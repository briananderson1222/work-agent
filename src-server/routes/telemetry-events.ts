import { Hono } from 'hono';

export function createTelemetryRoutes(logger: any) {
  const app = new Hono();

  app.post('/events', async (c) => {
    try {
      const { events } = await c.req.json();
      const plugin = c.req.header('x-stallion-plugin') || '';
      // Log events for now — the OTLP pipeline picks them up via server metrics
      if (Array.isArray(events)) {
        for (const event of events) {
          logger.info('Plugin telemetry event', { plugin, ...event });
        }
      }
      return c.json({ success: true });
    } catch (error: any) {
      return c.json({ success: false, error: error.message }, 400);
    }
  });

  return app;
}
