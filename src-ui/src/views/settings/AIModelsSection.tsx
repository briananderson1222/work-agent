import type { RuntimeConnectionView } from '@stallion-ai/contracts/tool';
import { useRuntimeConnectionsQuery } from '@stallion-ai/sdk';
import { ModelSelector } from '../../components/ModelSelector';
import type { AppConfig } from '../../types';
import {
  preferredChatRuntime,
  runtimeCatalogVisibleModels,
} from '../../utils/execution';
import { SettingsSection } from './SettingsSection';

export function AIModelsSection({
  config,
  validationErrors,
  validationWarnings,
  onChange,
}: {
  config: AppConfig;
  validationErrors: Record<string, string>;
  validationWarnings: Record<string, string>;
  onChange: (config: AppConfig) => void;
}) {
  const { data: runtimeConnections = [] } = useRuntimeConnectionsQuery() as {
    data?: RuntimeConnectionView[];
  };
  const preferredRuntime = preferredChatRuntime(runtimeConnections);
  const runtimeModels = runtimeCatalogVisibleModels(preferredRuntime);
  const useRuntimeModelOptions =
    !config.defaultLLMProvider && runtimeModels.length > 0;

  return (
    <SettingsSection icon="◆" title="AI & Models" id="section-ai">
      <div className="settings__field">
        <label className="settings__field-label" htmlFor="defaultModel">
          Default Model
        </label>
        <ModelSelector
          value={config.defaultModel ?? ''}
          models={
            useRuntimeModelOptions
              ? runtimeModels.map((model) => ({
                  id: model.id,
                  name: model.name,
                  originalId: model.originalId,
                }))
              : undefined
          }
          onChange={(modelId) => onChange({ ...config, defaultModel: modelId })}
          placeholder="Select a model…"
        />
        <span className="settings__field-hint">
          {useRuntimeModelOptions
            ? `Default model for new chats and agents that don't specify one. Options currently come from ${preferredRuntime?.name}.`
            : "Default model for new chats and agents that don't specify one."}
        </span>
      </div>

      <div className="settings__field">
        <label className="settings__field-label" htmlFor="systemPrompt">
          Global System Prompt
        </label>
        <textarea
          id="systemPrompt"
          value={config.systemPrompt || ''}
          onChange={(event) =>
            onChange({ ...config, systemPrompt: event.target.value })
          }
          placeholder="Global instructions prepended to all agent prompts…"
          rows={6}
        />
        <div
          className="settings__char-count"
          aria-live="polite"
          aria-atomic="true"
        >
          {(config.systemPrompt || '').length.toLocaleString()} / 10,000
        </div>
        {validationErrors.systemPrompt && (
          <span className="settings__field-error">
            {validationErrors.systemPrompt}
          </span>
        )}
        <span className="settings__field-hint">
          Agents can override this with their own instructions. Supports
          template variables like {'{{date}}'}, {'{{time}}'}, or custom
          variables below.
        </span>
      </div>

      <div className="settings__field">
        <label className="settings__field-label">Template Variables</label>
        <div className="settings__vars">
          {(config.templateVariables || []).map((variable, index) => (
            <div key={index} className="settings__var-row">
              <input
                type="text"
                value={variable.key}
                onChange={(event) => {
                  const updated = [...(config.templateVariables || [])];
                  updated[index] = { ...variable, key: event.target.value };
                  onChange({ ...config, templateVariables: updated });
                }}
                placeholder="variable_name"
              />
              <select
                value={variable.type}
                onChange={(event) => {
                  const updated = [...(config.templateVariables || [])];
                  updated[index] = {
                    ...variable,
                    type: event.target.value as
                      | 'static'
                      | 'date'
                      | 'time'
                      | 'datetime'
                      | 'custom',
                  };
                  onChange({ ...config, templateVariables: updated });
                }}
              >
                <option value="static">Static</option>
                <option value="date">Date</option>
                <option value="time">Time</option>
                <option value="datetime">DateTime</option>
                <option value="custom">Custom</option>
              </select>
              {variable.type === 'static' || variable.type === 'custom' ? (
                <input
                  type="text"
                  value={variable.value || ''}
                  onChange={(event) => {
                    const updated = [...(config.templateVariables || [])];
                    updated[index] = {
                      ...variable,
                      value: event.target.value,
                    };
                    onChange({ ...config, templateVariables: updated });
                  }}
                  placeholder="Value"
                />
              ) : (
                <input
                  type="text"
                  value={variable.format || ''}
                  onChange={(event) => {
                    const updated = [...(config.templateVariables || [])];
                    updated[index] = {
                      ...variable,
                      format: event.target.value,
                    };
                    onChange({ ...config, templateVariables: updated });
                  }}
                  placeholder="Format (optional)"
                />
              )}
              <button
                type="button"
                className="settings__var-remove"
                onClick={() => {
                  const updated = (config.templateVariables || []).filter(
                    (_, candidateIndex) => candidateIndex !== index,
                  );
                  onChange({ ...config, templateVariables: updated });
                }}
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            className="settings__var-add"
            onClick={() =>
              onChange({
                ...config,
                templateVariables: [
                  ...(config.templateVariables || []),
                  { key: '', type: 'static' as const, value: '' },
                ],
              })
            }
          >
            + Add Variable
          </button>
          {validationErrors.templateVars && (
            <span className="settings__field-error">
              {validationErrors.templateVars}
            </span>
          )}
          {validationWarnings.templateVarValues && (
            <span className="settings__field-warning">
              {validationWarnings.templateVarValues}
            </span>
          )}
        </div>
        <div className="settings__var-ref">
          <strong>Built-in (always available):</strong>
          <ul>
            <li>
              <code>{'{{date}}'}</code> Full date · <code>{'{{time}}'}</code>{' '}
              Current time · <code>{'{{datetime}}'}</code> Combined
            </li>
            <li>
              <code>{'{{iso_date}}'}</code> ISO · <code>{'{{year}}'}</code>{' '}
              <code>{'{{month}}'}</code> <code>{'{{day}}'}</code>{' '}
              <code>{'{{weekday}}'}</code>
            </li>
          </ul>
        </div>
      </div>
    </SettingsSection>
  );
}
