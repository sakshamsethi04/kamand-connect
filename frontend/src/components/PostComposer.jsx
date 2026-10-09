import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import Modal from './Modal.jsx'

const COPY = {
  concern: { title: 'Raise a concern', titlePh: 'What needs fixing?', bodyPh: 'Where, since when, and who it affects. Specifics get things fixed faster.', submit: 'Post concern' },
  lostfound: { title: 'Post to lost & found', titlePh: 'e.g. Black JBL earbuds case', bodyPh: 'Colour, brand, marks, and when you last had it or where you found it.', submit: 'Post' },
}

export default function PostComposer({ kind, onClose, onCreated }) {
  const c = COPY[kind]
  const [categories, setCategories] = useState([])
  const [form, setForm] = useState({ title: '', body: '', category: '', location: '', lf_type: 'lost', anonymous: false })
  const [files, setFiles] = useState([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => { api('/api/boards/meta').then((d) => setCategories(d[kind].categories)).catch(() => {}) }, [kind])
  const previews = files.map((f) => URL.createObjectURL(f))
  useEffect(() => () => previews.forEach(URL.revokeObjectURL), [files]) // eslint-disable-line

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })

  const pick = (e) => {
    const chosen = [...files, ...e.target.files].slice(0, 4)
    const tooBig = chosen.find((f) => f.size > 6 * 1024 * 1024)
    setError(tooBig ? `${tooBig.name} is larger than 6 MB` : '')
    setFiles(chosen.filter((f) => f.size <= 6 * 1024 * 1024))
    e.target.value = ''
  }

  const submit = async (e) => {
    e.preventDefault()
    if (form.title.trim().length < 4) return setError('Give it a title of at least 4 characters')
    setBusy(true)
    setError('')
    const fd = new FormData()
    fd.append('kind', kind)
    fd.append('title', form.title.trim())
    fd.append('body', form.body.trim())
    if (form.category) fd.append('category', form.category)
    if (form.location.trim()) fd.append('location', form.location.trim())
    if (kind === 'lostfound') fd.append('lf_type', form.lf_type)
    if (kind === 'concern') fd.append('anonymous', form.anonymous ? 'true' : 'false')
    files.forEach((f) => fd.append('images', f))
    try {
      const d = await api('/api/posts', { method: 'POST', form: fd })
      onCreated(d.post)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <Modal title={c.title} onClose={onClose} width={560}>
      <form onSubmit={submit} className="stack">
        {kind === 'lostfound' && (
          <div className="segmented" role="radiogroup" aria-label="Lost or found">
            {['lost', 'found'].map((t) => (
              <button type="button" key={t} role="radio" aria-checked={form.lf_type === t}
                className={form.lf_type === t ? 'on' : ''} onClick={() => setForm({ ...form, lf_type: t })}>
                {t === 'lost' ? 'I lost something' : 'I found something'}
              </button>
            ))}
          </div>
        )}
        <label className="field">
          <span>Title</span>
          <input value={form.title} onChange={set('title')} maxLength={140} placeholder={c.titlePh} required />
        </label>
        <label className="field">
          <span>Description</span>
          <textarea value={form.body} onChange={set('body')} rows={4} maxLength={5000} placeholder={c.bodyPh} />
        </label>
        <div className="grid-2">
          <label className="field">
            <span>Category</span>
            <select value={form.category} onChange={set('category')}>
              <option value="">Choose one</option>
              {categories.map((x) => <option key={x}>{x}</option>)}
            </select>
          </label>
          <label className="field">
            <span>{kind === 'lostfound' ? 'Where' : 'Location (optional)'}</span>
            <input value={form.location} onChange={set('location')} maxLength={120} placeholder="e.g. B12, 2nd floor" />
          </label>
        </div>
        <div className="field">
          <span>Images ({files.length}/4)</span>
          <div className="uploads">
            {previews.map((src, i) => (
              <div className="upload-thumb" key={src}>
                <img src={src} alt="" />
                <button type="button" aria-label="Remove image" onClick={() => setFiles(files.filter((_, j) => j !== i))}>✕</button>
              </div>
            ))}
            {files.length < 4 && (
              <label className="upload-add">
                <input type="file" accept="image/*" multiple onChange={pick} hidden />
                <span>+ Add image</span>
              </label>
            )}
          </div>
        </div>
        {kind === 'concern' && (
          <label className="check">
            <input type="checkbox" checked={form.anonymous} onChange={set('anonymous')} />
            <span>Post without my name <span className="muted small">(hidden from everyone on the board)</span></span>
          </label>
        )}
        {error && <p className="error" role="alert">{error}</p>}
        <div className="row gap end">
          <button type="button" className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={busy}>{busy ? 'Posting…' : c.submit}</button>
        </div>
      </form>
    </Modal>
  )
}
