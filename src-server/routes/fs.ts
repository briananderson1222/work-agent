import { Hono } from 'hono';
import { readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { homedir } from 'node:os';

export function createFsRoutes() {
  const app = new Hono();

  app.get('/browse', async (c) => {
    try {
      const pathParam = c.req.query('path') || '~';
      const resolvedPath = pathParam === '~' ? homedir() : resolve(pathParam);

      const entries = await readdir(resolvedPath, { withFileTypes: true });
      const directories = entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => ({
          name: entry.name,
          isDirectory: true,
        }))
        .sort((a, b) => {
          const aStartsWithDot = a.name.startsWith('.');
          const bStartsWithDot = b.name.startsWith('.');
          if (aStartsWithDot !== bStartsWithDot) {
            return aStartsWithDot ? 1 : -1;
          }
          return a.name.localeCompare(b.name);
        });

      return c.json({
        path: resolvedPath,
        entries: directories,
      });
    } catch (error) {
      return c.json({ error: 'Path not found or permission denied' }, 404);
    }
  });

  return app;
}
