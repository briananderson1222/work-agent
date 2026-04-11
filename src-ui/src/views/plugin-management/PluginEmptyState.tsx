import type { Plugin, PluginMessage, PluginUpdateSummary } from './types';

export function PluginEmptyState({
  updates,
  plugins,
  filteredPlugins,
  isLoading,
  search,
  message,
  onUpdateAll,
  onInstall,
}: {
  updates: PluginUpdateSummary[];
  plugins: Plugin[];
  filteredPlugins: Plugin[];
  isLoading: boolean;
  search: string;
  message: PluginMessage | null;
  onUpdateAll: () => void;
  onInstall: () => void;
}) {
  return (
    <div className="detail-panel">
      {updates.length > 0 && (
        <div className="plugins__update-banner">
          <span className="plugins__update-banner-text">
            {updates.length} update{updates.length > 1 ? 's' : ''} available
          </span>
          <button className="plugins__update-all-btn" onClick={onUpdateAll}>
            Update All
          </button>
        </div>
      )}
      {message && (
        <div className={`plugins__message plugins__message--${message.type}`}>
          {message.text}
        </div>
      )}
      {plugins.length === 0 && !isLoading && (
        <div className="plugins__empty">
          No plugins installed yet.
          <button className="plugins__empty-cta" onClick={onInstall}>
            Install your first plugin
          </button>
        </div>
      )}
      {plugins.length > 0 && filteredPlugins.length === 0 && search && (
        <div className="plugins__empty">
          No plugins matching &ldquo;{search}&rdquo;
        </div>
      )}
    </div>
  );
}
