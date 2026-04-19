import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../api', () => ({
  _getApiBase: vi.fn().mockResolvedValue('http://example.test'),
}));

import {
  cleanupTerminalProcess,
  fetchLoadedOrchestrationSessions,
  fetchOrchestrationSession,
  fetchOrchestrationSessions,
  fetchTerminalProcess,
  fetchTerminalProcesses,
} from '../query-domains/chatRuntimeOrchestration';

function mockJsonResponse(payload: unknown, ok = true) {
  vi.mocked(fetch).mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    json: async () => payload,
  } as Response);
}

describe('chatRuntimeOrchestration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('fetches orchestration sessions through the read-model route', async () => {
    mockJsonResponse({ success: true, data: [{ threadId: 'thread-1' }] });

    await expect(fetchOrchestrationSessions()).resolves.toEqual([
      { threadId: 'thread-1' },
    ]);
    expect(fetch).toHaveBeenCalledWith(
      'http://example.test/api/orchestration/sessions/read-model',
    );
  });

  it('fetches loaded orchestration sessions through the loaded route', async () => {
    mockJsonResponse({ success: true, data: [{ threadId: 'thread-2' }] });

    await expect(fetchLoadedOrchestrationSessions()).resolves.toEqual([
      { threadId: 'thread-2' },
    ]);
    expect(fetch).toHaveBeenCalledWith(
      'http://example.test/api/orchestration/sessions/loaded',
    );
  });

  it('fetches one orchestration session detail', async () => {
    mockJsonResponse({
      success: true,
      data: { session: { threadId: 'thread-3' }, events: [] },
    });

    await expect(fetchOrchestrationSession('thread-3')).resolves.toEqual({
      session: { threadId: 'thread-3' },
      events: [],
    });
    expect(fetch).toHaveBeenCalledWith(
      'http://example.test/api/orchestration/sessions/thread-3',
    );
  });

  it('fetches terminal process summaries and detail', async () => {
    mockJsonResponse({ success: true, data: [{ sessionId: 'demo:t1' }] });
    await expect(fetchTerminalProcesses()).resolves.toEqual([
      { sessionId: 'demo:t1' },
    ]);
    expect(fetch).toHaveBeenCalledWith(
      'http://example.test/api/orchestration/processes/terminals',
    );

    mockJsonResponse({
      success: true,
      data: { process: { sessionId: 'demo:t1' }, history: '' },
    });
    await expect(fetchTerminalProcess('demo:t1')).resolves.toEqual({
      process: { sessionId: 'demo:t1' },
      history: '',
    });
    expect(fetch).toHaveBeenCalledWith(
      'http://example.test/api/orchestration/processes/terminals/demo%3At1',
    );
  });

  it('cleans up a terminal process through the delete route', async () => {
    mockJsonResponse({ success: true });

    await expect(
      cleanupTerminalProcess({ sessionId: 'demo:t1' }),
    ).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledWith(
      'http://example.test/api/orchestration/processes/terminals/demo%3At1',
      { method: 'DELETE' },
    );
  });
});
