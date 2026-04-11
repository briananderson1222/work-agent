import type { ClientSideConnection } from '@agentclientprotocol/sdk';
import type { ACPConnectionStatus } from './acp-connection.js';

export function isACPConnectionConnected({
  status,
  connection,
  sessionId,
}: {
  status: ACPConnectionStatus;
  connection: ClientSideConnection | null;
  sessionId: string | null;
}): boolean {
  return status === 'connected' && connection !== null && sessionId !== null;
}

export function isACPConnectionIdle({
  status,
  activeWriter,
  lastActivityAt,
  now = Date.now(),
}: {
  status: ACPConnectionStatus;
  activeWriter: ((chunk: any) => Promise<void>) | null;
  lastActivityAt: number;
  now?: number;
}): boolean {
  if (status !== 'connected' || activeWriter) {
    return false;
  }
  return now - lastActivityAt > 5 * 60_000;
}

export function isACPConnectionStale({
  status,
  lastActivityAt,
  now = Date.now(),
}: {
  status: ACPConnectionStatus;
  lastActivityAt: number;
  now?: number;
}): boolean {
  if (status !== 'disconnected' && status !== 'error') {
    return false;
  }
  return now - lastActivityAt > 30_000;
}

export async function loadACPConnectionSession({
  connection,
  sessionId,
  cwd,
  logger,
}: {
  connection: ClientSideConnection | null;
  sessionId: string;
  cwd: string;
  logger: {
    info: (message: string, meta?: unknown) => void;
    warn: (message: string, meta?: unknown) => void;
  };
}): Promise<boolean> {
  if (!connection) {
    return false;
  }

  try {
    await connection.loadSession({
      sessionId,
      cwd,
      mcpServers: [],
    });
    logger.info('[ACPBridge] Session loaded', { sessionId });
    return true;
  } catch (error: any) {
    logger.warn('[ACPBridge] Failed to load session', {
      sessionId,
      error: error.message,
    });
    return false;
  }
}
