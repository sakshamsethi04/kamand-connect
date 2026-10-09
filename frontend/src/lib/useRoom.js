import { useCallback, useEffect, useRef, useState } from 'react'
import { api, wsUrl } from './api.js'

const merge = (a, b) => {
  const map = new Map()
  for (const m of [...a, ...b]) map.set(m.id, { ...map.get(m.id), ...m })
  return [...map.values()].sort((x, y) => x.id - y.id)
}

/** History over REST + live updates over a WebSocket, with reconnect and backoff. */
export function useRoom(room) {
  const [messages, setMessages] = useState([])
  const [meta, setMeta] = useState(null)
  const [status, setStatus] = useState('connecting')
  const [online, setOnline] = useState(0)
  const [notice, setNotice] = useState(null)
  const [hasMore, setHasMore] = useState(false)
  const [typing, setTyping] = useState({}) // key -> { name, until }
  const wsRef = useRef(null)
  const lastTyping = useRef(0)
  const pending = useRef(null) // { body, timer } until the server echoes it back
  const [failed, setFailed] = useState(null)
  const reviveRef = useRef(null)

  const loadLatest = useCallback(async () => {
    const d = await api(`/api/rooms/${encodeURIComponent(room)}/messages`)
    setMeta(d.room)
    setHasMore(d.has_more)
    setMessages((prev) => merge(prev, d.messages))
  }, [room])

  useEffect(() => {
    if (!room) return
    let closed = false
    let retry = 0
    let timer
    setMessages([])
    setNotice(null)
    setMeta(null)
    setTyping({})
    setStatus('connecting')

    loadLatest().catch((e) => {
      setNotice({ kind: 'error', text: e.message })
      if (e.status === 403 || e.status === 404) { closed = true; setStatus('denied') }
    })

    let heartbeat
    let lastSeen = Date.now()
    // A socket can look open while the server behind a proxy is gone (Render restarts / sleeps).
    // Drop it and dial again instead of waiting for a close event that never comes.
    const abandon = (ws) => {
      clearInterval(heartbeat)
      ws.onclose = ws.onmessage = null
      try { ws.close() } catch { /* already dead */ }
      if (closed) return
      setStatus('reconnecting')
      retry = Math.max(retry, 1)
      timer = setTimeout(connect, 300)
    }
    reviveRef.current = () => wsRef.current && abandon(wsRef.current)
    const connect = () => {
      if (closed) return
      const ws = new WebSocket(wsUrl(room))
      wsRef.current = ws
      ws.onopen = () => {
        setStatus('live')
        if (retry > 0) loadLatest().catch(() => {})
        retry = 0
        lastSeen = Date.now()
        clearInterval(heartbeat)
        heartbeat = setInterval(() => {
          if (Date.now() - lastSeen > 25000) return abandon(ws)
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' }))
        }, 10000)
      }
      ws.onmessage = (ev) => {
        lastSeen = Date.now()
        const d = JSON.parse(ev.data)
        if (d.type !== 'pong' && d.type !== 'presence' && d.type !== 'typing' && pending.current &&
            (d.type !== 'message' || d.message.mine)) {
          clearTimeout(pending.current.timer) // server answered our send
          pending.current = null
        }
        if (d.type === 'pong') return
        if (d.type === 'message') {
          setMessages((m) => merge(m, [d.message]))
          const key = d.message.sender.alias || d.message.sender.name
          setTyping((t) => { if (!t[key]) return t; const n = { ...t }; delete n[key]; return n })
        }
        else if (d.type === 'typing') setTyping((t) => ({ ...t, [d.key]: { name: d.name, until: Date.now() + 3500 } }))
        else if (d.type === 'hidden') setMessages((m) => m.map((x) => (x.id === d.id ? { ...x, hidden: true, body: null } : x)))
        else if (d.type === 'presence') setOnline(d.count)
        else if (d.type === 'error' || d.type === 'slowmode')
          setNotice({ kind: d.type, text: d.detail, retryAfter: d.retry_after, at: Date.now() })
        else if (d.type === 'closed') { closed = true; setStatus('denied'); setNotice({ kind: 'error', text: d.detail }) }
      }
      ws.onclose = (ev) => {
        clearInterval(heartbeat)
        if (closed) return
        if (ev.code === 4401 || ev.code === 4403) {
          setStatus('denied')
          setNotice({ kind: 'error', text: ev.reason || "You can't join this room." })
          return
        }
        setStatus('reconnecting')
        timer = setTimeout(connect, Math.min(1000 * 2 ** retry++, 10000))
      }
    }
    connect()
    return () => {
      closed = true
      clearTimeout(timer)
      clearInterval(heartbeat)
      clearTimeout(pending.current?.timer)
      pending.current = null
      wsRef.current?.close()
    }
  }, [room, loadLatest])

  const send = useCallback((body) => {
    const ws = wsRef.current
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'message', body }))
      clearTimeout(pending.current?.timer)
      pending.current = {
        body,
        timer: setTimeout(() => { // no echo in 6s: the connection is dead, so give the text back and redial
          pending.current = null
          setFailed({ body, at: Date.now() })
          setNotice({ kind: 'error', text: "That message didn't go through. Reconnected, so tap Send again.", at: Date.now() })
          reviveRef.current?.()
        }, 6000),
      }
      return true
    }
    setNotice({ kind: 'error', text: 'Not connected yet. Your message was not sent.', at: Date.now() })
    return false
  }, [])

  const sendTyping = useCallback(() => {
    const ws = wsRef.current
    if (ws?.readyState === WebSocket.OPEN && Date.now() - lastTyping.current > 1800) {
      lastTyping.current = Date.now()
      ws.send(JSON.stringify({ type: 'typing' }))
    }
  }, [])

  const loadOlder = useCallback(async () => {
    const first = messages[0]
    if (!first) return
    const d = await api(`/api/rooms/${encodeURIComponent(room)}/messages?before=${first.id}`)
    setHasMore(d.has_more)
    setMessages((prev) => merge(d.messages, prev))
  }, [room, messages])

  const markHidden = useCallback((id) => setMessages((m) => m.map((x) => (x.id === id ? { ...x, reported: true } : x))), [])

  return { messages, meta, status, online, notice, setNotice, hasMore, send, sendTyping, typing, setTyping, loadOlder, markHidden, failed }
}
