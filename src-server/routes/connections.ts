import { randomUUID } from 'node:crypto';
import type { ConnectionConfig } from '@stallion-ai/shared';
import { Hono } from 'hono';
import type { ConnectionService } from '../services/connection-service.js';
import {
  connectionSchema,
  errorMessage,
  getBody,
  param,
  validate,
} from './schemas.js';

export function createConnectionRoutes(connectionService: ConnectionService) {
  const app = new Hono();

  app.get('/', async (c) => {
    try {
      const data = await connectionService.listConnections();
      return c.json({ success: true, data });
    } catch (error: unknown) {
      return c.json({ success: false, error: errorMessage(error) }, 500);
    }
  });

  app.get('/models', async (c) => {
    try {
      const data = await connectionService.listModelConnections();
      return c.json({ success: true, data });
    } catch (error: unknown) {
      return c.json({ success: false, error: errorMessage(error) }, 500);
    }
  });

  app.get('/runtimes', async (c) => {
    try {
      const data = await connectionService.listRuntimeConnections();
      return c.json({ success: true, data });
    } catch (error: unknown) {
      return c.json({ success: false, error: errorMessage(error) }, 500);
    }
  });

  app.get('/:id', async (c) => {
    try {
      const connection = await connectionService.getConnection(param(c, 'id'));
      if (!connection) {
        return c.json({ success: false, error: 'Connection not found' }, 404);
      }
      return c.json({ success: true, data: connection });
    } catch (error: unknown) {
      return c.json({ success: false, error: errorMessage(error) }, 500);
    }
  });

  app.post('/', validate(connectionSchema), async (c) => {
    try {
      const body = getBody(c) as ConnectionConfig;
      const data = await connectionService.saveConnection({
        ...body,
        id: body.id || randomUUID(),
      });
      return c.json({ success: true, data }, 201);
    } catch (error: unknown) {
      return c.json({ success: false, error: errorMessage(error) }, 400);
    }
  });

  app.put('/:id', validate(connectionSchema), async (c) => {
    try {
      const body = getBody(c) as ConnectionConfig;
      const data = await connectionService.saveConnection({
        ...body,
        id: param(c, 'id'),
      });
      return c.json({ success: true, data });
    } catch (error: unknown) {
      return c.json({ success: false, error: errorMessage(error) }, 400);
    }
  });

  app.delete('/:id', async (c) => {
    try {
      await connectionService.deleteConnection(param(c, 'id'));
      return c.json({ success: true });
    } catch (error: unknown) {
      return c.json({ success: false, error: errorMessage(error) }, 400);
    }
  });

  app.post('/:id/test', async (c) => {
    try {
      const data = await connectionService.testConnection(param(c, 'id'));
      return c.json({ success: true, data });
    } catch (error: unknown) {
      const message = errorMessage(error);
      const status = /not found/i.test(message) ? 404 : 400;
      return c.json({ success: false, error: message }, status);
    }
  });

  return app;
}
