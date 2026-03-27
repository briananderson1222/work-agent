import { useCallback, useRef, useState } from 'react';
import { useApiBase } from '../contexts/ApiBaseContext';

/**
 * Hook for AI-enriching form fields via POST /invoke.
 * Returns { enrich, isEnriching } where enrich(prompt) returns the generated text.
 */
export function useAIEnrich() {
  const { apiBase } = useApiBase();
  const [isEnriching, setIsEnriching] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const enrich = useCallback(
    async (prompt: string): Promise<string> => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setIsEnriching(true);

      try {
        const res = await fetch(`${apiBase}/invoke`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt,
            system:
              'You are a concise content generator for a UI form. Output ONLY the requested text. No questions, no preamble, no explanation, no markdown formatting unless requested.',
          }),
          signal: controller.signal,
        });

        const data = await res.json();
        return data.response || '';
      } finally {
        setIsEnriching(false);
        abortRef.current = null;
      }
    },
    [apiBase],
  );

  return { enrich, isEnriching };
}
