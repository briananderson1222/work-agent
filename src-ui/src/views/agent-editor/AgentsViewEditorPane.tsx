import type { AgentTemplate } from '@stallion-ai/sdk';
import { useState, type Dispatch, type SetStateAction } from 'react';
import { ACPConnectionsSection } from '../../components/ACPConnectionsSection';
import { ConfirmModal } from '../../components/ConfirmModal';
import { DetailHeader } from '../../components/DetailHeader';
import { AgentIcon } from '../../components/AgentIcon';
import type { AgentData } from '../../contexts/AgentsContext';
import { AgentAddModal } from '../AgentAddModal';
import { AgentEditorForm, type AgentFormData } from '../AgentEditorForm';
import type { NavigationView } from '../../types';
import type { AgentSummary, Tool } from '../../types';

interface AgentsViewEditorPaneProps {
  selectedAcpConnection: string | null;
  acpAgents: AgentData[];
  isLoading: boolean;
  notFound: boolean;
  error: string | null;
  isCreating: boolean;
  templatePicked: boolean;
  agentsCount: number;
  selectedSlug: string | null;
  selectedAgent?: AgentData;
  isAcp: boolean;
  isPlugin: boolean;
  locked: boolean;
  isLocked: boolean;
  dirty: boolean;
  isSaving: boolean;
  validationErrors: Record<string, string>;
  availableTools: Tool[];
  availableSkills: any[];
  availablePrompts: any[];
  integrationTools: Record<string, Tool[]>;
  appConfig: any;
  enrich: (prompt: string) => Promise<string | null>;
  isEnriching: boolean;
  onNavigate: (view: NavigationView) => void;
  onDeselect: () => void;
  onDelete: () => void;
  onSave: () => void;
  onUnlockPlugin: () => void;
  form: AgentFormData;
  setForm: Dispatch<SetStateAction<AgentFormData>>;
  templates: AgentTemplate[];
  onPickTemplate: (templateForm?: Partial<AgentFormData>) => void;
  onStartBlank: () => void;
}

export function AgentsViewEditorPane({
  selectedAcpConnection,
  acpAgents,
  isLoading,
  notFound,
  error,
  isCreating,
  templatePicked,
  agentsCount,
  selectedSlug,
  selectedAgent,
  isAcp,
  isPlugin,
  locked,
  isLocked,
  dirty,
  isSaving,
  validationErrors,
  availableTools,
  availableSkills,
  availablePrompts,
  integrationTools,
  appConfig,
  enrich,
  isEnriching,
  onNavigate,
  onDeselect,
  onDelete,
  onSave,
  onUnlockPlugin,
  form,
  setForm,
  templates,
  onPickTemplate,
  onStartBlank,
}: AgentsViewEditorPaneProps) {
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [addModalType, setAddModalType] = useState<
    'integrations' | 'skills' | 'prompts' | null
  >(null);

  return (
    <>
      {selectedAcpConnection ? (
        <div className="agent-editor__acp-section">
          <ACPConnectionsSection
            acpAgents={acpAgents as unknown as AgentSummary[]}
          />
        </div>
      ) : isLoading ? (
        <div className="editor__loading">Loading agent...</div>
      ) : notFound ? (
        <div className="split-pane__empty">
          <div className="split-pane__empty-icon">⬡</div>
          <p className="split-pane__empty-title">Agent not found</p>
          <p className="split-pane__empty-desc">
            The agent "{selectedSlug}" doesn't exist or was deleted.
          </p>
          <button
            type="button"
            className="editor-btn editor-btn--primary"
            onClick={onDeselect}
          >
            Back to agents
          </button>
        </div>
      ) : (
        <div className="agent-inline-editor">
          <DetailHeader
            title={isCreating ? 'New Agent' : form.name || selectedSlug || ''}
            icon={
              !isCreating && selectedAgent ? (
                <AgentIcon
                  agent={selectedAgent as any}
                  size="medium"
                  className="editor-icon-preview"
                />
              ) : undefined
            }
            badge={
              isAcp
                ? { label: 'ACP', variant: 'muted' as const }
                : isPlugin
                  ? {
                      label: selectedSlug?.split(':')[0] || 'plugin',
                      variant: 'info' as const,
                    }
                  : undefined
            }
          >
            {!isCreating && selectedSlug && !isAcp && (
              <button
                type="button"
                className="editor-btn editor-btn--danger"
                onClick={() => setShowDeleteModal(true)}
                disabled={locked}
              >
                Delete
              </button>
            )}
            {!isAcp && (
              <button
                type="button"
                className="editor-btn editor-btn--primary agent-editor__save-btn"
                onClick={onSave}
                disabled={isSaving || locked}
              >
                {dirty && !isSaving && (
                  <span
                    className="agent-inline-editor__dirty-dot"
                    aria-label="Unsaved changes"
                  />
                )}
                {isSaving ? 'Saving…' : isCreating ? 'Create Agent' : 'Save Changes'}
              </button>
            )}
          </DetailHeader>

          {error && (
            <div className="management-view__error agent-editor__error-banner">
              {error}
            </div>
          )}

          {isPlugin && locked && (
            <div className="editor__lock-banner">
              <span>
                🔒 This agent is managed by a plugin. Edits will be overwritten on
                plugin updates.
              </span>
              <button
                type="button"
                className="editor__lock-btn"
                onClick={onUnlockPlugin}
              >
                Unlock
              </button>
            </div>
          )}

          {isAcp && (
            <div className="editor__lock-banner editor__lock-banner--info">
              <span>
                ℹ️ This agent is managed by ACP. Configuration is read-only.
              </span>
            </div>
          )}

          <div className="agent-inline-editor__body">
            {isCreating && !templatePicked && agentsCount > 0 ? (
              <div className="agent-editor__template-picker">
                <h3 className="agent-editor__template-title">
                  Start with a template
                </h3>
                <p className="agent-editor__template-desc">
                  Pick a starting point or start from scratch
                </p>
                <div className="template-grid">
                  {templates.map((t) => (
                    <button
                      key={t.id}
                      className="template-card"
                      onClick={() => onPickTemplate(t.form as Partial<AgentFormData>)}
                    >
                      <span className="template-card__icon">{t.icon}</span>
                      <span className="template-card__label">{t.label}</span>
                      <span className="template-card__desc">
                        {t.description}
                      </span>
                    </button>
                  ))}
                </div>
                <button className="template-blank" onClick={onStartBlank}>
                  Start Blank →
                </button>
              </div>
            ) : (
              <AgentEditorForm
                form={form}
                setForm={setForm}
                isCreating={isCreating}
                locked={locked}
                isPlugin={isPlugin}
                isLocked={isLocked}
                validationErrors={validationErrors}
                availableTools={availableTools}
                availableSkills={availableSkills}
                availablePrompts={availablePrompts}
                integrationTools={integrationTools}
                appConfig={appConfig}
                enrich={enrich}
                isEnriching={isEnriching}
                onNavigate={onNavigate}
                onOpenAddModal={(type) => setAddModalType(type)}
              />
            )}
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={showDeleteModal}
        title="Delete Agent"
        message={`Are you sure you want to delete "${form.name || selectedSlug}"? This cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={onDelete}
        onCancel={() => setShowDeleteModal(false)}
        variant="danger"
      />

      {addModalType && (
        <AgentAddModal
          type={addModalType}
          availableTools={availableTools}
          availableSkills={availableSkills}
          availablePrompts={availablePrompts}
          form={form}
          setForm={setForm}
          onClose={() => setAddModalType(null)}
        />
      )}
    </>
  );
}
