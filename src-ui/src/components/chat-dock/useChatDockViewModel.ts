import {
  useProjectLayoutsQuery,
  useRuntimeConnectionsQuery,
} from '@stallion-ai/sdk';
import type { RuntimeConnectionView } from '@stallion-ai/contracts/tool';
import type { AgentData } from '../../contexts/AgentsContext';
import { useModelSupportsAttachments } from '../../contexts/ModelCapabilitiesContext';
import { useProject } from '../../contexts/ProjectsContext';
import { useGitStatus } from '../../hooks/useGitStatus';
import type { ChatSession } from '../../types';
import {
  resolveBindingStatus,
  resolveSessionExecutionSummary,
} from '../../utils/execution';

type ModelOption = { id: string; name: string };

function ensureActiveModelOption(
  models: ModelOption[],
  currentModelId: string | null | undefined,
): ModelOption[] {
  if (!currentModelId || models.some((model) => model.id === currentModelId)) {
    return models;
  }
  return [{ id: currentModelId, name: currentModelId }, ...models];
}

interface UseChatDockViewModelArgs {
  activeSessionId: string | null;
  availableModels: ModelOption[];
  agents: AgentData[];
  sessions: ChatSession[];
}

export function useChatDockViewModel({
  activeSessionId,
  availableModels,
  agents,
  sessions,
}: UseChatDockViewModelArgs) {
  const activeSession =
    sessions.find((session) => session.id === activeSessionId) || null;
  const activeSessionForHook = activeSession;
  const agentForHook: AgentData | null = activeSessionForHook
    ? agents.find((agent) => agent.slug === activeSessionForHook.agentSlug) ||
      null
    : null;
  const agentDefaultModelId = agentForHook?.model;

  const sessionProjectSlug = activeSessionForHook?.projectSlug ?? null;
  const { project: sessionProject } = useProject(sessionProjectSlug ?? '');
  const sessionWorkingDir = sessionProject?.workingDirectory ?? null;
  const sessionProjectName =
    sessionProject?.name ??
    activeSessionForHook?.projectName ??
    sessionProjectSlug ??
    null;
  const { data: gitStatus } = useGitStatus(sessionWorkingDir);
  const { data: sessionLayouts = [] } = useProjectLayoutsQuery(
    sessionProjectSlug ?? '',
    { enabled: !!sessionProjectSlug },
  );
  const { data: runtimeConnections = [] } = useRuntimeConnectionsQuery() as {
    data?: RuntimeConnectionView[];
  };
  const sessionCodingLayout = sessionLayouts.find(
    (layout: any) => layout.type === 'coding',
  );

  const runtimeConnectionId =
    activeSessionForHook?.runtimeConnectionId ??
    agentForHook?.execution?.runtimeConnectionId ??
    null;
  const runtimeConnection = runtimeConnections.find(
    (connection) => connection.id === runtimeConnectionId,
  );
  const currentModelId =
    activeSession?.model ||
    agents.find((agent) => agent.slug === activeSession?.agentSlug)?.model;
  const bindingStatus = resolveBindingStatus({
    agent: agentForHook,
    chatState: activeSessionForHook,
    runtimeConnection,
    globalModels: availableModels.map((model) => ({
      id: model.id,
      name: model.name,
      originalId: model.id,
    })),
  });
  const effectiveModels = ensureActiveModelOption(
    bindingStatus.visibleModels as ModelOption[],
    currentModelId,
  );
  const bedrockModelSupportsAttachments = useModelSupportsAttachments(
    typeof currentModelId === 'string' ? currentModelId : undefined,
  );
  const modelSupportsAttachments =
    bedrockModelSupportsAttachments ||
    (agents.find((agent) => agent.slug === activeSession?.agentSlug)
      ?.supportsAttachments ??
      false);
  const unreadCount = sessions.filter((session) => session.hasUnread).length;
  const executionSummary = resolveSessionExecutionSummary(activeSession);

  return {
    activeSession,
    activeSessionForHook,
    agentDefaultModelId,
    bindingStatus,
    effectiveModels,
    executionSummary,
    gitStatus,
    modelSupportsAttachments,
    sessionCodingLayout,
    sessionProjectName,
    sessionWorkingDir,
    unreadCount,
  };
}
