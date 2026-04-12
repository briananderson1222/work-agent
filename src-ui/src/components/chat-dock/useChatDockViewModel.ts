import { useProjectLayoutsQuery } from '@stallion-ai/sdk';
import type { AgentData } from '../../contexts/AgentsContext';
import { useModelSupportsAttachments } from '../../contexts/ModelCapabilitiesContext';
import { useProject } from '../../contexts/ProjectsContext';
import { useGitStatus } from '../../hooks/useGitStatus';
import type { ChatSession } from '../../types';
import { resolveSessionExecutionSummary } from '../../utils/execution';

type ModelOption = { id: string; name: string };

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
  const sessionCodingLayout = sessionLayouts.find(
    (layout: any) => layout.type === 'coding',
  );

  const effectiveModels = agentForHook?.modelOptions || availableModels;
  const currentModelId =
    activeSession?.model ||
    agents.find((agent) => agent.slug === activeSession?.agentSlug)?.model;
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
