import { useFileSystemBrowseQuery } from '@stallion-ai/sdk';
import { useState } from 'react';

export function FolderPickerModal({
  onSelect,
  onClose,
}: {
  onSelect: (path: string) => void;
  onClose: () => void;
}) {
  const [currentPath, setCurrentPath] = useState('');

  const {
    data,
    isLoading: loading,
    error,
  } = useFileSystemBrowseQuery(currentPath);

  const entries = (data?.entries || []).filter((entry) => entry.isDirectory);
  const resolvedPath = data?.path || currentPath;

  const parentPath = resolvedPath
    ? resolvedPath.replace(/\/[^/]+\/?$/, '') || '/'
    : '';

  return (
    <div className="plugins__modal-overlay" onClick={onClose}>
      <div
        className="plugins__modal plugins__folder-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="plugins__modal-header">
          <h3 className="plugins__modal-title">Select Folder</h3>
          <button className="plugins__modal-close" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="plugins__folder-path">
          <code>{resolvedPath}</code>
          <button
            className="plugins__folder-select-btn"
            onClick={() => {
              onSelect(resolvedPath);
              onClose();
            }}
          >
            Select This Folder
          </button>
        </div>
        <div className="plugins__modal-body">
          {error && (
            <div className="plugins__modal-message plugins__message--error">
              {(error as Error).message}
            </div>
          )}
          {loading ? (
            <div className="plugins__empty">Loading...</div>
          ) : (
            <div className="plugins__folder-list">
              {resolvedPath !== '/' && (
                <div
                  className="plugins__folder-entry"
                  onClick={() => setCurrentPath(parentPath)}
                >
                  <span className="plugins__folder-icon">↑</span>
                  <span className="plugins__folder-name">..</span>
                </div>
              )}
              {entries.map((entry) => (
                <div
                  key={entry.name}
                  className="plugins__folder-entry"
                  onClick={() =>
                    setCurrentPath(`${resolvedPath}/${entry.name}`)
                  }
                >
                  <span className="plugins__folder-icon">📁</span>
                  <span className="plugins__folder-name">{entry.name}</span>
                </div>
              ))}
              {entries.length === 0 && (
                <div className="plugins__empty">No subdirectories</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
