import {
  useInstallRegistryItemMutation,
  useRegistryAgentsQuery,
  useRegistryInstalledQuery,
  useRegistryIntegrationsQuery,
  useRegistryPluginsQuery,
  useRegistrySkillsQuery,
  useUninstallRegistryItemMutation,
} from '@stallion-ai/sdk';
import { useMemo, useState } from 'react';
import { SplitPaneLayout } from '../components/SplitPaneLayout';
import { Tabs } from '../components/Tabs';
import { useToast } from '../contexts/ToastContext';
import { useUrlSelection } from '../hooks/useUrlSelection';
import type { NavigationView } from '../types';
import './editor-layout.css';
import './page-layout.css';
import './registry-view.css';

type RegistryTab = 'agents' | 'skills' | 'integrations' | 'plugins';

interface RegistryViewProps {
  tab?: RegistryTab;
  onNavigate: (view: NavigationView) => void;
}

const TABS: { key: RegistryTab; label: string }[] = [
  { key: 'agents', label: 'Agents' },
  { key: 'skills', label: 'Skills' },
  { key: 'integrations', label: 'Integrations' },
  { key: 'plugins', label: 'Plugins' },
];

interface RegistryEntry {
  id: string;
  name: string;
  description?: string;
  version?: string;
  source?: string;
  installed: boolean;
}

function useTabData(tab: RegistryTab) {
  const agents = useRegistryAgentsQuery({ enabled: tab === 'agents' });
  const skills = useRegistrySkillsQuery({ enabled: tab === 'skills' });
  const integrations = useRegistryIntegrationsQuery({
    enabled: tab === 'integrations',
  });
  const plugins = useRegistryPluginsQuery({ enabled: tab === 'plugins' });
  const installed = useRegistryInstalledQuery(tab);

  const map: Record<RegistryTab, { data: any[]; isLoading: boolean }> = {
    agents: { data: agents.data ?? [], isLoading: agents.isLoading },
    skills: { data: skills.data ?? [], isLoading: skills.isLoading },
    integrations: {
      data: integrations.data ?? [],
      isLoading: integrations.isLoading,
    },
    plugins: { data: plugins.data ?? [], isLoading: plugins.isLoading },
  };

  const available = map[tab];
  const installedIds = new Set(
    (installed.data ?? []).map((i: any) => i.id ?? i.name ?? i.slug ?? ''),
  );

  return {
    data: available.data,
    installedIds,
    isLoading: available.isLoading || installed.isLoading,
  };
}

function normalizeItems(
  raw: any[],
  installedIds: Set<string>,
): RegistryEntry[] {
  return raw.map((item: any) => {
    const id = item.id ?? item.name ?? item.slug ?? '';
    return {
      id,
      name: item.name ?? item.displayName ?? item.id ?? '',
      description: item.description,
      version: item.version,
      source: item.source,
      installed: installedIds.has(id) || (item.installed ?? false),
    };
  });
}

export function RegistryView({ tab, onNavigate }: RegistryViewProps) {
  const activeTab = tab ?? 'agents';
  const { selectedId, select, deselect } = useUrlSelection(
    `/registry/${activeTab}`,
  );
  const [search, setSearch] = useState('');
  const { showToast } = useToast();

  const { data: rawItems, installedIds, isLoading } = useTabData(activeTab);

  const items = useMemo(() => {
    const normalized = normalizeItems(rawItems, installedIds);
    const q = search.toLowerCase();
    return q
      ? normalized.filter(
          (i) =>
            i.name.toLowerCase().includes(q) ||
            i.description?.toLowerCase().includes(q),
        )
      : normalized;
  }, [rawItems, search, installedIds]);

  const selected = items.find((i) => i.id === selectedId);

  const installMutation = useInstallRegistryItemMutation(activeTab);
  const uninstallMutation = useUninstallRegistryItemMutation(activeTab);

  const sidebarItems = items.map((i) => ({
    id: i.id,
    name: i.name,
    subtitle: i.installed ? '✓ Installed' : (i.source ?? 'Available'),
  }));

  return (
    <div className="page page--full">
      <Tabs
        tabs={TABS}
        activeTab={activeTab}
        onTabChange={(t) => {
          deselect();
          onNavigate({ type: 'registry', tab: t as RegistryTab });
        }}
      />

      <SplitPaneLayout
        label={activeTab}
        title="Registry"
        subtitle="Browse and install agents, skills, integrations, and plugins"
        items={sidebarItems}
        loading={isLoading}
        selectedId={selectedId}
        onSelect={select}
        onDeselect={deselect}
        onSearch={setSearch}
        searchPlaceholder={`Search ${activeTab}...`}
        emptyIcon="📦"
        emptyTitle="No item selected"
        emptyDescription="Select an item to view details"
      >
        {selected && (
          <div className="registry-detail">
            <div className="registry-detail__hero">
              <div className="registry-detail__icon">
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                  <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                  <line x1="12" y1="22.08" x2="12" y2="12" />
                </svg>
              </div>
              <div className="registry-detail__hero-text">
                <h2 className="registry-detail__name">{selected.name}</h2>
                <div className="registry-detail__meta">
                  {selected.installed ? (
                    <span className="registry-detail__badge registry-detail__badge--installed">
                      Installed
                    </span>
                  ) : (
                    <span className="registry-detail__badge registry-detail__badge--available">
                      Available
                    </span>
                  )}
                  {selected.version && (
                    <span className="registry-detail__badge registry-detail__badge--version">
                      v{selected.version}
                    </span>
                  )}
                  {selected.source && (
                    <span className="registry-detail__badge registry-detail__badge--source">
                      {selected.source}
                    </span>
                  )}
                </div>
              </div>
              <div className="registry-detail__actions">
                {selected.installed ? (
                  <button
                    type="button"
                    className="registry-detail__btn registry-detail__btn--uninstall"
                    disabled={uninstallMutation.isPending}
                    onClick={() =>
                      uninstallMutation.mutate(selected.id, {
                        onError: () => showToast('Failed to uninstall'),
                      })
                    }
                  >
                    {uninstallMutation.isPending ? 'Removing…' : 'Uninstall'}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="registry-detail__btn registry-detail__btn--install"
                    disabled={installMutation.isPending}
                    onClick={() =>
                      installMutation.mutate(selected.id, {
                        onError: () => showToast('Failed to install'),
                      })
                    }
                  >
                    {installMutation.isPending ? (
                      'Installing…'
                    ) : (
                      <>
                        <span className="registry-detail__btn-icon">↓</span>{' '}
                        Install
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
            {selected.description && (
              <div className="registry-detail__section">
                <p className="registry-detail__description">
                  {selected.description}
                </p>
              </div>
            )}
          </div>
        )}
      </SplitPaneLayout>
    </div>
  );
}
