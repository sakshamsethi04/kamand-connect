import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import CommentThread, { ReplyBox } from '../components/CommentThread.jsx'
import Modal from '../components/Modal.jsx'
import VoteButtons from '../components/VoteButtons.jsx'
import { api } from '../lib/api.js'
import { timeAgo } from '../lib/format.js'
import { BOARD } from './Board.jsx'

export default function PostDetail({ kind }) {
  const { id } = useParams()
  const cfg = BOARD[kind]
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [zoom, setZoom] = useState(null)

  useEffect(() => {
    api(`/api/posts/${id}`).then(setData).catch((e) => setError(e.message))
  }, [id])

  if (error) return <div className="page-center"><p>{error}</p><Link to={cfg.path}>Back to {cfg.title.toLowerCase()}</Link></div>
  if (!data) return <div className="page-center"><span className="spinner" /></div>
  const { post: p, comments } = data

  const reply = async (body, parent_id = null) => {
    const d = await api(`/api/posts/${p.id}/comments`, { method: 'POST', body: { body, parent_id } })
    setData({ post: { ...p, comment_count: p.comment_count + 1 }, comments: [...comments, d.comment] })
  }
  const toggleStatus = async () => {
    const status = p.status === 'open' ? 'resolved' : 'open'
    await api(`/api/posts/${p.id}/status`, { method: 'PATCH', body: { status } })
    setData({ ...data, post: { ...p, status } })
  }
  const remove = async () => {
    if (!confirm('Delete this post and all its replies?')) return
    await api(`/api/posts/${p.id}`, { method: 'DELETE' })
    navigate(cfg.path)
  }

  return (
    <div className="board" style={{ '--bg': `url(${cfg.bg})` }}>
      <div className="board-inner narrow">
        <Link to={cfg.path} className="back-link light">All {cfg.title.toLowerCase()}</Link>
        <article className="post-full panel">
          <div className="post-full-head">
            <VoteButtons endpoint={`/api/posts/${p.id}/vote`} score={p.score} myVote={p.my_vote} />
            <div className="post-main">
              <div className="post-meta">
                {kind === 'lostfound' && <span className={`tag ${p.lf_type}`}>{p.lf_type === 'lost' ? 'Lost' : 'Found'}</span>}
                {p.category && <span className="tag">{p.category}</span>}
                {p.status === 'resolved' && <span className="tag ok">{kind === 'lostfound' ? 'Returned' : 'Resolved'}</span>}
                <span className="muted small">
                  {p.author ? `${p.author.name} · ${p.author.hostel.toUpperCase()}` : 'Posted anonymously'} · {timeAgo(p.created_at)}
                </span>
              </div>
              <h1>{p.title}</h1>
              {p.location && <p className="muted">📍 {p.location}</p>}
            </div>
          </div>
          {p.body && <p className="post-text">{p.body}</p>}
          {p.images.length > 0 && (
            <div className={`gallery n${p.images.length}`}>
              {p.images.map((src) => <button key={src} onClick={() => setZoom(src)}><img src={src} alt="" /></button>)}
            </div>
          )}
          <div className="row gap wrap">
            {p.author && !p.mine && (
              <button className="btn amber" onClick={() => navigate(`/messages/${p.author.id}`)}>
                Message {p.author.name.split(' ')[0]}
              </button>
            )}
            {p.mine && (
              <>
                <button className="btn ghost" onClick={toggleStatus}>
                  {p.status === 'open' ? (kind === 'lostfound' ? 'Mark as returned' : 'Mark as resolved') : 'Reopen'}
                </button>
                <button className="btn ghost danger" onClick={remove}>Delete</button>
              </>
            )}
          </div>
        </article>

        <section className="panel">
          <h2 className="section-title">{p.comment_count} {p.comment_count === 1 ? 'reply' : 'replies'}</h2>
          <ReplyBox onSubmit={(b) => reply(b)} placeholder={kind === 'lostfound' ? 'Ask about the item or share a lead' : 'Add to this concern'} />
          <CommentThread comments={comments} onReply={reply} />
        </section>
      </div>
      {zoom && <Modal title="Image" onClose={() => setZoom(null)} width={900}><img src={zoom} alt="" className="zoomed" /></Modal>}
    </div>
  )
}
