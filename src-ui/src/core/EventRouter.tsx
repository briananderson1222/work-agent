import { useEffect, ReactNode } from 'react';
import { useEvents } from '@stallion-ai/sdk';

export function EventRouter({ children }: { children: ReactNode }) {
  const events = useEvents();

  useEffect(() => {
    // Route core events to SDK
    const handleCoreEvent = (event: CustomEvent) => {
      events.emit(event.type, event.detail);
    };

    window.addEventListener('core:event', handleCoreEvent);
    return () => window.removeEventListener('core:event', handleCoreEvent);
  }, [events]);

  return <>{children}</>;
}
