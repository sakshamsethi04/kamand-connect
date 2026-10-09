import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api.js'
import { clock } from '../lib/format.js'
import { useRoom } from '../lib/useRoom.js'
import { useNotify } from '../lib/notify.jsx'
import Avatar from './Avatar.jsx'

const STATUS = { live: 'Live', connecting: 'Connecting…', reconnecting: 'Reconnecting…', denied: 'No access' }

export default function ChatPanel({ room, title, subtitle, emptyText = 'No messages yet. Say hello.', headerExtra, placeholder }) {
  const { messages, meta, status, online, notice, setNotice, hasMore, send, sendTyping, typing, setTyping, loadOlder, markHidden, failed } = useRoom(room)
  const { setViewing, refresh } = useNotify()
  const lastRead = useRef(0)
  const [draft, setDraft] = useState('')
  const [cooldownUntil, setCooldownUntil] = useState(0)
  const [now, setNow] = useState(Date.now())
  const listRef = useRef(null)
  const stick = useRef(true)
  const navigate = useNavigate()
  const anonymous = meta?.anonymous
  const slow = meta?.slowmode_seconds || 0

  useEffect(() => { setDraft(''); setCooldownUntil(0); stick.current = true; lastRead.current = 0 }, [room])
  useEffect(() => { if (failed) setDraft((d) => d || failed.body) }, [failed]) // give back unsent text

  // Tell the notifier this room is on screen, and mark DMs / ride chats read as messages arrive.
  const tracksUnread = room?.startsWith('dm:') || room?.startsWith('carpool:')
  useEffect(() => {
    setViewing(room)
    return () => setViewing(null)
  }, [room, setViewing])
  useEffect(() => {
    const last = messages[messages.length - 1]
    if (!tracksUnread || !last || last.id <= lastRead.current || document.hidden) return
    lastRead.current = last.id
    api(`/api/rooms/${encodeURIComponent(room)}/read`, { method: 'POST', body: { last_id: last.id } }).then(refresh).catch(() => {})
  }, [messages, room, tracksUnread, refresh])

  // Drop typing indicators that went quiet.
  const typers = Object.values(typing).filter((t) => t.until > now)
  useEffect(() => {
    if (!Object.keys(typing).length) return
    const t = setInterval(() => {
      setNow(Date.now())
      setTyping((cur) => {
        const live = Object.fromEntries(Object.entries(cur).filter(([, v]) => v.until > Date.now()))
        return Object.keys(live).length === Object.keys(cur).length ? cur : live
      })
    }, 700)
    return () => clearInterval(t)
  }, [typing, setTyping])

  // keep scrolled to bottom unless the reader scrolled up
  useLayoutEffect(() => {
    const el = listRef.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [messages])

  useEffect(() => {
    if (notice?.kind === 'slowmode' && notice.retryAfter) setCooldownUntil(Date.now() + notice.retryAfter * 1000)
  }, [notice])

  const cooling = cooldownUntil > now
  useEffect(() => {
    if (!cooling) return
    const t = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(t)
  }, [cooling])

  const submit = (e) => {
    e?.preventDefault()
    const body = draft.trim()
    if (!body || cooling || status !== 'live') return
    if (send(body)) {
      setDraft('')
      setNotice(null)
      stick.current = true
      if (slow) { setCooldownUntil(Date.now() + slow * 1000); setNow(Date.now()) }
    }
  }

  const report = async (m) => {
    if (!confirm('Report this message? It gets hidden for everyone once enough people report it.')) return
    try {
      await api(`/api/messages/${m.id}/report`, { method: 'POST' })
      markHidden(m.id)
    } catch (e) {
      setNotice({ kind: 'error', text: e.message, at: Date.now() })
    }
  }

  const onScroll = async (e) => {
    const el = e.currentTarget
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    if (el.scrollTop < 40 && hasMore) {
      const before = el.scrollHeight
      await loadOlder()
      requestAnimationFrame(() => { el.scrollTop = el.scrollHeight - before + el.scrollTop })
    }
  }

  const secondsLeft = Math.ceil((cooldownUntil - now) / 1000)

  return (
    <section className={`chat ${anonymous ? 'is-anon' : ''}`}>
      <header className="chat-head">
        <div>
          <h2>{title || meta?.title || 'Chat'}</h2>
          {subtitle && <p className="muted small">{subtitle}</p>}
        </div>
        <div className="chat-status">
          {headerExtra}
          <span className={`dot ${status}`} />
          <span className="small">{STATUS[status]}{status === 'live' && online ? ` · ${online} here` : ''}</span>
        </div>
      </header>

      <div className="chat-list" ref={listRef} onScroll={onScroll} aria-live="polite">
        {hasMore && <button className="link-btn center" onClick={loadOlder}>Load older messages</button>}
        {status !== 'denied' && messages.length === 0 && <p className="chat-empty">{emptyText}</p>}
        {messages.map((m, i) => {
          const prev = messages[i - 1]
          const name = anonymous ? m.sender.alias : m.sender.name
          const grouped = prev && (anonymous ? prev.sender.alias === m.sender.alias : prev.sender.id === m.sender.id)
            && new Date(m.created_at) - new Date(prev.created_at) < 5 * 60000
          return (
            <div key={m.id} className={`msg ${m.mine ? 'mine' : ''} ${grouped ? 'grouped' : ''}`}>
              <div className="msg-avatar">{!grouped && <Avatar name={name} size={34} anon={anonymous} />}</div>
              <div className="msg-main">
                {!grouped && (
                  <div className="msg-meta">
                    {anonymous || m.mine ? (
                      <strong>{name}{m.mine && ' (you)'}</strong>
                    ) : (
                      <button className="msg-name" title={`Message ${name}`} onClick={() => navigate(`/messages/${m.sender.id}`)}>{name}</button>
                    )}
                    {!anonymous && m.outsider && <span className="tag outsider">(outsider)</span>}
                    {!anonymous && meta?.kind !== 'hostel_residents' && <span className="tag">{m.sender.hostel?.toUpperCase()}</span>}
                    <time className="muted small">{clock(m.created_at)}</time>
                  </div>
                )}
                <div className="msg-body">
                  {m.hidden ? <em className="muted">Message hidden after reports</em> : m.body}
                  {!m.mine && !m.hidden && (
                    <button className="msg-report" onClick={() => report(m)} disabled={m.reported} title="Report message">
                      {m.reported ? 'Reported' : 'Report'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="typing" aria-live="polite">
        {typers.length > 0 && (
          <>
            <span className="typing-dots"><i /><i /><i /></span>
            {typers.length === 1 ? `${typers[0].name} is typing`
              : typers.length === 2 ? `${typers[0].name} and ${typers[1].name} are typing`
              : `${typers.length} people are typing`}
          </>
        )}
      </div>

      {notice && (
        <div className={`chat-notice ${notice.kind}`} role="status">
          {notice.kind === 'slowmode' && cooling ? `Slow mode: you can send again in ${secondsLeft}s` : notice.text}
          <button className="icon-btn" onClick={() => setNotice(null)} aria-label="Dismiss">✕</button>
        </div>
      )}

      {status !== 'denied' && (
        <form className="chat-input" onSubmit={submit}>
          <textarea
            rows={1}
            value={draft}
            maxLength={1000}
            onChange={(e) => { setDraft(e.target.value); if (e.target.value.trim()) sendTyping() }}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() } }}
            placeholder={placeholder || (anonymous ? 'Say something kind. Nobody sees your name.' : 'Write a message')}
            aria-label="Message"
          />
          <button className="btn primary" disabled={!draft.trim() || cooling || status !== 'live'}>
            {cooling ? `${secondsLeft}s` : 'Send'}
          </button>
        </form>
      )}
    </section>
  )
}
