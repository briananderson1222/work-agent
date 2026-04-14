import type { ConnectionConfig } from '@stallion-ai/contracts/tool';
import { useRuntimeConnectionsQuery } from '@stallion-ai/sdk';
import { AgentIcon } from '../../components/AgentIcon';
import { ModelSelector } from '../../components/ModelSelector';
import {
  defaultManagedRuntimeConnection,
  isManagedRuntimeConnectionId,
  preferredConnectedRuntime,
} from '../../utils/execution';
import type { AgentEditorFormProps, AgentType } from './types';
import {
  buildDescriptionPrompt,
  buildSystemPromptPrompt,
  slugify,
} from './utils';

export function AgentEditorBasicTab({
  form,
  setForm,
  isCreating,
  locked,
  validationErrors,
  appConfig,
  enrich,
  isEnriching,
  agentType,
}: Pick<
  AgentEditorFormProps,
  | 'form'
  | 'setForm'
  | 'isCreating'
  | 'locked'
  | 'validationErrors'
  | 'appConfig'
  | 'enrich'
  | 'isEnriching'
> & {
  agentType: AgentType;
}) {
  const { data: runtimeConnections = [] } = useRuntimeConnectionsQuery();
  const preferredConnected = preferredConnectedRuntime(
    runtimeConnections as ConnectionConfig[],
  );
  const managedRuntime = defaultManagedRuntimeConnection(
    runtimeConnections as ConnectionConfig[],
  );

  return (
    <>
      <div className="agent-editor__section">
        {agentType !== 'acp' && (
          <div className="editor-field">
            <label className="editor-label" htmlFor="ae-agent-type">
              Agent Type
            </label>
            <select
              id="ae-agent-type"
              className="editor-input"
              value={agentType}
              disabled={locked}
              onChange={(event) => {
                const nextType = event.target.value as AgentType;
                setForm((current) => ({
                  ...current,
                  execution: {
                    ...current.execution,
                    runtimeConnectionId:
                      nextType === 'connected'
                        ? preferredConnected?.id ||
                          current.execution.runtimeConnectionId
                        : managedRuntime?.id || '',
                    modelConnectionId:
                      nextType === 'connected'
                        ? ''
                        : current.execution.modelConnectionId,
                    runtimeOptions:
                      nextType === 'connected' &&
                      isManagedRuntimeConnectionId(
                        current.execution.runtimeConnectionId,
                        runtimeConnections as ConnectionConfig[],
                      )
                        ? {}
                        : current.execution.runtimeOptions,
                  },
                }));
              }}
            >
              <option value="managed">Managed</option>
              <option value="connected" disabled={!preferredConnected}>
                Connected
              </option>
            </select>
            <span className="editor-hint">
              Managed agents use Stallion&apos;s built-in runtime and editor
              tabs. Connected agents run through Claude, Codex, or another
              runtime connection.
              {!preferredConnected &&
                ' Add a connected runtime in Connections before switching this agent.'}
            </span>
          </div>
        )}

        <div className="editor-field">
          <label className="editor-label" htmlFor="ae-name">
            Name <span className="editor-required">*</span>
          </label>
          <input
            id="ae-name"
            type="text"
            className="editor-input"
            name="name"
            value={form.name}
            onChange={(event) => {
              const name = event.target.value;
              setForm((current) => ({
                ...current,
                name,
                slug: isCreating ? slugify(name) : current.slug,
              }));
            }}
            placeholder="My Agent"
            disabled={locked}
          />
          {validationErrors.name && (
            <span className="editor-error">{validationErrors.name}</span>
          )}
        </div>

        <div className="editor-field">
          <label className="editor-label" htmlFor="ae-slug">
            Slug
          </label>
          <input
            id="ae-slug"
            type="text"
            className="editor-input"
            name="slug"
            value={form.slug}
            onChange={(event) =>
              isCreating &&
              setForm((current) => ({ ...current, slug: event.target.value }))
            }
            disabled={!isCreating}
            placeholder="my-agent"
          />
          {validationErrors.slug && (
            <span className="editor-error">{validationErrors.slug}</span>
          )}
          {!isCreating && (
            <span className="editor-label">
              <span className="editor-hint">
                Slug cannot be changed after creation
              </span>
            </span>
          )}
        </div>

        <div className="editor-field">
          <label className="editor-label">Icon</label>
          <div className="editor-icon-row">
            <AgentIcon
              agent={{ name: form.name || 'Agent', icon: form.icon }}
              size="large"
              className="editor-icon-preview"
            />
            <input
              type="text"
              className="editor-input"
              name="icon"
              value={form.icon}
              onChange={(event) =>
                setForm((current) => ({ ...current, icon: event.target.value }))
              }
              placeholder="Emoji (e.g. 🤖) or leave empty for initials"
              disabled={locked}
            />
          </div>
        </div>

        <div className="editor-field">
          <div className="editor-label-row">
            <label className="editor-label" htmlFor="ae-description">
              Description
            </label>
            <button
              type="button"
              className="editor-enrich-btn"
              disabled={isEnriching || !form.name || locked}
              aria-label="Generate description"
              onClick={async () => {
                const text = await enrich(buildDescriptionPrompt(form));
                if (text) {
                  setForm((current) => ({
                    ...current,
                    description: text.trim(),
                  }));
                }
              }}
            >
              {isEnriching ? '...' : '✨ Generate'}
            </button>
          </div>
          <input
            id="ae-description"
            type="text"
            className="editor-input"
            name="description"
            value={form.description}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                description: event.target.value,
              }))
            }
            placeholder="A helpful agent for..."
            disabled={locked}
          />
        </div>

        {agentType === 'managed' && (
          <div className="editor-field">
            <div className="editor-label-row">
              <label className="editor-label" htmlFor="ae-prompt">
                System Prompt <span className="editor-required">*</span>
              </label>
              <button
                type="button"
                className="editor-enrich-btn"
                disabled={isEnriching || !form.name || locked}
                aria-label="Generate system prompt"
                onClick={async () => {
                  const text = await enrich(buildSystemPromptPrompt(form));
                  if (text) {
                    setForm((current) => ({ ...current, prompt: text.trim() }));
                  }
                }}
              >
                {isEnriching ? '...' : '✨ Generate'}
              </button>
            </div>
            <textarea
              id="ae-prompt"
              className="editor-textarea editor-textarea--tall editor-textarea--mono"
              name="prompt"
              value={form.prompt}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  prompt: event.target.value,
                }))
              }
              placeholder="You are a helpful assistant..."
              disabled={locked}
            />
            {validationErrors.prompt && (
              <span className="editor-error">{validationErrors.prompt}</span>
            )}
          </div>
        )}
      </div>

      {agentType === 'managed' && (
        <div className="agent-editor__section">
          <div className="editor-field">
            <label className="editor-label">
              Model{' '}
              <span className="editor-hint">— leave empty to use default</span>
            </label>
            <div className={locked ? 'agent-editor__locked-field' : undefined}>
              <ModelSelector
                value={form.modelId}
                onChange={(modelId) =>
                  setForm((current) => ({ ...current, modelId }))
                }
                placeholder="Select a model..."
                defaultModel={appConfig?.defaultModel}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
