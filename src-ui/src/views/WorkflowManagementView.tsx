import { LoadingState } from '@stallion-ai/sdk';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '../components/Button';
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
  const qc = useQueryClient();
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [currentWorkflow, setCurrentWorkflow] = useState<WorkflowFile | null>(
    null,
  );
  const [editorContent, setEditorContent] = useState('');
  const [newWorkflowName, setNewWorkflowName] = useState('');
  const [_contentLoading, setContentLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workflowToDelete, setWorkflowToDelete] = useState<string | null>(null);

  const { data: workflows = [], isLoading } = useQuery<WorkflowFile[]>({
    queryKey: ['workflows', agentSlug],
    queryFn: async () => {
      const res = await fetch(`${apiBase}/agents/${agentSlug}/workflows/files`);
      if (!res.ok) throw new Error('Failed to load workflows');
      const data = await res.json();
      return data.data || [];
    },
  });

  const loadWorkflowContent = async (workflowId: string) => {
    try {
      setContentLoading(true);
      setError(null);
      const response = await fetch(
        `${apiBase}/agents/${agentSlug}/workflows/${workflowId}`,
      );
      if (!response.ok) throw new Error('Failed to load workflow content');
      const data = await response.json();
      const workflow = data.data;
      setCurrentWorkflow(workflow);
      setEditorContent(workflow.content || '');
      setViewMode('edit');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setContentLoading(false);
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
        const response = await fetch(
          `${apiBase}/agents/${agentSlug}/workflows`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              filename: newWorkflowName,
              content: editorContent,
            }),
          },
        );
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
          },
        );
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to update workflow');
        }
      }

      qc.invalidateQueries({ queryKey: ['workflows', agentSlug] });
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
      const response = await fetch(
        `${apiBase}/agents/${agentSlug}/workflows/${workflowId}`,
        {
          method: 'DELETE',
        },
      );
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete workflow');
      }
      qc.invalidateQueries({ queryKey: ['workflows', agentSlug] });
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
          <Button variant="secondary" onClick={onBack}>
            Back
          </Button>
          <h2>Manage Workflows: {agentName}</h2>
        </div>
        <LoadingState message="Loading workflows..." />
      </div>
    );
  }

  return (
    <>
      <div className="management-view">
        <div className="management-view__header">
          <Button
            variant="secondary"
            onClick={viewMode === 'list' ? onBack : cancelEdit}
          >
            {viewMode === 'list' ? 'Back' : 'Cancel'}
          </Button>
          <h2>
            {viewMode === 'list'
              ? `Manage Workflows: ${agentName}`
              : viewMode === 'create'
                ? 'New Workflow'
                : `Edit: ${currentWorkflow?.name}`}
          </h2>
          {viewMode === 'list' && (
            <Button variant="primary" onClick={startCreate}>
              New Workflow
            </Button>
          )}
          {(viewMode === 'edit' || viewMode === 'create') && (
            <Button
              variant="primary"
              onClick={saveWorkflow}
              disabled={isSaving}
            >
              {isSaving ? 'Saving...' : 'Save'}
            </Button>
          )}
        </div>

        {error && <div className="management-view__error">{error}</div>}

        {viewMode === 'list' ? (
          <div className="workflow-list">
            {workflows.length === 0 ? (
              <div className="empty-state">
                <h3>No workflows yet</h3>
                <p>Create your first workflow to get started.</p>
                <Button variant="primary" onClick={startCreate}>
                  New Workflow
                </Button>
              </div>
            ) : (
              <div className="workflow-grid">
                {workflows.map((workflow) => (
                  <div key={workflow.id} className="workflow-card">
                    <div className="workflow-card__header">
                      <h3>{workflow.name}</h3>
                      <span className="workflow-badge">
                        {workflow.extension}
                      </span>
                    </div>
                    <div className="workflow-card__meta">
                      <span>Modified: {formatDate(workflow.lastModified)}</span>
                    </div>
                    <div className="workflow-card__actions">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => loadWorkflowContent(workflow.id)}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => setWorkflowToDelete(workflow.id)}
                      >
                        Delete
                      </Button>
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
