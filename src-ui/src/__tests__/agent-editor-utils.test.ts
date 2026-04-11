import { describe, expect, test } from 'vitest';
import type { Tool } from '../types';
import {
  getAgentType,
  getEditorTabs,
  removeIntegration,
  slugify,
  toggleIntegrationAutoApprove,
  toggleIntegrationToolAutoApprove,
  toggleIntegrationToolEnabled,
} from '../views/agent-editor/utils';
import type { AgentFormData } from '../views/agent-editor/types';

const toolList: Tool[] = [
  {
    id: 'shell',
    name: 'Shell',
    toolName: 'run',
    description: 'Run shell commands',
  },
  {
    id: 'search',
    name: 'Search',
    toolName: 'find',
    description: 'Find files',
  },
] as Tool[];

function buildForm(): AgentFormData {
  return {
    slug: 'planner',
    name: 'Planner',
    description: '',
    prompt: '',
    modelId: '',
    region: '',
    guardrails: null,
    maxSteps: '',
    tools: {
      mcpServers: ['github'],
      available: [],
      autoApprove: [],
    },
    execution: {
      runtimeConnectionId: 'bedrock-runtime',
      modelConnectionId: '',
      runtimeOptions: {},
    },
    icon: '',
    skills: [],
    prompts: [],
  };
}

describe('agent-editor utils', () => {
  test('slugify normalizes names', () => {
    expect(slugify('My Planner Agent')).toBe('my-planner-agent');
    expect(slugify('  Review++ Agent  ')).toBe('review-agent');
  });

  test('agent type and tabs reflect runtime selection', () => {
    expect(getAgentType('bedrock-runtime')).toBe('managed');
    expect(getAgentType('acp')).toBe('acp');
    expect(getAgentType('codex-runtime')).toBe('connected');
    expect(getEditorTabs('managed').map((tab) => tab.key)).toEqual([
      'basic',
      'skills',
      'tools',
      'commands',
    ]);
  });

  test('removeIntegration clears matching tool state', () => {
    const form = {
      ...buildForm(),
      tools: {
        mcpServers: ['github'],
        available: ['github_run', 'github_find'],
        autoApprove: ['github_*', 'github_run'],
      },
    };

    expect(removeIntegration(form, 'github').tools).toEqual({
      mcpServers: [],
      available: [],
      autoApprove: [],
    });
  });

  test('tool toggles expand implicit all-tools state into explicit lists', () => {
    const base = buildForm();
    const disabled = toggleIntegrationToolEnabled(
      base,
      'github',
      'github_run',
      toolList,
    );
    expect(disabled.tools.available.sort()).toEqual(['github_find']);

    const reenabled = toggleIntegrationToolEnabled(
      disabled,
      'github',
      'github_run',
      toolList,
    );
    expect(reenabled.tools.available.sort()).toEqual([
      'github_find',
      'github_run',
    ]);
  });

  test('auto-approve toggles between wildcard and explicit tool approvals', () => {
    const base = buildForm();
    const wildcard = toggleIntegrationAutoApprove(base, 'github');
    expect(wildcard.tools.autoApprove).toEqual(['github_*']);

    const explicit = toggleIntegrationToolAutoApprove(
      wildcard,
      'github',
      'github_run',
      toolList,
    );
    expect(explicit.tools.autoApprove.sort()).toEqual(['github_find']);
  });
});
