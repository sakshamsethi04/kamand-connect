"""Reddit-style boards. Used by both 'Raise a concern' (kind=concern) and 'Lost & found' (kind=lostfound)."""
import io
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from PIL import Image, ImageOps
from pydantic import BaseModel, Field
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import settings
from ..db import get_db
from ..deps import current_user, public_user
from ..models import Comment, Post, PostImage, User, Vote
from ..moderation import clean
from ..utils import iso, limiter

router = APIRouter(prefix="/api", tags=["posts"])
Image.MAX_IMAGE_PIXELS = 40_000_000
MAX_IMAGES, MAX_BYTES = 4, 6 * 1024 * 1024
KINDS = {"concern", "lostfound"}
CONCERN_CATEGORIES = ["Hostel", "Mess", "Academics", "Transport", "Infrastructure", "Safety", "Other"]
LF_CATEGORIES = ["Electronics", "ID / cards", "Keys", "Bottle", "Clothing", "Books", "Other"]


def upload_dir() -> Path:
    p = Path(settings.upload_dir)
    p.mkdir(parents=True, exist_ok=True)
    return p


async def save_images(files: list[UploadFile]) -> list[str]:
    if len(files) > MAX_IMAGES:
        raise HTTPException(422, f"Attach up to {MAX_IMAGES} images")
    saved = []
    for f in files:
        data = await f.read(MAX_BYTES + 1)
        if len(data) > MAX_BYTES:
            raise HTTPException(413, f"{f.filename} is larger than 6 MB")
        try:
            Image.open(io.BytesIO(data)).verify()  # rejects non-images and truncated files
            img = ImageOps.exif_transpose(Image.open(io.BytesIO(data)))
            img.thumbnail((1600, 1600))
            if img.mode not in ("RGB", "RGBA"):
                img = img.convert("RGB")
            name = f"{uuid.uuid4().hex}.webp"
            img.save(upload_dir() / name, "WEBP", quality=82)  # re-encode = strips EXIF/GPS
            saved.append(name)
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(422, f"{f.filename} isn't a supported image")
    return saved


def post_out(p: Post, viewer: User, my_vote: int = 0, full: bool = False) -> dict:
    body = p.body if full or len(p.body) <= 280 else p.body[:280].rstrip() + "…"
    return {"id": p.id, "kind": p.kind, "lf_type": p.lf_type, "title": p.title, "body": body,
            "category": p.category, "location": p.location, "status": p.status, "score": p.score,
            "comment_count": p.comment_count, "created_at": iso(p.created_at),
            "images": [f"/uploads/{i.path}" for i in p.images],
            "author": None if p.is_anonymous else public_user(p.author),
            "anonymous": p.is_anonymous, "mine": p.author_id == viewer.id, "my_vote": my_vote}


async def my_votes(db: AsyncSession, user: User, target_type: str, ids: list[int]) -> dict[int, int]:
    if not ids:
        return {}
    rows = await db.execute(select(Vote.target_id, Vote.value).where(
        Vote.user_id == user.id, Vote.target_type == target_type, Vote.target_id.in_(ids)))
    return dict(rows.all())


async def load_post(db: AsyncSession, post_id: int) -> Post:
    p = await db.scalar(select(Post).where(Post.id == post_id).execution_options(populate_existing=True))
    if not p:
        raise HTTPException(404, "This post was removed")
    return p


@router.get("/boards/meta")
async def boards_meta():
    return {"concern": {"categories": CONCERN_CATEGORIES}, "lostfound": {"categories": LF_CATEGORIES}}


@router.get("/posts")
async def list_posts(kind: str, sort: str = "top", lf_type: str | None = None, q: str | None = None,
                     status: str | None = None, offset: int = Query(0, ge=0), limit: int = Query(30, le=50),
                     user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    if kind not in KINDS:
        raise HTTPException(404, "Unknown board")
    stmt = select(Post).where(Post.kind == kind)
    if lf_type in ("lost", "found"):
        stmt = stmt.where(Post.lf_type == lf_type)
    if status in ("open", "resolved"):
        stmt = stmt.where(Post.status == status)
    if q:
        stmt = stmt.where(Post.title.ilike(f"%{q.strip()[:60]}%"))
    order = [Post.id.desc()] if sort == "new" else [Post.score.desc(), Post.id.desc()]
    posts = (await db.scalars(stmt.order_by(*order).offset(offset).limit(limit + 1))).unique().all()
    votes = await my_votes(db, user, "post", [p.id for p in posts])
    return {"posts": [post_out(p, user, votes.get(p.id, 0)) for p in posts[:limit]],
            "has_more": len(posts) > limit}


@router.post("/posts")
async def create_post(kind: str = Form(...), title: str = Form(..., min_length=4, max_length=140),
                      body: str = Form("", max_length=5000), category: str | None = Form(None),
                      location: str | None = Form(None, max_length=120), lf_type: str | None = Form(None),
                      anonymous: bool = Form(False), images: list[UploadFile] | None = File(None),
                      user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    if kind not in KINDS:
        raise HTTPException(404, "Unknown board")
    if limiter.hit(f"post:{user.id}", 5, 600):
        raise HTTPException(429, "You've posted a lot recently. Try again in a few minutes.")
    cats = CONCERN_CATEGORIES if kind == "concern" else LF_CATEGORIES
    if category and category not in cats:
        raise HTTPException(422, "Pick a category from the list")
    if kind == "lostfound":
        if lf_type not in ("lost", "found"):
            raise HTTPException(422, "Say whether you lost or found it")
        anonymous = False  # people need to be able to message you
    else:
        lf_type = None
    names = await save_images([f for f in (images or []) if f.filename])
    post = Post(kind=kind, lf_type=lf_type, title=clean(title)[0], body=clean(body)[0], category=category,
                location=(location or "").strip() or None, is_anonymous=anonymous, author_id=user.id,
                images=[PostImage(path=n) for n in names])
    db.add(post)
    await db.commit()
    return {"post": post_out(await load_post(db, post.id), user, full=True)}


@router.get("/posts/{post_id}")
async def get_post(post_id: int, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    post = await load_post(db, post_id)
    comments = (await db.scalars(select(Comment).where(Comment.post_id == post_id)
                                 .order_by(Comment.score.desc(), Comment.id))).unique().all()
    pv = await my_votes(db, user, "post", [post.id])
    cv = await my_votes(db, user, "comment", [c.id for c in comments])
    return {"post": post_out(post, user, pv.get(post.id, 0), full=True),
            "comments": [{"id": c.id, "parent_id": c.parent_id, "body": c.body, "score": c.score,
                          "created_at": iso(c.created_at), "my_vote": cv.get(c.id, 0),
                          "mine": c.author_id == user.id,
                          "author": None if (post.is_anonymous and c.author_id == post.author_id)
                          else public_user(c.author),
                          "is_op": c.author_id == post.author_id} for c in comments]}


class VoteIn(BaseModel):
    value: int = Field(ge=-1, le=1)


async def apply_vote(db: AsyncSession, user: User, target_type: str, model, target_id: int, value: int) -> int:
    existing = await db.scalar(select(Vote).where(Vote.user_id == user.id, Vote.target_type == target_type,
                                                  Vote.target_id == target_id))
    old = existing.value if existing else 0
    if value == 0 and existing:
        await db.delete(existing)
    elif value and existing:
        existing.value = value
    elif value:
        db.add(Vote(user_id=user.id, target_type=target_type, target_id=target_id, value=value))
    if value != old:  # atomic counter update avoids lost updates under concurrent votes
        await db.execute(update(model).where(model.id == target_id).values(score=model.score + (value - old)))
    await db.commit()
    return await db.scalar(select(model.score).where(model.id == target_id))


@router.post("/posts/{post_id}/vote")
async def vote_post(post_id: int, data: VoteIn, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    await load_post(db, post_id)
    return {"score": await apply_vote(db, user, "post", Post, post_id, data.value), "my_vote": data.value}


@router.post("/comments/{comment_id}/vote")
async def vote_comment(comment_id: int, data: VoteIn, user: User = Depends(current_user),
                       db: AsyncSession = Depends(get_db)):
    if not await db.get(Comment, comment_id):
        raise HTTPException(404, "Comment not found")
    return {"score": await apply_vote(db, user, "comment", Comment, comment_id, data.value), "my_vote": data.value}


class CommentIn(BaseModel):
    body: str = Field(min_length=1, max_length=2000)
    parent_id: int | None = None


@router.post("/posts/{post_id}/comments")
async def add_comment(post_id: int, data: CommentIn, user: User = Depends(current_user),
                      db: AsyncSession = Depends(get_db)):
    post = await load_post(db, post_id)
    if limiter.hit(f"comment:{user.id}", 10, 60):
        raise HTTPException(429, "Slow down a little before replying again")
    if data.parent_id:
        parent = await db.get(Comment, data.parent_id)
        if not parent or parent.post_id != post_id:
            raise HTTPException(422, "That reply target doesn't exist")
    body = clean(data.body)[0].strip()
    if not body:
        raise HTTPException(422, "Write something first")
    c = Comment(post_id=post_id, parent_id=data.parent_id, author_id=user.id, body=body)
    db.add(c)
    await db.execute(update(Post).where(Post.id == post_id).values(comment_count=Post.comment_count + 1))
    await db.commit()
    await db.refresh(c)
    return {"comment": {"id": c.id, "parent_id": c.parent_id, "body": c.body, "score": 0,
                        "created_at": iso(c.created_at), "my_vote": 0, "mine": True,
                        "author": None if (post.is_anonymous and user.id == post.author_id) else public_user(user),
                        "is_op": user.id == post.author_id}}


class StatusIn(BaseModel):
    status: str = Field(pattern="^(open|resolved)$")


@router.patch("/posts/{post_id}/status")
async def set_status(post_id: int, data: StatusIn, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    post = await load_post(db, post_id)
    if post.author_id != user.id:
        raise HTTPException(403, "Only the person who posted this can change its status")
    post.status = data.status
    await db.commit()
    return {"status": post.status}


@router.delete("/posts/{post_id}")
async def delete_post(post_id: int, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)):
    post = await load_post(db, post_id)
    if post.author_id != user.id:
        raise HTTPException(403, "Only the person who posted this can delete it")
    files = [i.path for i in post.images]
    comment_ids = select(Comment.id).where(Comment.post_id == post_id)
    await db.execute(delete(Vote).where(Vote.target_type == "comment", Vote.target_id.in_(comment_ids)))
    await db.execute(delete(Vote).where(Vote.target_type == "post", Vote.target_id == post_id))
    await db.execute(update(Comment).where(Comment.post_id == post_id).values(parent_id=None))
    await db.execute(delete(Comment).where(Comment.post_id == post_id))
    await db.delete(post)
    await db.commit()
    for f in files:
        (upload_dir() / f).unlink(missing_ok=True)
    return {"ok": True}
