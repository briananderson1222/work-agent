interface QueuedMessagesProps {
  messages: string[];
}

export function QueuedMessages({ messages }: QueuedMessagesProps) {
  if (messages.length === 0) return null;

  return (
    <div className="queued-messages">
      <div className="queued-messages__label">
        {messages.length} message{messages.length !== 1 ? 's' : ''} queued
      </div>
      <div className="queued-messages__list">
        {messages.map((msg, idx) => (
          <div key={idx} className="queued-message" title={msg}>
            {msg.length > 50 ? msg.slice(0, 50) + '...' : msg}
          </div>
        ))}
      </div>
    </div>
  );
}
