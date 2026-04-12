import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../api', () => ({
  _getApiBase: vi.fn().mockResolvedValue('http://example.test'),
}));

import {
  fetchBranding,
  fetchMonitoringMetrics,
  requestSystemStatus,
  applyCoreUpdate,
} from '../query-domains/systemRuntimeRequests';

describe('systemRuntimeRequests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('uses the configured API base and normalizes branding defaults', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: {} }),
    } as Response);

    await expect(fetchBranding()).resolves.toEqual({
      appName: 'Stallion',
      logo: null,
      theme: null,
      welcomeMessage: null,
    });

    expect(fetch).toHaveBeenCalledWith('http://example.test/api/branding');
  });

  it('returns an empty metrics list when monitoring reports failure', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ success: false, data: { metrics: [{ agentSlug: 'one' }] } }),
    } as Response);

    await expect(fetchMonitoringMetrics('week')).resolves.toEqual([]);

    expect(fetch).toHaveBeenCalledWith(
      'http://example.test/monitoring/metrics?range=week',
    );
  });

  it('uses the provided API base for system status and rejects non-ok responses', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      json: async () => ({ ready: false }),
    } as Response);

    await expect(requestSystemStatus('http://custom.test')).rejects.toThrow(
      'Failed to fetch system status',
    );

    expect(fetch).toHaveBeenCalledWith('http://custom.test/api/system/status');
  });

  it('posts core updates through the helper and surfaces server errors', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ success: false, error: 'boom' }),
    } as Response);

    await expect(applyCoreUpdate('http://custom.test')).rejects.toThrow('boom');

    expect(fetch).toHaveBeenCalledWith(
      'http://custom.test/api/system/core-update',
      { method: 'POST' },
    );
  });
});
