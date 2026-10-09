import { useNavigate } from 'react-router-dom'
import { useNotify } from '../lib/notify.jsx'
import Avatar from './Avatar.jsx'

export default function Toasts() {
  const { toasts, dismiss } = useNotify()
  const navigate = useNavigate()
  if (!toasts.length) return null
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          <button className="toast-main" onClick={() => { dismiss(t.id); navigate(t.href) }}>
            <Avatar name={t.title} size={34} />
            <span>
              <strong>{t.label} · {t.title}</strong>
              <span className="ellipsis">{t.body}</span>
            </span>
          </button>
          <button className="icon-btn" aria-label="Dismiss" onClick={() => dismiss(t.id)}>✕</button>
        </div>
      ))}
    </div>
  )
}
