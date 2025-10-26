// @vitest-environment node

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { validator } from '../validator.js';
import { ConfigLoader } from '../config-loader.js';

const createTempDir = () => mkdtempSync(join(tmpdir(), 'work-agent-test-'));

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
      /Invalid agent configuration:[\s\S]*missing required property 'label'/
    );
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
        2
      ),
      'utf-8'
    );

    writeFileSync(join(agentDir, 'workflows', 'existing.ts'), '// workflow placeholder', 'utf-8');
    writeFileSync(join(agentDir, 'workflows', 'second-workflow.js'), '// another', 'utf-8');
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it('lists workflow metadata with derived labels', async () => {
    const loader = new ConfigLoader({ workAgentDir: workDir });
    const workflows = await loader.listAgentWorkflows('example');

    expect(workflows).toEqual([
      { id: 'existing.ts', label: 'Existing' },
      { id: 'second-workflow.js', label: 'Second Workflow' },
    ]);
  });

  it('reports missing workflow shortcuts during agent listing', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const loader = new ConfigLoader({ workAgentDir: workDir });
    const agents = await loader.listAgents();

    expect(agents[0].workflowWarnings).toEqual(['missing.ts']);
    expect(warnSpy).toHaveBeenCalledWith(
      "Agent 'example' references missing workflows in ui.workflowShortcuts: missing.ts"
    );
    warnSpy.mockRestore();
  });
});
