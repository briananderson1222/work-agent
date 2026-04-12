import { describe, expect, test } from 'vitest';
import {
  getACPConnectionStatusView,
  getACPConnectionVirtualAgents,
  getACPCurrentModelName,
  hasACPConnectionAgent,
} from '../acp-connection-view.js';

describe('acp-connection-view helpers', () => {
  test('matches agent slugs for a connection prefix', () => {
    expect(
      hasACPConnectionAgent(
        [{ id: 'dev' }, { id: 'plan' }],
        'kiro',
        'kiro-dev',
      ),
    ).toBe(true);
    expect(hasACPConnectionAgent([{ id: 'dev' }], 'kiro', 'claude-dev')).toBe(
      false,
    );
  });

  test('prefers model config options over detected CLI model names', () => {
    expect(
      getACPCurrentModelName(
        [
          {
            category: 'model',
            currentValue: 'claude-sonnet',
            options: [{ name: 'Claude Sonnet', value: 'claude-sonnet' }],
          },
        ],
        'fallback-model',
      ),
    ).toBe('Claude Sonnet');
    expect(getACPCurrentModelName([], 'fallback-model')).toBe('fallback-model');
  });

  test('builds connection virtual agents and status views', () => {
    const config = {
      id: 'kiro',
      name: 'Kiro',
      icon: '🧪',
      enabled: true,
    };
    const configOptions = [
      {
        category: 'model',
        currentValue: 'claude-sonnet',
        options: [{ name: 'Claude Sonnet', value: 'claude-sonnet' }],
      },
    ];

    const agents = getACPConnectionVirtualAgents({
      modes: [{ id: 'dev', name: 'Dev Mode', description: 'Build things' }],
      prefix: 'kiro',
      config: config as any,
      configOptions,
      promptCapabilities: { image: true },
      currentModelName: 'Claude Sonnet',
    });
    const status = getACPConnectionStatusView({
      status: 'connected',
      modes: [{ id: 'dev' }, { id: 'plan' }],
      sessionId: 'session-1',
      mcpServers: ['filesystem'],
      configOptions,
      currentModel: 'Claude Sonnet',
      interactive: { args: ['--interactive'] },
    });

    expect(agents).toEqual([
      expect.objectContaining({
        slug: 'kiro-dev',
        name: 'Dev Mode',
        model: 'Claude Sonnet',
        supportsAttachments: true,
        modelOptions: [
          {
            id: 'claude-sonnet',
            name: 'Claude Sonnet',
            originalId: 'claude-sonnet',
          },
        ],
      }),
    ]);
    expect(status).toEqual({
      status: 'connected',
      modes: ['dev', 'plan'],
      sessionId: 'session-1',
      mcpServers: ['filesystem'],
      configOptions,
      currentModel: 'Claude Sonnet',
      interactive: { args: ['--interactive'] },
    });
  });
});
