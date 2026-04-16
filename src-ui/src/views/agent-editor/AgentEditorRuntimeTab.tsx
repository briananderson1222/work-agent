import type {
  ConnectionConfig,
  RuntimeConnectionView,
} from '@stallion-ai/contracts/tool';
import {
  useModelConnectionsQuery,
  useRuntimeConnectionsQuery,
} from '@stallion-ai/sdk';
import { Checkbox } from '../../components/Checkbox';
import {
  connectionStatusLabel,
  defaultManagedRuntimeConnection,
  isManagedRuntimeConnectionId,
  preferredConnectedRuntime,
  runtimeCatalogSourceLabel,
} from '../../utils/execution';
import type { AgentEditorFormProps } from './types';

export function AgentEditorRuntimeTab({
  form,
  setForm,
  locked,
  onNavigate,
}: Pick<AgentEditorFormProps, 'form' | 'setForm' | 'locked' | 'onNavigate'>) {
  const { data: runtimeConnections = [] } = useRuntimeConnectionsQuery() as {
    data?: RuntimeConnectionView[];
  };
  const { data: modelConnections = [] } = useModelConnectionsQuery() as {
    data?: ConnectionConfig[];
  };

  const availableRuntimeConnections = runtimeConnections.filter(
    (connection) =>
      connection.enabled &&
      connection.type !== 'acp' &&
      connection.capabilities.includes('agent-runtime'),
  );
  const preferredConnected = preferredConnectedRuntime(
    availableRuntimeConnections,
  );
  const managedRuntime = defaultManagedRuntimeConnection(
    availableRuntimeConnections,
  );
  const selectedRuntimeId =
    form.execution.runtimeConnectionId ||
    preferredConnected?.id ||
    managedRuntime?.id ||
    availableRuntimeConnections[0]?.id ||
    '';
  const selectedRuntime = availableRuntimeConnections.find(
    (connection) => connection.id === selectedRuntimeId,
  );
  const needsModelConnection = isManagedRuntimeConnectionId(
    selectedRuntimeId,
    availableRuntimeConnections,
  );
  const readyModelConnections = modelConnections.filter(
    (connection) =>
      connection.enabled && connection.capabilities.includes('llm'),
  );

  return (
    <div className="agent-editor__section">
      <div className="agent-editor__section-header">
        <h4 className="agent-editor__section-title">Execution</h4>
        <p className="agent-editor__section-desc">
          Which AI engine powers this agent and how it runs. To inspect or test
          a runtime, visit{' '}
          <button
            type="button"
            className="editor-link"
            onClick={() => onNavigate({ type: 'connections' })}
          >
            Connections
          </button>
          .
        </p>
      </div>

      <div className="editor-field">
        <label className="editor-label" htmlFor="ae-runtime-connection">
          Runtime Connection
        </label>
        <select
          id="ae-runtime-connection"
          className="editor-input"
          value={selectedRuntimeId}
          disabled={locked}
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              execution: {
                runtimeConnectionId: event.target.value,
                modelConnectionId: isManagedRuntimeConnectionId(
                  event.target.value,
                  availableRuntimeConnections,
                )
                  ? current.execution.modelConnectionId
                  : '',
                runtimeOptions:
                  event.target.value === current.execution.runtimeConnectionId
                    ? current.execution.runtimeOptions
                    : {},
              },
            }))
          }
        >
          {availableRuntimeConnections.map((connection) => (
            <option key={connection.id} value={connection.id}>
              {connection.name}
            </option>
          ))}
        </select>
        <span className="editor-hint">
          {selectedRuntime?.description ||
            (selectedRuntimeId === 'claude-runtime'
              ? 'Runs via the Claude Agent SDK. Requires ANTHROPIC_API_KEY.'
              : selectedRuntimeId === 'codex-runtime'
                ? 'Runs via the Codex CLI. Requires Codex installed and OPENAI_API_KEY.'
                : 'Runs via Stallion\u2019s built-in managed runtime using the selected model connection (Bedrock, OpenAI-compatible, or Ollama).')}
        </span>
        {selectedRuntime && (
          <div className="agent-runtime-card__meta">
            <span
              className={`agent-runtime-card__badge agent-runtime-card__badge--${selectedRuntime.status === 'ready' ? 'ok' : 'warn'}`}
            >
              {connectionStatusLabel(selectedRuntime.status)}
            </span>
            <span
              className={`agent-runtime-card__badge agent-runtime-card__badge--${selectedRuntime.runtimeCatalog?.source === 'live' ? 'ok' : 'muted'}`}
            >
              Catalog:{' '}
              {runtimeCatalogSourceLabel(
                selectedRuntime.runtimeCatalog?.source ?? 'none',
              )}
            </span>
            {selectedRuntime.runtimeCatalog?.reason && (
              <span className="editor-hint">
                {selectedRuntime.runtimeCatalog.reason}
              </span>
            )}
          </div>
        )}
      </div>

      {needsModelConnection && (
        <div className="editor-field">
          <label className="editor-label" htmlFor="ae-model-connection">
            Model Connection
          </label>
          <select
            id="ae-model-connection"
            className="editor-input"
            value={form.execution.modelConnectionId}
            disabled={locked}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                execution: {
                  ...current.execution,
                  modelConnectionId: event.target.value,
                },
              }))
            }
          >
            <option value="">Use app default</option>
            {readyModelConnections.map((connection) => (
              <option key={connection.id} value={connection.id}>
                {connection.name}
              </option>
            ))}
          </select>
          <span className="editor-hint">
            Which model connection to use for the managed runtime. Leave blank
            to use the app default.
          </span>
        </div>
      )}

      <div className="editor-field">
        <label className="editor-label" htmlFor="ae-model-id">
          Model ID
        </label>
        <input
          id="ae-model-id"
          type="text"
          className="editor-input"
          name="modelId"
          value={form.modelId}
          onChange={(event) =>
            setForm((current) => ({ ...current, modelId: event.target.value }))
          }
          placeholder={
            selectedRuntimeId === 'claude-runtime'
              ? 'e.g. claude-opus-4-6'
              : selectedRuntimeId === 'codex-runtime'
                ? 'e.g. codex-mini'
                : isManagedRuntimeConnectionId(selectedRuntimeId)
                  ? 'e.g. us.anthropic.claude-sonnet-4-20250514-v1:0 or gpt-4.1'
                  : 'Model ID (leave blank for runtime default)'
          }
          disabled={locked}
        />
        <span className="editor-hint">
          Leave blank to use the runtime&apos;s default model.
        </span>
      </div>

      {selectedRuntimeId === 'claude-runtime' && (
        <>
          <div className="editor-field">
            <label className="editor-label">Extended Thinking</label>
            <label className="editor-label editor-label--inline">
              <Checkbox
                checked={form.execution.runtimeOptions.thinking !== false}
                onChange={(checked) =>
                  setForm((current) => ({
                    ...current,
                    execution: {
                      ...current.execution,
                      runtimeOptions: {
                        ...current.execution.runtimeOptions,
                        thinking: checked,
                      },
                    },
                  }))
                }
                disabled={locked}
              />
              Enable by default
            </label>
            <span className="editor-hint">
              Allows the model to reason step-by-step before responding.
            </span>
          </div>
          <div className="editor-field">
            <label className="editor-label" htmlFor="ae-claude-effort">
              Thinking Budget
            </label>
            <select
              id="ae-claude-effort"
              className="editor-input"
              value={String(form.execution.runtimeOptions.effort || 'medium')}
              disabled={locked}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  execution: {
                    ...current.execution,
                    runtimeOptions: {
                      ...current.execution.runtimeOptions,
                      effort: event.target.value,
                    },
                  },
                }))
              }
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="max">Maximum</option>
            </select>
            <span className="editor-hint">
              Controls how much reasoning the model does. Higher = more
              thorough, slower, costlier.
            </span>
          </div>
        </>
      )}

      {selectedRuntimeId === 'codex-runtime' && (
        <>
          <div className="editor-field">
            <label className="editor-label" htmlFor="ae-codex-effort">
              Reasoning Effort
            </label>
            <select
              id="ae-codex-effort"
              className="editor-input"
              value={String(
                form.execution.runtimeOptions.reasoningEffort || 'medium',
              )}
              disabled={locked}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  execution: {
                    ...current.execution,
                    runtimeOptions: {
                      ...current.execution.runtimeOptions,
                      reasoningEffort: event.target.value,
                    },
                  },
                }))
              }
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="xhigh">Highest</option>
            </select>
            <span className="editor-hint">
              How deeply Codex reasons before responding.
            </span>
          </div>
          <div className="editor-field">
            <label className="editor-label">Fast Mode</label>
            <label className="editor-label editor-label--inline">
              <Checkbox
                checked={form.execution.runtimeOptions.fastMode === true}
                onChange={(checked) =>
                  setForm((current) => ({
                    ...current,
                    execution: {
                      ...current.execution,
                      runtimeOptions: {
                        ...current.execution.runtimeOptions,
                        fastMode: checked,
                      },
                    },
                  }))
                }
                disabled={locked}
              />
              Enable fast mode
            </label>
            <span className="editor-hint">
              Trades reasoning depth for faster responses.
            </span>
          </div>
        </>
      )}
    </div>
  );
}
