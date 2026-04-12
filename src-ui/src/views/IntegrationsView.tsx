import {
  type IntegrationViewModel,
  useDeleteIntegrationMutation,
  useIntegrationQuery,
  useIntegrationsQuery,
  useReconnectIntegrationMutation,
  useSaveIntegrationMutation,
} from '@stallion-ai/sdk';
import { useEffect, useMemo, useState } from 'react';
import { SplitPaneLayout } from '../components/SplitPaneLayout';
import { useUrlSelection } from '../hooks/useUrlSelection';
import { DeleteIntegrationModal } from './integrations/DeleteIntegrationModal';
import { IntegrationEditorPanel } from './integrations/IntegrationEditorPanel';
import { RegistryModal } from './integrations/RegistryModal';
import {
  filterIntegrationItems,
  formToMcpJson,
  parseMcpJson,
} from './integrations/utils';
import './PluginManagementView.css';
import './IntegrationsView.css';
import './page-layout.css';
import './editor-layout.css';

type IntegrationDef = IntegrationViewModel;

/* ── Integrations View ── */
export function IntegrationsView() {
  const { data: integrations = [], isLoading } = useIntegrationsQuery();
  const [showRegistry, setShowRegistry] = useState(false);
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const { selectedId, select, deselect } =
    useUrlSelection('/connections/tools');
  const [editForm, setEditForm] = useState<IntegrationDef | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [isLocked, setIsLocked] = useState(true);
  const [viewMode, setViewMode] = useState<'form' | 'raw'>('form');
  const [rawJson, setRawJson] = useState('');
  const [rawError, setRawError] = useState<string | null>(null);

  // Load full detail when selected
  const { data: detailData } = useIntegrationQuery(selectedId ?? undefined, {
    enabled: !!selectedId && selectedId !== 'new',
  });

  useEffect(() => {
    if (detailData) setEditForm(detailData);
  }, [detailData]);

  const saveMutation = useSaveIntegrationMutation({
    onSuccess: (_, variables) => {
      setMessage({ type: 'success', text: 'Saved' });
      if (variables.isNew) select(variables.id);
    },
    onError: (error) => setMessage({ type: 'error', text: error.message }),
  });

  const deleteMutation = useDeleteIntegrationMutation({
    onSuccess: () => {
      deselect();
      setEditForm(null);
    },
    onError: (error) => setMessage({ type: 'error', text: error.message }),
  });

  const reconnectMutation = useReconnectIntegrationMutation({
    onSuccess: () => {
      setMessage({ type: 'success', text: 'Reconnecting…' });
    },
    onError: (error) => setMessage({ type: 'error', text: error.message }),
  });

  const handleNew = () => {
    setEditForm({
      id: '',
      kind: 'mcp',
      transport: 'stdio',
      command: '',
      args: [],
      env: {},
      displayName: '',
      description: '',
    });
    setViewMode('form');
    setRawJson('');
    setRawError(null);
    select('new');
  };

  const switchToRaw = () => {
    if (editForm) setRawJson(formToMcpJson(editForm));
    setRawError(null);
    setViewMode('raw');
  };

  const switchToForm = () => {
    if (rawJson.trim()) {
      const { form, error } = parseMcpJson(rawJson, editForm);
      setRawError(error);
      if (form) setEditForm(form);
      else return;
    }
    setViewMode('form');
  };

  const items = useMemo(
    () => filterIntegrationItems(integrations, search),
    [integrations, search],
  );

  const isNew = selectedId === 'new';
  const locked = !!(editForm?.plugin && isLocked && !isNew);

  return (
    <>
      <SplitPaneLayout
        label="connections / tools"
        title="Tool Servers"
        subtitle="MCP server connections"
        items={items}
        loading={isLoading}
        selectedId={selectedId}
        onSelect={(id) => {
          select(id);
          setMessage(null);
          setIsLocked(true);
        }}
        onDeselect={() => {
          deselect();
          setEditForm(null);
        }}
        onSearch={setSearch}
        searchPlaceholder="Search tool servers..."
        onAdd={handleNew}
        addLabel="+ Add Tool Server"
        sidebarActions={
          <button
            className="split-pane__add-btn split-pane__add-btn--secondary"
            onClick={() => setShowRegistry(true)}
          >
            Browse Registry
          </button>
        }
        emptyIcon="⚙"
        emptyTitle="No integration selected"
        emptyDescription="Select an integration to edit, or add a new one"
        emptyContent={
          <div className="split-pane__empty">
            <div className="split-pane__empty-icon">⚙</div>
            <p className="split-pane__empty-title">No integration selected</p>
            <p className="split-pane__empty-desc">
              Select an integration to edit, or add a new one
            </p>
          </div>
        }
      >
        {editForm && (
          <IntegrationEditorPanel
            editForm={editForm}
            isNew={isNew}
            locked={locked}
            message={message}
            viewMode={viewMode}
            rawJson={rawJson}
            rawError={rawError}
            savePending={saveMutation.isPending}
            reconnectPending={reconnectMutation.isPending}
            onReconnect={() => reconnectMutation.mutate(editForm.id)}
            onDelete={() => setDeleteConfirm(true)}
            onSave={() =>
              saveMutation.mutate({
                ...editForm,
                isNew: selectedId === 'new',
              })
            }
            onSwitchToForm={switchToForm}
            onSwitchToRaw={switchToRaw}
            onRawJsonChange={(value) => {
              setRawJson(value);
              setRawError(null);
            }}
            onUpdate={(updater) =>
              setEditForm((form) => (form ? updater(form) : form))
            }
            onUnlock={() => setIsLocked(false)}
          />
        )}
      </SplitPaneLayout>

      {showRegistry && <RegistryModal onClose={() => setShowRegistry(false)} />}

      {deleteConfirm && (
        <DeleteIntegrationModal
          integrationName={editForm?.displayName || selectedId || 'integration'}
          onCancel={() => setDeleteConfirm(false)}
          onConfirm={() => {
            setDeleteConfirm(false);
            if (selectedId) deleteMutation.mutate(selectedId);
          }}
        />
      )}
    </>
  );
}
