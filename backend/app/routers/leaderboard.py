from collections import defaultdict
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..hostels import HOSTELS
from ..models import Message, User

router = APIRouter(prefix="/api", tags=["leaderboard"])
IST = timezone(timedelta(hours=5, minutes=30))


@router.get("/leaderboard")
async def leaderboard(db: AsyncSession = Depends(get_db)):
    """Messages sent in each hostel's two rooms since Monday 00:00 IST."""
    now = datetime.now(IST)
    start = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
    rows = (await db.execute(
        select(Message.room, Message.sender_id, func.count(Message.id))
        .where(Message.room.like("hostel:%"), Message.created_at >= start.astimezone(timezone.utc),
               Message.hidden.is_(False))
        .group_by(Message.room, Message.sender_id))).all()

    totals, people, per_user = defaultdict(int), defaultdict(set), defaultdict(lambda: defaultdict(int))
    for room, sender, n in rows:
        slug = room.split(":")[1]
        totals[slug] += n
        people[slug].add(sender)
        per_user[slug][sender] += n

    residents = dict((await db.execute(select(User.hostel, func.count(User.id)).group_by(User.hostel))).all())
    top_ids = {slug: max(u.items(), key=lambda kv: kv[1]) for slug, u in per_user.items()}
    names = dict((await db.execute(select(User.id, User.name).where(
        User.id.in_([uid for uid, _ in top_ids.values()] or [0])))).all())

    board = []
    for slug, h in HOSTELS.items():
        top = top_ids.get(slug)
        board.append({"slug": slug, "code": h["code"], "name": h["name"], "messages": totals[slug],
                      "active_members": len(people[slug]), "residents": residents.get(slug, 0),
                      "top_chatter": {"name": names.get(top[0], "Someone"), "messages": top[1]} if top else None})
    board.sort(key=lambda r: (-r["messages"], -r["active_members"], r["code"]))
    for i, r in enumerate(board):
        r["rank"] = i + 1
    return {"week_start": start.isoformat(), "generated_at": now.isoformat(), "hostels": board}
