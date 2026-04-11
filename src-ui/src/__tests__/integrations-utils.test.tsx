import { describe, expect, test } from 'vitest';
import type { IntegrationViewModel } from '@stallion-ai/sdk';
import {
  filterIntegrationItems,
  formToMcpJson,
  parseMcpJson,
} from '../views/integrations/utils';

const baseIntegration: IntegrationViewModel = {
  id: 'docs',
  kind: 'mcp',
  transport: 'stdio',
  command: 'npx',
  args: ['-y', '@example/server'],
  env: { TOKEN: 'abc' },
  displayName: 'Docs Server',
  description: 'Searches docs',
  connected: true,
};

describe('integrations utils', () => {
  test('formToMcpJson serializes stdio integration config', () => {
    expect(formToMcpJson(baseIntegration)).toContain('"mcpServers"');
    expect(formToMcpJson(baseIntegration)).toContain('"command": "npx"');
    expect(formToMcpJson(baseIntegration)).toContain('"TOKEN": "abc"');
  });

  test('parseMcpJson parses mcpServers config back into an integration form', () => {
    const result = parseMcpJson(
      '{\n  "mcpServers": {\n    "docs": {\n      "command": "npx",\n      "args": ["-y", "@example/server"],\n      "env": { "TOKEN": "abc" }\n    }\n  }\n}',
      null,
    );

    expect(result).toEqual({
      error: null,
      form: {
        id: 'docs',
        kind: 'mcp',
        transport: 'stdio',
        command: 'npx',
        args: ['-y', '@example/server'],
        endpoint: '',
        displayName: 'docs',
        description: '',
        env: { TOKEN: 'abc' },
      },
    });
  });

  test('filterIntegrationItems filters by display name and description', () => {
    const items = filterIntegrationItems(
      [
        baseIntegration,
        {
          ...baseIntegration,
          id: 'db',
          displayName: 'Database Server',
          description: 'Accesses postgres',
          connected: false,
        },
      ],
      'postgres',
    );

    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('db');
  });
});
