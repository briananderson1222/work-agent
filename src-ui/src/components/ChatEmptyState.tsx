interface ChatEmptyStateProps {
  agentName: string;
}

export function ChatEmptyState({ agentName }: ChatEmptyStateProps) {
  return (
    <div className="empty-state">
      <h3>Start a conversation</h3>
      <p>Type a message below to chat with {agentName}</p>
      <p
        style={{
          fontSize: '0.9em',
          color: 'var(--text-muted)',
          marginTop: '8px',
        }}
      >
        💡 Type{' '}
        <code
          style={{
            padding: '2px 6px',
            background: 'var(--bg-tertiary)',
            borderRadius: '3px',
            fontFamily: 'monospace',
          }}
        >
          /
        </code>{' '}
        to see available commands
      </p>
    </div>
  );
}
