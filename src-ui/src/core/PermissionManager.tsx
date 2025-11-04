import { useState, createContext, useContext, ReactNode } from 'react';

interface PermissionContextType {
  requestPermission: (permission: string) => Promise<boolean>;
  hasPermission: (permission: string) => boolean;
}

const PermissionContext = createContext<PermissionContextType | null>(null);

export function PermissionManager({ children }: { children: ReactNode }) {
  const [granted, setGranted] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<string | null>(null);

  const requestPermission = async (permission: string): Promise<boolean> => {
    if (granted.has(permission)) return true;

    setPending(permission);
    return new Promise((resolve) => {
      const handleApprove = () => {
        setGranted(prev => new Set(prev).add(permission));
        setPending(null);
        resolve(true);
      };
      const handleDeny = () => {
        setPending(null);
        resolve(false);
      };
      // In real implementation, show dialog and call handleApprove/handleDeny
      handleApprove();
    });
  };

  const hasPermission = (permission: string) => granted.has(permission);

  return (
    <PermissionContext.Provider value={{ requestPermission, hasPermission }}>
      {children}
      {pending && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'white', padding: '20px', borderRadius: '8px' }}>
            <p>Permission requested: {pending}</p>
          </div>
        </div>
      )}
    </PermissionContext.Provider>
  );
}

export function usePermissions() {
  const ctx = useContext(PermissionContext);
  if (!ctx) throw new Error('usePermissions must be used within PermissionManager');
  return ctx;
}
