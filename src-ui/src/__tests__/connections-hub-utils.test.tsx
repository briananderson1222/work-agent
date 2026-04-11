import { describe, expect, it } from 'vitest';
import {
  describeConnection,
  getConnectionStatusClass,
  getProviderIcon,
} from '../views/connections-hub/utils';

describe('connections-hub utils', () => {
  it('describes missing prerequisites', () => {
    expect(
      describeConnection({
        id: 'bedrock',
        kind: 'runtime',
        type: 'bedrock',
        name: 'Bedrock',
        enabled: true,
        capabilities: [],
        status: 'missing_prerequisites',
        prerequisites: [
          { name: 'AWS credentials', status: 'missing' },
          { name: 'Region', status: 'invalid' },
        ],
        config: {},
      }),
    ).toContain('AWS credentials');
  });

  it('describes acp configured vs connected counts', () => {
    expect(
      describeConnection({
        id: 'acp',
        kind: 'runtime',
        type: 'acp',
        name: 'ACP',
        enabled: true,
        capabilities: [],
        status: 'ready',
        prerequisites: [],
        config: {
          configuredCount: 3,
          connectedCount: 2,
        },
      }),
    ).toBe('2 of 3 active');
  });

  it('returns stable status and provider fallbacks', () => {
    expect(getConnectionStatusClass('ready')).toBe('ready');
    expect(getConnectionStatusClass('unknown')).toBe('warn');
    expect(getProviderIcon('unknown')).toBeTypeOf('function');
  });
});
