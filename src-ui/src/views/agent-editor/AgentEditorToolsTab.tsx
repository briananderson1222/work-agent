import type { Dispatch, SetStateAction } from 'react';
import { Checkbox } from '../../components/Checkbox';
import type { AgentEditorFormProps } from './types';
import {
  getIntegrationToolKey,
  removeIntegration,
  toggleIntegrationAutoApprove,
  toggleIntegrationToolAutoApprove,
  toggleIntegrationToolEnabled,
} from './utils';

export function AgentEditorToolsTab({
  form,
  setForm,
  locked,
  availableTools,
  integrationTools,
  expandedIntegrations,
  setExpandedIntegrations,
  onNavigate,
  onOpenAddModal,
}: Pick<
  AgentEditorFormProps,
  | 'form'
  | 'setForm'
  | 'locked'
  | 'availableTools'
  | 'integrationTools'
  | 'onNavigate'
  | 'onOpenAddModal'
> & {
  expandedIntegrations: Record<string, boolean>;
  setExpandedIntegrations: Dispatch<SetStateAction<Record<string, boolean>>>;
}) {
  const enabledServers = new Set(form.tools.mcpServers);
  const enabledIntegrations = availableTools.filter((tool) =>
    enabledServers.has(tool.id),
  );

  return (
    <div className="agent-editor__section">
      <div className="editor-field">
        <div className="editor-label-row">
          <label className="editor-label">Integrations</label>
          <span className="editor-label-row__actions">
            <button
              type="button"
              className="editor-enrich-btn"
              onClick={() => onNavigate({ type: 'connections-tools' })}
            >
              Manage →
            </button>
            {!locked && (
              <button
                type="button"
                className="editor-enrich-btn"
                onClick={() => onOpenAddModal('integrations')}
              >
                + Add
              </button>
            )}
          </span>
        </div>
        {enabledIntegrations.length === 0 ? (
          <div className="editor__tools-empty">
            No integrations enabled.{' '}
            {!locked && (
              <button
                type="button"
                className="editor__tools-link"
                onClick={() => onOpenAddModal('integrations')}
              >
                Add integrations
              </button>
            )}
          </div>
        ) : (
          <div className="editor__tools-grouped">
            {enabledIntegrations.map((integration) => {
              const isExpanded = expandedIntegrations[integration.id] || false;
              const tools = integrationTools[integration.id] || [];
              const prefix = `${integration.id}_`;
              const hasAutoApprove = form.tools.autoApprove.includes(
                `${prefix}*`,
              );
              const hasExplicitAvailable = form.tools.available.some((entry) =>
                entry.startsWith(prefix),
              );
              const allToolsActive =
                !hasExplicitAvailable ||
                form.tools.available.includes(`${prefix}*`);

              return (
                <div key={integration.id} className="editor__tools-server">
                  <div
                    className={`editor__tools-server-header${tools.length > 0 ? ' editor__tools-server-header--clickable' : ''}`}
                    onClick={() =>
                      tools.length > 0 &&
                      setExpandedIntegrations((current) => ({
                        ...current,
                        [integration.id]: !current[integration.id],
                      }))
                    }
                  >
                    <span
                      onClick={(event) => event.stopPropagation()}
                      style={{ display: 'contents' }}
                    >
                      <Checkbox
                        checked={true}
                        onChange={() => {
                          if (locked) {
                            return;
                          }
                          setForm((current) =>
                            removeIntegration(current, integration.id),
                          );
                        }}
                        disabled={locked}
                      />
                    </span>
                    <span className="editor__tools-server-name">
                      {integration.displayName || integration.id}
                    </span>
                    <button
                      className={`editor__tool-badge editor__tool-badge--btn${hasAutoApprove ? ' editor__tool-badge--auto' : ' editor__tool-badge--add'}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        if (locked) {
                          return;
                        }
                        setForm((current) =>
                          toggleIntegrationAutoApprove(current, integration.id),
                        );
                      }}
                    >
                      {hasAutoApprove ? '✓ auto-approve' : '+ auto-approve'}
                    </button>
                    {tools.length > 0 && (
                      <span
                        className={`agent-editor__chevron${isExpanded ? ' agent-editor__chevron--open' : ''}`}
                      >
                        ›
                      </span>
                    )}
                  </div>
                  {isExpanded && tools.length > 0 && (
                    <div className="editor__tools-list">
                      {tools.map((tool) => {
                        const toolKey = getIntegrationToolKey(
                          integration.id,
                          tool,
                        );
                        const toolEnabled =
                          allToolsActive ||
                          form.tools.available.includes(toolKey);
                        const toolAutoApprove =
                          toolEnabled &&
                          (form.tools.autoApprove.includes(`${prefix}*`) ||
                            form.tools.autoApprove.includes(toolKey));

                        return (
                          <div
                            key={tool.id}
                            className={`editor__tool-item${toolEnabled ? ' editor__tool-item--active' : ''}`}
                          >
                            <Checkbox
                              checked={toolEnabled}
                              disabled={locked}
                              onChange={() => {
                                if (locked) {
                                  return;
                                }
                                setForm((current) =>
                                  toggleIntegrationToolEnabled(
                                    current,
                                    integration.id,
                                    toolKey,
                                    tools,
                                  ),
                                );
                              }}
                            />
                            <div className="editor__tool-info">
                              <div className="editor__tool-name">
                                {tool.toolName || tool.name}
                              </div>
                              {tool.description && (
                                <div className="editor__tool-desc">
                                  {tool.description}
                                </div>
                              )}
                            </div>
                            {toolEnabled ? (
                              <button
                                className={`editor__tool-badge editor__tool-badge--btn${toolAutoApprove ? ' editor__tool-badge--auto' : ' editor__tool-badge--add'}`}
                                onClick={() => {
                                  if (locked) {
                                    return;
                                  }
                                  setForm((current) =>
                                    toggleIntegrationToolAutoApprove(
                                      current,
                                      integration.id,
                                      toolKey,
                                      tools,
                                    ),
                                  );
                                }}
                              >
                                {toolAutoApprove ? '✓ auto' : '+ auto'}
                              </button>
                            ) : (
                              <span className="editor__tool-badge editor__tool-badge--disabled">
                                auto
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
