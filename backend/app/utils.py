import hashlib
import hmac
import time
from collections import defaultdict, deque
from datetime import datetime, timezone

from .config import settings


def aware(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def iso(dt: datetime | None) -> str | None:
    dt = aware(dt)
    return dt.isoformat() if dt else None


class RateLimiter:
    """In-memory sliding window. Fine for one process; swap for Redis when scaling out."""

    def __init__(self):
        self.hits: dict[str, deque] = defaultdict(deque)

    def hit(self, key: str, limit: int, window: float) -> float:
        now = time.monotonic()
        q = self.hits[key]
        while q and now - q[0] > window:
            q.popleft()
        if len(q) >= limit:
            return round(window - (now - q[0]), 1)
        q.append(now)
        return 0.0


limiter = RateLimiter()

_ADJ = ["Misty", "Quiet", "Brave", "Sleepy", "Curious", "Swift", "Gentle", "Witty",
        "Sunny", "Chilly", "Lucky", "Bold", "Mellow", "Zesty", "Hidden", "Rainy"]
_NOUN = ["Deodar", "Yak", "Monal", "Langur", "Pine", "Kingfisher", "Rhododendron", "Uhl",
         "Beas", "Snowfinch", "Leopard", "Apple", "Ghoral", "Bulbul", "Cedar", "Glacier"]


def anon_alias(user_id: int, when: datetime) -> str:
    """Stable for one ISO week, unlinkable to the account without the server secret."""
    year, week, _ = aware(when).isocalendar()
    digest = hmac.new(settings.jwt_secret.encode(), f"anon:{user_id}:{year}-{week}".encode(),
                      hashlib.sha256).digest()
    return f"{_ADJ[digest[0] % len(_ADJ)]} {_NOUN[digest[1] % len(_NOUN)]} {digest[2] % 90 + 10}"
