import { useState } from 'react';
import { log } from '@/utils/logger';

export function useExternalAuth() {
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const authenticate = async (pin: string): Promise<boolean> => {
    setIsAuthenticating(true);
    setError(null);

    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('authenticate_external', { pin });
      return true;
    } catch (err: any) {
      // Tauri not available (browser mode) or auth command not configured
      if (
        err?.toString?.().includes('not a function') ||
        err?.toString?.().includes('Could not resolve')
      ) {
        setError('Desktop auth not available in browser mode');
      } else {
        log.api('[Auth] Failed:', err);
        setError(err as string);
      }
      return false;
    } finally {
      setIsAuthenticating(false);
    }
  };

  return { authenticate, isAuthenticating, error };
}
