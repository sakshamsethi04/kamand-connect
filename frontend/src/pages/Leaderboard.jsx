import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api.js'
import { useAuth } from '../lib/auth.jsx'

export default function Leaderboard() {
  const { user } = useAuth()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const load = () => api('/api/leaderboard').then(setData).catch((e) => setError(e.message))
    load()
    const t = setInterval(load, 30000)
    return () => clearInterval(t)
  }, [])

  const rows = data?.hostels || []
  const top = rows[0]?.messages || 1
  const podium = rows.slice(0, 3)
  const weekOf = data && new Date(data.week_start).toLocaleDateString(undefined, { day: 'numeric', month: 'long' })

  return (
    <div className="leader">
      <section className="leader-hero" style={{ backgroundImage: 'url(/img/p2.jpg)' }}>
        <div className="leader-hero-copy">
          <h1>Loudest hostel this week</h1>
          <p>{data ? `Messages in each hostel's rooms since Monday, ${weekOf}. Resets every Monday.` : 'Counting messages…'}</p>
        </div>
        {podium.length === 3 && podium[0].messages > 0 && (
          <ol className="podium">
            {[podium[1], podium[0], podium[2]].map((h) => (
              <li key={h.slug} className={`place p${h.rank}`}>
                <span className="place-code">{h.code}</span>
                <span className="place-count">{h.messages.toLocaleString()} messages</span>
                <div className="place-block"><span>{h.rank}</span></div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="leader-table">
        {error && <p className="error">{error}</p>}
        {data && rows.every((r) => r.messages === 0) && (
          <p className="panel empty">No hostel messages yet this week. <Link to="/">Pick a hostel on the map</Link> and get yours on the board.</p>
        )}
        <ol>
          {rows.map((h) => (
            <li key={h.slug} className={`leader-row ${user?.hostel === h.slug ? 'mine' : ''}`}>
              <span className="rank">{h.rank}</span>
              <div className="leader-info">
                <div className="row between">
                  <Link to={`/hostel/${h.slug}`} className="leader-name">{h.name}{user?.hostel === h.slug && <span className="tag">Yours</span>}</Link>
                  <strong>{h.messages.toLocaleString()}</strong>
                </div>
                <div className="bar"><div style={{ width: `${(h.messages / top) * 100}%` }} /></div>
                <p className="muted small">
                  {h.active_members} active this week · {h.residents} registered
                  {h.top_chatter && ` · Most active: ${h.top_chatter.name} (${h.top_chatter.messages})`}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}
