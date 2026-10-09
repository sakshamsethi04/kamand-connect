import { useCallback, useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { api } from '../lib/api.js'
import { useAuth } from '../lib/auth.jsx'
import { timeAgo } from '../lib/format.js'

export default function Moderation() {
  const { user } = useAuth()
  const [view, setView] = useState('open')
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(null)

  const load = useCallback(() => {
    api(`/api/mod/reports?view=${view}`).then(setData).catch((e) => setError(e.message))
  }, [view])
  useEffect(() => {
    load()
    const t = setInterval(load, 15000)
    return () => clearInterval(t)
  }, [load])

  if (!user.is_mod) return <Navigate to="/" replace />

  const act = async (key, path, body) => {
    setBusy(key)
    setError('')
    try { await api(path, { method: 'POST', body }); load() } catch (e) { setError(e.message) } finally { setBusy(null) }
  }

  return (
    <div className="mod">
      <header className="mod-head">
        <div>
          <h1>Moderation</h1>
          <p className="muted">Reported messages from every room, worst first. Actions apply live in the chat.</p>
        </div>
        {data && (
          <dl className="mod-stats">
            <div><dt>Reported</dt><dd>{data.stats.open_reports}</dd></div>
            <div><dt>Hidden</dt><dd>{data.stats.hidden}</dd></div>
            <div><dt>Muted now</dt><dd>{data.stats.muted}</dd></div>
          </dl>
        )}
      </header>

      <div className="segmented small">
        <button className={view === 'open' ? 'on' : ''} onClick={() => setView('open')}>All reported</button>
        <button className={view === 'hidden' ? 'on' : ''} onClick={() => setView('hidden')}>Hidden only</button>
      </div>
      {error && <p className="error">{error}</p>}
      {data && data.reports.length === 0 && <p className="panel empty">Nothing reported. The chats are behaving.</p>}

      <ul className="mod-list">
        {data?.reports.map((r) => (
          <li key={r.id} className={`panel mod-item ${r.hidden ? 'is-hidden' : ''}`}>
            <div className="mod-meta">
              <span className="tag">{r.room_label}</span>
              <span className="tag outsider">{r.report_count} {r.report_count === 1 ? 'report' : 'reports'}</span>
              {r.hidden && <span className="tag lost">Hidden</span>}
              <span className="muted small">{timeAgo(r.created_at)}</span>
            </div>
            <blockquote>{r.body}</blockquote>
            <p className="small">
              <strong>{r.sender.name}</strong> · {r.sender.email} · {r.sender.hostel.toUpperCase()}
              {r.alias && <span className="muted"> · posted as “{r.alias}”</span>}
              {r.sender.muted_until && <span className="error"> · muted until {new Date(r.sender.muted_until).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</span>}
            </p>
            <div className="row gap wrap">
              <button className="btn small primary" disabled={busy} onClick={() => act(`h${r.id}`, `/api/mod/messages/${r.id}/hide`, { hidden: !r.hidden })}>
                {r.hidden ? 'Unhide' : 'Hide message'}
              </button>
              <button className="btn small ghost" disabled={busy} onClick={() => act(`d${r.id}`, `/api/mod/messages/${r.id}/dismiss`)}>Dismiss reports</button>
              {r.sender.muted_until ? (
                <button className="btn small ghost" disabled={busy} onClick={() => act(`m${r.id}`, `/api/mod/users/${r.sender.id}/mute`, { hours: 0 })}>Unmute</button>
              ) : (
                <>
                  <button className="btn small ghost danger" disabled={busy} onClick={() => act(`m${r.id}`, `/api/mod/users/${r.sender.id}/mute`, { hours: 1 })}>Mute 1h</button>
                  <button className="btn small ghost danger" disabled={busy} onClick={() => act(`m${r.id}`, `/api/mod/users/${r.sender.id}/mute`, { hours: 24 })}>Mute 24h</button>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
