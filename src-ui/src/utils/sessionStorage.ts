import { log } from '@/utils/logger';

const ACTIVE_SESSIONS_KEY = 'work-agent:active-sessions';

export interface PersistedSession {
  conversationId: string;
  agentSlug: string;
  title?: string;
}

export function getActiveSessions(): PersistedSession[] {
  try {
    const stored = sessionStorage.getItem(ACTIVE_SESSIONS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function setActiveSessions(sessions: PersistedSession[]): void {
  try {
    sessionStorage.setItem(ACTIVE_SESSIONS_KEY, JSON.stringify(sessions));
  } catch (error) {
    log.debug('Failed to persist sessions:', error);
  }
}

export function addActiveSession(session: PersistedSession): void {
  const sessions = getActiveSessions();
  const exists = sessions.some(s => s.conversationId === session.conversationId);
  if (!exists) {
    setActiveSessions([...sessions, session]);
  }
}

export function removeActiveSession(conversationId: string): void {
  const sessions = getActiveSessions().filter(s => s.conversationId !== conversationId);
  setActiveSessions(sessions);
}
