import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth.jsx'
import { useNotify } from '../lib/notify.jsx'
import Avatar from './Avatar.jsx'

const LINKS = [
  ['/lost-found', 'Lost & found'],
  ['/concerns', 'Raise a concern'],
  ['/carpool', 'Carpool'],
  ['/leaderboard', 'Chat leaderboard'],
  ['/anon', 'Anonymous chat'],
]

export default function Navbar() {
  const { user, logout, hostelName } = useAuth()
  const { dmUnread, rideUnread, friendRequests } = useNotify()
  const [open, setOpen] = useState(false)
  const [menu, setMenu] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const menuRef = useRef(null)

  useEffect(() => { setOpen(false); setMenu(false) }, [location.pathname])
  useEffect(() => {
    const close = (e) => menuRef.current && !menuRef.current.contains(e.target) && setMenu(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  return (
    <header className="nav">
      <Link to="/" className="brand" aria-label="Kamand Connect home">
        <img src="/img/logo.png" alt="" className="brand-logo" />
        <span className="brand-name">Kamand<span>Connect</span></span>
      </Link>

      <button className="nav-toggle" aria-label="Menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span /><span /><span />
      </button>

      <nav className={`nav-links ${open ? 'open' : ''}`}>
        {LINKS.map(([to, label]) => (
          <NavLink key={to} to={to} className={({ isActive }) => `nav-link ${to === '/anon' ? 'anon' : ''} ${isActive ? 'active' : ''}`}>
            {label}
          </NavLink>
        ))}
        {!user && (
          <div className="nav-auth">
            <NavLink to="/login" className="nav-link">Log in</NavLink>
            <NavLink to="/register" className="btn amber small">Register</NavLink>
          </div>
        )}
      </nav>

      {user ? (
        <div className="nav-user" ref={menuRef}>
          <NavLink to="/messages" className="nav-icon" aria-label="Direct messages" title="Direct messages">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg>
            {dmUnread + friendRequests > 0 && <span className="badge" aria-label={`${dmUnread + friendRequests} new`}>{dmUnread + friendRequests > 99 ? '99+' : dmUnread + friendRequests}</span>}
          </NavLink>
          <button className="avatar-btn" onClick={() => setMenu(!menu)} aria-label="Account menu" aria-expanded={menu}>
            <Avatar name={user.name} size={36} />
          </button>
          {menu && (
            <div className="menu">
              <div className="menu-head">
                <strong>{user.name}</strong>
                <span className="muted small">{hostelName(user.hostel)}</span>
              </div>
              <Link to={`/hostel/${user.hostel}`}>My hostel chat</Link>
              <Link to="/messages">Direct messages</Link>
              <Link to="/carpool?mine=1">My rides{rideUnread > 0 && <span className="badge inline">{rideUnread}</span>}</Link>
              {user.is_mod && <Link to="/mod">Moderation</Link>}
              <button onClick={async () => { await logout(); navigate('/') }}>Log out</button>
            </div>
          )}
        </div>
      ) : (
        <Link to="/login" className="nav-icon guest" aria-label="Log in">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>
        </Link>
      )}
    </header>
  )
}
