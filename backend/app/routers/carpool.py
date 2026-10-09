from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..deps import current_user, public_user
from ..hub import hub
from ..models import Carpool, CarpoolMember, Message, User
from ..utils import aware, iso

router = APIRouter(prefix="/api/carpools", tags=["carpool"])
LOCATIONS = ["Mandi", "North Campus", "South Campus"]
ROUTES = [("Mandi", "North Campus"), ("Mandi", "South Campus"), ("North Campus", "Mandi"), ("South Campus", "Mandi")]


def pool_out(p: Carpool, viewer: User) -> dict:
    member_ids = [m.user_id for m in p.members]
    return {"id": p.id, "from": p.from_loc, "to": p.to_loc, "depart_at": iso(p.depart_at), "seats": p.seats,
            "seats_left": max(0, p.seats - len(member_ids)), "note": p.note, "room": f"carpool:{p.id}",
            "creator": public_user(p.creator), "members": [public_user(m.user) for m in p.members],
            "is_member": viewer.id in member_ids, "is_creator": p.creator_id == viewer.id}


async def load_pool(db: AsyncSession, pool_id: int) -> Carpool:
    p = await db.scalar(select(Carpool).where(Carpool.id == pool_id).execution_options(populate_existing=True))
    if not p:
        raise HTTPException(404, "This ride was cancelled")
    return p


@router.get("/meta")
async def meta():
    return {"locations": LOCATIONS, "routes": [{"from": a, "to": b} for a, b in ROUTES]}


class PoolIn(BaseModel):
    from_loc: str
    to_loc: str
    depart_at: datetime
    seats: int = Field(ge=2, le=8)
    note: str | None = Field(None, max_length=200)


@router.get("")
async def list_pools(from_loc: str | None = None, to_loc: str | None = None, mine: bool = False,
                     user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    since = datetime.now(timezone.utc) - timedelta(hours=1)
    stmt = select(Carpool).where(Carpool.depart_at >= since)
    if from_loc:
        stmt = stmt.where(Carpool.from_loc == from_loc)
    if to_loc:
        stmt = stmt.where(Carpool.to_loc == to_loc)
    if mine:
        stmt = stmt.where(Carpool.id.in_(select(CarpoolMember.carpool_id).where(CarpoolMember.user_id == user.id)))
    pools = (await db.scalars(stmt.order_by(Carpool.depart_at).limit(100))).unique().all()
    return {"carpools": [pool_out(p, user) for p in pools]}


@router.post("")
async def create_pool(data: PoolIn, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    if (data.from_loc, data.to_loc) not in ROUTES:
        raise HTTPException(422, "Pick one of the listed routes")
    depart = aware(data.depart_at).astimezone(timezone.utc)
    now = datetime.now(timezone.utc)
    if depart < now - timedelta(minutes=5):
        raise HTTPException(422, "Departure time is in the past")
    if depart > now + timedelta(days=30):
        raise HTTPException(422, "Rides can be posted up to 30 days ahead")
    pool = Carpool(creator_id=user.id, from_loc=data.from_loc, to_loc=data.to_loc, depart_at=depart,
                   seats=data.seats, note=(data.note or "").strip() or None,
                   members=[CarpoolMember(user_id=user.id)])
    db.add(pool)
    await db.commit()
    return {"carpool": pool_out(await load_pool(db, pool.id), user)}


@router.post("/{pool_id}/join")
async def join_pool(pool_id: int, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    pool = await load_pool(db, pool_id)
    if any(m.user_id == user.id for m in pool.members):
        return {"carpool": pool_out(pool, user)}
    if len(pool.members) >= pool.seats:
        raise HTTPException(409, "This ride is full")
    db.add(CarpoolMember(carpool_id=pool.id, user_id=user.id))
    db.add(Message(room=f"carpool:{pool.id}", sender_id=user.id, sender_hostel=user.hostel, body="joined the ride 👋"))
    await db.commit()
    return {"carpool": pool_out(await load_pool(db, pool_id), user)}


@router.post("/{pool_id}/leave")
async def leave_pool(pool_id: int, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    pool = await load_pool(db, pool_id)
    if pool.creator_id == user.id:
        raise HTTPException(400, "You posted this ride. Cancel it instead.")
    await db.execute(delete(CarpoolMember).where(CarpoolMember.carpool_id == pool_id, CarpoolMember.user_id == user.id))
    await db.commit()
    return {"carpool": pool_out(await load_pool(db, pool_id), user)}


@router.delete("/{pool_id}")
async def cancel_pool(pool_id: int, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    pool = await load_pool(db, pool_id)
    if pool.creator_id != user.id:
        raise HTTPException(403, "Only the person who posted this ride can cancel it")
    await db.delete(pool)
    await db.commit()
    await hub.broadcast(f"carpool:{pool_id}", {"type": "closed", "detail": "This ride was cancelled"})
    return {"ok": True}
