import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import Avatar from '../components/Avatar.jsx'
import ChatPanel from '../components/ChatPanel.jsx'
import FriendButton from '../components/FriendButton.jsx'
import { FindPeople } from '../components/FriendsDock.jsx'
import { api } from '../lib/api.js'
import { timeAgo } from '../lib/format.js'
import { useNotify } from '../lib/notify.jsx'

const Person = ({ u, size = 34 }) => (
  <span className="presence-wrap"><Avatar name={u.name} size={size} />{u.online && <i className="presence" />}</span>
)

export default function Messages() {
  const { userId } = useParams()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') || 'chats'
  const { lastEvent, refresh } = useNotify()
  const [convos, setConvos] = useState([])
  const [friends, setFriends] = useState({ friends: [], incoming: [], outgoing: [] })
  const [active, setActive] = useState(null)
  const [error, setError] = useState('')
  const [finding, setFinding] = useState(false)

  const load = useCallback(() => {
    api('/api/dm/conversations').then((d) => setConvos(d.conversations)).catch(() => {})
    api('/api/friends').then(setFriends).catch(() => {})
  }, [])
  useEffect(() => {
    load()
    const t = setInterval(load, 30000)
    return () => clearInterval(t)
  }, [load, lastEvent?.at, userId])

  useEffect(() => {
    setError('')
    if (!userId) return setActive(null)
    api(`/api/dm/with/${userId}`).then(setActive).catch((e) => { setActive(null); setError(e.message) })
  }, [userId])

  const changed = () => { load(); refresh?.() }
  const chats = convos.filter((c) => !c.request)
  const dmRequests = convos.filter((c) => c.request)
  const requestCount = dmRequests.length + friends.incoming.length
  const setTab = (t) => setParams(t === 'chats' ? {} : { tab: t })

  return (
    <div className={`chat-layout dm ${userId ? 'has-active' : ''}`}>
      <aside className="side">
        <div className="side-head">
          <div className="row between">
            <h3>Messages</h3>
            <button className="btn small primary" onClick={() => setFinding(true)}>Find friends</button>
          </div>
          <div className="segmented small full">
            <button className={tab === 'chats' ? 'on' : ''} onClick={() => setTab('chats')}>Chats</button>
            <button className={tab === 'requests' ? 'on' : ''} onClick={() => setTab('requests')}>
              Requests{requestCount > 0 && <span className="badge inline">{requestCount}</span>}
            </button>
            <button className={tab === 'friends' ? 'on' : ''} onClick={() => setTab('friends')}>Friends</button>
          </div>
        </div>

        <ul className="side-list people">
          {tab === 'chats' && (
            <>
              {chats.length === 0 && <li className="muted small pad">No chats yet. Find a friend, or tap any name in a hostel chat.</li>}
              {chats.map((c) => (
                <li key={c.room}>
                  <Link to={`/messages/${c.user.id}`} className={String(c.user.id) === userId ? 'active' : ''}>
                    <Person u={c.user} />
                    <span className="convo">
                      <strong>{c.user.name}</strong>
                      <span className="muted small ellipsis">{c.last.mine ? 'You: ' : ''}{c.last.body ?? 'Message hidden'}</span>
                    </span>
                    <span className="convo-side">
                      <span className="muted small">{timeAgo(c.last.created_at)}</span>
                      {c.unread > 0 && String(c.user.id) !== userId && <span className="badge inline">{c.unread}</span>}
                    </span>
                  </Link>
                </li>
              ))}
            </>
          )}

          {tab === 'requests' && (
            <>
              {requestCount === 0 && <li className="muted small pad">No requests right now.</li>}
              {friends.incoming.map((u) => (
                <li key={`f${u.id}`} className="request-row">
                  <Person u={u} />
                  <span className="convo"><strong>{u.name}</strong><span className="muted small">Friend request · {u.hostel.toUpperCase()}</span></span>
                  <span className="row gap">
                    <FriendButton user={u} status="incoming" onChange={changed} />
                    <button className="icon-btn" title="Decline" onClick={() => api(`/api/friends/${u.id}`, { method: 'DELETE' }).then(changed)}>✕</button>
                  </span>
                </li>
              ))}
              {dmRequests.map((c) => (
                <li key={c.room}>
                  <Link to={`/messages/${c.user.id}`} className={String(c.user.id) === userId ? 'active' : ''}>
                    <Person u={c.user} />
                    <span className="convo">
                      <strong>{c.user.name}</strong>
                      <span className="muted small ellipsis">Message request: {c.last.body ?? 'hidden'}</span>
                    </span>
                    {c.unread > 0 && <span className="badge inline">{c.unread}</span>}
                  </Link>
                </li>
              ))}
            </>
          )}

          {tab === 'friends' && (
            <>
              {friends.friends.length === 0 && <li className="muted small pad">No friends yet. Use Find friends above.</li>}
              {friends.friends.map((u) => (
                <li key={u.id}>
                  <Link to={`/messages/${u.id}`} className={String(u.id) === userId ? 'active' : ''}>
                    <Person u={u} />
                    <span className="convo"><strong>{u.name}</strong><span className="muted small">{u.online ? 'Online' : 'Offline'} · {u.hostel.toUpperCase()}</span></span>
                  </Link>
                </li>
              ))}
              {friends.outgoing.length > 0 && <li className="muted small pad">Waiting for {friends.outgoing.map((u) => u.name.split(' ')[0]).join(', ')} to accept.</li>}
            </>
          )}
        </ul>
      </aside>

      <div className="chat-col">
        {userId && <Link to="/messages" className="back-link mobile-only">All messages</Link>}
        {active ? (
          <>
            {active.user.friendship !== 'friends' && (
              <div className="dm-banner">
                {active.user.friendship === 'incoming' ? `${active.user.name} sent you a friend request.`
                  : active.user.friendship === 'outgoing' ? 'Friend request sent. You can still chat.'
                  : `You and ${active.user.name.split(' ')[0]} aren't friends yet. Messages land in their Requests.`}
                <FriendButton key={active.user.id} user={active.user} status={active.user.friendship}
                  onChange={(s) => { setActive({ ...active, user: { ...active.user, friendship: s } }); changed() }} />
              </div>
            )}
            <ChatPanel key={active.room} room={active.room} title={active.user.name}
              subtitle={`${active.user.online ? 'Online' : 'Offline'} · ${active.user.hostel.toUpperCase()} · only the two of you can see this`}
              emptyText={`Start your conversation with ${active.user.name.split(' ')[0]}.`} />
          </>
        ) : (
          <div className="page-center muted">{error || 'Pick a chat, or find a friend to message.'}</div>
        )}
      </div>
      {finding && <FindPeople onClose={() => { setFinding(false); load() }} />}
    </div>
  )
}
