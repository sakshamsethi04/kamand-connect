import { useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../lib/auth.jsx'

export const safeNext = (n) => (n && n.startsWith('/') && !n.startsWith('//') ? n : '/')

export function AuthShell({ title, children, aside }) {
  return (
    <div className="auth-page">
      <div className="auth-art" style={{ backgroundImage: 'url(/img/p1.jpg)' }}>
        <div className="auth-art-copy">
          <img src="/img/logo.png" alt="" width="72" />
          <p>{aside}</p>
        </div>
      </div>
      <div className="auth-form">
        <h1>{title}</h1>
        {children}
      </div>
    </div>
  )
}

export default function Login() {
  const { user, login } = useAuth()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (user) return <Navigate to={next} replace />

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await login(email.trim(), password)
      navigate(next, { replace: true })
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <AuthShell title="Log in" aside="Hostel chats, concerns, rides and lost things, all in one place for Kamand.">
      <form onSubmit={submit} className="stack">
        <label className="field">
          <span>Institute email</span>
          <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="b23xxx@students.iitmandi.ac.in" required />
        </label>
        <label className="field">
          <span>Password</span>
          <div className="pw">
            <input type={show ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            <button type="button" className="link-btn small" onClick={() => setShow(!show)}>{show ? 'Hide' : 'Show'}</button>
          </div>
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn primary block" disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</button>
        <p className="muted center">New here? <Link to={`/register?next=${encodeURIComponent(next)}`}>Create an account</Link></p>
      </form>
    </AuthShell>
  )
}
