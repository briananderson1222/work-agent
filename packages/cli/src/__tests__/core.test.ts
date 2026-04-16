import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function sseResponse(events: Array<Record<string, unknown>>) {
  const body = events
    .map((event) => `data: ${JSON.stringify(event)}\n\n`)
    .concat('data: [DONE]\n\n')
    .join('');
  return new Response(body, {
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

describe('runCoreCommand', () => {
  const fetchMock = vi.fn<typeof fetch>();
  let stdoutWrite: ReturnType<typeof vi.spyOn>;
  let consoleLog: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    stdoutWrite = vi.spyOn(process.stdout, 'write');
    stdoutWrite.mockImplementation(() => true);
    consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    fetchMock.mockReset();
  });

  test('lists agents through the enriched API surface', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        success: true,
        data: [{ slug: 'default', name: 'Default Agent' }],
      }),
    );

    const { runCoreCommand } = await import('../commands/core.js');
    await runCoreCommand('agents', ['list']);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:3141/api/agents',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(consoleLog).toHaveBeenCalledWith(
      JSON.stringify([{ slug: 'default', name: 'Default Agent' }], null, 2),
    );
  });

  test('creates a project from inline JSON payload data', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        success: true,
        data: { slug: 'demo', name: 'Demo Project' },
      }),
    );

    const { runCoreCommand } = await import('../commands/core.js');
    await runCoreCommand('projects', [
      'create',
      '--data={"name":"Demo Project","slug":"demo"}',
    ]);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:3141/api/projects',
      expect.objectContaining({
        method: 'POST',
        body: '{"name":"Demo Project","slug":"demo"}',
      }),
    );
  });

  test('creates a local skill package through the dedicated local route', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        success: true,
        data: { success: true, message: 'Created' },
      }),
    );

    const { runCoreCommand } = await import('../commands/core.js');
    await runCoreCommand('skills', [
      'create',
      '--data={"name":"ship-it","body":"Do the thing"}',
    ]);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:3141/api/skills/local',
      expect.objectContaining({
        method: 'POST',
        body: '{"name":"ship-it","body":"Do the thing"}',
      }),
    );
  });

  test('records a playbook outcome', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        success: true,
        data: { id: 'pb-1', stats: { qualityScore: 100 } },
      }),
    );

    const { runCoreCommand } = await import('../commands/core.js');
    await runCoreCommand('playbooks', ['outcome', 'pb-1', 'success']);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:3141/api/playbooks/pb-1/outcome',
      expect.objectContaining({
        method: 'POST',
        body: '{"outcome":"success"}',
      }),
    );
  });

  test('streams chat deltas to stdout', async () => {
    fetchMock.mockResolvedValueOnce(
      sseResponse([
        { type: 'text-delta', delta: 'Hello' },
        { type: 'text-delta', delta: ' world' },
        { type: 'finish', finishReason: 'stop' },
      ]),
    );

    const { runCoreCommand } = await import('../commands/core.js');
    await runCoreCommand('chat', ['default', 'hello there']);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:3141/api/agents/default/chat',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          input: 'hello there',
          options: {},
        }),
      }),
    );
    expect(stdoutWrite).toHaveBeenCalledWith('Hello');
    expect(stdoutWrite).toHaveBeenCalledWith(' world');
  });
});
