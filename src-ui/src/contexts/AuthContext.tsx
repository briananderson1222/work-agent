import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { useApiBase } from './ApiBaseContext';

type AuthStatus = 'valid' | 'expiring' | 'expired' | 'missing' | 'loading';

interface AuthState {
  status: AuthStatus;
  expiresAt: Date | null;
  provider: string;
  user: { alias: string; profileUrl?: string; name?: string; title?: string; email?: string } | null;
  renew: () => Promise<void>;
  isRenewing: boolean;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { apiBase } = useApiBase();
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [provider, setProvider] = useState<string>('');
  const [user, setUser] = useState<{ alias: string } | null>(null);
  const [isRenewing, setIsRenewing] = useState(false);

  const checkStatus = useCallback(async () => {
    try {
      const response = await fetch(`${apiBase}/api/auth/status`);
      const data = await response.json();
      setStatus(data.status);
      setProvider(data.provider);
      setExpiresAt(data.expiresAt ? new Date(data.expiresAt) : null);
      if (data.user) setUser(data.user);
    } catch {
      setStatus('missing');
    }
  }, [apiBase]);

  const renew = useCallback(async () => {
    setIsRenewing(true);
    try {
      await fetch(`${apiBase}/api/auth/renew`, { method: 'POST' });
      setTimeout(checkStatus, 3000);
    } catch { /* ignore */ }
    finally { setIsRenewing(false); }
  }, [apiBase, checkStatus]);

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 60000);
    return () => clearInterval(interval);
  }, [checkStatus]);

  return (
    <AuthContext.Provider value={{ status, expiresAt, provider, user, renew, isRenewing }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
