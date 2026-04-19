import {
  type RegistryCatalogTab,
  useInstalledRegistryItemsQuery,
  usePluginRegistryInstallMutation,
  useRegistryAgentActionMutation,
  useRegistryIntegrationActionMutation,
  useRegistryItemsQuery,
  useRegistrySkillActionMutation,
} from '@stallion-ai/sdk';
import { useEffect, useMemo, useState } from 'react';
import { useNavigation } from '../contexts/NavigationContext';
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

function getRegistryItemId(item: RegistryItem) {
  return item.id || (item as any).name || (item as any).slug;
}

function getTabSingularLabel(tab: RegistryCatalogTab) {
  return tab.slice(0, -1);
}

function getRegistrySourceLabel(item: RegistryItem) {
  if (!item.source) return null;
  if (item.source === 'GitHub') return 'GitHub';
  if (item.source.startsWith('/')) return 'Local';
  return item.source;
}

function getRegistryActionLabel(tab: RegistryCatalogTab, isInstalled: boolean) {
  if (tab === 'skills') {
    return isInstalled ? 'Remove from workspace' : 'Install to workspace';
  }
  return isInstalled ? 'Remove' : 'Install';
}

function getRegistryActionHint(tab: RegistryCatalogTab, isInstalled: boolean) {
  if (tab !== 'skills') return null;
  return isInstalled
    ? 'Removing deletes the workspace copy so the skill is no longer selectable in agent definitions.'
    : 'Installing copies this skill into the workspace so it becomes selectable in agent definitions.';
}

export function RegistryView() {
  const { navigate } = useNavigation();
  const [activeTab, setActiveTab] = useState<RegistryCatalogTab>('agents');
  const [message, setMessage] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const {
    data: available = [],
    error: availableError,
    isLoading: loadingAvailable,
  } = useRegistryItemsQuery<RegistryItem>(activeTab);
  const {
    data: installed = [],
    error: installedError,
    isLoading: loadingInstalled,
  } = useInstalledRegistryItemsQuery<RegistryItem>(activeTab);
  const agentMutation = useRegistryAgentActionMutation();
  const integrationMutation = useRegistryIntegrationActionMutation();
  const pluginMutation = usePluginRegistryInstallMutation();
  const skillMutation = useRegistrySkillActionMutation();

  const isLoading = loadingAvailable || loadingInstalled;
  const loadError =
    (availableError as Error | null) || (installedError as Error | null);
  const installedIds = useMemo(
    () =>
      new Set(installed.map((item) => getRegistryItemId(item as RegistryItem))),
    [installed],
  );
  const filteredAvailable = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return available;
    return available.filter((item) => {
      const id = getRegistryItemId(item).toLowerCase();
      return (
        id.includes(query) ||
        item.displayName?.toLowerCase().includes(query) ||
        item.description?.toLowerCase().includes(query) ||
        item.source?.toLowerCase().includes(query) ||
        item.version?.toLowerCase().includes(query)
      );
    });
  }, [available, search]);
  const selectedItem = useMemo(() => {
    if (filteredAvailable.length === 0) return null;
    return (
      filteredAvailable.find(
        (item) => getRegistryItemId(item) === selectedId,
      ) ?? filteredAvailable[0]
    );
  }, [filteredAvailable, selectedId]);

  useEffect(() => {
    if (filteredAvailable.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedItem) {
      setSelectedId(getRegistryItemId(filteredAvailable[0]));
    }
  }, [filteredAvailable, selectedItem]);

  const selectedItemId = selectedItem ? getRegistryItemId(selectedItem) : null;
  const selectedInstalled = selectedItem
    ? installedIds.has(selectedItemId ?? '') || !!selectedItem.installed
    : false;
  const pendingId =
    activeTab === 'agents'
      ? agentMutation.variables?.id
      : activeTab === 'skills'
        ? skillMutation.variables?.id
        : activeTab === 'integrations'
          ? integrationMutation.variables?.id
          : pluginMutation.variables?.id;
  const actionPending =
    (activeTab === 'agents'
      ? agentMutation.isPending
      : activeTab === 'skills'
        ? skillMutation.isPending
        : activeTab === 'integrations'
          ? integrationMutation.isPending
          : pluginMutation.isPending) && pendingId === selectedItemId;

  const runAction = (
    item: RegistryItem,
    itemId: string,
    isInstalled: boolean,
  ) => {
    const action = isInstalled ? 'uninstall' : 'install';
    const callbacks = {
      onError: (error: Error) => setMessage(error.message),
      onSuccess: () =>
        setMessage(
          `${isInstalled ? 'Removed' : 'Installed'} ${item.displayName || itemId}`,
        ),
    };

    if (activeTab === 'agents') {
      agentMutation.mutate({ id: itemId, action }, callbacks);
      return;
    }
    if (activeTab === 'skills') {
      skillMutation.mutate({ id: itemId, action }, callbacks);
      return;
    }
    if (activeTab === 'integrations') {
      integrationMutation.mutate({ id: itemId, action }, callbacks);
      return;
    }
    pluginMutation.mutate({ id: itemId, action }, callbacks);
  };

  return (
    <div className="page page--full">
      <div className="page__header page__header--sticky">
        <div className="page__header-text">
          <div className="page__label">Registry</div>
          <h2 className="page__title">Registry</h2>
          <p className="page__subtitle">
            Browse and install agents, skills, integrations, and plugins.
          </p>
          {activeTab === 'skills' && (
            <div className="page__header-actions-inline">
              <button
                type="button"
                className="page__btn-secondary"
                onClick={() => navigate('/skills')}
              >
                Manage Installed Skills
              </button>
            </div>
          )}
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
              setSearch('');
              setActiveTab(tab.key);
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="page page__section-stack">
        <div className="page__search-row">
          <input
            type="text"
            className="page__search-input"
            placeholder={`Search ${activeTab}...`}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label={`Search ${activeTab}`}
          />
        </div>

        {message && <div className="page__message">{message}</div>}

        {isLoading && <div className="page__empty">Loading...</div>}

        {!isLoading && loadError && (
          <div className="page__empty">
            <p>Could not load {activeTab} right now.</p>
            <p className="page__subtitle">{loadError.message}</p>
          </div>
        )}

        {!isLoading && !loadError && available.length === 0 && (
          <div className="page__empty">
            <p>No {activeTab} available in the registry.</p>
          </div>
        )}

        {!isLoading &&
          !loadError &&
          available.length > 0 &&
          filteredAvailable.length === 0 && (
            <div className="page__empty">
              <p className="page__empty-title">No matching {activeTab}</p>
              <p className="page__empty-desc">
                Adjust the search to browse more registry items.
              </p>
            </div>
          )}

        {!isLoading && !loadError && filteredAvailable.length > 0 && (
          <>
            {selectedItem && (
              <div className="page__card-loose" data-testid="registry-detail">
                <div className="page__section-label">
                  Selected {getTabSingularLabel(activeTab)}
                </div>
                <div className="page__card-row">
                  <div className="page__card-text">
                    <div className="page__card-name">
                      {selectedItem.displayName || selectedItemId}
                    </div>
                    {selectedItem.description && (
                      <div className="page__card-desc">
                        {selectedItem.description}
                      </div>
                    )}
                  </div>
                  <span
                    className={`page__tag${selectedInstalled ? ' page__tag--accent' : ''}`}
                  >
                    {selectedInstalled ? 'Installed' : 'Available'}
                  </span>
                </div>

                {getRegistrySourceLabel(selectedItem) && (
                  <div className="page__meta-row">
                    <span className="page__meta-pill">
                      {getRegistrySourceLabel(selectedItem)}
                    </span>
                  </div>
                )}

                {selectedItem.version && (
                  <div className="page__subtitle">{`v${selectedItem.version}`}</div>
                )}

                {getRegistryActionHint(activeTab, selectedInstalled) && (
                  <div className="page__subtitle">
                    {getRegistryActionHint(activeTab, selectedInstalled)}
                  </div>
                )}

                <div className="page__card-footer">
                  <button
                    type="button"
                    className="page__btn-primary"
                    disabled={actionPending}
                    onClick={() => {
                      setMessage(null);
                      runAction(
                        selectedItem,
                        selectedItemId!,
                        selectedInstalled,
                      );
                    }}
                  >
                    {actionPending
                      ? 'Working...'
                      : getRegistryActionLabel(activeTab, selectedInstalled)}
                  </button>
                </div>
              </div>
            )}

            <div className="page__card-grid">
              {filteredAvailable.map((item) => {
                const id = getRegistryItemId(item);
                const isInstalled = installedIds.has(id) || !!item.installed;
                const isSelected = id === selectedItemId;
                const sourceLabel = getRegistrySourceLabel(item);

                return (
                  <div
                    key={id}
                    role="button"
                    tabIndex={0}
                    className={`page__card-loose${isSelected ? ' page__card-loose--selected' : ''}`}
                    aria-pressed={isSelected}
                    onClick={() => {
                      setMessage(null);
                      setSelectedId(id);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setMessage(null);
                        setSelectedId(id);
                      }
                    }}
                  >
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

                    {item.version && (
                      <div
                        className="page__subtitle"
                        style={{ marginTop: '0.75rem' }}
                      >
                        {`v${item.version}`}
                      </div>
                    )}

                    <div className="page__card-footer">
                      <div className="page__meta-row">
                        {sourceLabel && (
                          <span className="page__meta-pill">{sourceLabel}</span>
                        )}
                      </div>
                      <button
                        type="button"
                        className="page__btn-secondary"
                        onClick={(event) => {
                          event.stopPropagation();
                          setMessage(null);
                          setSelectedId(id);
                          runAction(item, id, isInstalled);
                        }}
                      >
                        {getRegistryActionLabel(activeTab, isInstalled)}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
