from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .hostels import HOSTELS, hostel_name
from .models import Carpool, CarpoolMember, User


class RoomError(Exception):
    def __init__(self, status: int, detail: str):
        self.status, self.detail = status, detail


@dataclass
class RoomInfo:
    key: str
    kind: str  # anon | hostel_residents | hostel_common | dm | carpool
    title: str
    hostel: str | None = None
    anonymous: bool = False


def dm_room(a: int, b: int) -> str:
    lo, hi = sorted((a, b))
    return f"dm:{lo}:{hi}"


async def resolve_room(db: AsyncSession, user: User, room: str) -> RoomInfo:
    """Single place that decides who may read/write a room."""
    parts = room.split(":")
    if room == "anon":
        return RoomInfo(room, "anon", "Anonymous campus chat", anonymous=True)

    if len(parts) == 3 and parts[0] == "hostel":
        slug, scope = parts[1], parts[2]
        if slug not in HOSTELS or scope not in ("residents", "common"):
            raise RoomError(404, "That room doesn't exist")
        if scope == "residents" and user.hostel != slug:
            raise RoomError(403, f"Only {hostel_name(slug)} residents can join this room. "
                                 "Use the common room instead.")
        label = "residents" if scope == "residents" else "common room"
        return RoomInfo(room, f"hostel_{scope}", f"{hostel_name(slug)} {label}", hostel=slug)

    if len(parts) == 3 and parts[0] == "dm":
        try:
            a, b = int(parts[1]), int(parts[2])
        except ValueError:
            raise RoomError(404, "That conversation doesn't exist")
        if a >= b or user.id not in (a, b):
            raise RoomError(403, "This conversation is private")
        other = await db.get(User, b if user.id == a else a)
        if not other:
            raise RoomError(404, "That person no longer has an account")
        return RoomInfo(room, "dm", other.name)

    if len(parts) == 2 and parts[0] == "carpool" and parts[1].isdigit():
        pool = await db.get(Carpool, int(parts[1]))
        if not pool:
            raise RoomError(404, "That ride was cancelled")
        member = await db.scalar(select(CarpoolMember.id).where(
            CarpoolMember.carpool_id == pool.id, CarpoolMember.user_id == user.id))
        if not member:
            raise RoomError(403, "Join this ride to see its chat")
        return RoomInfo(room, "carpool", f"{pool.from_loc} to {pool.to_loc}")

    raise RoomError(404, "That room doesn't exist")
