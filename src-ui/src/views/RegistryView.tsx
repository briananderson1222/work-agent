import {
  type RegistryCatalogTab,
  useInstalledRegistryItemsQuery,
  usePluginRegistryInstallMutation,
  useRegistryItemsQuery,
} from '@stallion-ai/sdk';
import { useMemo, useState } from 'react';
import './page-layout.css';

interface RegistryItem {
  id: string;
  displayName?: string;
  description?: string;
  installed?: boolean;
  source?: string;
  version?: string;
}

const TABS: { key: RegistryCatalogTab; label: string }[] = [
  { key: 'agents', label: 'Agents' },
  { key: 'skills', label: 'Skills' },
  { key: 'integrations', label: 'Integrations' },
  { key: 'plugins', label: 'Plugins' },
];

export function RegistryView() {
  const [activeTab, setActiveTab] = useState<RegistryCatalogTab>('agents');
  const [message, setMessage] = useState<string | null>(null);
  const { data: available = [], isLoading: loadingAvailable } =
    useRegistryItemsQuery<RegistryItem>(activeTab);
  const { data: installed = [], isLoading: loadingInstalled } =
    useInstalledRegistryItemsQuery<RegistryItem>(activeTab);
  const pluginMutation = usePluginRegistryInstallMutation();

  const isLoading = loadingAvailable || loadingInstalled;
  const installedIds = useMemo(
    () =>
      new Set(
        installed.map(
          (item) => item.id || (item as any).name || (item as any).slug,
        ),
      ),
    [installed],
  );

  return (
    <div className="page page--full">
      <div className="page__header page__header--sticky">
        <div className="page__header-text">
          <div className="page__label">Registry</div>
          <h2 className="page__title">Registry</h2>
          <p className="page__subtitle">
            Browse and install agents, skills, integrations, and plugins.
          </p>
        </div>
      </div>

      <div className="page__tabs">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`page__tab${activeTab === tab.key ? ' page__tab--active' : ''}`}
            onClick={() => {
              setMessage(null);
              setActiveTab(tab.key);
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="page" style={{ paddingTop: '1rem' }}>
        {message && <div className="page__subtitle">{message}</div>}

        {isLoading && <div className="page__empty">Loading...</div>}

        {!isLoading && available.length === 0 && (
          <div className="page__empty">
            <p>No {activeTab} available in the registry.</p>
          </div>
        )}

        {!isLoading && available.length > 0 && (
          <div className="page__card-grid">
            {available.map((item) => {
              const id = item.id || (item as any).name || (item as any).slug;
              const isInstalled =
                activeTab === 'plugins'
                  ? !!item.installed
                  : installedIds.has(id);

              return (
                <div key={id} className="page__card-loose">
                  <div className="page__card-row">
                    <div className="page__card-text">
                      <div className="page__card-name">
                        {item.displayName || id}
                      </div>
                      {item.description && (
                        <div className="page__card-desc">
                          {item.description}
                        </div>
                      )}
                    </div>
                    <span
                      className={`page__tag${isInstalled ? ' page__tag--accent' : ''}`}
                    >
                      {isInstalled ? 'Installed' : 'Available'}
                    </span>
                  </div>

                  {(item.version || item.source) && (
                    <div
                      className="page__subtitle"
                      style={{ marginTop: '0.75rem' }}
                    >
                      {[item.version ? `v${item.version}` : null, item.source]
                        .filter(Boolean)
                        .join(' • ')}
                    </div>
                  )}

                  {activeTab === 'plugins' && (
                    <div style={{ marginTop: '1rem' }}>
                      <button
                        type="button"
                        className="page__btn-primary"
                        disabled={
                          pluginMutation.isPending &&
                          pluginMutation.variables?.id === id
                        }
                        onClick={() => {
                          setMessage(null);
                          pluginMutation.mutate(
                            {
                              action: isInstalled ? 'uninstall' : 'install',
                              id,
                            },
                            {
                              onError: (error) => setMessage(error.message),
                              onSuccess: () =>
                                setMessage(
                                  `${isInstalled ? 'Removed' : 'Installed'} ${item.displayName || id}`,
                                ),
                            },
                          );
                        }}
                      >
                        {pluginMutation.isPending &&
                        pluginMutation.variables?.id === id
                          ? 'Working...'
                          : isInstalled
                            ? 'Remove'
                            : 'Install'}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
