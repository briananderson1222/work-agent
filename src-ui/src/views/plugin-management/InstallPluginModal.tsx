import { PathAutocomplete } from '../../components/PathAutocomplete';

export function InstallPluginModal({
  apiBase,
  installSource,
  installMessage,
  installPending,
  previewPending,
  onChangeSource,
  onBrowse,
  onInstall,
  onClose,
}: {
  apiBase: string;
  installSource: string;
  installMessage: { type: 'success' | 'error'; text: string } | null;
  installPending: boolean;
  previewPending: boolean;
  onChangeSource: (value: string) => void;
  onBrowse: () => void;
  onInstall: () => void;
  onClose: () => void;
}) {
  return (
    <div className="plugins__modal-overlay" onClick={onClose}>
      <div
        className="plugins__modal plugins__modal--install"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="plugins__modal-header">
          <h3 className="plugins__modal-title">Install Plugin</h3>
          <button className="plugins__modal-close" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="plugins__modal-body plugins__modal-body--visible">
          {installMessage && (
            <div
              className={`plugins__modal-message plugins__message--${installMessage.type}`}
            >
              {installMessage.text}
            </div>
          )}
          <div className="plugins__install plugins__install--modal">
            <span className="plugins__install-prefix">$</span>
            <PathAutocomplete
              className="plugins__install-input"
              value={installSource}
              onChange={onChangeSource}
              onSubmit={onInstall}
              placeholder="git@github.com:org/plugin.git or /local/path"
              disabled={installPending}
              apiBase={apiBase}
            />
            <button
              className="plugins__browse-btn"
              onClick={onBrowse}
              disabled={installPending}
              title="Browse local folders"
            >
              📁
            </button>
            <button
              className="plugins__install-btn"
              onClick={onInstall}
              disabled={installPending || previewPending || !installSource.trim()}
            >
              {installPending
                ? 'Installing...'
                : previewPending
                  ? 'Validating...'
                  : 'Install'}
            </button>
          </div>
          <p className="plugins__install-hint">
            Paste a git URL or local path to a Stallion plugin.
          </p>
        </div>
      </div>
    </div>
  );
}
