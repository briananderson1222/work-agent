import { describe, expect, test } from 'vitest';
import {
  buildAgentPayload,
  createEmptyAgentForm,
  createNewAgentForm,
  formFromAgent,
  groupAgentToolsByServer,
  isAgentFormDirty,
  validateAgentForm,
} from '../views/agent-editor/agentsViewUtils';

describe('agents view utils', () => {
  test('createEmptyAgentForm returns a fresh editable form', () => {
    const first = createEmptyAgentForm();
    const second = createEmptyAgentForm();

    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(first.tools).not.toBe(second.tools);
    expect(first.execution).not.toBe(second.execution);
  });

  test('formFromAgent normalizes persisted agent data into form data', () => {
    expect(
      formFromAgent({
        slug: 'agent-1',
        name: 'Agent One',
        description: 'Desc',
        prompt: 'Prompt',
        model: { modelId: 'bedrock-model' },
        region: 'us-east-1',
        guardrails: { temperature: 0.2 },
        maxSteps: 7,
        toolsConfig: {
          mcpServers: ['server-1'],
          available: ['server-1_tool-a'],
          autoApprove: ['server-1_tool-a'],
        },
        execution: {
          runtimeConnectionId: 'runtime-1',
          modelConnectionId: 'model-1',
          runtimeOptions: { timeout: 30 },
        },
        icon: '🧠',
        skills: ['skill-a'],
        prompts: ['prompt-a'],
      }),
    ).toEqual({
      slug: 'agent-1',
      name: 'Agent One',
      description: 'Desc',
      prompt: 'Prompt',
      modelId: 'bedrock-model',
      region: 'us-east-1',
      guardrails: { temperature: 0.2 },
      maxSteps: '7',
      tools: {
        mcpServers: ['server-1'],
        available: ['server-1_tool-a'],
        autoApprove: ['server-1_tool-a'],
      },
      execution: {
        runtimeConnectionId: 'runtime-1',
        modelConnectionId: 'model-1',
        runtimeOptions: { timeout: 30 },
      },
      icon: '🧠',
      skills: ['skill-a'],
      prompts: ['prompt-a'],
    });
  });

  test('createNewAgentForm merges template form data onto a fresh base form', () => {
    const next = createNewAgentForm(
      {
        name: 'Template Agent',
        tools: { mcpServers: ['server-2'], available: [], autoApprove: [] },
      },
      'managed-runtime',
    );

    expect(next.name).toBe('Template Agent');
    expect(next.tools.mcpServers).toEqual(['server-2']);
    expect(next.execution.runtimeConnectionId).toBe('managed-runtime');
  });

  test('validateAgentForm enforces required fields and slug rules for new agents', () => {
    expect(validateAgentForm(createEmptyAgentForm(), true)).toEqual({
      name: 'Name is required',
      prompt: 'System prompt is required',
      slug: 'Slug is required',
    });

    expect(
      validateAgentForm(
        {
          ...createEmptyAgentForm(),
          name: 'Agent',
          prompt: 'Prompt',
          slug: 'Bad Slug',
        },
        true,
      ),
    ).toEqual({
      slug: 'Lowercase letters, numbers, hyphens only',
    });

    expect(
      validateAgentForm(
        {
          ...createEmptyAgentForm(),
          name: 'Agent',
          prompt: 'Prompt',
        },
        false,
      ),
    ).toEqual({});
  });

  test('validateAgentForm allows empty prompts for connected runtimes only', () => {
    expect(
      validateAgentForm(
        {
          ...createEmptyAgentForm(),
          name: 'Connected Agent',
          prompt: '',
          execution: {
            runtimeConnectionId: 'codex-runtime',
            modelConnectionId: '',
            runtimeOptions: {},
          },
        },
        true,
        'connected',
      ),
    ).toEqual({
      slug: 'Slug is required',
    });

    expect(
      validateAgentForm(
        {
          ...createEmptyAgentForm(),
          name: 'Managed Agent',
          prompt: '',
          execution: {
            runtimeConnectionId: 'bedrock-runtime',
            modelConnectionId: '',
            runtimeOptions: {},
          },
        },
        false,
        'managed',
      ),
    ).toEqual({
      prompt: 'System prompt is required',
    });
  });

  test('buildAgentPayload strips empty fields and preserves runtime settings', () => {
    expect(
      buildAgentPayload({
        ...createEmptyAgentForm(),
        slug: 'agent-1',
        name: 'Agent One',
        description: '',
        prompt: 'Prompt',
        modelId: 'model-1',
        region: 'us-east-1',
        guardrails: null,
        maxSteps: '12',
        tools: {
          mcpServers: ['server-1'],
          available: [],
          autoApprove: [],
        },
        execution: {
          runtimeConnectionId: 'runtime-1',
          modelConnectionId: '',
          runtimeOptions: { timeout: 30 },
        },
        icon: '',
        skills: [],
        prompts: ['prompt-a'],
      }),
    ).toEqual({
      slug: 'agent-1',
      name: 'Agent One',
      description: undefined,
      prompt: 'Prompt',
      model: 'model-1',
      region: 'us-east-1',
      guardrails: undefined,
      maxSteps: 12,
      tools: {
        mcpServers: ['server-1'],
        available: [],
        autoApprove: [],
      },
      execution: {
        runtimeConnectionId: 'runtime-1',
        modelConnectionId: undefined,
        modelId: 'model-1',
        runtimeOptions: { timeout: 30 },
      },
      icon: undefined,
      skills: undefined,
      prompts: ['prompt-a'],
    });
  });

  test('buildAgentPayload preserves an empty prompt for connected runtimes', () => {
    expect(
      buildAgentPayload({
        ...createEmptyAgentForm(),
        slug: 'connected-agent',
        name: 'Connected Agent',
        prompt: '',
        execution: {
          runtimeConnectionId: 'codex-runtime',
          modelConnectionId: '',
          runtimeOptions: {},
        },
      }),
    ).toMatchObject({
      slug: 'connected-agent',
      name: 'Connected Agent',
      prompt: '',
      execution: {
        runtimeConnectionId: 'codex-runtime',
        modelId: undefined,
      },
    });
  });

  test('groupAgentToolsByServer groups tool definitions by server name', () => {
    expect(
      groupAgentToolsByServer([
        { id: '1', name: 'One', server: 'alpha' },
        { id: '2', name: 'Two', server: 'beta' },
        { id: '3', name: 'Three', server: 'alpha' },
        { id: '4', name: 'No server' },
      ]),
    ).toEqual({
      alpha: [
        { id: '1', name: 'One', server: 'alpha' },
        { id: '3', name: 'Three', server: 'alpha' },
      ],
      beta: [{ id: '2', name: 'Two', server: 'beta' }],
    });
  });

  test('isAgentFormDirty compares the full form payload', () => {
    const base = createEmptyAgentForm();

    expect(isAgentFormDirty(base, base)).toBe(false);
    expect(
      isAgentFormDirty(
        {
          ...base,
          name: 'Changed',
        },
        base,
      ),
    ).toBe(true);
  });
});
