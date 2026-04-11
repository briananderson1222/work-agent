import { describe, expect, test } from 'vitest';
import { getACPConnectionStatusView } from '../components/acp-connections/utils';

describe('acp connection status utils', () => {
  test('maps unavailable connections to installation status', () => {
    expect(
      getACPConnectionStatusView({
        id: 'gemini',
        name: 'Gemini',
        command: 'gemini',
        args: [],
        enabled: true,
        status: 'unavailable',
        source: 'manual',
      } as any),
    ).toMatchObject({
      isUnavailable: true,
      statusLabel: 'not installed',
    });
  });

  test('maps disabled plugin connections to muted state', () => {
    expect(
      getACPConnectionStatusView({
        id: 'plugin-conn',
        name: 'Plugin Connection',
        command: 'plugin',
        args: [],
        enabled: false,
        status: 'available',
        source: 'plugin',
      } as any),
    ).toMatchObject({
      isPlugin: true,
      statusLabel: 'disabled',
      statusColor: 'var(--success-text)',
    });
  });
});
