import { useCallback, useEffect, useRef, useState } from 'react';
import { useConnections } from './ConnectionsContext';
import type { ConnectionStatus } from '../core/types';

export interface UseConnectionStatusOptions {
  /** Function that returns a Promise<boolean> indicating server health */
  checkHealth: (url: string) => Promise<boolean>;
  /** Poll interval in ms (default: 10_000) */
  pollInterval?: number;
}

export interface ConnectionStatusResult {
  status: ConnectionStatus;
  /** Whether a check is currently in flight */
  checking: boolean;
  /** Manually trigger a health check */
  recheck: () => void;
}

export function useConnectionStatus({
  checkHealth,
  pollInterval = 10_000,
}: UseConnectionStatusOptions): ConnectionStatusResult {
  const { apiBase } = useConnections();
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [checking, setChecking] = useState(false);
  const latestUrl = useRef(apiBase);
  latestUrl.current = apiBase;

  const runCheck = useCallback(async () => {
    const url = latestUrl.current;
    setChecking(true);
    try {
      const ok = await checkHealth(url);
      // Only update if URL hasn't changed mid-flight
      if (latestUrl.current === url) {
        setStatus(ok ? 'connected' : 'error');
      }
    } catch {
      if (latestUrl.current === url) {
        setStatus('error');
      }
    } finally {
      setChecking(false);
    }
  }, [checkHealth]);

  // Reset to connecting whenever the URL changes
  useEffect(() => {
    setStatus('connecting');
    runCheck();
  }, [apiBase, runCheck]);

  // Poll on interval
  useEffect(() => {
    const id = setInterval(runCheck, pollInterval);
    return () => clearInterval(id);
  }, [runCheck, pollInterval]);

  return { status, checking, recheck: runCheck };
}
