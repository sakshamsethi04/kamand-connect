import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import ChatPanel from '../components/ChatPanel.jsx'
import { useAuth } from '../lib/auth.jsx'

export default function HostelChat() {
  const { slug } = useParams()
  const { user, hostels, hostelName } = useAuth()
  const [params, setParams] = useSearchParams()
  const resident = user.hostel === slug
  const tab = params.get('room') === 'common' || !resident ? 'common' : params.get('room') || 'residents'
  const [filter, setFilter] = useState('')

  useEffect(() => { setFilter('') }, [slug])
  const exists = !hostels.length || hostels.some((h) => h.slug === slug)
  if (!exists) return <div className="page-center"><p>That hostel isn't on Kamand Connect. <Link to="/">Back to the map</Link></p></div>

  const list = hostels.filter((h) => h.code.toLowerCase().includes(filter.toLowerCase()))

  return (
    <div className="chat-layout">
      <aside className="side">
        <div className="side-head">
          <h3>Hostels</h3>
          <input className="side-search" placeholder="Find a hostel" value={filter} onChange={(e) => setFilter(e.target.value)} />
        </div>
        <ul className="side-list">
          {list.map((h) => (
            <li key={h.slug}>
              <Link to={`/hostel/${h.slug}`} className={h.slug === slug ? 'active' : ''}>
                <span>{h.name}</span>
                {h.slug === user.hostel && <span className="tag">Yours</span>}
              </Link>
            </li>
          ))}
        </ul>
      </aside>

      <div className="chat-col">
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'residents'} className={tab === 'residents' ? 'on' : ''} disabled={!resident}
            title={resident ? '' : `Only ${hostelName(slug)} residents can open this`}
            onClick={() => setParams({ room: 'residents' })}>
            Residents only {!resident && <span aria-hidden>🔒</span>}
          </button>
          <button role="tab" aria-selected={tab === 'common'} className={tab === 'common' ? 'on' : ''} onClick={() => setParams({ room: 'common' })}>
            Common room
          </button>
        </div>
        <ChatPanel
          key={`${slug}-${tab}`}
          room={`hostel:${slug}:${tab}`}
          title={`${hostelName(slug)} · ${tab === 'residents' ? 'Residents' : 'Common room'}`}
          subtitle={tab === 'residents'
            ? 'Only people living here can read or write in this room.'
            : resident ? 'Open to everyone. Visitors show up as (outsider).' : "You're visiting, so your name shows (outsider) here."}
        />
      </div>
    </div>
  )
}
