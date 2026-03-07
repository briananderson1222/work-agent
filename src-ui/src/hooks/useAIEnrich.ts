import { useCallback, useRef, useState } from 'react';
import { useApiBase } from '../contexts/ApiBaseContext';

/**
 * Hook for AI-enriching form fields via the default agent.
 * Returns { enrich, isEnriching } where enrich(prompt) returns the generated text.
 */
export function useAIEnrich() {
  const { apiBase } = useApiBase();
  const [isEnriching, setIsEnriching] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const enrich = useCallback(async (prompt: string): Promise<string> => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setIsEnriching(true);

    try {
      // Find default agent
      const agentsRes = await fetch(`${apiBase}/api/agents`, { signal: controller.signal });
      const { data: agents } = await agentsRes.json();
      const slug = agents?.[0]?.slug;
      if (!slug) throw new Error('No agents available');

      const res = await fetch(`${apiBase}/api/agents/${slug}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: prompt, options: {} }),
        signal: controller.signal,
      });

      let text = '';
      if (res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          for (const line of decoder.decode(value, { stream: true }).split('\n')) {
            if (!line.startsWith('data: ')) continue;
            try {
              const evt = JSON.parse(line.slice(6));
              if (evt.type === 'text-delta') text += evt.text;
            } catch { /* skip */ }
          }
        }
      }
      return text;
    } finally {
      setIsEnriching(false);
      abortRef.current = null;
    }
  }, [apiBase]);

  return { enrich, isEnriching };
}
