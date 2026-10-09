import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { timeAgo } from '../lib/format.js'
import Avatar from './Avatar.jsx'
import VoteButtons from './VoteButtons.jsx'

export function ReplyBox({ onSubmit, onCancel, autoFocus, placeholder = 'Add a reply' }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submit = async (e) => {
    e.preventDefault()
    if (!text.trim()) return
    setBusy(true)
    setError('')
    try {
      await onSubmit(text.trim())
      setText('')
      onCancel?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <form className="reply-box" onSubmit={submit}>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={2000} placeholder={placeholder} autoFocus={autoFocus} />
      {error && <p className="error small">{error}</p>}
      <div className="row gap end">
        {onCancel && <button type="button" className="btn ghost small" onClick={onCancel}>Cancel</button>}
        <button className="btn primary small" disabled={busy || !text.trim()}>{busy ? 'Posting…' : 'Reply'}</button>
      </div>
    </form>
  )
}

function CommentNode({ c, byParent, onReply, depth }) {
  const [replying, setReplying] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const navigate = useNavigate()
  const kids = byParent.get(c.id) || []
  const name = c.author?.name || 'Original poster'
  return (
    <div className="comment" style={{ '--depth': depth }}>
      <div className="comment-head">
        <Avatar name={name} size={24} anon={!c.author} />
        {c.author && !c.mine ? (
          <button className="msg-name" onClick={() => navigate(`/messages/${c.author.id}`)} title={`Message ${name}`}>{name}</button>
        ) : <strong>{name}{c.mine && ' (you)'}</strong>}
        {c.is_op && <span className="tag op">OP</span>}
        {c.author && <span className="tag">{c.author.hostel.toUpperCase()}</span>}
        <span className="muted small">{timeAgo(c.created_at)}</span>
        {kids.length > 0 && (
          <button className="link-btn small" onClick={() => setCollapsed(!collapsed)}>
            {collapsed ? `Show ${kids.length} ${kids.length === 1 ? 'reply' : 'replies'}` : 'Hide replies'}
          </button>
        )}
      </div>
      <p className="comment-body">{c.body}</p>
      <div className="comment-actions">
        <VoteButtons endpoint={`/api/comments/${c.id}/vote`} score={c.score} myVote={c.my_vote} compact />
        <button className="link-btn small" onClick={() => setReplying(!replying)}>Reply</button>
      </div>
      {replying && <ReplyBox autoFocus onCancel={() => setReplying(false)} onSubmit={(body) => onReply(body, c.id)} />}
      {!collapsed && kids.length > 0 && (
        <div className="comment-children">
          {kids.map((k) => <CommentNode key={k.id} c={k} byParent={byParent} onReply={onReply} depth={depth + 1} />)}
        </div>
      )}
    </div>
  )
}

export default function CommentThread({ comments, onReply }) {
  const byParent = new Map()
  for (const c of comments) {
    const key = c.parent_id ?? 'root'
    byParent.set(key, [...(byParent.get(key) || []), c])
  }
  for (const list of byParent.values()) list.sort((a, b) => b.score - a.score || a.id - b.id)
  const roots = byParent.get('root') || []
  if (!roots.length) return <p className="muted">No replies yet. Start the conversation.</p>
  return <div className="comments">{roots.map((c) => <CommentNode key={c.id} c={c} byParent={byParent} onReply={onReply} depth={0} />)}</div>
}
