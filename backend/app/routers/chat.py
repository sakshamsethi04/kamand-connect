import math
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..db import SessionLocal, get_db
from ..deps import current_user, public_user, user_from_token
from ..hub import hub
from ..models import CarpoolMember, Message, MessageReport, RoomRead, User
from ..moderation import clean
from ..rooms import RoomError, RoomInfo, dm_room, resolve_room
from ..security import COOKIE_NAME
from ..utils import aware, anon_alias, iso, limiter

router = APIRouter(tags=["chat"])
MAX_LEN = 1000


def serialize(m: Message, sender: User | None, info: RoomInfo, viewer_id: int) -> dict:
    out = {"id": m.id, "room": m.room, "body": None if m.hidden else m.body, "hidden": m.hidden,
           "created_at": iso(m.created_at), "mine": m.sender_id == viewer_id}
    if info.anonymous:
        out["sender"] = {"alias": anon_alias(m.sender_id, m.created_at)}  # never the real id
    else:
        out["sender"] = {"id": m.sender_id, "name": sender.name if sender else "Deleted user",
                         "hostel": m.sender_hostel}
        out["outsider"] = info.kind == "hostel_common" and m.sender_hostel != info.hostel
    return out


def room_meta(info: RoomInfo) -> dict:
    return {"key": info.key, "kind": info.kind, "title": info.title, "hostel": info.hostel,
            "anonymous": info.anonymous,
            "slowmode_seconds": settings.anon_slowmode_seconds if info.anonymous else 0}


async def _resolve_or_http(db, user, room) -> RoomInfo:
    try:
        return await resolve_room(db, user, room)
    except RoomError as e:
        raise HTTPException(e.status, e.detail)


@router.get("/api/rooms/{room}/messages")
async def history(room: str, before: int | None = None, limit: int = Query(50, ge=1, le=100),
                  user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    info = await _resolve_or_http(db, user, room)
    q = select(Message, User).outerjoin(User, User.id == Message.sender_id).where(Message.room == room)
    if before:
        q = q.where(Message.id < before)
    rows = (await db.execute(q.order_by(Message.id.desc()).limit(limit + 1))).all()
    has_more = len(rows) > limit
    rows = list(reversed(rows[:limit]))
    return {"room": room_meta(info), "has_more": has_more,
            "messages": [serialize(m, u, info, user.id) for m, u in rows]}


@router.post("/api/messages/{message_id}/report")
async def report(message_id: int, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    msg = await db.get(Message, message_id)
    if not msg:
        raise HTTPException(404, "Message not found")
    info = await _resolve_or_http(db, user, msg.room)
    if msg.sender_id == user.id:
        raise HTTPException(400, "You can't report your own message")
    db.add(MessageReport(message_id=msg.id, reporter_id=user.id))
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        return {"ok": True, "already": True}
    msg.report_count += 1
    hidden_now = False
    if msg.report_count >= settings.report_hide_threshold and not msg.hidden:
        msg.hidden, hidden_now = True, True
        if info.anonymous:  # three hidden anon messages in a day = one-hour mute
            since = datetime.now(timezone.utc) - timedelta(hours=24)
            strikes = await db.scalar(select(func.count(Message.id)).where(
                Message.sender_id == msg.sender_id, Message.room == "anon",
                Message.hidden.is_(True), Message.created_at >= since))
            if (strikes or 0) >= 3:  # autoflush already counts this one
                offender = await db.get(User, msg.sender_id)
                offender.anon_muted_until = datetime.now(timezone.utc) + timedelta(hours=1)
    await db.commit()
    if hidden_now:
        await hub.broadcast(msg.room, {"type": "hidden", "id": msg.id})
    return {"ok": True}


# ---------- direct messages ----------
@router.get("/api/dm/conversations")
async def conversations(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    mine = or_(Message.room.like(f"dm:{user.id}:%"), Message.room.like(f"dm:%:{user.id}"))
    latest = select(func.max(Message.id)).where(Message.room.like("dm:%"), mine).group_by(Message.room)
    msgs = (await db.scalars(select(Message).where(Message.id.in_(latest)).order_by(Message.id.desc()))).all()
    reads = await read_markers(db, user.id, [m.room for m in msgs])
    from .friends import statuses
    others = [int(m.room.split(":")[2]) if int(m.room.split(":")[1]) == user.id else int(m.room.split(":")[1]) for m in msgs]
    st = await statuses(db, user.id, others)
    out = []
    for m in msgs:
        _, a, b = m.room.split(":")
        other = await db.get(User, int(b) if int(a) == user.id else int(a))
        if other:
            replied = await db.scalar(select(Message.id).where(Message.room == m.room, Message.sender_id == user.id).limit(1))
            out.append({"room": m.room, "user": public_user(other) | {"online": other.id in hub.users},
                        "friendship": st.get(other.id, "none"),
                        "request": st.get(other.id) != "friends" and not replied,
                        "unread": await unread_count(db, user.id, m.room, reads.get(m.room, 0)),
                        "last": {"body": None if m.hidden else m.body, "mine": m.sender_id == user.id,
                                 "created_at": iso(m.created_at)}})
    return {"conversations": out}


async def read_markers(db: AsyncSession, user_id: int, rooms: list[str]) -> dict[str, int]:
    if not rooms:
        return {}
    rows = await db.execute(select(RoomRead.room, RoomRead.last_read_id).where(
        RoomRead.user_id == user_id, RoomRead.room.in_(rooms)))
    return dict(rows.all())


async def unread_count(db: AsyncSession, user_id: int, room: str, last_read: int) -> int:
    return await db.scalar(select(func.count(Message.id)).where(
        Message.room == room, Message.id > last_read, Message.sender_id != user_id)) or 0


@router.get("/api/notifications/summary")
async def notification_summary(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    """Unread totals for the nav badge: DMs plus chats of rides you're on."""
    mine = or_(Message.room.like(f"dm:{user.id}:%"), Message.room.like(f"dm:%:{user.id}"))
    dm_rooms = list((await db.scalars(select(Message.room).where(mine).distinct())).all())
    ride_rooms = [f"carpool:{cid}" for cid in (await db.scalars(
        select(CarpoolMember.carpool_id).where(CarpoolMember.user_id == user.id))).all()]
    reads = await read_markers(db, user.id, dm_rooms + ride_rooms)
    dm = sum([await unread_count(db, user.id, r, reads.get(r, 0)) for r in dm_rooms])
    rides = sum([await unread_count(db, user.id, r, reads.get(r, 0)) for r in ride_rooms])
    from ..models import Friendship
    fr = await db.scalar(select(func.count(Friendship.id)).where(
        Friendship.addressee_id == user.id, Friendship.status == "pending")) or 0
    return {"dm_unread": dm, "ride_unread": rides, "friend_requests": fr}


class ReadIn(BaseModel):
    last_id: int


@router.post("/api/rooms/{room}/read")
async def mark_read(room: str, data: ReadIn, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    await _resolve_or_http(db, user, room)
    marker = await db.scalar(select(RoomRead).where(RoomRead.user_id == user.id, RoomRead.room == room))
    if marker:
        marker.last_read_id = max(marker.last_read_id, data.last_id)
    else:
        db.add(RoomRead(user_id=user.id, room=room, last_read_id=data.last_id))
    try:
        await db.commit()
    except IntegrityError:  # two tabs racing to create the marker
        await db.rollback()
    return {"ok": True}


@router.get("/api/presence")
async def presence():
    """Public, counts only: how many people are in each hostel's rooms right now."""
    return {"hostels": hub.hostel_presence()}


@router.get("/api/dm/with/{other_id}")
async def dm_with(other_id: int, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    other = await db.get(User, other_id)
    if not other or other.id == user.id:
        raise HTTPException(404, "Pick someone else to message")
    from .friends import person, statuses
    st = (await statuses(db, user.id, [other.id]))[other.id]
    return {"room": dm_room(user.id, other.id), "user": person(other, st)}


@router.get("/api/users/search")
async def search_users(q: str = Query(min_length=1, max_length=60), user: User = Depends(current_user),
                       db: AsyncSession = Depends(get_db)):
    rows = (await db.scalars(select(User).where(User.name.ilike(f"%{q.strip()}%"), User.id != user.id)
                             .order_by(User.name).limit(10))).all()
    from .friends import person, statuses
    st = await statuses(db, user.id, [u.id for u in rows])
    return {"users": [person(u, st[u.id]) for u in rows]}


# ---------- websocket ----------
@router.websocket("/ws/rooms/{room}")
async def room_socket(ws: WebSocket, room: str):
    await ws.accept()
    origin = ws.headers.get("origin")
    if origin and origin not in settings.origins:  # blocks cross-site websocket hijacking
        await ws.close(code=4403, reason="Origin not allowed")
        return
    async with SessionLocal() as db:
        user = await user_from_token(db, ws.cookies.get(COOKIE_NAME))
        if not user:
            await ws.close(code=4401, reason="Log in to chat")
            return
        try:
            info = await resolve_room(db, user, room)
        except RoomError as e:
            await ws.close(code=4403, reason=e.detail[:120])
            return

    await hub.join(room, ws, user.id)
    try:
        while True:
            data = await ws.receive_json()
            if not isinstance(data, dict):
                continue
            if data.get("type") == "ping":  # client heartbeat; lets the browser spot dead sockets
                await ws.send_json({"type": "pong"})
            elif data.get("type") == "message":
                await handle_send(ws, user.id, info, str(data.get("body", "")))
            elif data.get("type") == "typing" and not limiter.hit(f"typing:{user.id}:{room}", 1, 2):
                who = anon_alias(user.id, datetime.now(timezone.utc)) if info.anonymous else user.name
                uid = user.id
                await hub.broadcast(room, lambda viewer: None if viewer == uid else
                                    {"type": "typing", "key": who, "name": who})
    except (WebSocketDisconnect, RuntimeError, ValueError):
        pass
    finally:
        await hub.leave(room, ws)


async def handle_send(ws: WebSocket, user_id: int, info: RoomInfo, raw: str):
    body = raw.strip()
    if not body:
        return
    if len(body) > MAX_LEN:
        await ws.send_json({"type": "error", "detail": f"Messages can be up to {MAX_LEN} characters"})
        return
    if info.anonymous:
        async with SessionLocal() as db:
            muted = await db.scalar(select(User.anon_muted_until).where(User.id == user_id))
        if muted and aware(muted) > datetime.now(timezone.utc):
            mins = max(1, int((aware(muted) - datetime.now(timezone.utc)).total_seconds() // 60))
            await ws.send_json({"type": "error", "detail": f"You're muted in anonymous chat for about {mins} more minutes."})
            return
        wait = limiter.hit(f"slow:{user_id}", 1, settings.anon_slowmode_seconds)
        if wait:
            await ws.send_json({"type": "slowmode", "retry_after": wait,
                                "detail": f"Slow mode is on. You can send again in {math.ceil(wait)}s."})
            return
    wait = limiter.hit(f"msg:{user_id}", 8, 10)
    if wait:
        await ws.send_json({"type": "error", "retry_after": wait, "detail": "You're sending too fast. Take a breath."})
        return

    body, _flagged = clean(body, anonymous=info.anonymous)
    if not body:
        return
    async with SessionLocal() as db:
        sender = await db.get(User, user_id)
        msg = Message(room=info.key, sender_id=sender.id, sender_hostel=sender.hostel, body=body)
        db.add(msg)
        await db.commit()
        await db.refresh(msg)
    await hub.broadcast(info.key, lambda viewer: {"type": "message", "message": serialize(msg, sender, info, viewer)})
    await notify_offline_readers(info, msg, sender)


async def notify_offline_readers(info: RoomInfo, msg: Message, sender: User):
    """Ping people who aren't looking at the room: the other person in a DM, everyone else on a ride."""
    if info.kind == "dm":
        _, a, b = info.key.split(":")
        targets = [int(a) if int(b) == sender.id else int(b)]
        from .friends import statuses
        async with SessionLocal() as db:
            st = (await statuses(db, targets[0], [sender.id]))[sender.id]
        payload = {"type": "dm", "room": info.key, "from": public_user(sender), "preview": msg.body[:90],
                   "request": st != "friends"}
    elif info.kind == "carpool":
        async with SessionLocal() as db:
            targets = [uid for uid in (await db.scalars(select(CarpoolMember.user_id).where(
                CarpoolMember.carpool_id == int(info.key.split(":")[1])))).all() if uid != sender.id]
        payload = {"type": "ride", "room": info.key, "title": info.title, "from": public_user(sender),
                   "preview": msg.body[:90]}
    else:
        return
    for uid in targets:
        await hub.notify(uid, payload)


@router.websocket("/ws/notify")
async def notify_socket(ws: WebSocket):
    await ws.accept()
    origin = ws.headers.get("origin")
    if origin and origin not in settings.origins:
        await ws.close(code=4403, reason="Origin not allowed")
        return
    async with SessionLocal() as db:
        user = await user_from_token(db, ws.cookies.get(COOKIE_NAME))
    if not user:
        await ws.close(code=4401, reason="Log in first")
        return
    hub.subscribe(user.id, ws)
    try:
        while True:
            await ws.receive_text()  # client pings keep the connection alive
    except (WebSocketDisconnect, RuntimeError):
        pass
    finally:
        hub.unsubscribe(user.id, ws)
