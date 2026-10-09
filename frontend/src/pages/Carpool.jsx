import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Avatar from '../components/Avatar.jsx'
import ChatPanel from '../components/ChatPanel.jsx'
import { api } from '../lib/api.js'
import { rideTime } from '../lib/format.js'

const toLocalInput = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)

export default function Carpool() {
  const [meta, setMeta] = useState({ locations: [], routes: [] })
  const [pools, setPools] = useState([])
  const [form, setForm] = useState({ from_loc: 'North Campus', to_loc: 'Mandi', depart_at: toLocalInput(new Date(Date.now() + 3600000)), seats: 4, note: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [chatId, setChatId] = useState(null)
  const [params, setParams] = useSearchParams()
  const mine = params.get('mine') === '1'
  const routeFilter = params.get('route') || ''
  const rideParam = params.get('ride')
  useEffect(() => { if (rideParam) setChatId(Number(rideParam)) }, [rideParam])
  const navigate = useNavigate()

  const destinations = useMemo(() => meta.routes.filter((r) => r.from === form.from_loc).map((r) => r.to), [meta, form.from_loc])

  const load = useCallback(async () => {
    const qs = new URLSearchParams()
    if (mine) qs.set('mine', 'true')
    if (routeFilter) { const [f, t] = routeFilter.split('|'); qs.set('from_loc', f); qs.set('to_loc', t) }
    try { setPools((await api(`/api/carpools?${qs}`)).carpools) } catch (e) { setError(e.message) }
  }, [mine, routeFilter])

  useEffect(() => { api('/api/carpools/meta').then(setMeta).catch(() => {}) }, [])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (destinations.length && !destinations.includes(form.to_loc)) setForm((f) => ({ ...f, to_loc: destinations[0] }))
  }, [destinations, form.to_loc])

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const create = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const d = await api('/api/carpools', { method: 'POST', body: { ...form, seats: Number(form.seats), depart_at: new Date(form.depart_at).toISOString() } })
      setPools((p) => [...p, d.carpool].sort((a, b) => a.depart_at.localeCompare(b.depart_at)))
      setChatId(d.carpool.id)
      setForm({ ...form, note: '' })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const act = async (pool, action) => {
    setError('')
    try {
      if (action === 'cancel') {
        if (!confirm('Cancel this ride for everyone?')) return
        await api(`/api/carpools/${pool.id}`, { method: 'DELETE' })
        setPools((p) => p.filter((x) => x.id !== pool.id))
        if (chatId === pool.id) setChatId(null)
        return
      }
      const d = await api(`/api/carpools/${pool.id}/${action}`, { method: 'POST' })
      setPools((p) => p.map((x) => (x.id === pool.id ? d.carpool : x)))
      if (action === 'join') setChatId(pool.id)
      if (action === 'leave' && chatId === pool.id) setChatId(null)
    } catch (err) {
      setError(err.message)
    }
  }

  const chatPool = pools.find((p) => p.id === chatId && p.is_member)

  return (
    <div className="carpool">
      <div className="carpool-main">
        <form className="ride-form panel" onSubmit={create}>
          <h1>Find people to share a ride</h1>
          <div className="ride-fields">
            <label className="field"><span>From</span>
              <select value={form.from_loc} onChange={set('from_loc')}>
                {meta.locations.filter((l) => meta.routes.some((r) => r.from === l)).map((l) => <option key={l}>{l}</option>)}
              </select>
            </label>
            <button type="button" className="swap" aria-label="Swap from and to" onClick={() => setForm({ ...form, from_loc: form.to_loc, to_loc: form.from_loc })}>⇄</button>
            <label className="field"><span>To</span>
              <select value={form.to_loc} onChange={set('to_loc')}>
                {destinations.map((l) => <option key={l}>{l}</option>)}
              </select>
            </label>
            <label className="field"><span>Leaving at</span>
              <input type="datetime-local" value={form.depart_at} min={toLocalInput(new Date())} onChange={set('depart_at')} required />
            </label>
            <label className="field seats"><span>Seats</span>
              <select value={form.seats} onChange={set('seats')}>{[2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n}>{n}</option>)}</select>
            </label>
          </div>
          <div className="row gap">
            <input className="grow" value={form.note} onChange={set('note')} maxLength={200} placeholder="Note (optional): meeting point, cab or bus, fare split" />
            <button className="btn primary" disabled={busy}>{busy ? 'Posting…' : 'Post ride'}</button>
          </div>
          {error && <p className="error" role="alert">{error}</p>}
        </form>

        <div className="board-tools">
          <div className="segmented small">
            <button className={!mine ? 'on' : ''} onClick={() => setParams({})}>All rides</button>
            <button className={mine ? 'on' : ''} onClick={() => setParams({ mine: '1' })}>My rides</button>
          </div>
          <select className="search" value={routeFilter} onChange={(e) => setParams(e.target.value ? { route: e.target.value, ...(mine ? { mine: '1' } : {}) } : mine ? { mine: '1' } : {})}>
            <option value="">Every route</option>
            {meta.routes.map((r) => <option key={`${r.from}|${r.to}`} value={`${r.from}|${r.to}`}>{r.from} to {r.to}</option>)}
          </select>
        </div>

        <div className="rides">
          {pools.length === 0 && <div className="panel empty"><p>{mine ? "You haven't joined any upcoming rides." : 'No upcoming rides on this route. Post one above and others can join.'}</p></div>}
          {pools.map((p) => (
            <article key={p.id} className={`ride panel ${chatId === p.id ? 'focused' : ''}`}>
              <div className="ride-route">
                <strong>{p.from}</strong><span className="ride-line" /><strong>{p.to}</strong>
              </div>
              <p className="ride-time">{rideTime(p.depart_at)}</p>
              {p.note && <p className="muted small">{p.note}</p>}
              <div className="ride-members">
                {p.members.map((m) => (
                  <button key={m.id} className="member" title={`Message ${m.name}`} onClick={() => navigate(`/messages/${m.id}`)}>
                    <Avatar name={m.name} size={26} /> <span>{m.name.split(' ')[0]}</span>
                    {m.id === p.creator.id && <span className="tag">Host</span>}
                  </button>
                ))}
                <span className={`seats-left ${p.seats_left ? '' : 'full'}`}>{p.seats_left ? `${p.seats_left} of ${p.seats} seats left` : 'Full'}</span>
              </div>
              <div className="row gap wrap">
                {p.is_member ? (
                  <>
                    <button className="btn primary small" onClick={() => setChatId(p.id)}>Open ride chat</button>
                    {p.is_creator
                      ? <button className="btn ghost small danger" onClick={() => act(p, 'cancel')}>Cancel ride</button>
                      : <button className="btn ghost small" onClick={() => act(p, 'leave')}>Leave</button>}
                  </>
                ) : (
                  <button className="btn amber small" disabled={!p.seats_left} onClick={() => act(p, 'join')}>Join this carpool</button>
                )}
              </div>
            </article>
          ))}
        </div>
      </div>

      <aside className={`carpool-chat ${chatPool ? 'open' : ''}`}>
        {chatPool ? (
          <>
            <button className="link-btn small close-drawer" onClick={() => setChatId(null)}>Close chat</button>
            <ChatPanel key={chatPool.room} room={chatPool.room} title={`${chatPool.from} to ${chatPool.to}`}
              subtitle={`${rideTime(chatPool.depart_at)} · ${chatPool.members.length} riding`}
              emptyText="Sort out the meeting point and fare here." />
          </>
        ) : (
          <div className="page-center muted pad">Join a ride to chat with everyone on it. Tap any rider's name to message them one-to-one.</div>
        )}
      </aside>
    </div>
  )
}
