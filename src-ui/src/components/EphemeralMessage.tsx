import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { markdownCodeComponents } from './HighlightedCodeBlock';

interface EphemeralAction {
  label: string;
  handler: () => void;
}

interface EphemeralMsg {
  id?: string;
  content: string;
  contentType?: 'html' | 'markdown';
  action?: EphemeralAction;
  contentParts?: { type: string; content?: string }[];
}

interface EphemeralMessageProps {
  msg: EphemeralMsg;
  idx: number;
  fontSize: number;
  isRemoving: boolean;
  onDismiss: () => void;
  onAction?: () => void;
}

export function EphemeralMessage({
  msg,
  idx,
  fontSize,
  isRemoving,
  onDismiss,
  onAction,
}: EphemeralMessageProps) {
  const messageId = msg.id || `ephemeral-${idx}`;
  const textContent =
    msg.contentParts
      ?.filter((p) => p.type === 'text')
      .map((p) => p.content)
      .join('\n') ||
    msg.content ||
    '';

  return (
    <div
      key={messageId}
      className={`message system ephemeral-message ${isRemoving ? 'removing' : ''}`}
      style={{
        padding: '12px 40px 12px 12px',
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-primary)',
        borderRadius: '6px',
        marginTop: '8px',
        marginBottom: '0',
        position: 'relative',
        fontSize: `${fontSize}px`,
        textAlign: 'left',
        alignSelf: 'flex-start',
        width: '100%',
        opacity: isRemoving ? 0 : 1,
        transform: isRemoving ? 'translateY(-10px)' : 'translateY(0px)',
        transition: 'opacity 0.3s ease, transform 0.3s ease',
      }}
    >
      <button
        onClick={onDismiss}
        style={{
          position: 'absolute',
          top: '8px',
          right: '8px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          fontSize: '18px',
          color: 'var(--text-muted)',
          padding: '4px',
          lineHeight: 1,
        }}
        title="Dismiss"
      >
        ×
      </button>
      {msg.contentType === 'html' ? (
        <div
          ref={(el) => {
            if (el && !el.dataset.initialized) {
              el.innerHTML = msg.content;
              el.dataset.initialized = 'true';
            }
          }}
        />
      ) : (
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownCodeComponents}>{textContent}</ReactMarkdown>
      )}
      {msg.action && onAction && (
        <button
          onClick={onAction}
          style={{
            marginTop: '12px',
            padding: '8px 16px',
            borderRadius: '6px',
            border: 'none',
            background: 'var(--color-primary)',
            color: 'white',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: 500,
          }}
        >
          {msg.action.label}
        </button>
      )}
    </div>
  );
}
