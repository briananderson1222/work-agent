import {
  type RegistryCatalogTab,
  useInstalledRegistryItemsQuery,
  useRegistryItemsQuery,
} from '@stallion-ai/sdk';
import { useState } from 'react';
import './page-layout.css';

interface RegistryItem {
  id: string;
  name: string;
  description?: string;
  version?: string;
  installed?: boolean;
}

const TABS: { key: RegistryCatalogTab; label: string }[] = [
  { key: 'agents', label: 'Agents' },
  { key: 'skills', label: 'Skills' },
  { key: 'integrations', label: 'Integrations' },
  { key: 'plugins', label: 'Plugins' },
];

export function RegistryView() {
  const [activeTab, setActiveTab] = useState<RegistryCatalogTab>('agents');
  const { data: available = [], isLoading: loadingAvailable } =
    useRegistryItemsQuery<RegistryItem>(activeTab);
  const { data: installed = [], isLoading: loadingInstalled } =
    useInstalledRegistryItemsQuery<RegistryItem>(activeTab);

  const isLoading = loadingAvailable || loadingInstalled;
  const installedIds = new Set(
    installed.map((i) => i.id || (i as any).name || (i as any).slug),
  );

  return (
    <div className="page page--full">
      <div className="page-layout__header">
        <h2 className="page-layout__title">Registry</h2>
        <p className="page-layout__subtitle">
          Browse and install agents, skills, integrations, and plugins
        </p>
      </div>

      <div className="page-layout__tabs">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`page-layout__tab${activeTab === tab.key ? ' page-layout__tab--active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="page-layout__content">
        {isLoading && <div className="page-layout__loading">Loading...</div>}

        {!isLoading && available.length === 0 && (
          <div className="page-layout__empty">
            <p>No {activeTab} available in the registry.</p>
          </div>
        )}

        {!isLoading &&
          available.map((item) => {
            const id = item.id || (item as any).name || (item as any).slug;
            const isInstalled = installedIds.has(id);
            return (
              <div key={id} className="page-layout__card">
                <div className="page-layout__card-info">
                  <span className="page-layout__card-name">
                    {item.name || id}
                  </span>
                  {item.description && (
                    <span className="page-layout__card-desc">
                      {item.description}
                    </span>
                  )}
                </div>
                <span
                  className={`page-layout__card-badge${isInstalled ? ' page-layout__card-badge--installed' : ''}`}
                >
                  {isInstalled ? 'Installed' : 'Available'}
                </span>
              </div>
            );
          })}
      </div>
    </div>
  );
}
