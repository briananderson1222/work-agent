import { expect, type Page, test } from '@playwright/test';

function json(body: unknown, status = 200) {
  return {
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  };
}

type AgentFixture = {
  slug: string;
  name: string;
  prompt?: string;
  description?: string;
  source?: 'local' | 'acp';
  execution?: {
    runtimeConnectionId: string;
    modelConnectionId?: string;
    modelId?: string;
    runtimeOptions?: Record<string, unknown>;
  };
  toolsConfig?: { mcpServers?: string[]; available?: string[] };
  skills?: string[];
  prompts?: string[];
};

async function seedAgentEditorRoutes(page: Page) {
  let agents: AgentFixture[] = [
    {
      slug: 'managed-one',
      name: 'Managed One',
      prompt: 'You are managed.',
      description: 'Managed agent',
      source: 'local',
      execution: {
        runtimeConnectionId: 'bedrock-runtime',
        modelConnectionId: 'ollama-local',
        modelId: 'gpt-managed',
        runtimeOptions: {},
      },
      toolsConfig: { mcpServers: ['stallion-control'], available: [] },
      skills: [],
      prompts: [],
    },
    {
      slug: 'connected-two',
      name: 'Connected Two',
      prompt: '',
      description: 'Connected agent',
      source: 'local',
      execution: {
        runtimeConnectionId: 'claude-runtime',
        modelId: 'claude-sonnet-4-20250514',
        runtimeOptions: { thinking: true, effort: 'medium' },
      },
    },
    {
      slug: 'kiro-chat',
      name: 'Kiro Chat',
      description: 'ACP chat mode',
      source: 'acp',
      execution: { runtimeConnectionId: 'acp' },
    },
  ];

  const runtimeConnections = [
    {
      id: 'bedrock-runtime',
      kind: 'runtime',
      type: 'bedrock',
      name: 'Managed Runtime',
      description: 'Managed runtime',
      enabled: true,
      capabilities: ['agent-runtime'],
      config: { executionClass: 'managed' },
      status: 'ready',
      prerequisites: [],
      runtimeCatalog: { source: 'static' },
    },
    {
      id: 'claude-runtime',
      kind: 'runtime',
      type: 'claude',
      name: 'Claude Runtime',
      description: 'Connected Claude runtime',
      enabled: true,
      capabilities: ['agent-runtime'],
      config: { executionClass: 'connected' },
      status: 'ready',
      prerequisites: [],
      runtimeCatalog: { source: 'live' },
    },
    {
      id: 'codex-runtime',
      kind: 'runtime',
      type: 'codex',
      name: 'Codex Runtime',
      description: 'Connected Codex runtime',
      enabled: true,
      capabilities: ['agent-runtime'],
      config: { executionClass: 'connected' },
      status: 'ready',
      prerequisites: [],
      runtimeCatalog: { source: 'live' },
    },
  ];

  await page.route(/\/api\/agents(?:\/[^/?]+)?(?:\?.*)?$/, async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    const slug = url.pathname.match(/^\/api\/agents\/([^/]+)$/)?.[1];

    if (url.pathname === '/api/agents' && method === 'GET') {
      await route.fulfill(json({ success: true, data: agents }));
      return;
    }

    if (slug && method === 'GET') {
      const agent = agents.find(
        (entry) => entry.slug === decodeURIComponent(slug),
      );
      if (!agent) {
        await route.fulfill(
          json({ success: false, error: 'Agent not found' }, 404),
        );
        return;
      }
      await route.fulfill(json({ success: true, data: agent }));
      return;
    }

    await route.continue();
  });

  await page.route('**/agents**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const method = route.request().method();

    if (path === '/agents' && method === 'POST') {
      const body = route.request().postDataJSON() as AgentFixture;
      agents = [...agents, body];
      await route.fulfill(json({ success: true, data: body }, 201));
      return;
    }

    const toolsSlug = path.match(/^\/agents\/([^/]+)\/tools$/)?.[1];
    if (toolsSlug && method === 'GET') {
      await route.fulfill(json({ success: true, data: [] }));
      return;
    }

    const agentSlug = path.match(/^\/agents\/([^/]+)$/)?.[1];
    if (agentSlug && method === 'PUT') {
      const slug = decodeURIComponent(agentSlug);
      const body = route.request().postDataJSON() as AgentFixture;
      if (body.name === 'Reject Agent') {
        await route.fulfill(
          json({ success: false, error: 'Agent rejected by policy' }, 400),
        );
        return;
      }
      agents = agents.map((agent) =>
        agent.slug === slug ? { ...agent, ...body, slug } : agent,
      );
      await route.fulfill(
        json({
          success: true,
          data: agents.find((agent) => agent.slug === slug),
        }),
      );
      return;
    }

    if (agentSlug && method === 'DELETE') {
      const slug = decodeURIComponent(agentSlug);
      agents = agents.filter((agent) => agent.slug !== slug);
      await route.fulfill(json({ success: true, data: { deleted: true } }));
      return;
    }

    await route.continue();
  });

  await page.route('**/api/connections/runtimes', async (route) => {
    await route.fulfill(json({ success: true, data: runtimeConnections }));
  });
  await page.route('**/api/connections/models', async (route) => {
    await route.fulfill(
      json({
        success: true,
        data: [
          {
            id: 'ollama-local',
            kind: 'model',
            type: 'ollama',
            name: 'Ollama',
            enabled: true,
            capabilities: ['llm'],
            config: {},
            status: 'ready',
            prerequisites: [],
          },
        ],
      }),
    );
  });
  await page.route('**/api/templates?type=agent', async (route) => {
    await route.fulfill(json({ success: true, data: [] }));
  });
  await page.route('**/integrations', async (route) => {
    await route.fulfill(json({ success: true, data: [] }));
  });
  await page.route('**/api/system/skills', async (route) => {
    await route.fulfill(json({ success: true, data: [] }));
  });
  await page.route('**/api/playbooks', async (route) => {
    await route.fulfill(json({ success: true, data: [] }));
  });
  await page.route('**/acp/connections', async (route) => {
    await route.fulfill(
      json({
        success: true,
        data: [
          {
            id: 'kiro',
            name: 'Kiro ACP',
            command: 'kiro-cli',
            args: ['acp'],
            enabled: true,
            status: 'available',
            modes: [{ id: 'chat', name: 'Chat' }],
            mcpServers: [],
          },
        ],
      }),
    );
  });
  await page.route('**/acp/registry', async (route) => {
    await route.fulfill(json({ success: true, data: [] }));
  });
  await page.route('**/config/app', async (route) => {
    await route.fulfill(
      json({
        success: true,
        data: {
          apiBase: '',
          defaultModel: 'gpt-managed',
          defaultLLMProvider: 'ollama-local',
        },
      }),
    );
  });
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const method = route.request().method();

    if (path === '/api/agents' && method === 'GET') {
      await route.fulfill(json({ success: true, data: agents }));
      return;
    }

    const apiAgentSlug = path.match(/^\/api\/agents\/([^/]+)$/)?.[1];
    if (apiAgentSlug && method === 'GET') {
      const agent = agents.find(
        (entry) => entry.slug === decodeURIComponent(apiAgentSlug),
      );
      if (!agent) {
        await route.fulfill(
          json({ success: false, error: 'Agent not found' }, 404),
        );
        return;
      }
      await route.fulfill(json({ success: true, data: agent }));
      return;
    }

    if (typeof route.fallback === 'function') {
      await route.fallback();
      return;
    }
    await route.continue();
  });
}

test.describe('Agents', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    if (testInfo.title.includes('agent lifecycle covers')) {
      return;
    }
    await page.goto('/agents');
    await page.waitForSelector('.split-pane', { timeout: 15_000 });
  });

  test('agents page loads with agent list', async ({ page }) => {
    // Wait for loading to finish, then check split pane rendered
    await page
      .waitForFunction(
        () =>
          !document
            .querySelector('.split-pane')
            ?.textContent?.includes('Loading'),
        { timeout: 15_000 },
      )
      .catch(() => {});
    await expect(page.locator('.split-pane')).toBeVisible({ timeout: 5_000 });
  });

  test('+ New Agent opens the new agent flow', async ({ page }) => {
    await page.getByRole('button', { name: /^\+ New Agent$/ }).click();

    await page.waitForURL(/\/agents\/new$/, { timeout: 5_000 });
    await expect(page.getByRole('heading', { name: 'New Agent' })).toBeVisible({
      timeout: 5_000,
    });
    const hasTemplatePicker = await page
      .getByRole('heading', { name: 'Start with a template' })
      .isVisible()
      .catch(() => false);

    if (hasTemplatePicker) {
      await expect(
        page.getByRole('button', { name: /Start Blank/ }),
      ).toBeVisible();
    } else {
      await expect(
        page.getByRole('button', { name: 'Create Agent' }),
      ).toBeVisible();
      await expect(page.getByLabel('Name *')).toBeVisible();
    }
  });

  test('agent editor shows tabs for managed agent', async ({ page }) => {
    // Click on the first agent in the list
    await page.locator('.split-pane__item').first().click();

    // Managed agents should show Basic, Skills, Tools, Commands tabs
    await expect(page.getByRole('button', { name: 'Basic' })).toBeVisible({
      timeout: 5_000,
    });
    await expect(page.getByRole('button', { name: 'Skills' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Tools' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Commands' })).toBeVisible();
  });

  test('clicking tabs switches content', async ({ page }) => {
    await page.locator('.split-pane__item').first().click();

    // Click Skills tab
    const skillsTab = page.getByRole('button', { name: 'Skills' });
    const toolsTab = page.getByRole('button', { name: 'Tools' });

    await skillsTab.click();
    await expect(skillsTab).toHaveClass(/page__tab--active/);

    // Click Tools tab
    await toolsTab.click();
    await expect(toolsTab).toHaveClass(/page__tab--active/);
  });

  test('sidebar shows Agents nav item', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Agents' })).toBeVisible({
      timeout: 5_000,
    });
  });

  test('connected agent create flow settles and discard modal stays dismissible', async ({
    page,
  }) => {
    const agents = [
      {
        slug: 'default-agent',
        name: 'Default Agent',
        prompt: 'You are helpful.',
        description: 'Managed agent',
        execution: {
          runtimeConnectionId: 'bedrock-runtime',
        },
      },
    ];

    await page.route('**/api/agents', async (route) => {
      await route.fulfill(json({ success: true, data: agents }));
    });

    await page.route('**/agents', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue();
        return;
      }
      const body = route.request().postDataJSON() as {
        slug: string;
        name: string;
        prompt: string;
        execution: { runtimeConnectionId: string };
      };
      agents.push({
        slug: body.slug,
        name: body.name,
        prompt: body.prompt,
        description: '',
        execution: body.execution,
      });
      await route.fulfill(
        json({ success: true, data: { slug: body.slug, ...body } }, 201),
      );
    });

    await page.route('**/api/agents/*', async (route) => {
      const slug = route.request().url().split('/api/agents/')[1];
      const agent = agents.find((entry) => entry.slug === slug);
      if (!agent) {
        await route.fulfill(
          json({ success: false, error: 'Agent not found' }, 404),
        );
        return;
      }
      await route.fulfill(json({ success: true, data: agent }));
    });

    await page.route('**/agents/*/tools', async (route) => {
      await route.fulfill(json({ success: true, data: [] }));
    });

    await page.route('**/api/connections/runtimes', async (route) => {
      await route.fulfill(
        json({
          success: true,
          data: [
            {
              id: 'bedrock-runtime',
              kind: 'runtime',
              type: 'bedrock',
              name: 'Managed Runtime',
              description: 'Managed runtime',
              enabled: true,
              capabilities: ['agent-runtime'],
              config: { executionClass: 'managed' },
              status: 'ready',
              prerequisites: [],
              runtimeCatalog: { source: 'static' },
            },
            {
              id: 'codex-runtime',
              kind: 'runtime',
              type: 'codex',
              name: 'Codex Runtime',
              description: 'Connected runtime',
              enabled: true,
              capabilities: ['agent-runtime'],
              config: { executionClass: 'connected' },
              status: 'ready',
              prerequisites: [],
              runtimeCatalog: { source: 'static' },
            },
          ],
        }),
      );
    });

    await page.route('**/api/connections/models', async (route) => {
      await route.fulfill(json({ success: true, data: [] }));
    });

    await page.route('**/api/templates?type=agent', async (route) => {
      await route.fulfill(json({ success: true, data: [] }));
    });

    await page.route('**/integrations', async (route) => {
      await route.fulfill(json({ success: true, data: [] }));
    });

    await page.route('**/api/system/skills', async (route) => {
      await route.fulfill(json({ success: true, data: [] }));
    });

    await page.route('**/api/playbooks', async (route) => {
      await route.fulfill(json({ success: true, data: [] }));
    });

    await page.goto('/agents');
    await page.waitForSelector('.split-pane', { timeout: 15_000 });

    await page.getByRole('button', { name: /^\+ New Agent$/ }).click();
    await page.waitForURL(/\/agents\/new$/, { timeout: 5_000 });

    const startBlankButton = page.getByRole('button', { name: /Start Blank/i });
    if (await startBlankButton.isVisible().catch(() => false)) {
      await startBlankButton.click();
    }

    await page.selectOption('#ae-agent-type', 'connected');
    await page.getByLabel('Name *').fill('Connected Agent');

    await page.getByRole('button', { name: 'Create Agent' }).click();

    await expect(
      page.getByRole('button', { name: 'Save Changes' }),
    ).toBeVisible({ timeout: 5_000 });
    await expect(
      page.getByRole('button', { name: 'Create Agent' }),
    ).not.toBeVisible();
    await expect(page).toHaveURL(/\/agents\/connected-agent$/);

    await page.getByRole('button', { name: /^\+ New Agent$/ }).click();
    await expect(page).toHaveURL(/\/agents\/new$/);
    await expect(page.getByRole('dialog')).not.toBeVisible();

    if (await startBlankButton.isVisible().catch(() => false)) {
      await startBlankButton.click();
    }

    await page.getByLabel('Name *').fill('Draft Agent');
    await page.getByRole('button', { name: /^\+ New Agent$/ }).click();

    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(page.getByLabel('Name *')).toHaveValue('Draft Agent');
  });

  test('agent lifecycle covers edits, runtime persistence, delete, failed save, and ACP connections', async ({
    page,
  }) => {
    await seedAgentEditorRoutes(page);
    await page.goto('/agents');
    await page.waitForSelector('.split-pane', { timeout: 15_000 });

    await page.getByRole('button', { name: /Managed One/ }).click();
    await expect(page.getByRole('button', { name: 'Basic' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Skills' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Tools' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Commands' })).toBeVisible();

    await page.getByLabel('Name *').fill('Reject Agent');
    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes('/agents/managed-one') &&
          response.request().method() === 'PUT' &&
          response.status() === 400,
      ),
      page.getByRole('button', { name: 'Save Changes' }).click(),
    ]);
    await expect(page.getByText('Agent rejected by policy')).toBeVisible();

    await page.getByLabel('Name *').fill('Managed One Updated');
    await page
      .getByRole('textbox', { name: /System Prompt/ })
      .fill('You are managed and updated.');
    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes('/agents/managed-one') &&
          response.request().method() === 'PUT' &&
          response.status() === 200,
      ),
      page.getByRole('button', { name: 'Save Changes' }).click(),
    ]);
    await expect(page.getByText('Agent rejected by policy')).not.toBeVisible();
    await expect(page.getByLabel('Name *')).toHaveValue('Managed One Updated');

    await page
      .getByRole('textbox', { name: 'Description' })
      .fill('Unsaved managed description');
    await expect(page.getByLabel('Unsaved changes')).toBeVisible();
    await page.getByRole('button', { name: /Connected Two/ }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(
      page.getByRole('textbox', { name: 'Description' }),
    ).toHaveValue('Unsaved managed description');

    await page
      .getByRole('textbox', { name: 'Description' })
      .fill('Managed description saved');
    await page.getByRole('button', { name: 'Save Changes' }).click();
    await page.getByRole('button', { name: /Connected Two/ }).click();

    await expect(
      page.getByRole('button', { name: 'Basic', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Runtime', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Skills' }),
    ).not.toBeVisible();
    await page.getByRole('button', { name: 'Runtime', exact: true }).click();
    await page.selectOption('#ae-runtime-connection', 'codex-runtime');
    await page.getByLabel('Model ID').fill('gpt-5.5');
    await page.selectOption('#ae-codex-effort', 'high');
    await page.getByText('Enable fast mode').click();
    await expect(page.getByLabel('Enable fast mode')).toBeChecked();
    await page.getByRole('button', { name: 'Save Changes' }).click();
    await expect(page.getByLabel('Model ID')).toHaveValue('gpt-5.5');

    await page.getByRole('button', { name: /Kiro ACP/ }).click();
    await expect(page.getByText('Agent Client Protocol (ACP)')).toBeVisible();
    await expect(page.getByText('kiro-cli')).toBeVisible();
    await expect(page.getByText('1 agents', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: /Managed One Updated/ }).click();
    await page.getByRole('button', { name: 'Delete' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Delete' }).click();
    await expect(
      page.getByRole('button', { name: /Managed One Updated/ }),
    ).not.toBeVisible();
  });
});
