import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { api } from './api.js'
import { useAuth } from './auth.jsx'

const NotifyCtx = createContext({ dmUnread: 0, rideUnread: 0, toasts: [], lastEvent: null })
const notifyUrl = () => `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/notify`

/** One socket per logged-in tab that hears about DMs and ride chats you're not currently looking at. */
export function NotifyProvider({ children }) {
  const { user } = useAuth()
  const routeRef = useRef('')
  const loc = useLocation()
  routeRef.current = loc.pathname + loc.search
  const [counts, setCounts] = useState({ dm_unread: 0, ride_unread: 0, friend_requests: 0 })
  const [toasts, setToasts] = useState([])
  const [lastEvent, setLastEvent] = useState(null)
  const viewing = useRef(null) // room key ChatPanel says is on screen

  const refresh = useCallback(() => {
    if (!user) return
    api('/api/notifications/summary').then(setCounts).catch(() => {})
  }, [user])

  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), [])

  useEffect(() => {
    if (!user) { setCounts({ dm_unread: 0, ride_unread: 0, friend_requests: 0 }); setToasts([]); return }
    refresh()
    let ws, timer, ping, closed = false, retry = 0
    const connect = () => {
      ws = new WebSocket(notifyUrl())
      ws.onopen = () => { retry = 0; ping = setInterval(() => ws.readyState === 1 && ws.send('ping'), 25000) }
      ws.onmessage = (ev) => {
        const d = JSON.parse(ev.data)
        setLastEvent({ ...d, at: Date.now() })
        if (d.type?.startsWith('friend')) {
          refresh()
          const id = `${Date.now()}-${Math.random()}`
          const req = d.type === 'friend_request'
          setToasts((t) => [...t.slice(-3), { id, kind: 'friend', label: req ? 'Friend request' : 'Now friends', title: d.from.name,
            body: req ? 'wants to be friends' : 'accepted your request', href: req ? '/messages?tab=requests' : `/messages/${d.from.id}` }])
          setTimeout(() => dismiss(id), 6000)
          return
        }
        if (viewing.current === d.room) return // already on screen; ChatPanel marks it read
        refresh()
        const id = `${Date.now()}-${Math.random()}`
        const href = d.type === 'dm' ? `/messages/${d.from.id}` : `/carpool?ride=${d.room.split(':')[1]}`
        const title = d.type === 'dm' ? d.from.name : `${d.from.name} · ${d.title}`
        setToasts((t) => [...t.slice(-3), { id, title, body: d.preview, href, kind: d.type, label: d.type === 'ride' ? 'Ride chat' : d.request ? 'Message request' : 'New message' }])
        setTimeout(() => dismiss(id), 6000)
        if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
          new Notification(title, { body: d.preview, icon: '/img/logo.png' })
        }
      }
      ws.onclose = (ev) => {
        clearInterval(ping)
        if (closed || ev.code === 4401) return
        timer = setTimeout(connect, Math.min(1000 * 2 ** retry++, 15000))
      }
    }
    connect()
    return () => { closed = true; clearTimeout(timer); clearInterval(ping); ws?.close() }
  }, [user, refresh, dismiss])

  const setViewing = useCallback((room) => { viewing.current = room }, [])

  return (
    <NotifyCtx.Provider value={{ dmUnread: counts.dm_unread, rideUnread: counts.ride_unread, friendRequests: counts.friend_requests || 0, toasts, dismiss, lastEvent, refresh, setViewing }}>
      {children}
    </NotifyCtx.Provider>
  )
}

export const useNotify = () => useContext(NotifyCtx)
