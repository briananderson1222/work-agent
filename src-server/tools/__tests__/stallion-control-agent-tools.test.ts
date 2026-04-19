import { describe, expect, test } from 'vitest';

const { buildAgentPayload } = await import(
  '../stallion-control-agent-tools.js'
);

describe('stallion-control agent tools', () => {
  test('maps systemPrompt and mcpServers into the agent route shape', () => {
    expect(
      buildAgentPayload({
        name: 'Smoke Writer',
        slug: 'smoke-writer',
        model: 'llama3.2:latest',
        systemPrompt: 'Reply with exactly: SMOKE_WRITER_OK',
        skills: ['review'],
        mcpServers: ['stallion-control'],
      }),
    ).toEqual({
      name: 'Smoke Writer',
      slug: 'smoke-writer',
      model: 'llama3.2:latest',
      prompt: 'Reply with exactly: SMOKE_WRITER_OK',
      skills: ['review'],
      tools: { mcpServers: ['stallion-control'] },
    });
  });
});
