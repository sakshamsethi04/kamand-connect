import { useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../lib/auth.jsx'
import { AuthShell, safeNext } from './Login.jsx'

function strength(pw) {
  let s = 0
  if (pw.length >= 8) s++
  if (pw.length >= 12) s++
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++
  if (/\d/.test(pw)) s++
  if (/[^A-Za-z0-9]/.test(pw)) s++
  return Math.min(s, 4)
}
const LABELS = ['Too short', 'Weak', 'Okay', 'Good', 'Strong']

export default function Register() {
  const { user, register, hostels } = useAuth()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', email: '', hostel: '', password: '', confirm: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  const s = strength(form.password)

  if (user) return <Navigate to={next} replace />

  const submit = async (e) => {
    e.preventDefault()
    if (form.password !== form.confirm) return setError("Passwords don't match")
    if (!form.hostel) return setError('Pick your hostel')
    setBusy(true)
    setError('')
    try {
      await register({ name: form.name.trim(), email: form.email.trim(), hostel: form.hostel, password: form.password })
      navigate(next, { replace: true })
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <AuthShell title="Create your account" aside="Your hostel decides which residents-only room you get. Everyone can visit common rooms.">
      <form onSubmit={submit} className="stack">
        <label className="field">
          <span>Full name</span>
          <input autoComplete="name" value={form.name} onChange={set('name')} minLength={2} maxLength={60} required />
        </label>
        <label className="field">
          <span>Institute email</span>
          <input type="email" autoComplete="email" value={form.email} onChange={set('email')} placeholder="b23xxx@students.iitmandi.ac.in" required />
        </label>
        <label className="field">
          <span>Hostel</span>
          <select value={form.hostel} onChange={set('hostel')} required>
            <option value="">Choose your hostel</option>
            {hostels.map((h) => <option key={h.slug} value={h.slug}>{h.name}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Password</span>
          <input type="password" autoComplete="new-password" value={form.password} onChange={set('password')} minLength={8} maxLength={128} required />
          {form.password && (
            <div className="meter" aria-label={`Password strength: ${LABELS[s]}`}>
              <div className={`meter-bar s${s}`} style={{ width: `${(s / 4) * 100}%` }} />
              <span className="small muted">{LABELS[s]}. Use 8+ characters with letters and numbers.</span>
            </div>
          )}
        </label>
        <label className="field">
          <span>Confirm password</span>
          <input type="password" autoComplete="new-password" value={form.confirm} onChange={set('confirm')} required />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn primary block" disabled={busy}>{busy ? 'Creating account…' : 'Create account'}</button>
        <p className="muted center">Already registered? <Link to={`/login?next=${encodeURIComponent(next)}`}>Log in</Link></p>
      </form>
    </AuthShell>
  )
}
