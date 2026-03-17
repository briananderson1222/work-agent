import { exec as execCb, execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execCb);
const execFile = promisify(execFileCb);
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Hono } from 'hono';
import type { FileTreeService } from '../services/file-tree-service.js';
import { codingOps } from '../telemetry/metrics.js';

function validatePath(raw: string | undefined): string {
  if (!raw) throw new Error('path required');
  const resolved = resolve(raw);
  if (!existsSync(resolved))
    throw new Error(`Directory not found: ${resolved}`);
  return resolved;
}

export function createCodingRoutes(fileTreeService: FileTreeService) {
  const app = new Hono();

  app.get('/files', (c) => {
    codingOps.add(1, { operation: 'files' });
    try {
      const dir = validatePath(c.req.query('path'));
      const depth = c.req.query('depth')
        ? Number(c.req.query('depth'))
        : undefined;
      const maxEntries = c.req.query('maxEntries')
        ? Number(c.req.query('maxEntries'))
        : undefined;
      const data = fileTreeService.listDirectory(dir, { depth, maxEntries });
      return c.json({ success: true, data });
    } catch (e: any) {
      return c.json({ success: false, error: e.message }, 400);
    }
  });

  app.get('/files/search', (c) => {
    codingOps.add(1, { operation: 'search' });
    try {
      const dir = validatePath(c.req.query('path'));
      const query = c.req.query('query');
      if (!query)
        return c.json({ success: false, error: 'query required' }, 400);
      const data = fileTreeService.searchFiles(dir, query);
      return c.json({ success: true, data });
    } catch (e: any) {
      return c.json({ success: false, error: e.message }, 400);
    }
  });

  app.get('/files/content', (c) => {
    codingOps.add(1, { operation: 'content' });
    const path = c.req.query('path');
    if (!path) return c.json({ success: false, error: 'path required' }, 400);
    try {
      const content = fileTreeService.readFile(path);
      return c.json({ success: true, data: { path, content } });
    } catch (e: any) {
      return c.json({ success: false, error: e.message }, 500);
    }
  });

  app.get('/git/status', async (c) => {
    codingOps.add(1, { operation: 'git-status' });
    try {
      const dir = validatePath(c.req.query('path'));
      const branchOut = (await execFile('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
        cwd: dir,
        encoding: 'utf-8',
      })).stdout;
      const statusOut = (await execFile('git', ['status', '--porcelain'], {
        cwd: dir,
        encoding: 'utf-8',
      })).stdout;
      const changes = statusOut.split('\n').filter((l) => l.trim().length > 0);
      return c.json({
        success: true,
        data: { branch: branchOut.trim(), changes },
      });
    } catch (e: any) {
      return c.json({ success: false, error: e.message }, 400);
    }
  });

  app.get('/git/diff', async (c) => {
    try {
      const dir = validatePath(c.req.query('path'));
      const diff = (await execFile('git', ['diff'], { cwd: dir, encoding: 'utf-8' })).stdout;
      return c.json({ success: true, data: { diff } });
    } catch (e: any) {
      return c.json({ success: false, error: e.message }, 400);
    }
  });

  app.get('/git/branches', async (c) => {
    try {
      const dir = validatePath(c.req.query('path'));
      const raw = (await execFile(
        'git',
        ['branch', '-a', '--format=%(refname:short)|%(objectname:short)|%(committerdate:relative)|%(HEAD)'],
        { cwd: dir, encoding: 'utf-8' },
      )).stdout;
      const branches = raw
        .split('\n')
        .filter((l) => l.trim())
        .map((line) => {
          const [name, sha, date, head] = line.split('|');
          return {
            name: name.trim(),
            sha,
            date,
            current: head?.trim() === '*',
          };
        });
      return c.json({ success: true, data: branches });
    } catch (e: any) {
      return c.json({ success: false, error: e.message }, 400);
    }
  });

  app.post('/exec', async (c) => {
    codingOps.add(1, { operation: 'exec' });
    try {
      const { command, cwd } = await c.req.json();
      if (!command)
        return c.json({ success: false, error: 'command required' }, 400);
      const dir = validatePath(cwd);
      const result = await exec(command, {
        cwd: dir,
        encoding: 'utf-8',
        timeout: 30000,
        maxBuffer: 1024 * 1024,
      });
      return c.json({
        success: true,
        data: { stdout: result.stdout, stderr: result.stderr, exitCode: 0 },
      });
    } catch (e: any) {
      return c.json({
        success: true,
        data: {
          stdout: e.stdout ?? '',
          stderr: e.stderr ?? e.message,
          exitCode: e.status ?? 1,
        },
      });
    }
  });

  return app;
}
