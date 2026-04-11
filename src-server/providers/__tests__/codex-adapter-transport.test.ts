import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { describe, expect, test } from 'vitest';
import {
  CodexAdapterTransport,
  createCodexSessionRecord,
} from '../adapters/codex-adapter-transport.js';

class FakeWritable extends Writable {
  readonly lines: string[] = [];

  _write(
    chunk: Buffer | string,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    const text = chunk.toString();
    for (const line of text.split('\n')) {
      if (line.trim()) {
        this.lines.push(line);
      }
    }
    callback();
  }
}

class FakeCodexProcess extends EventEmitter {
  readonly stdin = new FakeWritable();
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  killed = false;

  constructor() {
    super();
    this.stdout.setEncoding('utf8');
    this.stderr.setEncoding('utf8');
  }

  kill(): boolean {
    this.killed = true;
    this.emit('exit', 0);
    return true;
  }
}

async function nextEvent(
  iterator: AsyncIterator<any>,
  label: string,
): Promise<any> {
  const result = await Promise.race([
    iterator.next(),
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`Timed out waiting for ${label}`)),
        750,
      ),
    ),
  ]);
  return result.value;
}

describe('CodexAdapterTransport', () => {
  test('routes stdout notifications and parses malformed JSON as warnings', async () => {
    const transport = new CodexAdapterTransport(() => new Date('2026-04-11T00:00:00Z'));
    const processHandle = new FakeCodexProcess();
    const record = createCodexSessionRecord({
      externalThreadId: 'thread-1',
      process: processHandle,
      provider: 'codex',
      threadId: 'thread-1',
      model: 'gpt-5-codex',
      nowIso: () => '2026-04-11T00:00:00Z',
    });

    transport.registerSession(record);
    transport.setCodexThreadId(record, 'codex-thread-1');
    transport.handleProcess(record);

    const iterator = transport.streamEvents()[Symbol.asyncIterator]();
    transport.handleStdoutLine(
      record,
      JSON.stringify({
        method: 'thread/status/changed',
        params: {
          threadId: 'codex-thread-1',
          status: { type: 'active', activeFlags: [] },
        },
      }),
    );
    transport.handleStdoutLine(record, '{not json');

    expect(await nextEvent(iterator, 'session.state-changed')).toMatchObject({
      method: 'session.state-changed',
      from: 'idle',
      to: 'running',
    });
    expect(await nextEvent(iterator, 'runtime.warning')).toMatchObject({
      method: 'runtime.warning',
      code: 'codex-json-parse',
    });
  });

  test('writes JSON-RPC requests and resolves session lookup helpers', async () => {
    const transport = new CodexAdapterTransport(() => new Date('2026-04-11T00:00:00Z'));
    const processHandle = new FakeCodexProcess();
    const record = createCodexSessionRecord({
      externalThreadId: 'thread-2',
      process: processHandle,
      provider: 'codex',
      threadId: 'thread-2',
      model: 'gpt-5-codex',
      nowIso: () => '2026-04-11T00:00:00Z',
    });

    transport.registerSession(record);
    expect(transport.hasSession('thread-2')).toBe(true);
    expect(transport.requireSession('thread-2')).toBe(record);
    const requestPromise = transport.sendRequest(record, 'initialize', { foo: 'bar' });
    expect(processHandle.stdin.lines[0]).toContain('"method":"initialize"');
    transport.handleStdoutLine(
      record,
      JSON.stringify({ id: '1', result: { ok: true } }),
    );
    await expect(requestPromise).resolves.toEqual({ ok: true });

    transport.stopSession('thread-2', () => '2026-04-11T00:00:00Z');
    expect(transport.hasSession('thread-2')).toBe(false);
    expect(processHandle.killed).toBe(true);
  });
});
