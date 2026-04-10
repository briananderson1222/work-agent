import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import type { OrchestrationService } from '../services/orchestration-service.js';
import { sseOps } from '../telemetry/metrics.js';
import { errorMessage, getBody, validate } from './schemas.js';

const providerKindSchema = z.enum(['bedrock', 'claude', 'codex']);

const startSessionCommandSchema = z.object({
  type: z.literal('startSession'),
  input: z.object({
    threadId: z.string().min(1),
    provider: providerKindSchema,
    cwd: z.string().optional(),
    modelId: z.string().optional(),
    modelOptions: z.record(z.unknown()).optional(),
    resumeCursor: z.unknown().optional(),
  }),
});

const sendTurnCommandSchema = z.object({
  type: z.literal('sendTurn'),
  input: z.object({
    threadId: z.string().min(1),
    input: z.string(),
    attachments: z.array(z.unknown()).optional(),
    modelId: z.string().optional(),
    modelOptions: z.record(z.unknown()).optional(),
  }),
});

const interruptTurnCommandSchema = z.object({
  type: z.literal('interruptTurn'),
  threadId: z.string().min(1),
  turnId: z.string().optional(),
});

const respondToRequestCommandSchema = z.object({
  type: z.literal('respondToRequest'),
  threadId: z.string().min(1),
  requestId: z.string().min(1),
  decision: z.enum(['accept', 'acceptForSession', 'decline', 'cancel']),
});

const stopSessionCommandSchema = z.object({
  type: z.literal('stopSession'),
  threadId: z.string().min(1),
});

const orchestrationCommandSchema = z.discriminatedUnion('type', [
  startSessionCommandSchema,
  sendTurnCommandSchema,
  interruptTurnCommandSchema,
  respondToRequestCommandSchema,
  stopSessionCommandSchema,
]);

export function createOrchestrationRoutes(
  orchestrationService: OrchestrationService,
  deps: {
    eventBus: {
      subscribe(
        listener: (event: {
          event: string;
          data?: Record<string, unknown>;
        }) => void,
      ): () => void;
    };
    logger: {
      debug(message: string, meta?: Record<string, unknown>): void;
    };
  },
) {
  const app = new Hono();

  app.get('/providers', async (c) => {
    const data = await orchestrationService.listProviders();
    return c.json({ success: true, data });
  });

  app.get('/providers/:provider/commands', async (c) => {
    const provider = c.req.param('provider');
    if (!['bedrock', 'claude', 'codex'].includes(provider)) {
      return c.json({ success: false, error: 'Unknown provider' }, 404);
    }
    const data = await orchestrationService.getProviderCommands(
      provider as 'bedrock' | 'claude' | 'codex',
    );
    return c.json({ success: true, data });
  });

  app.get('/sessions', async (c) => {
    const data = await orchestrationService.listSessions();
    return c.json({ success: true, data });
  });

  app.post('/commands', validate(orchestrationCommandSchema), async (c) => {
    try {
      const result = await orchestrationService.dispatch(getBody(c));
      return c.json({ success: true, data: result ?? null });
    } catch (error) {
      return c.json({ success: false, error: errorMessage(error) }, 400);
    }
  });

  app.get('/events', (c) => {
    return streamSSE(c, async (stream) => {
      sseOps.add(1, { op: 'orchestration_connect' });
      const sessions = await orchestrationService.listSessions();
      await stream.writeSSE({
        event: 'orchestration:snapshot',
        data: JSON.stringify({ sessions }),
      });

      const unsub = deps.eventBus.subscribe((evt) => {
        if (evt.event !== 'orchestration:event') return;
        stream
          .writeSSE({
            event: 'orchestration:event',
            data: JSON.stringify(evt.data ?? {}),
          })
          .catch(() => {});
      });

      const keepAlive = setInterval(() => {
        stream.writeSSE({ event: 'ping', data: '' }).catch(() => {});
      }, 30_000);

      try {
        await new Promise((_, reject) => {
          stream.onAbort(() => reject(new Error('aborted')));
        });
      } catch (error) {
        deps.logger.debug('Orchestration SSE client disconnected', {
          error: error instanceof Error ? error.message : String(error),
        });
      }

      clearInterval(keepAlive);
      unsub();
    });
  });

  return app;
}
