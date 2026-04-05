import { describe, expect, test } from 'vitest';
import {
  buildProviderOptions,
  buildRuntimeChatAgent,
  canAgentStartChat,
  executionStatusLabel,
  formatExecutionSummary,
  preferredChatRuntime,
  resolveAgentExecution,
  resolveSessionExecutionSummary,
  runtimeConnectionIdToProviderKind,
} from '../utils/execution';

describe('execution utils', () => {
  test('maps runtime connections to providers', () => {
    expect(runtimeConnectionIdToProviderKind('claude-runtime')).toBe('claude');
    expect(runtimeConnectionIdToProviderKind('codex-runtime')).toBe('codex');
    expect(runtimeConnectionIdToProviderKind('bedrock-runtime')).toBe(
      'bedrock',
    );
  });

  test('builds provider options for runtime-specific settings', () => {
    expect(
      buildProviderOptions('claude-runtime', {
        thinking: false,
        effort: 'high',
      }),
    ).toEqual({
      thinking: false,
      effort: 'high',
    });
    expect(
      buildProviderOptions('codex-runtime', {
        reasoningEffort: 'xhigh',
        fastMode: true,
      }),
    ).toEqual({
      reasoningEffort: 'xhigh',
      fastMode: true,
    });
  });

  test('resolves agent execution defaults and summaries', () => {
    const resolved = resolveAgentExecution({
      model: 'claude-sonnet',
      execution: {
        runtimeConnectionId: 'claude-runtime',
        modelId: 'claude-sonnet',
        runtimeOptions: { effort: 'medium', thinking: true },
      },
    });

    expect(resolved).toMatchObject({
      runtimeConnectionId: 'claude-runtime',
      provider: 'claude',
      model: 'claude-sonnet',
      providerOptions: { effort: 'medium', thinking: true },
    });
    expect(
      formatExecutionSummary({
        model: 'claude-sonnet',
        execution: { runtimeConnectionId: 'claude-runtime' },
      }),
    ).toBe('Claude Runtime · claude-sonnet');
  });

  test('prefers orchestration-backed session execution details', () => {
    expect(
      resolveSessionExecutionSummary({
        provider: 'bedrock',
        model: 'claude-should-not-win',
        status: 'sending',
        orchestrationProvider: 'claude',
        orchestrationModel: 'claude-sonnet-4-6',
        orchestrationStatus: 'awaiting-approval',
      }),
    ).toEqual({
      provider: 'claude',
      model: 'claude-sonnet-4-6',
      status: 'awaiting-approval',
    });
  });

  test('formats execution status labels for chat summary display', () => {
    expect(executionStatusLabel(undefined)).toBe('Not started');
    expect(executionStatusLabel('awaiting-approval')).toBe('Awaiting approval');
    expect(executionStatusLabel('running')).toBe('Running');
  });

  test('only allows chat for agents whose runtime is ready', () => {
    const runtimes = [
      {
        id: 'claude-runtime',
        kind: 'runtime',
        type: 'claude-runtime',
        name: 'Claude Runtime',
        enabled: true,
        capabilities: ['agent-runtime'],
        config: {},
        status: 'ready',
        prerequisites: [],
      },
      {
        id: 'bedrock-runtime',
        kind: 'runtime',
        type: 'bedrock-runtime',
        name: 'Bedrock Runtime',
        enabled: true,
        capabilities: ['agent-runtime'],
        config: {},
        status: 'missing_prerequisites',
        prerequisites: [],
      },
    ] as any;

    expect(
      canAgentStartChat(
        {
          execution: { runtimeConnectionId: 'claude-runtime' },
        },
        runtimes,
      ),
    ).toBe(true);
    expect(canAgentStartChat({ slug: 'default' }, runtimes)).toBe(false);
  });

  test('prefers direct runtime chat targets before bedrock fallback', () => {
    const runtime = preferredChatRuntime([
      {
        id: 'bedrock-runtime',
        kind: 'runtime',
        type: 'bedrock-runtime',
        name: 'Bedrock Runtime',
        enabled: true,
        capabilities: ['agent-runtime'],
        config: {},
        status: 'ready',
        prerequisites: [],
      },
      {
        id: 'codex-runtime',
        kind: 'runtime',
        type: 'codex-runtime',
        name: 'Codex Runtime',
        enabled: true,
        capabilities: ['agent-runtime'],
        config: { defaultModel: 'gpt-5-codex' },
        status: 'ready',
        prerequisites: [],
      },
    ] as any);

    expect(runtime?.id).toBe('codex-runtime');
    expect(buildRuntimeChatAgent(runtime as any)).toMatchObject({
      slug: '__runtime:codex-runtime',
      name: 'Codex Runtime',
      execution: {
        runtimeConnectionId: 'codex-runtime',
        modelId: 'gpt-5-codex',
      },
    });
  });
});
