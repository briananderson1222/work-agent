import {
  LoadingState,
  useRegistryIntegrationActionMutation,
  useRegistryIntegrationsQuery,
} from '@stallion-ai/sdk';
import { useState } from 'react';

export function RegistryModal({ onClose }: { onClose: () => void }) {
  const [message, setMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [filter, setFilter] = useState('');

  const { data: items = [], isLoading } = useRegistryIntegrationsQuery();

  const actionMutation = useRegistryIntegrationActionMutation({
    onSuccess: (_, variables) => {
      const item = items.find((candidate) => candidate.id === variables.id);
      setMessage({
        type: 'success',
        text: `${variables.action === 'install' ? 'Installed' : 'Removed'} ${item?.displayName || variables.id}`,
      });
    },
    onError: (error) => setMessage({ type: 'error', text: error.message }),
  });

  const filtered = items.filter((item) => {
    if (!filter) return true;
    const query = filter.toLowerCase();
    return (
      (item.displayName || item.id).toLowerCase().includes(query) ||
      item.description?.toLowerCase().includes(query)
    );
  });

  return (
    <div className="plugins__modal-overlay" onClick={onClose}>
      <div
        className="plugins__modal"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="plugins__modal-header">
          <h3 className="plugins__modal-title">Integration Registry</h3>
          <button className="plugins__modal-close" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="plugins__modal-body">
          {message && (
            <div
              className={`plugins__modal-message plugins__message--${message.type}`}
            >
              {message.text}
            </div>
          )}
          {isLoading ? (
            <LoadingState message="Loading registry..." />
          ) : items.length === 0 ? (
            <div className="plugins__empty">
              No integration registry configured.
            </div>
          ) : (
            <>
              <input
                className="plugins__filter-input"
                type="text"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder="Filter integrations..."
                autoFocus
              />
              <div className="plugins__registry-list">
                {filtered.length === 0 ? (
                  <div className="plugins__empty">
                    No matches for &ldquo;{filter}&rdquo;
                  </div>
                ) : (
                  filtered.map((item) => (
                    <div key={item.id} className="plugins__registry-item">
                      <div className="plugins__registry-info">
                        <div className="plugins__registry-name">
                          {item.displayName || item.id}
                          {item.version && (
                            <span className="plugins__card-version">
                              v{item.version}
                            </span>
                          )}
                          {item.source && (
                            <span className="plugins__cap plugins__cap--ref">
                              {item.source}
                            </span>
                          )}
                        </div>
                        {item.description && (
                          <div className="plugins__registry-desc plugins__registry-desc--clamp">
                            {item.description.replace(/\\n/g, ' ')}
                          </div>
                        )}
                      </div>
                      <button
                        className={`plugins__btn ${item.installed ? 'plugins__btn--uninstall' : 'plugins__btn--install'}`}
                        onClick={() =>
                          actionMutation.mutate({
                            id: item.id,
                            action: item.installed ? 'uninstall' : 'install',
                          })
                        }
                        disabled={actionMutation.isPending}
                      >
                        {actionMutation.isPending
                          ? '...'
                          : item.installed
                            ? 'Remove'
                            : 'Install'}
                      </button>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
