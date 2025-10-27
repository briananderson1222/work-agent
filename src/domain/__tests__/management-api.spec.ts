// @vitest-environment node

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { ConfigLoader } from '../config-loader.js';
import type { AgentSpec } from '../types.js';

const createTempDir = () => mkdtempSync(join(tmpdir(), 'work-agent-mgmt-test-'));

describe('Agent CRUD operations', () => {
  let tempDir: string;
  let loader: ConfigLoader;

  beforeEach(() => {
    tempDir = createTempDir();
    loader = new ConfigLoader({ workAgentDir: tempDir });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates a new agent with generated slug', async () => {
    const spec: AgentSpec = {
      name: 'Test Agent',
      prompt: 'You are a test agent.',
    };

    const { slug, spec: created } = await loader.createAgent(spec);

    expect(slug).toBe('test-agent');
    expect(created.name).toBe('Test Agent');
    expect(created.prompt).toBe('You are a test agent.');

    // Verify it can be loaded
    const loaded = await loader.loadAgent(slug);
    expect(loaded.name).toBe('Test Agent');
  });

  it('generates slug from special characters in name', async () => {
    const spec: AgentSpec = {
      name: 'My Super-Cool Agent!',
      prompt: 'Test',
    };

    const { slug } = await loader.createAgent(spec);
    expect(slug).toBe('my-super-cool-agent');
  });

  it('throws error if agent already exists', async () => {
    const spec: AgentSpec = {
      name: 'Duplicate',
      prompt: 'Test',
    };

    await loader.createAgent(spec);

    await expect(loader.createAgent(spec)).rejects.toThrow(
      "Agent with slug 'duplicate' already exists"
    );
  });

  it('updates an existing agent', async () => {
    const spec: AgentSpec = {
      name: 'Original',
      prompt: 'Original prompt',
    };

    const { slug } = await loader.createAgent(spec);

    const updated = await loader.updateAgent(slug, {
      prompt: 'Updated prompt',
      model: 'new-model',
    });

    expect(updated.name).toBe('Original'); // unchanged
    expect(updated.prompt).toBe('Updated prompt');
    expect(updated.model).toBe('new-model');
  });

  it('deletes an agent', async () => {
    const spec: AgentSpec = {
      name: 'To Delete',
      prompt: 'Will be deleted',
    };

    const { slug } = await loader.createAgent(spec);

    await expect(loader.agentExists(slug)).resolves.toBe(true);

    await loader.deleteAgent(slug);

    await expect(loader.agentExists(slug)).resolves.toBe(false);
  });
});

describe('Workflow file operations', () => {
  let tempDir: string;
  let loader: ConfigLoader;
  let agentSlug: string;

  beforeEach(async () => {
    tempDir = createTempDir();
    loader = new ConfigLoader({ workAgentDir: tempDir });

    const spec: AgentSpec = {
      name: 'Workflow Test Agent',
      prompt: 'Test',
    };

    const result = await loader.createAgent(spec);
    agentSlug = result.slug;
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates a new workflow file', async () => {
    const content = `
import { andThen } from '@voltagent/core';

export default andThen(() => 'Hello from workflow');
`;

    await loader.createWorkflow(agentSlug, 'test-workflow.ts', content);

    const workflows = await loader.listAgentWorkflows(agentSlug);
    expect(workflows).toHaveLength(1);
    expect(workflows[0].id).toBe('test-workflow.ts');
    expect(workflows[0].label).toBe('Test Workflow');
  });

  it('reads workflow file content', async () => {
    const content = 'export default () => "test";';
    await loader.createWorkflow(agentSlug, 'read-test.ts', content);

    const read = await loader.readWorkflow(agentSlug, 'read-test.ts');
    expect(read).toBe(content);
  });

  it('updates workflow file content', async () => {
    await loader.createWorkflow(agentSlug, 'update-test.ts', 'original');

    await loader.updateWorkflow(agentSlug, 'update-test.ts', 'updated');

    const content = await loader.readWorkflow(agentSlug, 'update-test.ts');
    expect(content).toBe('updated');
  });

  it('deletes a workflow file', async () => {
    await loader.createWorkflow(agentSlug, 'delete-test.ts', 'content');

    const beforeDelete = await loader.listAgentWorkflows(agentSlug);
    expect(beforeDelete).toHaveLength(1);

    await loader.deleteWorkflow(agentSlug, 'delete-test.ts');

    const afterDelete = await loader.listAgentWorkflows(agentSlug);
    expect(afterDelete).toHaveLength(0);
  });

  it('throws error for invalid file extension', async () => {
    await expect(
      loader.createWorkflow(agentSlug, 'bad.txt', 'content')
    ).rejects.toThrow('Workflow filename must end with .ts, .js, .mjs, or .cjs');
  });
});

describe('App config operations', () => {
  let tempDir: string;
  let loader: ConfigLoader;

  beforeEach(() => {
    tempDir = createTempDir();
    loader = new ConfigLoader({ workAgentDir: tempDir });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('loads default app config on first run', async () => {
    const config = await loader.loadAppConfig();

    expect(config.region).toBe('us-east-1');
    expect(config.defaultModel).toBe('anthropic.claude-3-5-sonnet-20240620-v1:0');
  });

  it('updates app config', async () => {
    await loader.loadAppConfig(); // Create default

    const updated = await loader.updateAppConfig({
      region: 'us-west-2',
    });

    expect(updated.region).toBe('us-west-2');
    expect(updated.defaultModel).toBe('anthropic.claude-3-5-sonnet-20240620-v1:0'); // unchanged
  });
});
