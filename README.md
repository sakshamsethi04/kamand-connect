# Kamand Connect

IIT Mandi's campus chat app: a 3D map of North Campus where every hostel is a chat room, plus anonymous chat, DMs, a Reddit-style concerns board, lost & found and carpools.

**Stack:** React 18 + Vite + react-three-fiber · FastAPI · PostgreSQL (SQLAlchemy async) · WebSockets · Argon2id + JWT in httpOnly cookies

## Run it (about 5 minutes)

```bash
# 1. Database
docker compose up -d                       # Postgres on :5432 (user/pass/db = kamand)

# 2. Backend
cd backend
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                       # then set JWT_SECRET (command is in the file)
python seed.py                             # optional: demo users, messages, posts, a ride
uvicorn app.main:app --reload --port 8000

# 3. Frontend (new terminal)
cd frontend
npm install
npm run dev                                # http://localhost:5173
```

Demo login after seeding: `aarav@students.iitmandi.ac.in` / `Kamand@2026` (also kabir, ishita, meera, rohan, sanya, dev, tanvi). Open two browsers with different accounts to show live chat.

No Docker? Install Postgres and point `DATABASE_URL` at it. For a quick local run you can even use `DATABASE_URL=sqlite+aiosqlite:///./kamand.db`.

**Single-process deploy:** `cd frontend && npm run build`, then just run uvicorn. FastAPI serves `frontend/dist`, the API and websockets from one port. Set `COOKIE_SECURE=true` and add your domain to `ALLOWED_ORIGINS` when on HTTPS.

**Judges without an IIT Mandi email:** set `ALLOWED_EMAIL_DOMAINS=*` in `.env`.

**Moderators:** add emails to `MOD_EMAILS` in `.env` (e.g. `MOD_EMAILS=meera@students.iitmandi.ac.in` for the seeded demo), restart, and a Moderation link appears in that account's menu.

**Demo script (2 browsers):** log in as Aarav in one and Kabir in a private window. Kabir stays on Concerns; Aarav DMs him, and the toast and badge pop up instantly. Kabir opens it and sees "Aarav Sharma is typing". Then open the map in a third tab to see the live online counts on the hostel pins.

## What's where

| Feature | How it works | Code |
|---|---|---|
| 3D landing map | Loads the campus GLB; hostel nodes (B8–B23) are found by name, made pickable, lift and glow on hover, labelled with pins. Click opens the hostel chat, or a login popup if logged out. Hostel chips along the bottom do the same (keyboard and touch friendly). | `frontend/src/components/CampusScene.jsx`, `pages/Landing.jsx` |
| Day / night | One GLB, lit in real time. Night between 18:30 and 06:15 local time: moonlight, lamp glow near the messes, glowing windows, stars. Live / Day / Night switch for demos. Falls back to the screenshots if WebGL is unavailable. | same |
| Hostel chats | Two rooms per hostel. Residents only is enforced server-side for both REST and websocket. Common room is open; anyone from another hostel gets an `(outsider)` tag. | `backend/app/rooms.py`, `routers/chat.py` |
| Anonymous chat | Weekly rotating alias from an HMAC of user id + ISO week (the real id is never sent to clients). Slow mode (8s), slur masking, phone/email masking, 3 reports hide a message, 1-hour mute after 3 hidden messages in 24h. | `routers/chat.py`, `moderation.py`, `utils.py` |
| 1:1 DMs | Room `dm:<lo>:<hi>`, only those two people can join. Click any name in a chat, post, comment or ride to message them. Inbox with search. | `pages/Messages.jsx` |
| Concerns | Reddit-style: up/down votes, sorted by score, threaded replies with their own votes, up to 4 images, optional anonymous posting, mark resolved. | `routers/posts.py`, `pages/Board.jsx`, `PostDetail.jsx` |
| Lost & found | Same engine with lost/found type and location; every post has a Message button to DM the poster. | same |
| Carpool | From/To dropdowns limited to Mandi ↔ North Campus and Mandi ↔ South Campus, date-time picker, seats. Join, leave, cancel, members-only ride chat, DM any rider. | `routers/carpool.py`, `pages/Carpool.jsx` |
| Live notifications | A second websocket per tab (`/ws/notify`) pings you about DMs and ride-chat messages when you're not looking at that chat: toast in the corner, unread badge on the nav, per-conversation badges in the inbox, and a desktop notification if the tab is in the background. Read markers clear badges as you read. | `lib/notify.jsx`, `components/Toasts.jsx`, `routers/chat.py` |
| Friends & DM requests | Send / accept / decline / cancel / unfriend, stored in a `friendships` table and pushed live over the notify socket. Search by name, plus suggestions from your hostel. Messages from non-friends land in a Requests tab; accepting makes you friends. Online dots come from who has the app open. Dock on the map page, and Chats / Requests / Friends tabs in Messages. | `routers/friends.py`, `components/FriendsDock.jsx`, `pages/Messages.jsx` |
| Typing indicators | "Aarav is typing", throttled on both client and server. Anonymous chat shows the alias, never the name. | `lib/useRoom.js`, `ChatPanel.jsx` |
| Live presence on the map | Green counts on each hostel's pin and chip, plus "N people chatting right now". Public endpoint returns counts only. | `/api/presence`, `Landing.jsx` |
| Moderation panel | Accounts in `MOD_EMAILS` get `/mod`: every reported message across rooms, the real author behind anonymous ones, and Hide / Unhide / Dismiss reports / Mute 1h / Mute 24h. Changes appear live in the chat. | `routers/mod.py`, `pages/Moderation.jsx` |
| Leaderboard | Messages per hostel (both rooms) since Monday 00:00 IST, active members, most active person. Refreshes every 30s. | `routers/leaderboard.py`, `pages/Leaderboard.jsx` |

## Security notes (worth saying in the pitch)

- Passwords hashed with **Argon2id** (salted, memory-hard) and rehashed automatically if parameters change. Unknown emails still run a full hash check, so response time doesn't reveal which accounts exist.
- Sessions are **JWTs in httpOnly, SameSite=Lax cookies**, so page scripts can't read them. The websocket handshake uses the same cookie.
- Websocket **Origin check** blocks cross-site websocket hijacking.
- Rate limits on login, sign-up, posting, commenting and messages.
- Sign-up is limited to IIT Mandi email domains, with password strength rules.
- Uploaded images are verified, resized and **re-encoded to WebP**, which strips EXIF/GPS data. Non-images are rejected.
- Every room's access rule lives in one function (`resolve_room`) used by both REST and websockets.

## Hostel list

Hostels come from the GLB node names. **B24, B25 and B26 are excluded on purpose** (B25/B26 sit where the campus map shows "B-28"). Academic blocks, messes and faculty quarters aren't labelled or clickable. Edit `backend/app/hostels.py` to rename or add hostels (e.g. `DISPLAY_NAMES = {"B10": "B10 · Gauri Kund"}`); the frontend reads the list from `/api/hostels`.

## Past the hackathon

Rate limits and the websocket hub are in-memory, so run a single worker. For multiple workers, move both to Redis (pub/sub for broadcasts), and swap `create_all` for Alembic migrations.
