import ChatPanel from '../components/ChatPanel.jsx'

export default function AnonChat() {
  return (
    <div className="anon-layout">
      <ChatPanel room="anon" title="Anonymous campus chat"
        subtitle="Everyone here shows up under a random name that changes every week."
        emptyText="It's quiet. Start something fun." />
      <aside className="anon-rules">
        <h3>How this stays healthy</h3>
        <ul>
          <li><strong>Slow mode is always on.</strong> One message every few seconds per person, so nobody floods the room.</li>
          <li><strong>Slurs are masked</strong> and phone numbers or emails are hidden automatically, so nobody gets doxxed.</li>
          <li><strong>Report anything nasty.</strong> Three reports hide a message for everyone.</li>
          <li><strong>Repeat offenders get muted</strong> for an hour.</li>
          <li><strong>Moderators can see who wrote a reported message.</strong> Other students never can.</li>
        </ul>
        <p className="muted small">Your alias is generated from your account and the week number, so it stays the same all week and can't be traced back by other students.</p>
      </aside>
    </div>
  )
}
