import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../api', () => ({
  _getApiBase: vi.fn().mockResolvedValue('http://example.test'),
}));

import {
  fetchPlaybooks,
  fetchRegistryItems,
  requestIntegration,
  requestPlaybook,
  requestRegistryIntegrationAction,
} from '../query-domains/catalogRequests';

function mockJsonResponse(payload: unknown) {
  vi.mocked(fetch).mockResolvedValue({
    json: async () => payload,
  } as Response);
}

describe('catalogRequests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('fetches playbooks through the shared catalog base', async () => {
    mockJsonResponse({
      success: true,
      data: [{ id: 'playbook-1' }],
    });

    await expect(fetchPlaybooks()).resolves.toEqual([{ id: 'playbook-1' }]);

    expect(fetch).toHaveBeenCalledWith(
      'http://example.test/api/playbooks',
      undefined,
    );
  });

  it('keeps playbook requests on the playbooks endpoint with fallback errors', async () => {
    mockJsonResponse({ success: false });

    await expect(requestPlaybook('/demo', { method: 'PUT' })).rejects.toThrow(
      'Playbook request failed',
    );

    expect(fetch).toHaveBeenCalledWith(
      'http://example.test/api/playbooks/demo',
      { method: 'PUT' },
    );
  });

  it('keeps registry lookups scoped to the installed suffix and defaults empty arrays', async () => {
    mockJsonResponse({ success: true });

    await expect(fetchRegistryItems('integrations', true)).resolves.toEqual([]);

    expect(fetch).toHaveBeenCalledWith(
      'http://example.test/api/registry/integrations/installed',
      undefined,
    );
  });

  it('keeps integration requests on the integrations endpoint', async () => {
    mockJsonResponse({
      success: true,
      data: { id: 'integration-1' },
    });

    await expect(
      requestIntegration('/integration-1', { method: 'DELETE' }),
    ).resolves.toEqual({ id: 'integration-1' });

    expect(fetch).toHaveBeenCalledWith(
      'http://example.test/integrations/integration-1',
      { method: 'DELETE' },
    );
  });

  it('uses the integration message fallback when an install fails', async () => {
    mockJsonResponse({
      success: false,
      message: 'Plugin install dependencies unavailable',
    });

    await expect(
      requestRegistryIntegrationAction({
        id: 'demo',
        action: 'install',
      }),
    ).rejects.toThrow('Plugin install dependencies unavailable');

    expect(fetch).toHaveBeenCalledWith(
      'http://example.test/api/registry/integrations/install',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'demo' }),
      },
    );
  });

  it('prefers registry error text over message text on install failures', async () => {
    mockJsonResponse({
      success: false,
      error: 'Registry install denied',
      message: 'Plugin install dependencies unavailable',
    });

    await expect(
      requestRegistryIntegrationAction({
        id: 'demo',
        action: 'install',
      }),
    ).rejects.toThrow('Registry install denied');
  });
});
