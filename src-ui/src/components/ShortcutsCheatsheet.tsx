import { useKeyboardShortcuts } from '../contexts/KeyboardShortcutsContext';

interface ShortcutsCheatsheetProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ShortcutsCheatsheet({
  isOpen,
  onClose,
}: ShortcutsCheatsheetProps) {
  const { getAllShortcuts, getDisplay } = useKeyboardShortcuts();

  if (!isOpen) return null;

  const shortcuts = getAllShortcuts();
  const grouped = shortcuts.reduce(
    (acc, shortcut) => {
      const category = shortcut.id.split('.')[0];
      if (!acc[category]) acc[category] = [];
      acc[category].push(shortcut);
      return acc;
    },
    {} as Record<string, typeof shortcuts>,
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '600px' }}
      >
        <div className="modal-header">
          <h2>Keyboard Shortcuts</h2>
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div
          className="modal-body"
          style={{ maxHeight: '70vh', overflow: 'auto' }}
        >
          {Object.entries(grouped).map(([category, items]) => (
            <div key={category} style={{ marginBottom: '24px' }}>
              <h3
                style={{
                  textTransform: 'capitalize',
                  fontSize: '14px',
                  fontWeight: 600,
                  marginBottom: '12px',
                  color: 'var(--text-primary)',
                }}
              >
                {category}
              </h3>
              <div
                style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
              >
                {items.map((shortcut) => (
                  <div
                    key={shortcut.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '8px 12px',
                      background: 'var(--bg-secondary)',
                      borderRadius: '4px',
                    }}
                  >
                    <span style={{ color: 'var(--text-primary)' }}>
                      {shortcut.description}
                    </span>
                    <kbd
                      style={{
                        padding: '4px 8px',
                        background: 'var(--bg-tertiary)',
                        border: '1px solid var(--border-primary)',
                        borderRadius: '4px',
                        fontSize: '12px',
                        fontFamily: 'monospace',
                        color: 'var(--text-primary)',
                      }}
                    >
                      {getDisplay(shortcut.id)}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
