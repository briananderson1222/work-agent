import { describe, expect, test } from 'vitest';
import {
  buildProviderOptions,
  buildRuntimeChatAgent,
  canAgentStartChat,
  executionStatusLabel,
  formatExecutionSummary,
  preferredChatRuntime,
  preferredConnectedRuntime,
  resolveAgentExecution,
  resolveBindingStatus,
  resolveEffectiveCapabilityState,
  resolveGlobalProviderManagedExecution,
  resolveProjectProviderManagedExecution,
  resolveSessionExecutionSummary,
  runtimeConnectionIdToProviderKind,
  supportsProviderManagedBinding,
} from '../utils/execution';

describe('execution utils', () => {
  test('maps runtime connections to providers', () => {
    expect(runtimeConnectionIdToProviderKind('claude-runtime')).toBe('claude');
    expect(runtimeConnectionIdToProviderKind('codex-runtime')).toBe('codex');
    expect(runtimeConnectionIdToProviderKind('bedrock-runtime')).toBe(
      'bedrock',
    );
    expect(runtimeConnectionIdToProviderKind('custom-runtime')).toBe('custom');
    expect(runtimeConnectionIdToProviderKind('unknown-runtime')).toBe(
      'unknown',
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
    ).toBe('Claude Code · claude-sonnet');
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
        name: 'Managed Runtime',
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
        name: 'Managed Runtime',
        enabled: true,
        capabilities: ['agent-runtime'],
        config: { executionClass: 'managed' },
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
        config: {
          executionClass: 'connected',
          defaultModel: 'gpt-5-codex',
        },
        status: 'ready',
        runtimeCatalog: {
          source: 'live',
          models: [
            {
              id: 'gpt-5-codex',
              name: 'GPT-5 Codex',
              originalId: 'gpt-5-codex',
            },
          ],
          fallbackModels: [],
        },
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
      modelOptions: [
        {
          id: 'gpt-5-codex',
          name: 'GPT-5 Codex',
          originalId: 'gpt-5-codex',
        },
      ],
    });
  });

  test('prefers connected runtimes when choosing a connected agent default', () => {
    const runtime = preferredConnectedRuntime([
      {
        id: 'bedrock-runtime',
        kind: 'runtime',
        type: 'bedrock-runtime',
        name: 'Managed Runtime',
        enabled: true,
        capabilities: ['agent-runtime'],
        config: { executionClass: 'managed' },
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
        config: { executionClass: 'connected' },
        status: 'ready',
        prerequisites: [],
      },
    ] as any);

    expect(runtime?.id).toBe('codex-runtime');
  });

  test('resolves provider-managed execution for project-scoped chat', () => {
    const resolved = resolveProjectProviderManagedExecution(
      {
        defaultProviderId: 'ollama-local',
        defaultModel: 'llama3.2',
      },
      [
        {
          id: 'ollama-local',
          kind: 'model',
          type: 'ollama',
          name: 'Local Ollama',
          enabled: true,
          capabilities: ['llm'],
          config: {},
          status: 'ready',
          prerequisites: [],
        },
      ] as any,
    );

    expect(resolved).toEqual({
      executionMode: 'provider-managed',
      executionScope: 'project',
      provider: 'ollama',
      providerId: 'ollama-local',
      model: 'llama3.2',
      providerOptions: {},
    });
  });

  test('resolves provider-managed execution for bedrock-backed project defaults', () => {
    expect(
      resolveProjectProviderManagedExecution(
        {
          defaultProviderId: 'bedrock-default',
          defaultModel: 'claude-sonnet',
        },
        [
          {
            id: 'bedrock-default',
            kind: 'model',
            type: 'bedrock',
            name: 'Bedrock',
            enabled: true,
            capabilities: ['llm'],
            config: {},
            status: 'ready',
            prerequisites: [],
          },
        ] as any,
      ),
    ).toEqual({
      executionMode: 'provider-managed',
      executionScope: 'project',
      provider: 'bedrock',
      providerId: 'bedrock-default',
      model: 'claude-sonnet',
      providerOptions: {},
    });
    expect(resolveProjectProviderManagedExecution(null, [] as any)).toBeNull();
  });

  test('resolves a global provider-managed fallback when there is exactly one llm provider', () => {
    const resolved = resolveGlobalProviderManagedExecution(
      {
        defaultModel: 'llama3.2',
      },
      [
        {
          id: 'ollama-local',
          kind: 'model',
          type: 'ollama',
          name: 'Local Ollama',
          enabled: true,
          capabilities: ['llm'],
          config: {},
          status: 'ready',
          prerequisites: [],
        },
      ] as any,
    );

    expect(resolved).toEqual({
      executionMode: 'provider-managed',
      executionScope: 'global',
      provider: 'ollama',
      providerId: 'ollama-local',
      model: 'llama3.2',
      providerOptions: {},
    });
  });

  test('falls back to a provider-supported model when the requested model is invalid for that provider', () => {
    const resolved = resolveProjectProviderManagedExecution(
      {
        defaultProviderId: 'ollama-local',
        defaultModel: 'claude-sonnet-4-6',
      },
      [
        {
          id: 'ollama-local',
          kind: 'model',
          type: 'ollama',
          name: 'Local Ollama',
          enabled: true,
          capabilities: ['llm'],
          config: {
            defaultModel: 'llama3.2',
            modelOptions: [{ id: 'llama3.2', name: 'Llama 3.2' }],
          },
          status: 'ready',
          prerequisites: [],
        },
      ] as any,
    );

    expect(resolved).toEqual({
      executionMode: 'provider-managed',
      executionScope: 'project',
      provider: 'ollama',
      providerId: 'ollama-local',
      model: 'llama3.2',
      providerOptions: {},
    });
  });

  test('marks provider-managed bindings as incompatible for agents that require MCP', () => {
    expect(
      supportsProviderManagedBinding({
        slug: 'default',
        toolsConfig: { mcpServers: ['stallion-control'] },
      } as any),
    ).toBe(false);
    expect(
      supportsProviderManagedBinding({
        slug: 'chat-helper',
        toolsConfig: { mcpServers: [] },
      } as any),
    ).toBe(true);
  });

  test('derives effective capability state from the current binding', () => {
    expect(
      resolveEffectiveCapabilityState({
        agent: {
          slug: 'default',
          toolsConfig: { mcpServers: ['stallion-control'] },
          execution: { runtimeConnectionId: 'bedrock-runtime' },
        } as any,
        runtimeConnection: {
          id: 'bedrock-runtime',
          kind: 'runtime',
          type: 'bedrock-runtime',
          name: 'Managed Runtime',
          enabled: true,
          capabilities: ['agent-runtime'],
          config: { executionClass: 'managed' },
          status: 'ready',
          prerequisites: [],
        } as any,
        hasModelCatalog: true,
      }),
    ).toEqual({
      system_prompt: true,
      mcp: true,
      tool_execution: true,
      model_catalog: true,
      model_selection: true,
    });

    expect(
      resolveEffectiveCapabilityState({
        agent: {
          slug: 'default',
          toolsConfig: { mcpServers: ['stallion-control'] },
        } as any,
        chatState: {
          executionMode: 'provider-managed',
        } as any,
        hasModelCatalog: true,
      }),
    ).toEqual({
      system_prompt: true,
      mcp: false,
      tool_execution: false,
      model_catalog: false,
      model_selection: false,
    });

    expect(
      resolveEffectiveCapabilityState({
        agent: {
          slug: '__runtime:claude-runtime',
          execution: { runtimeConnectionId: 'claude-runtime' },
        } as any,
        chatState: {
          executionMode: 'runtime',
          runtimeConnectionId: 'claude-runtime',
        } as any,
        hasModelCatalog: false,
      }),
    ).toEqual({
      system_prompt: true,
      mcp: false,
      tool_execution: false,
      model_catalog: false,
      model_selection: false,
    });

    expect(
      resolveEffectiveCapabilityState({
        agent: {
          slug: '__runtime:claude-runtime',
          execution: { runtimeConnectionId: 'claude-runtime' },
          modelOptions: [{ id: 'claude-sonnet', name: 'Claude Sonnet' }],
        } as any,
        chatState: {
          executionMode: 'runtime',
          runtimeConnectionId: 'claude-runtime',
        } as any,
        hasModelCatalog: true,
      }),
    ).toEqual({
      system_prompt: true,
      mcp: false,
      tool_execution: false,
      model_catalog: true,
      model_selection: true,
    });
  });

  test('resolves binding status from runtime catalog metadata', () => {
    expect(
      resolveBindingStatus({
        agent: {
          slug: '__runtime:codex-runtime',
          execution: { runtimeConnectionId: 'codex-runtime' },
        } as any,
        chatState: {
          executionMode: 'runtime',
          runtimeConnectionId: 'codex-runtime',
        } as any,
        runtimeConnection: {
          id: 'codex-runtime',
          kind: 'runtime',
          type: 'codex-runtime',
          name: 'Codex Runtime',
          enabled: true,
          capabilities: ['agent-runtime'],
          config: {},
          status: 'degraded',
          prerequisites: [],
          runtimeCatalog: {
            source: 'fallback',
            reason: 'Live catalog unavailable.',
            models: [],
            fallbackModels: [
              {
                id: 'gpt-5.5',
                name: 'GPT-5.5',
                originalId: 'gpt-5.5',
              },
            ],
          },
        } as any,
      }),
    ).toEqual({
      catalogSource: 'fallback',
      catalogReason: 'Live catalog unavailable.',
      bindingReadiness: 'degraded',
      capabilityState: {
        system_prompt: true,
        mcp: false,
        tool_execution: false,
        model_catalog: true,
        model_selection: true,
      },
      visibleModels: [
        {
          id: 'gpt-5.5',
          name: 'GPT-5.5',
          originalId: 'gpt-5.5',
        },
      ],
    });
  });
});
