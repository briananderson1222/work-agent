/**
 * SSE test helper — reads an SSE response stream and collects parsed events.
 * Works with Hono's streamSSE responses from app.request().
 */

/** Collect SSE events from a Response until the stream ends or timeout. */
export async function collectSSE(
  res: Response,
  opts?: { maxEvents?: number; timeoutMs?: number },
): Promise<Array<{ event?: string; data: string; parsed?: any }>> {
  const maxEvents = opts?.maxEvents ?? 50;
  const timeoutMs = opts?.timeoutMs ?? 2000;
  const events: Array<{ event?: string; data: string; parsed?: any }> = [];

  const reader = res.body?.getReader();
  if (!reader) return events;

  const decoder = new TextDecoder();
  let buffer = '';
  let currentEvent: string | undefined;

  const timeout = new Promise<void>((resolve) => setTimeout(resolve, timeoutMs));
  const read = async () => {
    try {
      while (events.length < maxEvents) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            const data = line.slice(6);
            let parsed: any;
            try { parsed = JSON.parse(data); } catch { parsed = undefined; }
            events.push({ event: currentEvent, data, parsed });
            currentEvent = undefined;
          } else if (line === '') {
            // Empty line = end of event block, reset
            currentEvent = undefined;
          }
        }
      }
    } catch (e) {
      // Stream aborted or errored — that's fine, return what we have
    }
  };

  await Promise.race([read(), timeout]);
  reader.cancel().catch(() => {});
  return events;
}
