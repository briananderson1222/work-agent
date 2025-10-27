import { useState, useEffect } from 'react';
import { ConfirmModal } from '../components/ConfirmModal';
import type { WorkflowFile } from '../types';

export interface WorkflowManagementViewProps {
  apiBase: string;
  agentSlug: string;
  agentName: string;
  onBack: () => void;
}

type ViewMode = 'list' | 'edit' | 'create';

const WORKFLOW_TEMPLATE = `import { defineWorkflow } from '@voltagent/core';

export default defineWorkflow({
  name: 'My Workflow',
  description: 'Description of what this workflow does',

  async execute({ input, context }) {
    // Workflow implementation
    return {
      success: true,
      result: 'Workflow completed'
    };
  }
});
`;

export function WorkflowManagementView({
  apiBase,
  agentSlug,
  agentName,
  onBack,
}: WorkflowManagementViewProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [workflows, setWorkflows] = useState<WorkflowFile[]>([]);
  const [currentWorkflow, setCurrentWorkflow] = useState<WorkflowFile | null>(null);
  const [editorContent, setEditorContent] = useState('');
  const [newWorkflowName, setNewWorkflowName] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workflowToDelete, setWorkflowToDelete] = useState<string | null>(null);

  useEffect(() => {
    loadWorkflows();
  }, [agentSlug]);

  const loadWorkflows = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await fetch(`${apiBase}/agents/${agentSlug}/workflows/files`);
      if (!response.ok) throw new Error('Failed to load workflows');
      const data = await response.json();
      setWorkflows(data.data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const loadWorkflowContent = async (workflowId: string) => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await fetch(`${apiBase}/agents/${agentSlug}/workflows/${workflowId}`);
      if (!response.ok) throw new Error('Failed to load workflow content');
      const data = await response.json();
      const workflow = data.data;
      setCurrentWorkflow(workflow);
      setEditorContent(workflow.content || '');
      setViewMode('edit');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const saveWorkflow = async () => {
    if (viewMode === 'create' && !newWorkflowName.trim()) {
      setError('Workflow name is required');
      return;
    }

    try {
      setIsSaving(true);
      setError(null);

      if (viewMode === 'create') {
        const response = await fetch(`${apiBase}/agents/${agentSlug}/workflows`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: newWorkflowName, content: editorContent }),
        });
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to create workflow');
        }
      } else if (viewMode === 'edit' && currentWorkflow) {
        const response = await fetch(
          `${apiBase}/agents/${agentSlug}/workflows/${currentWorkflow.id}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: editorContent }),
          }
        );
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to update workflow');
        }
      }

      await loadWorkflows();
      setViewMode('list');
      setCurrentWorkflow(null);
      setEditorContent('');
      setNewWorkflowName('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const deleteWorkflow = async (workflowId: string) => {
    try {
      setIsSaving(true);
      setError(null);
      setWorkflowToDelete(null);
      const response = await fetch(`${apiBase}/agents/${agentSlug}/workflows/${workflowId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete workflow');
      }
      await loadWorkflows();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const startCreate = () => {
    setViewMode('create');
    setEditorContent(WORKFLOW_TEMPLATE);
    setNewWorkflowName('');
  };

  const cancelEdit = () => {
    setViewMode('list');
    setCurrentWorkflow(null);
    setEditorContent('');
    setNewWorkflowName('');
  };

  const formatDate = (isoString: string) => {
    const date = new Date(isoString);
    if (Number.isNaN(date.valueOf())) return 'Unknown';
    return date.toLocaleString();
  };

  if (isLoading && viewMode === 'list') {
    return (
      <div className="management-view">
        <div className="management-view__header">
          <button type="button" className="button button--secondary" onClick={onBack}>
            Back
          </button>
          <h2>Manage Workflows: {agentName}</h2>
        </div>
        <div className="management-view__loading">Loading workflows...</div>
      </div>
    );
  }

  return (
    <>
      <div className="management-view">
        <div className="management-view__header">
          <button type="button" className="button button--secondary" onClick={viewMode === 'list' ? onBack : cancelEdit}>
            {viewMode === 'list' ? 'Back' : 'Cancel'}
          </button>
          <h2>
            {viewMode === 'list'
              ? `Manage Workflows: ${agentName}`
              : viewMode === 'create'
                ? 'New Workflow'
                : `Edit: ${currentWorkflow?.name}`}
          </h2>
          {viewMode === 'list' && (
            <button type="button" className="button button--primary" onClick={startCreate}>
              New Workflow
            </button>
          )}
          {(viewMode === 'edit' || viewMode === 'create') && (
            <button
              type="button"
              className="button button--primary"
              onClick={saveWorkflow}
              disabled={isSaving}
            >
              {isSaving ? 'Saving...' : 'Save'}
            </button>
          )}
        </div>

        {error && <div className="management-view__error">{error}</div>}

        {viewMode === 'list' ? (
          <div className="workflow-list">
            {workflows.length === 0 ? (
              <div className="empty-state">
                <h3>No workflows yet</h3>
                <p>Create your first workflow to get started.</p>
                <button type="button" className="button button--primary" onClick={startCreate}>
                  New Workflow
                </button>
              </div>
            ) : (
              <div className="workflow-grid">
                {workflows.map((workflow) => (
                  <div key={workflow.id} className="workflow-card">
                    <div className="workflow-card__header">
                      <h3>{workflow.name}</h3>
                      <span className="workflow-badge">{workflow.extension}</span>
                    </div>
                    <div className="workflow-card__meta">
                      <span>Modified: {formatDate(workflow.lastModified)}</span>
                    </div>
                    <div className="workflow-card__actions">
                      <button
                        type="button"
                        className="button button--secondary button--small"
                        onClick={() => loadWorkflowContent(workflow.id)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="button button--danger button--small"
                        onClick={() => setWorkflowToDelete(workflow.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="workflow-editor">
            {viewMode === 'create' && (
              <div className="form-group">
                <label htmlFor="workflowName">Workflow Name</label>
                <input
                  id="workflowName"
                  type="text"
                  value={newWorkflowName}
                  onChange={(e) => setNewWorkflowName(e.target.value)}
                  placeholder="my-workflow.ts"
                />
                <span className="form-help">
                  Include extension (.ts or .js). Use lowercase with hyphens.
                </span>
              </div>
            )}
            <div className="code-editor">
              <textarea
                value={editorContent}
                onChange={(e) => setEditorContent(e.target.value)}
                placeholder="Write your workflow code here..."
                spellCheck={false}
              />
            </div>
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={!!workflowToDelete}
        title="Delete Workflow"
        message={`Are you sure you want to delete "${workflows.find((w) => w.id === workflowToDelete)?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onConfirm={() => workflowToDelete && deleteWorkflow(workflowToDelete)}
        onCancel={() => setWorkflowToDelete(null)}
      />
    </>
  );
}
