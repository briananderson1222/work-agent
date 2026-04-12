import { useState } from 'react';
import { AgentEditorAdvancedSection } from './agent-editor/AgentEditorAdvancedSection';
import { AgentEditorBasicTab } from './agent-editor/AgentEditorBasicTab';
import { AgentEditorRuntimeTab } from './agent-editor/AgentEditorRuntimeTab';
import { AgentEditorSkillsTab } from './agent-editor/AgentEditorSkillsTab';
import { AgentEditorToolsTab } from './agent-editor/AgentEditorToolsTab';
import type { AgentEditorFormProps } from './agent-editor/types';
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
  } = props;

  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [expandedIntegrations, setExpandedIntegrations] = useState<
    Record<string, boolean>
  >({});

  const agentType = getAgentType(form.execution.runtimeConnectionId);
  const tabs = getEditorTabs(agentType);
  const [activeTab, setActiveTab] = useState(tabs[0].key);

  return (
    <>
      <div className="page-layout__tabs">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`page-layout__tab${activeTab === tab.key ? ' page-layout__tab--active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'basic' && (
        <AgentEditorBasicTab {...props} agentType={agentType} />
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
