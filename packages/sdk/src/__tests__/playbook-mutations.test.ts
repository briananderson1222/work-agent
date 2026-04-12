import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../api', () => ({
  _getApiBase: vi.fn().mockResolvedValue('http://example.test'),
}));

import {
  requestPlaybookOutcome,
  requestPlaybookRun,
} from '../query-domains/catalog';

describe('playbook mutations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('posts playbook run tracking to the run endpoint', async () => {
    vi.mocked(fetch).mockResolvedValue({
      json: async () => ({
        success: true,
        data: { id: 'playbook-1', stats: { runs: 1 } },
      }),
    } as Response);

    await requestPlaybookRun('playbook-1');

    expect(fetch).toHaveBeenCalledWith(
      'http://example.test/api/playbooks/playbook-1/run',
      { method: 'POST' },
    );
  });

  it('posts playbook outcomes to the outcome endpoint', async () => {
    vi.mocked(fetch).mockResolvedValue({
      json: async () => ({
        success: true,
        data: { id: 'playbook-1', stats: { qualityScore: 100 } },
      }),
    } as Response);

    await requestPlaybookOutcome({
      id: 'playbook-1',
      outcome: 'success',
    });

    expect(fetch).toHaveBeenCalledWith(
      'http://example.test/api/playbooks/playbook-1/outcome',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outcome: 'success' }),
      },
    );
  });
});
