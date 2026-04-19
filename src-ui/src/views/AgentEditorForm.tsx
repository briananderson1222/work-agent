import { useState } from 'react';
import { Tabs } from '../components/Tabs';
import { AgentEditorAdvancedSection } from './agent-editor/AgentEditorAdvancedSection';
import { AgentEditorBasicTab } from './agent-editor/AgentEditorBasicTab';
import { AgentEditorRuntimeTab } from './agent-editor/AgentEditorRuntimeTab';
import { AgentEditorSkillsTab } from './agent-editor/AgentEditorSkillsTab';
import { AgentEditorToolsTab } from './agent-editor/AgentEditorToolsTab';
import type {
  AgentEditorFormProps,
  AgentEditorTab,
} from './agent-editor/types';
import { getAgentType, getEditorTabs } from './agent-editor/utils';
import './editor-layout.css';

export type { AgentFormData } from './agent-editor/types';

export function AgentEditorForm(props: AgentEditorFormProps) {
  const {
    form,
    isPlugin,
    isLocked,
    availableTools,
    availableSkills,
    availablePrompts,
    integrationTools,
    onNavigate,
    onOpenAddModal,
    runtimeConnections = [],
  } = props;

  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [expandedIntegrations, setExpandedIntegrations] = useState<
    Record<string, boolean>
  >({});
  const agentType = getAgentType(
    form.execution.runtimeConnectionId,
    runtimeConnections,
  );
  const tabs = getEditorTabs(agentType);
  const [activeTab, setActiveTab] = useState<AgentEditorTab>(tabs[0].key);

  return (
    <>
      <Tabs
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={(key) => setActiveTab(key as AgentEditorTab)}
      />

      {activeTab === 'basic' && (
        <AgentEditorBasicTab
          {...props}
          agentType={agentType}
          onSwitchTab={(tab) => setActiveTab(tab)}
        />
      )}

      {activeTab === 'runtime' && <AgentEditorRuntimeTab {...props} />}

      {activeTab === 'connection' && (
        <div className="agent-editor__section">
          <p className="agent-editor__section-desc">
            This agent is connected via ACP. Configuration is managed by the
            external runtime.
          </p>
        </div>
      )}

      {activeTab === 'tools' && (
        <AgentEditorToolsTab
          form={form}
          setForm={props.setForm}
          locked={props.locked}
          availableTools={availableTools}
          integrationTools={integrationTools}
          expandedIntegrations={expandedIntegrations}
          setExpandedIntegrations={setExpandedIntegrations}
          onNavigate={onNavigate}
          onOpenAddModal={onOpenAddModal}
        />
      )}

      {activeTab === 'skills' && (
        <AgentEditorSkillsTab
          form={form}
          setForm={props.setForm}
          locked={props.locked}
          availableSkills={availableSkills}
          availablePrompts={availablePrompts}
          onNavigate={onNavigate}
          onOpenAddModal={onOpenAddModal}
        />
      )}

      {activeTab === 'commands' && (
        <div className="agent-editor__section">
          <p className="agent-editor__section-desc">
            Slash commands for this agent. Commands are defined in the
            agent&apos;s configuration.
          </p>
        </div>
      )}

      {activeTab === 'basic' && agentType === 'managed' && (
        <AgentEditorAdvancedSection
          form={form}
          setForm={props.setForm}
          appConfig={props.appConfig}
          isPlugin={isPlugin}
          isLocked={isLocked}
          advancedOpen={advancedOpen}
          setAdvancedOpen={setAdvancedOpen}
        />
      )}
    </>
  );
}
