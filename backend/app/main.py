from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .config import settings
from .db import Base, engine
from .hostels import HOSTELS
from .routers import auth, carpool, chat, friends, leaderboard, mod, posts


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:  # hackathon-friendly: create tables on boot (use Alembic later)
        await conn.run_sync(Base.metadata.create_all)
    if "change-me" in settings.jwt_secret:
        print("⚠️  JWT_SECRET is the dev default. Set it in backend/.env before deploying.")
    yield


app = FastAPI(title="Kamand Connect API", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=settings.origins, allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])


@app.middleware("http")
async def security_headers(request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Referrer-Policy", "same-origin")
    return response


for r in (auth.router, chat.router, posts.router, carpool.router, leaderboard.router, mod.router, friends.router):
    app.include_router(r)

Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=settings.upload_dir), name="uploads")


@app.get("/api/hostels")
async def hostels():
    return {"hostels": list(HOSTELS.values())}


@app.get("/api/health")
async def health():
    return {"ok": True}


# Serve the built React app (frontend/dist) so one `uvicorn` process runs everything in production.
DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if DIST.exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa(full_path: str):
        if full_path.startswith(("api/", "ws/", "uploads/")):
            raise HTTPException(404)
        file = (DIST / full_path).resolve()
        if full_path and file.is_file() and file.is_relative_to(DIST):
            return FileResponse(file)
        return FileResponse(DIST / "index.html")
