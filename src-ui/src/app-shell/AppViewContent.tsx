import { NewProjectModal } from '../components/NewProjectModal';
import { NotificationsPage } from '../pages/NotificationsPage';
import { ProfilePage } from '../pages/ProfilePage';
import type { AgentSummary, NavigationView } from '../types';
import { AgentsView } from '../views/AgentsView';
import { ConnectionsHub } from '../views/ConnectionsHub';
import { IntegrationsView } from '../views/IntegrationsView';
import { KnowledgeConnectionView } from '../views/KnowledgeConnectionView';
import { MonitoringViewWithBoundary as MonitoringView } from '../views/MonitoringView';
import { PlaybooksView } from '../views/PlaybooksView';
import { PluginManagementView } from '../views/PluginManagementView';
import { ProjectPage } from '../views/ProjectPage';
import { ProjectSettingsView } from '../views/ProjectSettingsView';
import { ProviderSettingsView } from '../views/ProviderSettingsView';
import { RegistryView } from '../views/RegistryView';
import { RuntimeConnectionView } from '../views/RuntimeConnectionView';
import { ScheduleView } from '../views/ScheduleView';
import { SettingsView } from '../views/SettingsView';
import { ToolManagementView } from '../views/ToolManagementView';
import { WorkflowManagementView } from '../views/WorkflowManagementView';
import { ProjectLayoutRenderer } from './ProjectLayoutRenderer';

export function AppViewContent({
  currentView,
  agents,
  apiBase,
  availableModels,
  defaultModel,
  bedrockReady,
  onNavigate,
  onNavigateHome,
  onSettingsSaved,
}: {
  currentView: NavigationView;
  agents: AgentSummary[];
  apiBase: string;
  availableModels: unknown;
  defaultModel?: string;
  bedrockReady: boolean;
  onNavigate: (view: NavigationView) => void;
  onNavigateHome: () => void;
  onSettingsSaved: () => void;
}) {
  if (
    currentView.type === 'agents' ||
    currentView.type === 'agent-detail' ||
    currentView.type === 'agent-new' ||
    currentView.type === 'agent-edit'
  ) {
    return (
      <AgentsView
        agents={agents}
        apiBase={apiBase}
        availableModels={availableModels}
        defaultModel={defaultModel}
        bedrockReady={bedrockReady}
        onNavigate={onNavigate}
      />
    );
  }

  if (currentView.type === 'playbooks' || currentView.type === 'prompts') {
    return <PlaybooksView />;
  }
  if (currentView.type === 'registry') {
    return <RegistryView />;
  }
  if (currentView.type === 'plugins') {
    return <PluginManagementView />;
  }
  if (currentView.type === 'connections') {
    return <ConnectionsHub />;
  }
  if (currentView.type === 'connections-providers') {
    return <ProviderSettingsView onNavigate={onNavigate} />;
  }
  if (currentView.type === 'connections-provider-edit') {
    return (
      <ProviderSettingsView
        selectedProviderId={currentView.id}
        onNavigate={onNavigate}
      />
    );
  }
  if (currentView.type === 'connections-runtime-edit') {
    return (
      <RuntimeConnectionView
        selectedRuntimeId={currentView.id}
        onNavigate={onNavigate}
      />
    );
  }
  if (
    currentView.type === 'connections-tools' ||
    currentView.type === 'connections-tool-edit'
  ) {
    return <IntegrationsView />;
  }
  if (currentView.type === 'connections-knowledge') {
    return <KnowledgeConnectionView />;
  }
  if (currentView.type === 'project-new') {
    return (
      <NewProjectModal
        isOpen
        onClose={() => {
          if (window.location.pathname === '/projects/new') {
            onNavigateHome();
          }
        }}
      />
    );
  }
  if (currentView.type === 'project-edit') {
    return <ProjectSettingsView slug={currentView.slug} />;
  }
  if (currentView.type === 'layout') {
    return (
      <ProjectLayoutRenderer
        projectSlug={currentView.projectSlug}
        layoutSlug={currentView.layoutSlug}
      />
    );
  }
  if (currentView.type === 'project') {
    return <ProjectPage slug={currentView.slug} />;
  }
  if (currentView.type === 'agent-tools') {
    return (
      <ToolManagementView
        apiBase={apiBase}
        agentSlug={currentView.slug}
        agentName={
          agents.find((agent) => agent.slug === currentView.slug)?.name ||
          currentView.slug
        }
        onBack={onNavigateHome}
      />
    );
  }
  if (currentView.type === 'workflows') {
    return (
      <WorkflowManagementView
        agentSlug={currentView.slug}
        agentName={
          agents.find((agent) => agent.slug === currentView.slug)?.name ||
          currentView.slug
        }
        onBack={onNavigateHome}
      />
    );
  }
  if (currentView.type === 'settings') {
    return (
      <SettingsView
        onBack={onNavigateHome}
        onSaved={onSettingsSaved}
        onNavigate={onNavigate}
      />
    );
  }
  if (currentView.type === 'profile') {
    return <ProfilePage />;
  }
  if (currentView.type === 'notifications') {
    return <NotificationsPage />;
  }
  if (currentView.type === 'monitoring') {
    return <MonitoringView />;
  }
  if (currentView.type === 'schedule') {
    return <ScheduleView />;
  }

  return null;
}
