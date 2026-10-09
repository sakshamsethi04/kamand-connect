import { Route, Routes } from 'react-router-dom'
import Navbar from './components/Navbar.jsx'
import Toasts from './components/Toasts.jsx'
import Moderation from './pages/Moderation.jsx'
import { RequireAuth } from './components/AuthGate.jsx'
import Landing from './pages/Landing.jsx'
import Login from './pages/Login.jsx'
import Register from './pages/Register.jsx'
import HostelChat from './pages/HostelChat.jsx'
import AnonChat from './pages/AnonChat.jsx'
import Messages from './pages/Messages.jsx'
import Board from './pages/Board.jsx'
import PostDetail from './pages/PostDetail.jsx'
import Carpool from './pages/Carpool.jsx'
import Leaderboard from './pages/Leaderboard.jsx'
import NotFound from './pages/NotFound.jsx'

const gated = (el, what) => <RequireAuth what={what}>{el}</RequireAuth>

export default function App() {
  return (
    <div className="app">
      <Navbar />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/hostel/:slug" element={gated(<HostelChat />, 'hostel chats')} />
          <Route path="/anon" element={gated(<AnonChat />, 'the anonymous chat')} />
          <Route path="/messages" element={gated(<Messages />, 'your messages')} />
          <Route path="/messages/:userId" element={gated(<Messages />, 'your messages')} />
          <Route path="/concerns" element={gated(<Board kind="concern" />, 'concerns')} />
          <Route path="/concerns/:id" element={gated(<PostDetail kind="concern" />, 'concerns')} />
          <Route path="/lost-found" element={gated(<Board kind="lostfound" />, 'lost & found')} />
          <Route path="/lost-found/:id" element={gated(<PostDetail kind="lostfound" />, 'lost & found')} />
          <Route path="/carpool" element={gated(<Carpool />, 'carpools')} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/mod" element={gated(<Moderation />, 'moderation')} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <Toasts />
    </div>
  )
}
