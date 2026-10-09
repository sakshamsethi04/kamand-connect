import re

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..db import get_db
from ..deps import current_user_optional
from ..hostels import HOSTELS
from ..models import User
from ..security import (clear_auth_cookie, create_token, hash_password, needs_rehash,
                        set_auth_cookie, verify_password)
from ..utils import limiter

router = APIRouter(prefix="/api/auth", tags=["auth"])


class RegisterIn(BaseModel):
    name: str = Field(min_length=2, max_length=60)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    hostel: str


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


def me_out(u: User) -> dict:
    return {"id": u.id, "name": u.name, "email": u.email, "hostel": u.hostel, "is_mod": u.email in settings.mods}


def check_password_strength(pw: str, email: str, name: str):
    if not (re.search(r"[A-Za-z]", pw) and re.search(r"\d", pw)):
        raise HTTPException(422, "Password needs at least one letter and one number")
    local = email.split("@")[0].lower()
    if len(local) >= 4 and local in pw.lower():
        raise HTTPException(422, "Password can't contain your email name")
    if pw.lower() in {"password1", "12345678a", "iitmandi1", "qwerty123", "kamand123"}:
        raise HTTPException(422, "That password is too common")


@router.post("/register")
async def register(data: RegisterIn, response: Response, request: Request, db: AsyncSession = Depends(get_db)):
    ip = request.client.host if request.client else "?"
    if limiter.hit(f"register:{ip}", 10, 3600):
        raise HTTPException(429, "Too many sign-ups from this network. Try again later.")
    email = data.email.strip().lower()
    domain = email.split("@")[1]
    if "*" not in settings.email_domains and domain not in settings.email_domains:
        raise HTTPException(422, f"Use your IIT Mandi email ({', '.join('@' + d for d in settings.email_domains)})")
    if data.hostel not in HOSTELS:
        raise HTTPException(422, "Pick your hostel from the list")
    name = " ".join(data.name.split())
    check_password_strength(data.password, email, name)
    if await db.scalar(select(User.id).where(User.email == email)):
        raise HTTPException(409, "An account with this email already exists. Log in instead.")
    user = User(name=name, email=email, password_hash=hash_password(data.password), hostel=data.hostel)
    db.add(user)
    await db.commit()
    await db.refresh(user)
    set_auth_cookie(response, create_token(user.id))
    return {"user": me_out(user)}


@router.post("/login")
async def login(data: LoginIn, response: Response, request: Request, db: AsyncSession = Depends(get_db)):
    email = data.email.strip().lower()
    ip = request.client.host if request.client else "?"
    wait = limiter.hit(f"login:{ip}:{email}", 6, 300) or limiter.hit(f"login:{ip}", 30, 300)
    if wait:
        raise HTTPException(429, f"Too many attempts. Try again in {int(wait) + 1} seconds.")
    user = await db.scalar(select(User).where(User.email == email))
    # verify_password runs a full Argon2 check even for unknown emails, so timing doesn't leak accounts
    if not verify_password(user.password_hash if user else None, data.password):
        raise HTTPException(401, "Email or password is incorrect")
    if needs_rehash(user.password_hash):
        user.password_hash = hash_password(data.password)
        await db.commit()
    set_auth_cookie(response, create_token(user.id))
    return {"user": me_out(user)}


@router.post("/logout")
async def logout(response: Response):
    clear_auth_cookie(response)
    return {"ok": True}


@router.get("/me")
async def me(user: User | None = Depends(current_user_optional)):
    return {"user": me_out(user) if user else None}
