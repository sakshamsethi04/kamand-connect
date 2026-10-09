function detailText(detail) {
  if (!detail) return null
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) return detail.map((d) => d.msg?.replace(/^Value error, /, '')).join('. ')
  return String(detail)
}

export async function api(path, { method = 'GET', body, form } = {}) {
  const opts = { method, credentials: 'include', headers: {} }
  if (form) opts.body = form
  else if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json'
    opts.body = JSON.stringify(body)
  }
  let res
  try {
    res = await fetch(path, opts)
  } catch {
    throw Object.assign(new Error("Can't reach the server. Check that the backend is running."), { status: 0 })
  }
  const text = await res.text()
  let data = null
  if (text) {
    try { data = JSON.parse(text) } catch { data = { detail: text } }
  }
  if (!res.ok) {
    const err = new Error(detailText(data?.detail) || `Request failed (${res.status})`)
    err.status = res.status
    throw err
  }
  return data
}

export const wsUrl = (room) =>
  `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/rooms/${encodeURIComponent(room)}`
