import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../lib/api.js'
import { useAuth } from '../lib/auth.jsx'
import { useNotify } from '../lib/notify.jsx'
import Avatar from './Avatar.jsx'
import FriendButton from './FriendButton.jsx'
import Modal from './Modal.jsx'

export function FindPeople({ onClose }) {
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [users, setUsers] = useState([])
  const [title, setTitle] = useState('From your hostel')
  useEffect(() => {
    const t = setTimeout(() => {
      const url = q.trim() ? `/api/users/search?q=${encodeURIComponent(q.trim())}` : '/api/users/suggested'
      setTitle(q.trim() ? 'Results' : 'From your hostel')
      api(url).then((d) => setUsers(d.users)).catch(() => setUsers([]))
    }, 250)
    return () => clearTimeout(t)
  }, [q])
  return (
    <Modal title="Find friends" onClose={onClose} width={480}>
      <input autoFocus placeholder="Search by name" value={q} onChange={(e) => setQ(e.target.value)} />
      <p className="muted small" style={{ margin: '14px 0 6px' }}>{title}</p>
      <ul className="people-list">
        {users.length === 0 && <li className="muted small">{q ? 'Nobody matches that name.' : 'Nobody new from your hostel yet. Try searching.'}</li>}
        {users.map((u) => (
          <li key={u.id}>
            <span className="presence-wrap"><Avatar name={u.name} size={36} />{u.online && <i className="presence" />}</span>
            <span className="grow"><strong>{u.name}</strong><span className="muted small"> · {u.hostel.toUpperCase()}</span></span>
            <FriendButton user={u} status={u.friendship} />
            <button className="btn small ghost" onClick={() => { onClose(); navigate(`/messages/${u.id}`) }}>Message</button>
          </li>
        ))}
      </ul>
    </Modal>
  )
}

/** Sits on the landing page: online friends, requests, messages, and search. */
export default function FriendsDock({ night }) {
  const { user } = useAuth()
  const { dmUnread, friendRequests, lastEvent } = useNotify()
  const navigate = useNavigate()
  const [data, setData] = useState({ friends: [], incoming: [] })
  const [finding, setFinding] = useState(false)

  useEffect(() => {
    if (!user) return
    const load = () => api('/api/friends').then(setData).catch(() => {})
    load()
    const t = setInterval(load, 20000)
    return () => clearInterval(t)
  }, [user, lastEvent?.at])

  if (!user) {
    return (
      <div className={`friends-dock ${night ? 'night' : ''}`}>
        <div className="dock-copy"><strong>Friends & DMs</strong><span className="muted small">Log in to message friends one-to-one.</span></div>
        <Link className="btn small primary" to="/login">Log in</Link>
      </div>
    )
  }

  const online = data.friends.filter((f) => f.online).length
  return (
    <div className={`friends-dock ${night ? 'night' : ''}`}>
      <div className="dock-top">
        <strong>Friends <span className="muted small">{data.friends.length ? `${online} online` : ''}</span></strong>
        <div className="row gap">
          <button className="btn small ghost dock-btn" onClick={() => navigate('/messages')}>
            Messages{dmUnread > 0 && <span className="badge inline">{dmUnread}</span>}
          </button>
          {friendRequests > 0 && (
            <button className="btn small amber" onClick={() => navigate('/messages?tab=requests')}>Requests <span className="badge inline dark">{friendRequests}</span></button>
          )}
          <button className="btn small primary" onClick={() => setFinding(true)}>Find friends</button>
        </div>
      </div>
      <div className="dock-friends">
        {data.friends.length === 0 && <span className="muted small">No friends yet. Find people from your hostel and say hi.</span>}
        {data.friends.slice(0, 10).map((f) => (
          <button key={f.id} className="dock-friend" title={`Message ${f.name}${f.online ? ' (online)' : ''}`} onClick={() => navigate(`/messages/${f.id}`)}>
            <span className="presence-wrap"><Avatar name={f.name} size={34} />{f.online && <i className="presence" />}</span>
            <span className="small">{f.name.split(' ')[0]}</span>
          </button>
        ))}
        {data.friends.length > 10 && <Link className="small" to="/messages?tab=friends">+{data.friends.length - 10} more</Link>}
      </div>
      {finding && <FindPeople onClose={() => setFinding(false)} />}
    </div>
  )
}
