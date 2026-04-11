import { describe, expect, it } from 'vitest';
import {
  getConnectionManagerTitle,
  getConnectionStatus,
} from '../react/connection-manager-modal-utils';

describe('connection-manager-modal-utils', () => {
  it('maps panels to stable titles', () => {
    expect(getConnectionManagerTitle('list')).toBe('Connections');
    expect(getConnectionManagerTitle('add')).toBe('Add Connection');
    expect(getConnectionManagerTitle('scan')).toBe('Scan QR Code');
    expect(getConnectionManagerTitle('discover')).toBe('Discover on Network');
  });

  it('derives the same connection status semantics as the inline modal logic', () => {
    expect(
      getConnectionStatus({
        connectionId: 'a',
        activeConnectionId: 'a',
        healthValue: null,
      }),
    ).toBe('connecting');
    expect(
      getConnectionStatus({
        connectionId: 'a',
        activeConnectionId: 'a',
        healthValue: true,
      }),
    ).toBe('connected');
    expect(
      getConnectionStatus({
        connectionId: 'a',
        activeConnectionId: 'a',
        healthValue: false,
      }),
    ).toBe('error');
    expect(
      getConnectionStatus({
        connectionId: 'a',
        activeConnectionId: 'b',
        healthValue: true,
      }),
    ).toBe('connected');
    expect(
      getConnectionStatus({
        connectionId: 'a',
        activeConnectionId: 'b',
        healthValue: false,
      }),
    ).toBe('error');
    expect(
      getConnectionStatus({
        connectionId: 'a',
        activeConnectionId: 'b',
        healthValue: undefined,
      }),
    ).toBe('connecting');
  });
});
