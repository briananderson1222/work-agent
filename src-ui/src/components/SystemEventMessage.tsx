interface SystemEventMessageProps {
  content: string;
  messageKey: string;
}

export function SystemEventMessage({ content, messageKey }: SystemEventMessageProps) {
  return (
    <div 
      key={messageKey} 
      className="message system-event"
      style={{
        padding: '8px 12px',
        margin: '8px 0',
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-primary)',
        borderRadius: '6px',
        fontSize: '0.85em',
        fontStyle: 'italic',
        color: 'var(--text-muted)',
        textAlign: 'center'
      }}
    >
      {content}
    </div>
  );
}
