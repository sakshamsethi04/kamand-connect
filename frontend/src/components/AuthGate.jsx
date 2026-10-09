import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth.jsx'
import Modal from './Modal.jsx'

/** Popup shown whenever a logged-out visitor tries to open a chat or a hostel. */
export function AuthPrompt({ next, what = 'this', onClose }) {
  const navigate = useNavigate()
  const go = (path) => navigate(`${path}?next=${encodeURIComponent(next || '/')}`)
  return (
    <Modal title="Log in to continue" onClose={onClose} width={420}>
      <p className="muted">Kamand Connect is only for IIT Mandi. Log in with your institute email to open {what}.</p>
      <div className="row gap end" style={{ marginTop: 20 }}>
        <button className="btn ghost" onClick={() => go('/register')}>Create account</button>
        <button className="btn primary" onClick={() => go('/login')}>Log in</button>
      </div>
    </Modal>
  )
}

export function RequireAuth({ children, what }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  if (loading) return <div className="page-center"><span className="spinner" /></div>
  if (user) return children
  return (
    <div className="gated">
      <AuthPrompt next={location.pathname + location.search} what={what} onClose={() => navigate('/')} />
    </div>
  )
}
