import { useAgentsQuery } from '@stallion-ai/sdk';
import { SplitPaneLayout } from '../components/SplitPaneLayout';
import {
  type AgentData,
} from '../contexts/AgentsContext';
import type { NavigationView } from '../types';
import {
  AgentsViewEditorPane,
} from './agent-editor/AgentsViewEditorPane';
import { useAgentsViewModel } from './agent-editor/useAgentsViewModel';
import './editor-layout.css';
import './page-layout.css';

interface AgentsViewProps {
  agents: AgentData[];
  availableModels: Array<{ id: string; name: string }>;
  defaultModel?: string;
  bedrockReady: boolean;
  onNavigate: (view: NavigationView) => void;
}

export function AgentsView({
  agents,
  bedrockReady: _bedrockReady,
  onNavigate,
}: AgentsViewProps) {
  const { isLoading: agentsLoading } = useAgentsQuery();
  const {
    DiscardModal,
    acpAgents,
    appConfig,
    availablePrompts,
    availableSkills,
    availableTools,
    dirty,
    editorId,
    emptyContent,
    enrich,
    error,
    form,
    handleDelete,
    handleDeselect,
    handleSave,
    handleSelect,
    integrationTools,
    isAcp,
    isCreating,
    isEnriching,
    isLoading,
    isLocked,
    isPlugin,
    isSaving,
    listItems,
    locked,
    notFound,
    search,
    selectedAcpConnection,
    selectedAgent,
    selectedSlug,
    setForm,
    setIsLocked,
    setSearch,
    setSavedForm,
    setTemplatePicked,
    templatePicked,
    templates,
    validationErrors,
  } = useAgentsViewModel({ agents, onNavigate });

  return (
    <div className="page page--full">
      <SplitPaneLayout
        label="agents"
        title="Agents"
        subtitle="AI agents with custom prompts, models, and tools"
        items={listItems}
        loading={agentsLoading}
        selectedId={editorId}
        onSelect={handleSelect}
        onDeselect={handleDeselect}
        onSearch={setSearch}
        searchPlaceholder="Search agents..."
        onAdd={handleNew}
        addLabel="+ New Agent"
        emptyIcon="⬡"
        emptyTitle="No agent selected"
        emptyDescription="Select an agent to edit, or create a new one"
        emptyContent={emptyContent}
      >
        <AgentsViewEditorPane
          selectedAcpConnection={selectedAcpConnection}
          acpAgents={acpAgents}
          isLoading={isLoading}
          notFound={notFound}
          error={error}
          isCreating={isCreating}
          templatePicked={templatePicked}
          agentsCount={agents.length}
          selectedSlug={selectedSlug}
          selectedAgent={selectedAgent}
          isAcp={isAcp}
          isPlugin={isPlugin}
          locked={locked}
          isLocked={isLocked}
          dirty={dirty}
          isSaving={isSaving}
          validationErrors={validationErrors}
          availableTools={availableTools}
          availableSkills={availableSkills}
          availablePrompts={availablePrompts}
          integrationTools={integrationTools}
          appConfig={appConfig}
          enrich={enrich}
          isEnriching={isEnriching}
          onNavigate={onNavigate}
          onDeselect={handleDeselect}
          onDelete={handleDelete}
          onSave={handleSave}
          onUnlockPlugin={() => setIsLocked(false)}
          form={form}
          setForm={setForm}
          templates={templates}
          onPickTemplate={(templateForm) => {
            setForm((current) => ({ ...current, ...templateForm }));
            setSavedForm((current) => ({ ...current, ...templateForm }));
            setTemplatePicked(true);
          }}
          onStartBlank={() => setTemplatePicked(true)}
        />
      </SplitPaneLayout>

      <DiscardModal />
    </div>
  );
}
