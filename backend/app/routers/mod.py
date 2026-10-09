"""Moderator tools. Moderators are the accounts listed in MOD_EMAILS.
They see who wrote a reported message (including anonymous ones), and can hide, restore, dismiss or mute."""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import require_mod
from ..hub import hub
from ..models import Message, MessageReport, User
from ..rooms import RoomInfo
from ..utils import anon_alias, aware, iso
from .chat import serialize

router = APIRouter(prefix="/api/mod", tags=["moderation"])


def room_label(room: str) -> str:
    if room == "anon":
        return "Anonymous chat"
    parts = room.split(":")
    if parts[0] == "hostel":
        return f"{parts[1].upper()} {'residents' if parts[2] == 'residents' else 'common room'}"
    return {"dm": "Direct message", "carpool": "Ride chat"}.get(parts[0], room)


@router.get("/reports")
async def reports(view: str = "open", mod: User = Depends(require_mod), db: AsyncSession = Depends(get_db)):
    stmt = select(Message, User).join(User, User.id == Message.sender_id).where(Message.report_count > 0)
    if view == "hidden":
        stmt = stmt.where(Message.hidden.is_(True))
    rows = (await db.execute(stmt.order_by(Message.report_count.desc(), Message.id.desc()).limit(100))).all()
    now = datetime.now(timezone.utc)
    stats = {
        "open_reports": await db.scalar(select(func.count(Message.id)).where(Message.report_count > 0)) or 0,
        "hidden": await db.scalar(select(func.count(Message.id)).where(Message.hidden.is_(True))) or 0,
        "muted": await db.scalar(select(func.count(User.id)).where(User.anon_muted_until > now)) or 0,
    }
    return {"stats": stats, "reports": [{
        "id": m.id, "room": m.room, "room_label": room_label(m.room), "body": m.body, "hidden": m.hidden,
        "report_count": m.report_count, "created_at": iso(m.created_at),
        "alias": anon_alias(m.sender_id, m.created_at) if m.room == "anon" else None,
        "sender": {"id": u.id, "name": u.name, "email": u.email, "hostel": u.hostel,
                   "muted_until": iso(u.anon_muted_until) if u.anon_muted_until and aware(u.anon_muted_until) > now else None},
    } for m, u in rows]}


async def _message(db, mid: int) -> Message:
    m = await db.get(Message, mid)
    if not m:
        raise HTTPException(404, "Message not found")
    return m


async def _broadcast_state(m: Message, sender: User | None):
    if m.hidden:
        await hub.broadcast(m.room, {"type": "hidden", "id": m.id})
    else:
        info = RoomInfo(m.room, "anon" if m.room == "anon" else "other", "", anonymous=m.room == "anon")
        if m.room.startswith("hostel:") and m.room.endswith(":common"):
            info.kind, info.hostel = "hostel_common", m.room.split(":")[1]
        await hub.broadcast(m.room, lambda viewer: {"type": "message", "message": serialize(m, sender, info, viewer)})


class HideIn(BaseModel):
    hidden: bool


@router.post("/messages/{mid}/hide")
async def hide(mid: int, data: HideIn, mod: User = Depends(require_mod), db: AsyncSession = Depends(get_db)):
    m = await _message(db, mid)
    m.hidden = data.hidden
    await db.commit()
    await _broadcast_state(m, await db.get(User, m.sender_id))
    return {"ok": True, "hidden": m.hidden}


@router.post("/messages/{mid}/dismiss")
async def dismiss(mid: int, mod: User = Depends(require_mod), db: AsyncSession = Depends(get_db)):
    """Reports were wrong: clear them and make the message visible again."""
    m = await _message(db, mid)
    await db.execute(delete(MessageReport).where(MessageReport.message_id == mid))
    was_hidden = m.hidden
    m.report_count, m.hidden = 0, False
    await db.commit()
    if was_hidden:
        await _broadcast_state(m, await db.get(User, m.sender_id))
    return {"ok": True}


class MuteIn(BaseModel):
    hours: int = Field(ge=0, le=24 * 30)


@router.post("/users/{uid}/mute")
async def mute(uid: int, data: MuteIn, mod: User = Depends(require_mod), db: AsyncSession = Depends(get_db)):
    u = await db.get(User, uid)
    if not u:
        raise HTTPException(404, "User not found")
    u.anon_muted_until = datetime.now(timezone.utc) + timedelta(hours=data.hours) if data.hours else None
    await db.commit()
    return {"ok": True, "muted_until": iso(u.anon_muted_until)}
