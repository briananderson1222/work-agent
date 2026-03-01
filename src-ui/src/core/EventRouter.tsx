import { type ReactNode, useEffect } from 'react';

export function EventRouter({ children }: { children: ReactNode }) {
  useEffect(() => {
    // Route core events to SDK via custom DOM events
    const handleCoreEvent = (_event: Event) => {
      // Event routing handled by SDK via window events
    };

    window.addEventListener('core:event', handleCoreEvent);
    return () => window.removeEventListener('core:event', handleCoreEvent);
  }, []);

  return <>{children}</>;
}
