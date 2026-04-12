import type {
  PluginProviderDetail,
  PluginSettingField,
} from '@stallion-ai/sdk';
import { DetailHeader } from '../../components/DetailHeader';
import { Toggle } from '../../components/Toggle';
import { PluginSettingFieldRow } from './PluginSettingFieldRow';
import type { Plugin, PluginMessage, PluginUpdateSummary } from './types';

export function PluginDetailPanel({
  selected,
  updates,
  message,
  settingsData,
  changelogData,
  expandedProviders,
  providerDetails,
  loadingProviderDetails,
  changelogExpanded,
  updatePending,
  updateTarget,
  onUpdate,
  onCheckUpdates,
  onRemove,
  onToggleProviders,
  onToggleProvider,
  onSaveSetting,
  onToggleChangelog,
  onReviewPermissions,
}: {
  selected: Plugin;
  updates: PluginUpdateSummary[];
  message: PluginMessage | null;
  settingsData:
    | {
        schema: PluginSettingField[];
        values: Record<string, unknown>;
      }
    | undefined;
  changelogData:
    | {
        entries: Array<{
          hash: string;
          short: string;
          subject: string;
          author: string;
          date: string;
        }>;
      }
    | undefined;
  expandedProviders: Set<string>;
  providerDetails: PluginProviderDetail[] | undefined;
  loadingProviderDetails: boolean;
  changelogExpanded: boolean;
  updatePending: boolean;
  updateTarget: string | undefined;
  onUpdate: (name: string) => void;
  onCheckUpdates: () => void;
  onRemove: (name: string) => void;
  onToggleProviders: (pluginName: string) => void;
  onToggleProvider: (
    pluginName: string,
    providerType: string,
    currentlyEnabled: boolean,
  ) => void;
  onSaveSetting: (name: string, key: string, value: unknown) => void;
  onToggleChangelog: () => void;
  onReviewPermissions: () => Promise<void>;
}) {
  const update = updates.find((entry) => entry.name === selected.name);
  const providersExpanded = expandedProviders.has(selected.name);

  return (
    <div className="detail-panel">
      {message && (
        <div className={`plugins__message plugins__message--${message.type}`}>
          {message.text}
        </div>
      )}

      <DetailHeader
        title={selected.displayName || selected.name}
        subtitle={selected.description}
        badge={{
          label: `v${selected.version}`,
          variant: 'muted' as const,
        }}
      >
        {update ? (
          <button
            className="editor-btn editor-btn--primary"
            onClick={() => onUpdate(selected.name)}
            disabled={updatePending && updateTarget === selected.name}
          >
            {updatePending && updateTarget === selected.name
              ? 'Updating…'
              : update.source === 'git'
                ? `Update (${update.latestVersion})`
                : `Update to v${update.latestVersion}`}
          </button>
        ) : (
          <button className="editor-btn" onClick={onCheckUpdates}>
            Check for Updates
          </button>
        )}
        <button
          className="editor-btn editor-btn--danger"
          onClick={() => onRemove(selected.name)}
        >
          Remove
        </button>
      </DetailHeader>

      <div className="detail-panel__body">
        <div className="detail-panel__caps">
          {selected.hasBundle && (
            <span className="plugins__cap plugins__cap--bundle">ui</span>
          )}
          {selected.layout && (
            <span className="plugins__cap plugins__cap--workspace">
              layout:{selected.layout.slug}
            </span>
          )}
          {selected.agents?.map((agent) => (
            <span key={agent.slug} className="plugins__cap plugins__cap--agent">
              agent:{agent.slug}
            </span>
          ))}
          {selected.providers?.map((provider) => (
            <span
              key={provider.type}
              className="plugins__cap plugins__cap--provider"
            >
              provider:{provider.type}
            </span>
          ))}
          {selected.git && (
            <span className="plugins__cap plugins__cap--ref">
              {selected.git.branch}@{selected.git.hash?.slice(0, 7)}
            </span>
          )}
        </div>

        {selected.providers && selected.providers.length > 0 && (
          <div className="detail-panel__section">
            <button
              className="plugins__providers-toggle"
              onClick={() => onToggleProviders(selected.name)}
            >
              <span
                className={`plugins__providers-arrow${providersExpanded ? ' plugins__providers-arrow--expanded' : ''}`}
              >
                ▶
              </span>{' '}
              Providers ({selected.providers.length})
            </button>
            {providersExpanded &&
              (loadingProviderDetails && !providerDetails ? (
                <div className="plugins__empty">Loading providers...</div>
              ) : (
                providerDetails && (
                  <div className="plugins__providers-list">
                    {providerDetails.map((provider: PluginProviderDetail) => (
                      <div
                        key={provider.type}
                        className="plugins__provider-row"
                      >
                        <span className="plugins__cap plugins__cap--provider">
                          {provider.type}
                        </span>
                        {provider.layout && (
                          <span className="plugins__provider-scope">
                            {provider.layout}
                          </span>
                        )}
                        <label className="plugins__provider-toggle">
                          <Toggle
                            checked={provider.enabled}
                            onChange={() =>
                              onToggleProvider(
                                selected.name,
                                provider.type,
                                provider.enabled,
                              )
                            }
                            size="sm"
                          />
                          {provider.enabled ? 'Enabled' : 'Disabled'}
                        </label>
                      </div>
                    ))}
                  </div>
                )
              ))}
          </div>
        )}

        {selected.hasSettings && settingsData?.schema?.length ? (
          <div className="detail-panel__section">
            <div className="plugins__settings-header">Settings</div>
            <div className="plugins__settings-form">
              {settingsData.schema.map((field: PluginSettingField) => (
                <PluginSettingFieldRow
                  key={field.key}
                  field={field}
                  value={settingsData.values[field.key]}
                  onChange={(value) =>
                    onSaveSetting(selected.name, field.key, value)
                  }
                />
              ))}
            </div>
          </div>
        ) : null}

        {selected.git && changelogData?.entries?.length ? (
          <div className="detail-panel__section">
            <button
              className="plugins__providers-toggle"
              onClick={onToggleChangelog}
            >
              <span
                className={`plugins__providers-arrow${changelogExpanded ? ' plugins__providers-arrow--expanded' : ''}`}
              >
                ▶
              </span>{' '}
              Changelog ({changelogData.entries.length})
            </button>
            {changelogExpanded && (
              <div className="plugins__changelog-list">
                {changelogData.entries.map((entry) => (
                  <div key={entry.hash} className="plugins__changelog-entry">
                    <code className="plugins__changelog-hash">
                      {entry.short}
                    </code>
                    <span className="plugins__changelog-subject">
                      {entry.subject}
                    </span>
                    <span className="plugins__changelog-meta">
                      {entry.author} ·{' '}
                      {new Date(entry.date).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}

        {selected.permissions?.missing &&
        selected.permissions.missing.length > 0 ? (
          <button
            className="plugins__btn plugins__btn--permissions"
            onClick={onReviewPermissions}
          >
            Review Permissions ({selected.permissions.missing.length})
          </button>
        ) : null}
      </div>
    </div>
  );
}
