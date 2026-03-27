import { Hono } from 'hono';
import type { EventBus } from '../services/event-bus.js';
import { uiCommandOps } from '../telemetry/metrics.js';

const INVALID_PATH = /javascript:|data:|vbscript:/i;

export function createUICommandRoutes(eventBus: EventBus) {
  const app = new Hono();

  app.post('/', async (c) => {
    const { command, payload } = await c.req.json<{
      command: string;
      payload: Record<string, unknown>;
    }>();
    uiCommandOps.add(1, { op: 'execute' });

    if (command === 'navigate') {
      const path = payload?.path;
      if (
        typeof path !== 'string' ||
        !path.startsWith('/') ||
        path.startsWith('//') ||
        path.startsWith('http:') ||
        path.startsWith('https:') ||
        INVALID_PATH.test(path)
      ) {
        return c.json(
          { success: false, error: 'Invalid navigation path' },
          400,
        );
      }
      eventBus.emit('ui:navigate', { path });
      return c.json({ success: true });
    }

    return c.json(
      { success: false, error: `Unknown command: ${command}` },
      400,
    );
  });

  return app;
}
