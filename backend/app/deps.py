from fastapi import Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from .config import settings
from .db import get_db
from .models import User
from .security import COOKIE_NAME, decode_token


async def user_from_token(db: AsyncSession, token: str | None) -> User | None:
    uid = decode_token(token)
    return await db.get(User, uid) if uid else None


async def current_user_optional(request: Request, db: AsyncSession = Depends(get_db)) -> User | None:
    return await user_from_token(db, request.cookies.get(COOKIE_NAME))


async def current_user(user: User | None = Depends(current_user_optional)) -> User:
    if not user:
        raise HTTPException(401, "Log in to continue")
    return user


def public_user(u: User) -> dict:
    return {"id": u.id, "name": u.name, "hostel": u.hostel}


async def require_mod(user: User = Depends(current_user)) -> User:
    if user.email not in settings.mods:
        raise HTTPException(403, "Moderators only")
    return user
