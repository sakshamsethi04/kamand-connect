from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import current_user, public_user
from ..hub import hub
from ..models import Friendship, User

router = APIRouter(prefix="/api", tags=["friends"])


def _pair(a: int, b: int):
    return or_(and_(Friendship.requester_id == a, Friendship.addressee_id == b),
               and_(Friendship.requester_id == b, Friendship.addressee_id == a))


async def statuses(db: AsyncSession, me: int, ids: list[int]) -> dict[int, str]:
    """friends | outgoing | incoming | none, for each id."""
    if not ids:
        return {}
    rows = (await db.scalars(select(Friendship).where(or_(
        and_(Friendship.requester_id == me, Friendship.addressee_id.in_(ids)),
        and_(Friendship.addressee_id == me, Friendship.requester_id.in_(ids)))))).all()
    out = {i: "none" for i in ids}
    for f in rows:
        other = f.addressee_id if f.requester_id == me else f.requester_id
        out[other] = "friends" if f.status == "accepted" else ("outgoing" if f.requester_id == me else "incoming")
    return out


def person(u: User, status: str | None = None) -> dict:
    d = public_user(u) | {"online": u.id in hub.users}
    if status:
        d["friendship"] = status
    return d


@router.get("/friends")
async def friends(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    links = (await db.scalars(select(Friendship).where(
        or_(Friendship.requester_id == user.id, Friendship.addressee_id == user.id)))).all()
    other_ids = {f.addressee_id if f.requester_id == user.id else f.requester_id for f in links}
    users = {u.id: u for u in (await db.scalars(select(User).where(User.id.in_(other_ids or {0})))).all()}
    out = {"friends": [], "incoming": [], "outgoing": []}
    for f in links:
        other = users.get(f.addressee_id if f.requester_id == user.id else f.requester_id)
        if not other:
            continue
        key = "friends" if f.status == "accepted" else ("outgoing" if f.requester_id == user.id else "incoming")
        out[key].append(person(other))
    out["friends"].sort(key=lambda p: (not p["online"], p["name"]))
    return out


@router.get("/users/suggested")
async def suggested(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    """People from your hostel you aren't connected to yet."""
    linked = select(Friendship.addressee_id).where(Friendship.requester_id == user.id).union(
        select(Friendship.requester_id).where(Friendship.addressee_id == user.id))
    rows = (await db.scalars(select(User).where(User.hostel == user.hostel, User.id != user.id,
                                                User.id.not_in(linked)).order_by(User.name).limit(8))).all()
    return {"users": [person(u, "none") for u in rows]}


@router.post("/friends/{uid}")
async def add_friend(uid: int, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    """Send a request. If they already asked you, this accepts it."""
    other = await db.get(User, uid)
    if not other or uid == user.id:
        raise HTTPException(404, "Pick someone else")
    link = await db.scalar(select(Friendship).where(_pair(user.id, uid)))
    if link and (link.status == "accepted" or link.requester_id == user.id):
        return {"friendship": "friends" if link.status == "accepted" else "outgoing"}
    if link:  # they asked first -> accept
        link.status = "accepted"
        await db.commit()
        await hub.notify(uid, {"type": "friend_accepted", "from": public_user(user)})
        return {"friendship": "friends"}
    db.add(Friendship(requester_id=user.id, addressee_id=uid))
    await db.commit()
    await hub.notify(uid, {"type": "friend_request", "from": public_user(user)})
    return {"friendship": "outgoing"}


@router.post("/friends/{uid}/accept")
async def accept(uid: int, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    """Accept a friend request, or accept a DM request from a stranger (makes you friends)."""
    if uid == user.id or not await db.get(User, uid):
        raise HTTPException(404, "Pick someone else")
    link = await db.scalar(select(Friendship).where(_pair(user.id, uid)))
    if link:
        link.status = "accepted"
    else:
        db.add(Friendship(requester_id=uid, addressee_id=user.id, status="accepted"))
    await db.commit()
    await hub.notify(uid, {"type": "friend_accepted", "from": public_user(user)})
    return {"friendship": "friends"}


@router.delete("/friends/{uid}")
async def remove(uid: int, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    """Decline, cancel, or unfriend."""
    link = await db.scalar(select(Friendship).where(_pair(user.id, uid)))
    if link:
        await db.delete(link)
        await db.commit()
    return {"friendship": "none"}
