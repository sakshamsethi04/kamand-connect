import { hueFor } from '../lib/format.js'

export default function Avatar({ name = '?', size = 32, anon = false }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase()
  const hue = hueFor(name)
  return (
    <span className={`avatar ${anon ? 'anon' : ''}`} aria-hidden="true"
      style={{ width: size, height: size, fontSize: size * 0.4, background: anon ? undefined : `hsl(${hue} 45% 38%)` }}>
      {anon ? '?' : initials}
    </span>
  )
}
