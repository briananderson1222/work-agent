import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import type { ProviderSession } from '@stallion-ai/contracts/provider';
import type { CanonicalRuntimeEvent } from '@stallion-ai/contracts/runtime-events';
import { ORCHESTRATION_EVENT_STORE_MIGRATION } from '../domain/migrations/003-orchestration-events.js';
import {
  orchestrationEventPersistDuration,
  orchestrationEventsPersisted,
} from '../telemetry/metrics.js';

const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite') as {
  DatabaseSync: new (
    path: string,
  ) => {
    exec(sql: string): void;
    prepare(sql: string): {
      run: (...args: unknown[]) => unknown;
      get: (...args: unknown[]) => unknown;
      all: (...args: unknown[]) => unknown[];
    };
    close(): void;
  };
};

export interface OrchestrationCommandReceipt {
  commandId: string;
  threadId: string;
  commandType: string;
  status: 'accepted' | 'rejected' | 'failed';
  createdAt: string;
}

export interface PersistedRuntimeEvent {
  id: string;
  provider: string;
  threadId: string;
  turnId?: string;
  method: string;
  payload: CanonicalRuntimeEvent;
  createdAt: string;
  sequence: number;
}

export class EventStore {
  private readonly db: InstanceType<typeof DatabaseSync>;

  constructor(dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec(ORCHESTRATION_EVENT_STORE_MIGRATION);
  }

  appendEvent(event: CanonicalRuntimeEvent): number {
    const startedAt = performance.now();
    const nextSequence = this.nextSequence(event.threadId);
    this.db
      .prepare(
        `INSERT INTO orchestration_events
          (id, provider, thread_id, turn_id, method, payload, created_at, sequence)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        event.eventId,
        event.provider,
        event.threadId,
        event.turnId ?? null,
        event.method,
        JSON.stringify(event),
        event.createdAt,
        nextSequence,
      );
    orchestrationEventsPersisted.add(1, {
      provider: event.provider,
      method: event.method,
    });
    orchestrationEventPersistDuration.record(performance.now() - startedAt, {
      provider: event.provider,
      method: event.method,
    });
    return nextSequence;
  }

  listEvents(threadId?: string): PersistedRuntimeEvent[] {
    const rows = threadId
      ? this.db
          .prepare(
            `SELECT id, provider, thread_id, turn_id, method, payload, created_at, sequence
             FROM orchestration_events
             WHERE thread_id = ?
             ORDER BY sequence ASC`,
          )
          .all(threadId)
      : this.db
          .prepare(
            `SELECT id, provider, thread_id, turn_id, method, payload, created_at, sequence
             FROM orchestration_events
             ORDER BY created_at ASC, sequence ASC`,
          )
          .all();

    return rows.map((row: any) => ({
      id: row.id,
      provider: row.provider,
      threadId: row.thread_id,
      turnId: row.turn_id ?? undefined,
      method: row.method,
      payload: JSON.parse(row.payload),
      createdAt: row.created_at,
      sequence: row.sequence,
    }));
  }

  upsertSession(session: ProviderSession): void {
    this.db
      .prepare(
        `INSERT INTO provider_session_state
          (thread_id, provider, status, model, resume_cursor, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(thread_id) DO UPDATE SET
           provider = excluded.provider,
           status = excluded.status,
           model = excluded.model,
           resume_cursor = excluded.resume_cursor,
           updated_at = excluded.updated_at`,
      )
      .run(
        session.threadId,
        session.provider,
        session.status,
        session.model ?? null,
        session.resumeCursor === undefined
          ? null
          : JSON.stringify(session.resumeCursor),
        session.createdAt,
        session.updatedAt,
      );
  }

  markSessionClosed(threadId: string, provider?: string): void {
    const now = new Date().toISOString();
    const existing = this.db
      .prepare(
        `SELECT thread_id, provider, created_at FROM provider_session_state WHERE thread_id = ?`,
      )
      .get(threadId) as
      | { thread_id: string; provider: string; created_at: string }
      | undefined;

    if (!existing && !provider) return;

    this.db
      .prepare(
        `INSERT INTO provider_session_state
          (thread_id, provider, status, model, resume_cursor, created_at, updated_at)
         VALUES (?, ?, 'closed', NULL, NULL, ?, ?)
         ON CONFLICT(thread_id) DO UPDATE SET
           status = 'closed',
           updated_at = excluded.updated_at`,
      )
      .run(
        threadId,
        provider ?? existing!.provider,
        existing?.created_at ?? now,
        now,
      );
  }

  readSessions(): ProviderSession[] {
    const rows = this.db
      .prepare(
        `SELECT thread_id, provider, status, model, resume_cursor, created_at, updated_at
         FROM provider_session_state
         ORDER BY created_at ASC`,
      )
      .all();

    return rows.map((row: any) => ({
      provider: row.provider,
      threadId: row.thread_id,
      status: row.status,
      model: row.model ?? undefined,
      resumeCursor: row.resume_cursor
        ? JSON.parse(row.resume_cursor)
        : undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  appendCommandReceipt(receipt: OrchestrationCommandReceipt): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO orchestration_command_receipts
          (command_id, thread_id, command_type, status, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        receipt.commandId,
        receipt.threadId,
        receipt.commandType,
        receipt.status,
        receipt.createdAt,
      );
  }

  close(): void {
    this.db.close();
  }

  private nextSequence(threadId: string): number {
    const row = this.db
      .prepare(
        `SELECT COALESCE(MAX(sequence), 0) AS max_sequence
         FROM orchestration_events
         WHERE thread_id = ?`,
      )
      .get(threadId) as { max_sequence: number };
    return row.max_sequence + 1;
  }
}
