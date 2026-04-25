import { beforeEach, describe, expect, it, vi } from 'vitest';

const reactQueryMocks = vi.hoisted(() => ({
  invalidateQueries: vi.fn(),
  useMutation: vi.fn((options) => options),
  useQuery: vi.fn((options) => options),
}));

vi.mock('@tanstack/react-query', () => ({
  useMutation: reactQueryMocks.useMutation,
  useQuery: reactQueryMocks.useQuery,
  useQueryClient: vi.fn(() => ({
    invalidateQueries: reactQueryMocks.invalidateQueries,
  })),
}));

vi.mock('../api', () => ({
  _getApiBase: vi.fn().mockResolvedValue('http://example.test'),
}));

import {
  runsQueries,
  useFetchRunOutputRef,
  useRunJob,
  useRunQuery,
  useRunsQuery,
} from '../query-domains/scheduler';

describe('scheduler query domain', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('fetches runs through the neutral /api/runs surface', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: [
          {
            runId: 'run-1',
            sessionId: 'session-1',
            providerId: 'codex',
            source: 'orchestration',
            executionClass: 'connected',
            status: 'completed',
            startedAt: '2026-04-25T00:00:00.000Z',
            updatedAt: '2026-04-25T00:00:01.000Z',
            retryEligible: false,
            attempt: 1,
            eventCount: 1,
          },
        ],
      }),
    } as Response);

    expect(runsQueries.list().queryKey).toEqual(['runs']);
    await expect(runsQueries.list().queryFn()).resolves.toEqual([
      expect.objectContaining({ runId: 'run-1' }),
    ]);

    expect(fetch).toHaveBeenCalledWith('http://example.test/api/runs');
  });

  it('builds a detail query against /api/runs/:id and enables the hook only when an id is present', () => {
    useRunQuery('run-42');

    expect(reactQueryMocks.useQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['runs', 'run-42'],
        enabled: true,
      }),
    );

    useRunQuery(null);

    expect(reactQueryMocks.useQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({
        queryKey: ['runs', ''],
        enabled: false,
      }),
    );
  });

  it('passes the neutral runs query factory through useRunsQuery', () => {
    useRunsQuery({ staleTime: 1_000 });

    expect(reactQueryMocks.useQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['runs'],
        staleTime: 1_000,
      }),
    );
    expect(reactQueryMocks.invalidateQueries).not.toHaveBeenCalled();
  });

  it('invalidates both scheduler and runs queries after a manual run mutation succeeds', async () => {
    const mutation = useRunJob() as {
      onSuccess?: (data: unknown, variables: string) => void | Promise<void>;
    };

    await mutation.onSuccess?.(undefined, 'daily-report');

    expect(reactQueryMocks.invalidateQueries).toHaveBeenNthCalledWith(1, {
      queryKey: ['scheduler'],
    });
    expect(reactQueryMocks.invalidateQueries).toHaveBeenNthCalledWith(2, {
      queryKey: ['runs'],
    });
  });

  it('reads run output through an opaque output ref', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: { content: 'captured output' },
      }),
    } as Response);

    const mutation = useFetchRunOutputRef() as {
      mutationFn: (ref: {
        source: 'schedule';
        providerId: string;
        runId: string;
        artifactId: string;
        kind: 'text';
      }) => Promise<unknown>;
    };

    await expect(
      mutation.mutationFn({
        source: 'schedule',
        providerId: 'built-in',
        runId: 'run-1',
        artifactId: 'log-1',
        kind: 'text',
      }),
    ).resolves.toEqual({ content: 'captured output' });

    expect(fetch).toHaveBeenCalledWith(
      'http://example.test/api/runs/output',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          source: 'schedule',
          providerId: 'built-in',
          runId: 'run-1',
          artifactId: 'log-1',
          kind: 'text',
        }),
      }),
    );
  });
});
