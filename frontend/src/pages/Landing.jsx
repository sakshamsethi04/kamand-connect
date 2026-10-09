import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AuthPrompt } from '../components/AuthGate.jsx'
import FriendsDock from '../components/FriendsDock.jsx'
import { api } from '../lib/api.js'
import { useAuth } from '../lib/auth.jsx'

const CampusScene = lazy(() => import('../components/CampusScene.jsx'))
const FALLBACK_CODES = Array.from({ length: 16 }, (_, i) => `B${i + 8}`)

function hasWebGL() {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch { return false }
}

/** Night between 18:30 and 06:15 local time, re-checked every minute. */
function useIsNight(mode) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(t)
  }, [])
  const h = now.getHours() + now.getMinutes() / 60
  const auto = h < 6.25 || h >= 18.5
  return { night: mode === 'auto' ? auto : mode === 'night', now }
}

export default function Landing() {
  const { user, hostels } = useAuth()
  const navigate = useNavigate()
  const [hovered, setHovered] = useState(null)
  const [prompt, setPrompt] = useState(null)
  const [mode, setMode] = useState('auto')
  const { night, now } = useIsNight(mode)
  const webgl = useMemo(hasWebGL, [])
  const [online, setOnline] = useState({})
  useEffect(() => {
    const load = () => api('/api/presence').then((d) => setOnline(d.hostels)).catch(() => {})
    load()
    const t = setInterval(load, 10000)
    return () => clearInterval(t)
  }, [])
  const totalOnline = Object.values(online).reduce((a, b) => a + b, 0)
  const codes = useMemo(() => (hostels.length ? hostels.map((h) => h.code) : FALLBACK_CODES), [hostels])

  const open = (code) => {
    const slug = code.toLowerCase()
    if (!user) setPrompt(slug)
    else navigate(`/hostel/${slug}`)
  }

  return (
    <div className={`landing ${night ? 'night' : 'day'}`}>
      <div className="scene">
        {webgl ? (
          <Suspense fallback={<div className="scene-loading center-abs">Loading campus</div>}>
            <CampusScene hostelCodes={codes} night={night} hovered={hovered} onHover={setHovered} onSelect={open} online={online} />
          </Suspense>
        ) : (
          <img className="scene-fallback" src={night ? '/img/campus-night.jpg' : '/img/campus-day.jpg'} alt="North campus, IIT Mandi" />
        )}
      </div>

      <div className="landing-copy">
        <h1>Every hostel has a room.</h1>
        <p>Hover a hostel to find it. Click it to join its chat.</p>
        {totalOnline > 0 && <p className="online-now"><span className="dot live" /> {totalOnline} {totalOnline === 1 ? 'person' : 'people'} chatting right now</p>}
      </div>

      <FriendsDock night={night} />

      <div className="sky-switch" role="radiogroup" aria-label="Lighting">
        <span className="small">{now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</span>
        {[['auto', 'Live'], ['day', 'Day'], ['night', 'Night']].map(([m, label]) => (
          <button key={m} role="radio" aria-checked={mode === m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>{label}</button>
        ))}
      </div>

      <nav className="hostel-rail" aria-label="Hostels">
        {codes.map((code) => (
          <button key={code}
            className={`chip ${hovered === code ? 'on' : ''} ${user?.hostel === code.toLowerCase() ? 'mine' : ''}`}
            onMouseEnter={() => setHovered(code)} onMouseLeave={() => setHovered(null)}
            onFocus={() => setHovered(code)} onBlur={() => setHovered(null)}
            onClick={() => open(code)}>
            {code}
            {online[code.toLowerCase()] > 0 && <span className="chip-count" aria-label={`${online[code.toLowerCase()]} online`}>{online[code.toLowerCase()]}</span>}
          </button>
        ))}
      </nav>

      {prompt && <AuthPrompt next={`/hostel/${prompt}`} what={`the ${prompt.toUpperCase()} chat`} onClose={() => setPrompt(null)} />}
    </div>
  )
}
