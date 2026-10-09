"""Demo data so the app looks alive during judging.  python seed.py  (password for all: Kamand@2026)"""
import asyncio
import random
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.db import Base, SessionLocal, engine
from app.models import Carpool, CarpoolMember, Comment, Message, Post, User
from app.security import hash_password

PEOPLE = [("Aarav Sharma", "b10"), ("Ishita Verma", "b10"), ("Kabir Thakur", "b12"), ("Meera Nair", "b13"),
          ("Rohan Gupta", "b16"), ("Sanya Kapoor", "b17"), ("Dev Rana", "b12"), ("Tanvi Joshi", "b20")]
LINES = ["anyone going to the mess early today?", "wifi on 3rd floor is down again", "who has a spare charger",
         "match at 6 near the ground, need 2 more", "maggi point open?", "lab report deadline got extended",
         "rain is insane rn", "lost my umbrella near library lol", "movie night in common room?"]


async def main():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with SessionLocal() as db:
        if await db.scalar(select(User.id).limit(1)):
            print("Database already has users; skipping seed.")
            return
        pw = hash_password("Kamand@2026")
        users = []
        for name, hostel in PEOPLE:
            u = User(name=name, email=name.split()[0].lower() + "@students.iitmandi.ac.in", password_hash=pw, hostel=hostel)
            db.add(u)
            users.append(u)
        await db.flush()
        now = datetime.now(timezone.utc)
        for i in range(140):
            u = random.choice(users)
            host = random.choice(["b10", "b10", "b12", "b12", "b12", "b13", "b16", "b17", "b20"])
            scope = "residents" if u.hostel == host and random.random() < .6 else "common"
            if scope == "residents" and u.hostel != host:
                scope = "common"
            db.add(Message(room=f"hostel:{host}:{scope}", sender_id=u.id, sender_hostel=u.hostel,
                           body=random.choice(LINES), created_at=now - timedelta(minutes=random.randint(5, 3000))))
        concerns = [("Hot water not working in B12 since Monday", "Hostel", 14),
                    ("Mess food quality has dropped this week", "Mess", 22),
                    ("Need more buses to Mandi on Sundays", "Transport", 31),
                    ("Streetlights off on the road to South campus", "Safety", 9)]
        for t, c, s in concerns:
            p = Post(kind="concern", title=t, body="Raising this so it gets noticed. Please upvote if it affects you too.",
                     category=c, author_id=random.choice(users).id, score=s, comment_count=1)
            db.add(p)
            await db.flush()
            db.add(Comment(post_id=p.id, author_id=random.choice(users).id, body="Same issue here.", score=3))
        db.add(Post(kind="lostfound", lf_type="lost", title="Black JBL earbuds case", category="Electronics",
                    location="Library 2nd floor", body="Lost around 4pm. Has a small sticker.", author_id=users[3].id, score=4))
        db.add(Post(kind="lostfound", lf_type="found", title="Blue water bottle (Milton)", category="Bottle",
                    location="A10 lecture hall", body="Found after the 11am class. DM me with a description.",
                    author_id=users[5].id, score=2))
        pool = Carpool(creator_id=users[0].id, from_loc="North Campus", to_loc="Mandi",
                       depart_at=now + timedelta(hours=20), seats=4, note="Splitting the cab, ~₹150 each")
        pool.members = [CarpoolMember(user_id=users[0].id), CarpoolMember(user_id=users[2].id)]
        db.add(pool)
        await db.commit()
        print("Seeded. Log in as aarav@students.iitmandi.ac.in / Kamand@2026")


asyncio.run(main())
