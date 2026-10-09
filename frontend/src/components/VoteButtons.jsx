import { useState } from 'react'
import { api } from '../lib/api.js'

/** Reddit-style vote control. Clicking the active arrow again removes your vote. */
export default function VoteButtons({ endpoint, score: initialScore, myVote: initialVote, compact = false }) {
  const [score, setScore] = useState(initialScore)
  const [vote, setVote] = useState(initialVote)
  const [busy, setBusy] = useState(false)

  const cast = async (value) => {
    if (busy) return
    const next = vote === value ? 0 : value
    const prev = { score, vote }
    setScore(score + next - vote)
    setVote(next)
    setBusy(true)
    try {
      const d = await api(endpoint, { method: 'POST', body: { value: next } })
      setScore(d.score)
    } catch {
      setScore(prev.score)
      setVote(prev.vote)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`votes ${compact ? 'compact' : ''}`} onClick={(e) => e.stopPropagation()}>
      <button className={`vote up ${vote === 1 ? 'on' : ''}`} onClick={() => cast(1)} aria-label="Upvote" aria-pressed={vote === 1}>
        <svg viewBox="0 0 24 24" width="18" height="18"><path d="M12 4l8 9h-5v7H9v-7H4z" fill="currentColor" /></svg>
      </button>
      <span className={`score ${vote === 1 ? 'up' : vote === -1 ? 'down' : ''}`}>{score}</span>
      <button className={`vote down ${vote === -1 ? 'on' : ''}`} onClick={() => cast(-1)} aria-label="Downvote" aria-pressed={vote === -1}>
        <svg viewBox="0 0 24 24" width="18" height="18"><path d="M12 20l-8-9h5V4h6v7h5z" fill="currentColor" /></svg>
      </button>
    </div>
  )
}
