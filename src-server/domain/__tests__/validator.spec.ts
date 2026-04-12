// @vitest-environment node

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigLoader } from '../config-loader.js';
import { validator } from '../validator.js';

// Mock the logger
vi.mock('@voltagent/logger', () => ({
  createPinoLogger: vi.fn(() => ({
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  })),
}));

const createTempDir = () => mkdtempSync(join(tmpdir(), 'stallion-test-'));

describe('Agent schema validation', () => {
  it('accepts ui metadata with quick prompts and workflow shortcuts', () => {
    const spec = {
      name: 'Test Agent',
      prompt: 'Do things.',
      ui: {
        component: 'custom-component',
        quickPrompts: [
          { id: 'hello', label: 'Say Hello', prompt: 'Hello there!' },
        ],
        workflowShortcuts: ['daily-report.ts'],
      },
    };

    expect(() => validator.validateAgentSpec(spec)).not.toThrow();
  });

  it('rejects invalid quick prompt entries', () => {
    const spec = {
      name: 'Broken Agent',
      prompt: 'Does not matter.',
      ui: {
        quickPrompts: [
          // Missing label field
          { id: 'oops', prompt: 'Oops' },
        ],
      },
    } as any;

    expect(() => validator.validateAgentSpec(spec)).toThrowError(
      /Invalid agent configuration:[\s\S]*missing required property 'label'/,
    );
  });

  it('accepts execution metadata for runtime-backed agents', () => {
    const spec = {
      name: 'Claude Runtime Chat',
      prompt: 'You are a project-aware chat assistant.',
      execution: {
        runtimeConnectionId: 'claude-runtime',
        modelId: 'claude-sonnet-4',
        runtimeOptions: {
          thinking: true,
          effort: 'medium',
        },
      },
    };

    expect(() => validator.validateAgentSpec(spec)).not.toThrow();
  });
});

describe('App schema validation', () => {
  it('accepts app config without region', () => {
    const config = {
      defaultModel: 'claude-sonnet',
      invokeModel: 'invoke-model',
      structureModel: 'structure-model',
      approvalGuardian: {
        enabled: true,
        mode: 'enforce',
        model: 'guardian-model',
      },
    };

    expect(() => validator.validateAppConfig(config)).not.toThrow();
  });
});

describe('ConfigLoader workflow metadata', () => {
  let workDir: string;

  beforeEach(() => {
    workDir = createTempDir();
    const agentDir = join(workDir, 'agents', 'example');
    mkdirSync(join(workDir, 'agents'), { recursive: true });
    mkdirSync(join(agentDir, 'workflows'), { recursive: true });

    writeFileSync(
      join(agentDir, 'agent.json'),
      JSON.stringify(
        {
          name: 'Example Agent',
          prompt: 'Prompt',
          ui: {
            workflowShortcuts: ['existing.ts', 'missing.ts'],
          },
        },
        null,
        2,
      ),
      'utf-8',
    );

    writeFileSync(
      join(agentDir, 'workflows', 'existing.ts'),
      '// workflow placeholder',
      'utf-8',
    );
    writeFileSync(
      join(agentDir, 'workflows', 'second-workflow.js'),
      '// another',
      'utf-8',
    );
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it('lists workflow metadata with derived labels', async () => {
    const loader = new ConfigLoader({ projectHomeDir: workDir });
    const workflows = await loader.listAgentWorkflows('example');

    expect(workflows).toEqual([
      expect.objectContaining({
        id: 'existing.ts',
        label: 'Existing',
        filename: 'existing.ts',
      }),
      expect.objectContaining({
        id: 'second-workflow.js',
        label: 'Second Workflow',
        filename: 'second-workflow.js',
      }),
    ]);
  });

  it('reports missing workflow shortcuts during agent listing', async () => {
    const loader = new ConfigLoader({ projectHomeDir: workDir });
    const agents = await loader.listAgents();

    expect(agents[0].workflowWarnings).toEqual(['missing.ts']);

    // Get the mocked logger instance
    const { createPinoLogger } = await import('@voltagent/logger');
    const mockLogger = vi.mocked(createPinoLogger).mock.results[0].value;

    expect(mockLogger.warn).toHaveBeenCalledWith(
      'Agent references missing workflows in ui.workflowShortcuts',
      { agent: 'example', missing: 'missing.ts' },
    );
  });
});
