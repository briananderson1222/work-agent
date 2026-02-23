import { useCallback, useRef } from 'react';

/** Simple email→name cache used by Calendar to resolve attendee display names. */
export function useLocalSalesState() {
  const cache = useRef<Record<string, string>>({});

  const addEmailName = useCallback((email: string, name: string) => {
    if (email && name) cache.current[email.toLowerCase()] = name;
  }, []);

  const getNameForEmail = useCallback((email: string): string => {
    return cache.current[email.toLowerCase()] || '';
  }, []);

  return { addEmailName, getNameForEmail };
}
