import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import PostComposer from '../components/PostComposer.jsx'
import VoteButtons from '../components/VoteButtons.jsx'
import { api } from '../lib/api.js'
import { timeAgo } from '../lib/format.js'

export const BOARD = {
  concern: { path: '/concerns', bg: '/img/p3.jpg', title: 'Concerns', blurb: 'Raise what needs fixing on campus. The most upvoted rise to the top.', cta: 'Raise a concern', empty: 'No concerns yet. If something on campus needs fixing, raise it first.' },
  lostfound: { path: '/lost-found', bg: '/img/p1.jpg', title: 'Lost & found', blurb: 'Lost something, or found something that isn’t yours? Post it and message the owner directly.', cta: 'Post an item', empty: 'Nothing posted. Lost or found something? Post it here.' },
}

export function PostCard({ p, kind }) {
  const navigate = useNavigate()
  const href = `${BOARD[kind].path}/${p.id}`
  return (
    <article className={`post-card ${p.status === 'resolved' ? 'resolved' : ''}`} onClick={() => navigate(href)}>
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
        <h3><Link to={href} onClick={(e) => e.stopPropagation()}>{p.title}</Link></h3>
        {p.location && <p className="small muted">📍 {p.location}</p>}
        {p.body && <p className="post-body">{p.body}</p>}
        <div className="post-foot">
          <span className="small muted">{p.comment_count} {p.comment_count === 1 ? 'reply' : 'replies'}</span>
          {kind === 'lostfound' && p.author && !p.mine && (
            <button className="btn amber small" onClick={(e) => { e.stopPropagation(); navigate(`/messages/${p.author.id}`) }}>
              Message {p.author.name.split(' ')[0]}
            </button>
          )}
        </div>
      </div>
      {p.images[0] && (
        <div className="post-thumb">
          <img src={p.images[0]} alt="" loading="lazy" />
          {p.images.length > 1 && <span>+{p.images.length - 1}</span>}
        </div>
      )}
    </article>
  )
}

export default function Board({ kind }) {
  const cfg = BOARD[kind]
  const [params, setParams] = useSearchParams()
  const sort = params.get('sort') || 'top'
  const lf = params.get('type') || ''
  const [q, setQ] = useState('')
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [composing, setComposing] = useState(false)
  const navigate = useNavigate()

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const qs = new URLSearchParams({ kind, sort })
    if (lf) qs.set('lf_type', lf)
    if (q.trim()) qs.set('q', q.trim())
    try {
      setPosts((await api(`/api/posts?${qs}`)).posts)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [kind, sort, lf, q])

  useEffect(() => {
    const t = setTimeout(load, q ? 250 : 0)
    return () => clearTimeout(t)
  }, [load, q])

  const setParam = (k, v) => { const n = new URLSearchParams(params); v ? n.set(k, v) : n.delete(k); setParams(n) }

  return (
    <div className="board" style={{ '--bg': `url(${cfg.bg})` }}>
      <div className="board-inner">
        <header className="board-head">
          <div>
            <h1>{cfg.title}</h1>
            <p>{cfg.blurb}</p>
          </div>
          <button className="btn amber" onClick={() => setComposing(true)}>{cfg.cta}</button>
        </header>

        <div className="board-tools">
          <div className="segmented small">
            {[['top', 'Most upvoted'], ['new', 'Newest']].map(([v, l]) => (
              <button key={v} className={sort === v ? 'on' : ''} onClick={() => setParam('sort', v === 'top' ? '' : v)}>{l}</button>
            ))}
          </div>
          {kind === 'lostfound' && (
            <div className="segmented small">
              {[['', 'All'], ['lost', 'Lost'], ['found', 'Found']].map(([v, l]) => (
                <button key={l} className={lf === v ? 'on' : ''} onClick={() => setParam('type', v)}>{l}</button>
              ))}
            </div>
          )}
          <input className="search" placeholder="Search titles" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>

        <div className="post-list">
          {error && <p className="error panel">{error}</p>}
          {loading && !posts.length && <div className="panel center"><span className="spinner" /></div>}
          {!loading && !error && posts.length === 0 && (
            <div className="panel empty">
              <p>{q ? 'No posts match that search.' : cfg.empty}</p>
              {!q && <button className="btn primary" onClick={() => setComposing(true)}>{cfg.cta}</button>}
            </div>
          )}
          {posts.map((p) => <PostCard key={p.id} p={p} kind={kind} />)}
        </div>
      </div>
      {composing && (
        <PostComposer kind={kind} onClose={() => setComposing(false)}
          onCreated={(p) => { setComposing(false); navigate(`${cfg.path}/${p.id}`) }} />
      )}
    </div>
  )
}
