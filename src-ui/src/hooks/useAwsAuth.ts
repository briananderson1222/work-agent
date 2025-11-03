import { invoke } from '@tauri-apps/api/core';
import { useState } from 'react';

export function useAwsAuth() {
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const authenticate = async (pin: string): Promise<boolean> => {
    setIsAuthenticating(true);
    setError(null);
    
    try {
      console.log('[Auth] Calling mwinit...');
      await invoke('authenticate_aws', { pin });
      console.log('[Auth] Success');
      return true;
    } catch (err) {
      console.error('[Auth] Failed:', err);
      setError(err as string);
      return false;
    } finally {
      setIsAuthenticating(false);
    }
  };

  return { authenticate, isAuthenticating, error };
}
