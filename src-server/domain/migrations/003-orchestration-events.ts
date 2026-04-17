import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import type { DatabaseSync as NodeDatabaseSync } from 'node:sqlite';

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite') as {
  DatabaseSync: typeof NodeDatabaseSync;
};

export const ORCHESTRATION_DB_FILENAME = 'orchestration.sqlite';

export const ORCHESTRATION_EVENT_STORE_MIGRATION = `
CREATE TABLE IF NOT EXISTS orchestration_events (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  turn_id TEXT,
  method TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  sequence INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_thread
  ON orchestration_events(thread_id, sequence);
CREATE INDEX IF NOT EXISTS idx_events_method
  ON orchestration_events(method);

CREATE TABLE IF NOT EXISTS orchestration_command_receipts (
  command_id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  command_type TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS provider_session_state (
  thread_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  status TEXT NOT NULL,
  model TEXT,
  resume_cursor TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

export function getOrchestrationDatabasePath(projectHomeDir: string): string {
  return join(projectHomeDir, 'data', ORCHESTRATION_DB_FILENAME);
}

export function runOrchestrationEventMigration(projectHomeDir: string): void {
  const dbPath = getOrchestrationDatabasePath(projectHomeDir);
  mkdirSync(join(projectHomeDir, 'data'), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(ORCHESTRATION_EVENT_STORE_MIGRATION);
  db.close();
}
