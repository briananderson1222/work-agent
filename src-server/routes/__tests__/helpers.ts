import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Hono } from 'hono';
import { vi } from 'vitest';
import { ConfigLoader } from '../../domain/config-loader.js';

export function makeTempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'work-agent-test-'));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

export function makeConfigLoader(dir: string) {
  return new ConfigLoader({ projectHomeDir: dir });
}

export function mockLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
}

export async function req(
  app: Hono,
  method: string,
  path: string,
  body?: unknown,
) {
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers = { 'Content-Type': 'application/json' };
  }
  const res = await app.request(path, init);
  const responseBody = await res.json();
  return { status: res.status, body: responseBody };
}
