import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div className="page-center">
      <h1>This page isn't on campus</h1>
      <p className="muted">Check the link, or head back to the map.</p>
      <Link className="btn primary" to="/">Back to the map</Link>
    </div>
  )
}
