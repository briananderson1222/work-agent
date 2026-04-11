import {
  useAuthStatusQuery,
  useRenewAuthMutation,
} from '@stallion-ai/sdk';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';

type AuthStatus = 'valid' | 'expiring' | 'expired' | 'missing' | 'loading';

interface AuthState {
  status: AuthStatus;
  expiresAt: Date | null;
  provider: string;
  user: {
    alias: string;
    profileUrl?: string;
    name?: string;
    title?: string;
    email?: string;
  } | null;
  renew: () => Promise<void>;
  isRenewing: boolean;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [provider, setProvider] = useState<string>('');
  const [user, setUser] = useState<{ alias: string } | null>(null);
  const [isRenewing, setIsRenewing] = useState(false);
  const { data, error, refetch: refreshAuthStatus } = useAuthStatusQuery();
  const renewAuthMutation = useRenewAuthMutation();

  const checkStatus = useCallback(async () => {
    try {
      const result = await refreshAuthStatus();
      const authStatus = result.data;
      if (!authStatus) {
        throw result.error ?? new Error('Missing auth status');
      }
      setStatus(authStatus.status);
      setProvider(authStatus.provider);
      setExpiresAt(authStatus.expiresAt ? new Date(authStatus.expiresAt) : null);
      setUser(authStatus.user ?? null);
    } catch {
      setStatus('missing');
    }
  }, [refreshAuthStatus]);

  const renew = useCallback(async () => {
    setIsRenewing(true);
    try {
      await renewAuthMutation.mutateAsync();
      setTimeout(() => {
        void checkStatus();
      }, 3000);
    } catch {
      /* ignore */
    } finally {
      setIsRenewing(false);
    }
  }, [checkStatus, renewAuthMutation]);

  useEffect(() => {
    if (data) {
      setStatus(data.status);
      setProvider(data.provider);
      setExpiresAt(data.expiresAt ? new Date(data.expiresAt) : null);
      setUser(data.user ?? null);
      return;
    }
    if (error) {
      setStatus('missing');
    }
  }, [data, error]);

  useEffect(() => {
    void checkStatus();
    const interval = setInterval(checkStatus, 60000);
    return () => clearInterval(interval);
  }, [checkStatus]);

  return (
    <AuthContext.Provider
      value={{ status, expiresAt, provider, user, renew, isRenewing }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
