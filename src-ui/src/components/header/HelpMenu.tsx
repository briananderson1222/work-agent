import type { HeaderHelpPrompt } from './utils';

interface HelpMenuProps {
  isOpen: boolean;
  prompts: HeaderHelpPrompt[];
  onClose: () => void;
  onSelectPrompt: (prompt: string) => void;
}

export function HelpMenu({
  isOpen,
  prompts,
  onClose,
  onSelectPrompt,
}: HelpMenuProps) {
  if (!isOpen) return null;

  return (
    <>
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 99 }}
        onClick={onClose}
      />
      <div
        style={{
          position: 'fixed',
          top: 40,
          right: 8,
          zIndex: 100,
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-primary)',
          borderRadius: 8,
          width: 'min(280px, calc(100vw - 32px))',
          boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '8px 12px',
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            borderBottom: '1px solid var(--border-primary)',
          }}
        >
          Ask Stallion
        </div>
        {prompts.map((promptConfig, index) => (
          <button
            key={promptConfig.label}
            onClick={() => onSelectPrompt(promptConfig.prompt)}
            style={{
              display: 'flex',
              alignItems: 'center',
              width: '100%',
              padding: '10px 12px',
              border: 'none',
              background: 'transparent',
              color: 'var(--text-primary)',
              fontSize: 13,
              textAlign: 'left',
              cursor: 'pointer',
              borderBottom:
                index < prompts.length - 1
                  ? '1px solid var(--border-primary)'
                  : 'none',
              fontFamily: 'inherit',
            }}
            onMouseEnter={(event) => {
              event.currentTarget.style.background = 'var(--bg-tertiary)';
            }}
            onMouseLeave={(event) => {
              event.currentTarget.style.background = 'transparent';
            }}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--text-muted)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ flexShrink: 0, marginRight: 8 }}
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
            {promptConfig.label}
          </button>
        ))}
      </div>
    </>
  );
}
