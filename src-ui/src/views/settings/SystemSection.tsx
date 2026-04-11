import type { AppConfig } from '../../types';
import { CoreUpdateCheck } from './CoreUpdateCheck';
import { SettingsSection } from './SettingsSection';

export function SystemSection({
  apiBase,
  config,
  onChange,
  onExport,
  onImport,
  onResetToDefaults,
}: {
  apiBase: string;
  config: AppConfig;
  onChange: (config: AppConfig) => void;
  onExport: () => void;
  onImport: (file: File) => Promise<void>;
  onResetToDefaults: () => void;
}) {
  return (
    <SettingsSection icon="⚙" title="System" id="section-system">
      <div className="settings__field">
        <label className="settings__field-label">Core App Updates</label>
        <CoreUpdateCheck apiBase={apiBase} />
      </div>

      <div className="settings__field">
        <label className="settings__field-label" htmlFor="logLevel">
          Log Level
        </label>
        <select
          id="logLevel"
          value={config.logLevel || 'info'}
          onChange={(event) =>
            onChange({
              ...config,
              logLevel: event.target.value as AppConfig['logLevel'],
            })
          }
        >
          <option value="error">Error</option>
          <option value="warn">Warning</option>
          <option value="info">Info</option>
          <option value="debug">Debug</option>
          <option value="trace">Trace</option>
        </select>
        <span className="settings__field-hint">
          Logging verbosity. Higher levels include more detail.
        </span>
      </div>

      <div className="settings__field">
        <label className="settings__field-label">Backup & Restore</label>
        <div className="settings__export-row">
          <button
            type="button"
            className="settings__secondary-btn"
            onClick={onExport}
          >
            Export Settings
          </button>
          <label className="settings__secondary-btn settings__import-label">
            Import Settings
            <input
              type="file"
              accept=".json"
              hidden
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (file) await onImport(file);
                event.target.value = '';
              }}
            />
          </label>
        </div>
        <span className="settings__field-hint">
          Export current settings as JSON or import from a backup. Imported
          settings appear as unsaved changes.
        </span>
      </div>

      <div className="settings__danger">
        <button
          type="button"
          className="settings__danger-btn"
          onClick={onResetToDefaults}
        >
          Reset to Defaults
        </button>
        <span className="settings__field-hint">
          Restore all settings to factory defaults. Cannot be undone.
        </span>
      </div>
    </SettingsSection>
  );
}
