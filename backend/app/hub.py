import asyncio
from collections import defaultdict
from typing import Callable

from fastapi import WebSocket


class Hub:
    """Live sockets, per room and per user. Single-process; for multiple workers put Redis pub/sub behind
    broadcast() and notify()."""

    def __init__(self):
        self.rooms: dict[str, dict[WebSocket, int]] = defaultdict(dict)
        self.users: dict[int, set[WebSocket]] = defaultdict(set)  # /ws/notify connections

    # ----- rooms -----
    async def join(self, room: str, ws: WebSocket, user_id: int):
        self.rooms[room][ws] = user_id
        await self.broadcast(room, {"type": "presence", "count": self.online(room)})

    async def leave(self, room: str, ws: WebSocket):
        self.rooms[room].pop(ws, None)
        if not self.rooms[room]:
            self.rooms.pop(room, None)
        else:
            await self.broadcast(room, {"type": "presence", "count": self.online(room)})

    def online(self, room: str) -> int:
        return len(set(self.rooms.get(room, {}).values()))

    def hostel_presence(self) -> dict[str, int]:
        """People currently inside either of a hostel's rooms."""
        people: dict[str, set[int]] = defaultdict(set)
        for room, conns in self.rooms.items():
            if room.startswith("hostel:"):
                people[room.split(":")[1]].update(conns.values())
        return {slug: len(ids) for slug, ids in people.items()}

    async def broadcast(self, room: str, payload: dict | Callable[[int], dict | None]):
        """payload may be a function of the viewer's user id; returning None skips that viewer."""
        conns = list(self.rooms.get(room, {}).items())

        async def send(ws: WebSocket, uid: int):
            data = payload(uid) if callable(payload) else payload
            if data is None:
                return
            try:
                await ws.send_json(data)
            except Exception:
                self.rooms.get(room, {}).pop(ws, None)

        await asyncio.gather(*(send(ws, uid) for ws, uid in conns))

    # ----- per-user notifications -----
    def subscribe(self, user_id: int, ws: WebSocket):
        self.users[user_id].add(ws)

    def unsubscribe(self, user_id: int, ws: WebSocket):
        self.users[user_id].discard(ws)
        if not self.users[user_id]:
            self.users.pop(user_id, None)

    async def notify(self, user_id: int, payload: dict):
        for ws in list(self.users.get(user_id, ())):
            try:
                await ws.send_json(payload)
            except Exception:
                self.users.get(user_id, set()).discard(ws)


hub = Hub()
