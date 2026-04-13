import { SettingsSection } from './SettingsSection';

export function ConnectionSection({
  currentApiBase,
  isCustom,
  apiBaseError,
  testStatus,
  region,
  regionError,
  showRegion,
  onApiBaseChange,
  onResetApiBase,
  onTestConnection,
  onRegionChange,
}: {
  currentApiBase: string;
  isCustom: boolean;
  apiBaseError: string | null;
  testStatus: 'idle' | 'testing' | 'success' | 'failed';
  region: string;
  regionError?: string;
  showRegion: boolean;
  onApiBaseChange: (value: string) => void;
  onResetApiBase: () => void;
  onTestConnection: () => void;
  onRegionChange: (value: string) => void;
}) {
  return (
    <SettingsSection icon="◇" title="Connection" id="section-connection">
      <div className="settings__field">
        <label className="settings__field-label" htmlFor="apiBase">
          Backend API Base URL
        </label>
        <div className="settings__conn-row">
          <input
            id="apiBase"
            type="text"
            value={currentApiBase}
            onChange={(event) => onApiBaseChange(event.target.value)}
            placeholder="http://localhost:3141"
          />
          {isCustom && (
            <button
              type="button"
              className="settings__conn-reset"
              onClick={onResetApiBase}
            >
              Reset
            </button>
          )}
        </div>
        {apiBaseError && (
          <span className="settings__field-error">{apiBaseError}</span>
        )}
        <span className="settings__field-hint">
          Changes take effect immediately.
          {isCustom && (
            <span className="settings__conn-custom-warning">
              {' '}
              Using custom URL.
            </span>
          )}
        </span>
        <button
          type="button"
          aria-live="polite"
          className={`settings__conn-test${testStatus === 'success' ? ' settings__conn-test--ok' : testStatus === 'failed' ? ' settings__conn-test--fail' : ''}`}
          disabled={testStatus === 'testing'}
          onClick={onTestConnection}
        >
          {testStatus === 'testing'
            ? 'Testing…'
            : testStatus === 'success'
              ? '✓ Connected'
              : testStatus === 'failed'
                ? '✗ Failed'
                : 'Test Connection'}
        </button>
      </div>

      {showRegion ? (
        <div className="settings__field">
          <label className="settings__field-label" htmlFor="region">
            AWS Region
          </label>
          <input
            id="region"
            type="text"
            className={regionError ? 'settings__field--invalid' : ''}
            value={region}
            onChange={(event) => onRegionChange(event.target.value)}
            placeholder="us-east-1"
          />
          {regionError && (
            <span className="settings__field-error">{regionError}</span>
          )}
          <span className="settings__field-hint">
            Only used for Amazon Bedrock routing.
          </span>
        </div>
      ) : null}
    </SettingsSection>
  );
}
