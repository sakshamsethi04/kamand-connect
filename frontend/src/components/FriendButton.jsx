import { useState } from 'react'
import { api } from '../lib/api.js'

const LABEL = { none: 'Add friend', outgoing: 'Requested', incoming: 'Accept', friends: 'Friends ✓' }

/** Add / cancel / accept / unfriend, all against the real friends API. */
export default function FriendButton({ user, status: initial = 'none', onChange, small = true }) {
  const [status, setStatus] = useState(initial)
  const [busy, setBusy] = useState(false)
  const go = async (e) => {
    e.stopPropagation()
    if (status === 'friends' && !confirm(`Remove ${user.name} from friends?`)) return
    setBusy(true)
    try {
      const path = `/api/friends/${user.id}${status === 'incoming' ? '/accept' : ''}`
      const method = status === 'outgoing' || status === 'friends' ? 'DELETE' : 'POST'
      const d = await api(path, { method })
      setStatus(d.friendship)
      onChange?.(d.friendship)
    } catch (err) {
      alert(err.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <button className={`btn ${small ? 'small' : ''} friend-btn ${status}`} onClick={go} disabled={busy}
      title={status === 'outgoing' ? 'Cancel request' : status === 'friends' ? 'Unfriend' : ''}>
      {LABEL[status]}
    </button>
  )
}
