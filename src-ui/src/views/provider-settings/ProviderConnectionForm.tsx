import { PROVIDER_TYPES } from './providerTypes';
import type { ProviderConnection } from './types';

export function ProviderConnectionForm({
  form,
  isNew,
  selectedProviderId,
  testResult,
  testError,
  isTesting,
  onSetField,
  onSetConfigField,
  onTypeChange,
  onTestConnection,
}: {
  form: Omit<ProviderConnection, 'id'>;
  isNew: boolean;
  selectedProviderId?: string;
  testResult: { healthy: boolean } | null;
  testError: string | null;
  isTesting: boolean;
  onSetField: <K extends keyof Omit<ProviderConnection, 'id'>>(
    key: K,
    value: Omit<ProviderConnection, 'id'>[K],
  ) => void;
  onSetConfigField: (key: string, value: string) => void;
  onTypeChange: (type: string) => void;
  onTestConnection: (id: string) => void;
}) {
  return (
    <div
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: '20px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
      }}
    >
      <div className="editor-field">
        <label className="editor-label">Type</label>
        <select
          className="editor-select"
          value={form.type}
          onChange={(event) => onTypeChange(event.target.value)}
        >
          {PROVIDER_TYPES.map((option) => (
            <option key={option.type} value={option.type}>
              {option.name}
            </option>
          ))}
        </select>
      </div>

      <div className="editor-field">
        <label className="editor-label">Name *</label>
        <input
          className="editor-input"
          type="text"
          value={form.name}
          placeholder="My Model Connection"
          onChange={(event) => onSetField('name', event.target.value)}
        />
      </div>

      <div className="editor-field">
        <label className="editor-label">Capabilities</label>
        <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
          {form.capabilities
            .filter((capability) => capability !== 'vectordb')
            .map((capability) => (
              <span
                key={capability}
                style={{
                  fontSize: '10px',
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: '4px',
                  background: 'var(--bg-tertiary)',
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                {capability}
              </span>
            ))}
        </div>
      </div>

      {form.type === 'ollama' && (
        <div className="editor-field">
          <label className="editor-label">Base URL</label>
          <input
            className="editor-input"
            type="text"
            value={(form.config.baseUrl as string) ?? ''}
            placeholder="http://localhost:11434"
            onChange={(event) =>
              onSetConfigField('baseUrl', event.target.value)
            }
          />
        </div>
      )}

      {form.type === 'openai-compat' && (
        <>
          <div className="editor-field">
            <label className="editor-label">Base URL</label>
            <input
              className="editor-input"
              type="text"
              value={(form.config.baseUrl as string) ?? ''}
              placeholder="https://api.openai.com/v1"
              onChange={(event) =>
                onSetConfigField('baseUrl', event.target.value)
              }
            />
          </div>
          <div className="editor-field">
            <label className="editor-label">API Key</label>
            <input
              className="editor-input"
              type="password"
              value={(form.config.apiKey as string) ?? ''}
              placeholder="sk-…"
              onChange={(event) =>
                onSetConfigField('apiKey', event.target.value)
              }
            />
          </div>
        </>
      )}

      {form.type === 'bedrock' && (
        <div className="editor-field">
          <label className="editor-label">Region</label>
          <input
            className="editor-input"
            type="text"
            value={(form.config.region as string) ?? ''}
            placeholder="us-east-1"
            onChange={(event) => onSetConfigField('region', event.target.value)}
          />
        </div>
      )}

      <div className="editor-field">
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            cursor: 'pointer',
            fontSize: '13px',
            color: 'var(--text-primary)',
          }}
        >
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(event) => onSetField('enabled', event.target.checked)}
          />
          Enabled
        </label>
      </div>

      {!isNew && selectedProviderId && (
        <div
          style={{
            paddingTop: '8px',
            borderTop: '1px solid var(--border-primary)',
          }}
        >
          <button
            className="editor-btn"
            onClick={() => onTestConnection(selectedProviderId)}
            disabled={isTesting}
            style={{ marginBottom: '8px' }}
          >
            {isTesting ? 'Testing…' : 'Test Connection'}
          </button>
          {testResult && (
            <div
              style={{
                fontSize: '13px',
                color: testResult.healthy
                  ? 'var(--success-text, #22c55e)'
                  : 'var(--error-text)',
                marginTop: '6px',
              }}
            >
              {testResult.healthy
                ? '✓ Connection healthy'
                : '✗ Connection failed'}
            </div>
          )}
          {testError && (
            <div
              style={{
                fontSize: '13px',
                color: 'var(--error-text)',
                marginTop: '6px',
              }}
            >
              ✗ {testError}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
