import { useState } from 'react';

export interface ToolCallData {
  type: string;
  toolCallId?: string;
  tool?: {
    id: string;
    name: string;
    server?: string;
    toolName?: string;
    args: any;
    result?: any;
    error?: string;
    state?: string;
    needsApproval?: boolean;
    cancelled?: boolean;
    approvalStatus?: 'auto-approved' | 'user-approved' | 'user-denied';
    originalName?: string;
  };
  input?: any;
  output?: any;
  state?: string;
  errorText?: string;
  needsApproval?: boolean;
  cancelled?: boolean;
  approvalStatus?: 'auto-approved' | 'user-approved' | 'user-denied';
  server?: string;
  toolName?: string;
  originalName?: string;
}

interface ToolCallDisplayProps {
  toolCall: ToolCallData;
  onApprove?: (action: 'once' | 'trust' | 'deny') => void;
  showDetails?: boolean;
}

export function ToolCallDisplay({
  toolCall,
  onApprove,
  showDetails = true,
}: ToolCallDisplayProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!showDetails) return null;

  const tool = toolCall.tool || toolCall;
  const id = tool.id || toolCall.toolCallId || '';
  const server = tool.server || toolCall.server;
  const toolName =
    tool.toolName ||
    toolCall.toolName ||
    tool.name ||
    toolCall.type?.replace('tool-', '') ||
    '';
  const originalName = tool.originalName || toolCall.originalName;
  const args = tool.args || toolCall.input;
  const result = tool.result || toolCall.output;
  const error = tool.error || toolCall.errorText;
  const needsApproval = tool.needsApproval || toolCall.needsApproval;
  const cancelled = tool.cancelled || toolCall.cancelled;
  const approvalStatus = tool.approvalStatus || toolCall.approvalStatus;

  const argsPreview = args
    ? Object.keys(args).length > 0
      ? Object.keys(args)
          .map((k) => `${k}: ${JSON.stringify(args[k])}`)
          .join(', ')
      : 'no args'
    : 'no args';

  return (
    <div
      className="tool-call"
      style={{
        display: 'block',
        margin: '0.5rem 0',
        padding: '0.5rem',
        background: 'var(--color-bg-secondary)',
        border: '1px solid var(--color-border)',
        borderRadius: '4px',
        cursor: 'pointer',
      }}
      onClick={() => setIsExpanded(!isExpanded)}
    >
      <div
        className="tool-call__header"
        style={{
          display: 'block',
          padding: 0,
          color: 'inherit',
          textAlign: 'left',
          width: '100%',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.25rem',
            marginBottom: '0.25rem',
          }}
        >
          <span className="tool-call__toggle">{isExpanded ? '▼' : '▶'}</span>
          {server && <span className="tool-call__server-badge">{server}</span>}
          <span className="tool-call__name" style={{ fontWeight: 500 }}>
            {toolName}
          </span>
          {approvalStatus === 'auto-approved' && (
            <span className="tool-call__status-badge">Auto-approved</span>
          )}
          {approvalStatus === 'user-approved' && (
            <span className="tool-call__status-badge tool-call__status-badge--success">
              User approved
            </span>
          )}
          {approvalStatus === 'user-denied' && (
            <span className="tool-call__status-badge tool-call__status-badge--error">
              User denied
            </span>
          )}
          {result && !error && (
            <span style={{ color: 'var(--success-primary)' }} title="Success">
              ✓
            </span>
          )}
          {error && (
            <span style={{ color: 'var(--error-primary)' }} title="Error">
              ✗
            </span>
          )}
          {needsApproval && onApprove && !error && !result && !cancelled && (
            <ToolApprovalButtons onApprove={onApprove} />
          )}
          {needsApproval && !error && !result && !cancelled && (
            <span style={{ color: 'orange' }}>⏸</span>
          )}
          {error && <span className="tool-call__error">⚠️</span>}
        </div>
        <div className="tool-call__args-preview">{smartSummary}</div>
      </div>
      {isExpanded && (
        <ToolCallDetails
          id={id}
          server={server}
          toolName={toolName}
          originalName={originalName}
          args={args}
          result={result}
          error={error}
        />
      )}
    </div>
  );
}

function ToolApprovalButtons({
  onApprove,
}: {
  onApprove: (action: 'once' | 'trust' | 'deny') => void;
}) {
  return (
    <>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onApprove('once');
        }}
        className="tool-call__approve-btn tool-call__approve-btn--primary"
      >
        Allow Once
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onApprove('trust');
        }}
        className="tool-call__approve-btn tool-call__approve-btn--secondary"
      >
        Always Allow
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onApprove('deny');
        }}
        className="tool-call__approve-btn tool-call__approve-btn--danger"
      >
        Deny
      </button>
    </>
  );
}

function ToolCallDetails({
  id,
  server,
  toolName,
  originalName,
  args,
  result,
  error,
}: {
  id: string;
  server?: string;
  toolName: string;
  originalName?: string;
  args: any;
  result?: any;
  error?: string;
}) {
  return (
    <div
      className="tool-call__details"
      style={{ marginTop: '0.5rem', fontSize: '0.9em' }}
    >
      <div className="tool-call__meta">
        <span>
          <strong>ID:</strong> <code>{id}</code>
        </span>
        {server && (
          <span>
            <strong>Server:</strong> <code>{server}</code>
          </span>
        )}
        {toolName && (
          <span>
            <strong>Tool:</strong> <code>{toolName}</code>
          </span>
        )}
        {originalName && originalName !== `${server}_${toolName}` && (
          <span>
            <strong>Original Name:</strong> <code>{originalName}</code>
          </span>
        )}
        {(result || error) && (
          <span>
            <strong>Status:</strong>{' '}
            <span
              style={{
                color: error
                  ? 'var(--error-primary)'
                  : 'var(--success-primary)',
              }}
            >
              {error ? 'Failed' : 'Success'}
            </span>
          </span>
        )}
      </div>
      <div className="tool-call__section">
        <strong>Arguments:</strong>
        <pre className="tool-call__code">{JSON.stringify(args, null, 2)}</pre>
      </div>
      {result && (
        <div className="tool-call__section">
          <strong>Response:</strong>
          <pre className="tool-call__code tool-call__code--scrollable">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
      {error && (
        <div className="tool-call__section tool-call__section--error">
          <strong>Error:</strong>
          <pre className="tool-call__code tool-call__code--error">{error}</pre>
        </div>
      )}
    </div>
  );
}
