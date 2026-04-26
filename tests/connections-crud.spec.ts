import { expect, type Page, test } from '@playwright/test';

function json(body: unknown, status = 200) {
  return {
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  };
}

type ModelConnection = {
  id: string;
  kind: 'model';
  type: string;
  name: string;
  enabled: boolean;
  capabilities: string[];
  config: Record<string, unknown>;
  status: string;
  prerequisites: unknown[];
  lastCheckedAt: string | null;
};

type RuntimeConnection = {
  id: string;
  kind: 'runtime';
  type: string;
  name: string;
  description: string;
  enabled: boolean;
  capabilities: string[];
  config: Record<string, unknown>;
  status: string;
  prerequisites: unknown[];
  runtimeCatalog: {
    source: string;
    reason?: string;
    models: Array<{ id: string; name: string }>;
    fallbackModels: Array<{ id: string; name: string }>;
  };
};

type Integration = {
  id: string;
  kind: 'mcp';
  transport: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  displayName: string;
  description: string;
  connected?: boolean;
};

async function seedConnectionsRoutes(page: Page) {
  const state: {
    models: ModelConnection[];
    runtimes: RuntimeConnection[];
    integrations: Integration[];
  } = {
    models: [
      {
        id: 'ollama-local',
        kind: 'model',
        type: 'ollama',
        name: 'Local Ollama',
        enabled: true,
        capabilities: ['llm'],
        config: { baseUrl: 'http://localhost:11434' },
        status: 'ready',
        prerequisites: [],
        lastCheckedAt: null,
      },
    ],
    runtimes: [
      {
        id: 'codex-runtime',
        kind: 'runtime',
        type: 'codex',
        name: 'Codex Runtime',
        description: 'Connected runtime',
        enabled: true,
        capabilities: ['agent-runtime'],
        config: {
          executionClass: 'connected',
          providerLabel: 'Codex Runtime',
          defaultModel: 'codex-mini',
        },
        status: 'ready',
        prerequisites: [],
        runtimeCatalog: {
          source: 'static',
          reason: 'Mock runtime catalog',
          models: [{ id: 'codex-mini', name: 'Codex Mini' }],
          fallbackModels: [],
        },
      },
    ],
    integrations: [
      {
        id: 'filesystem-tools',
        kind: 'mcp',
        transport: 'stdio',
        command: 'npx',
        args: ['-y', '@example/filesystem-tools'],
        displayName: 'Filesystem Tools',
        description: 'Local filesystem helpers',
        connected: false,
      },
    ],
  };

  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const method = route.request().method();

    if (path === '/api/system/status') {
      await route.fulfill(
        json({
          ready: true,
          acp: { connected: false, connections: [] },
          clis: {},
          prerequisites: [],
          providers: {
            configuredChatReady: true,
            configured: [
              {
                id: 'ollama-local',
                type: 'ollama',
                enabled: true,
                capabilities: ['llm'],
              },
            ],
            detected: { ollama: true, bedrock: false },
          },
          capabilities: {
            chat: {
              ready: true,
              source: 'ollama-local',
            },
          },
          recommendation: {
            code: 'configured-chat-ready',
            type: 'providers',
            actionLabel: 'Manage Connections',
            title: 'Connections ready',
            detail: 'Mocked connection inventory',
          },
        }),
      );
      return;
    }

    if (path === '/api/system/capabilities') {
      await route.fulfill(
        json({
          runtime: 'voltagent',
          voice: { stt: [], tts: [] },
          context: { providers: [] },
          scheduler: true,
        }),
      );
      return;
    }

    if (path === '/api/auth/status') {
      await route.fulfill(json({ authenticated: true, user: null }));
      return;
    }

    if (path === '/api/branding') {
      await route.fulfill(json({ success: true, data: {} }));
      return;
    }

    if (path === '/config/app') {
      await route.fulfill(
        json({
          success: true,
          data: { defaultModel: 'codex-mini', region: 'us-east-1' },
        }),
      );
      return;
    }

    if (path === '/api/agents') {
      await route.fulfill(json({ success: true, data: [] }));
      return;
    }

    if (path === '/api/projects') {
      await route.fulfill(json({ success: true, data: [] }));
      return;
    }

    if (path === '/api/models') {
      await route.fulfill(json({ success: true, data: [] }));
      return;
    }

    if (path === '/api/knowledge/status') {
      await route.fulfill(
        json({
          success: true,
          data: {
            vectorDb: null,
            embedding: null,
            stats: { totalDocuments: 0, totalChunks: 0, projectCount: 0 },
          },
        }),
      );
      return;
    }

    if (path === '/api/connections' && method === 'GET') {
      await route.fulfill(
        json({ success: true, data: [...state.models, ...state.runtimes] }),
      );
      return;
    }

    if (path === '/api/connections' && method === 'POST') {
      const body = route.request().postDataJSON() as ModelConnection;
      state.models.push(body);
      await route.fulfill(json({ success: true, data: body }));
      return;
    }

    if (path === '/api/connections/models') {
      await route.fulfill(json({ success: true, data: state.models }));
      return;
    }

    if (path === '/api/connections/runtimes') {
      await route.fulfill(json({ success: true, data: state.runtimes }));
      return;
    }

    const connectionMatch = path.match(
      /^\/api\/connections\/([^/]+)(?:\/test)?$/,
    );
    if (connectionMatch) {
      const id = decodeURIComponent(connectionMatch[1]);
      const isTest = path.endsWith('/test');
      const existingModel = state.models.find((entry) => entry.id === id);
      const existingRuntime = state.runtimes.find((entry) => entry.id === id);

      if (isTest && method === 'POST') {
        await route.fulfill(
          json({
            success: true,
            data: { healthy: true, status: 'ready' },
          }),
        );
        return;
      }

      if (method === 'GET') {
        const connection = existingModel ?? existingRuntime;
        if (!connection) {
          await route.fulfill(
            json({ success: false, error: 'Not found' }, 404),
          );
          return;
        }
        await route.fulfill(json({ success: true, data: connection }));
        return;
      }

      if (method === 'PUT') {
        const body = route.request().postDataJSON() as
          | ModelConnection
          | RuntimeConnection;
        if (existingModel) {
          Object.assign(existingModel, body);
          await route.fulfill(json({ success: true, data: existingModel }));
          return;
        }
        if (existingRuntime) {
          Object.assign(existingRuntime, body);
          await route.fulfill(json({ success: true, data: existingRuntime }));
          return;
        }
      }

      if (method === 'DELETE' && existingRuntime) {
        existingRuntime.name = 'Codex Runtime';
        existingRuntime.enabled = true;
        await route.fulfill(json({ success: true, data: existingRuntime }));
        return;
      }

      if (method === 'DELETE' && existingModel) {
        state.models = state.models.filter((entry) => entry.id !== id);
        await route.fulfill(json({ success: true }));
        return;
      }
    }

    await route.fulfill(json({ success: true, data: [] }));
  });

  await page.route('**/integrations**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const method = route.request().method();

    if (path === '/integrations' && method === 'GET') {
      await route.fulfill(json({ success: true, data: state.integrations }));
      return;
    }

    if (path === '/integrations' && method === 'POST') {
      const body = route.request().postDataJSON() as Integration;
      state.integrations.push(body);
      await route.fulfill(json({ success: true, data: body }));
      return;
    }

    const integrationMatch = path.match(
      /^\/integrations\/([^/]+)(?:\/reconnect)?$/,
    );
    if (integrationMatch) {
      const id = decodeURIComponent(integrationMatch[1]);
      const existing = state.integrations.find((entry) => entry.id === id);

      if (path.endsWith('/reconnect') && method === 'POST') {
        if (existing) existing.connected = true;
        await route.fulfill(json({ success: true }));
        return;
      }

      if (method === 'GET') {
        if (!existing) {
          await route.fulfill(
            json({ success: false, error: 'Not found' }, 404),
          );
          return;
        }
        await route.fulfill(json({ success: true, data: existing }));
        return;
      }

      if (method === 'PUT') {
        const body = route.request().postDataJSON() as Integration;
        if (existing) {
          Object.assign(existing, body);
          await route.fulfill(json({ success: true, data: existing }));
          return;
        }
      }

      if (method === 'DELETE') {
        state.integrations = state.integrations.filter(
          (entry) => entry.id !== id,
        );
        await route.fulfill(json({ success: true }));
        return;
      }
    }

    await route.fulfill(json({ success: true, data: [] }));
  });

  await page.route('**/acp/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;

    if (path === '/acp/connections') {
      await route.fulfill(json({ success: true, data: [] }));
      return;
    }

    if (path === '/acp/registry') {
      await route.fulfill(
        json({
          success: true,
          data: [
            {
              id: 'kiro',
              name: 'Kiro CLI',
              command: 'kiro',
              args: ['--acp'],
              description: 'Connect Kiro through ACP',
              installed: false,
            },
          ],
        }),
      );
      return;
    }

    await route.fulfill(json({ success: true, data: [] }));
  });
}

async function forceClickRole(
  page: Page,
  role: 'button',
  name: RegExp | string,
) {
  await page
    .getByRole(role, { name })
    .first()
    .evaluate((el) =>
      el.dispatchEvent(new MouseEvent('click', { bubbles: true })),
    );
}

async function fillStable(page: Page, selector: string, value: string) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const locator = page.locator(selector).first();
    try {
      await locator.fill(value, { timeout: 1000 });
      if ((await locator.inputValue().catch(() => '')) === value) {
        return;
      }
    } catch {}
    await locator.waitFor({ state: 'visible', timeout: 1000 }).catch(() => {});
  }

  throw new Error(`Failed to fill stable input: ${selector}`);
}

test.describe('Connections CRUD', () => {
  test.beforeEach(async ({ page }) => {
    await seedConnectionsRoutes(page);
  });

  test('connections hub renders core sections', async ({ page }) => {
    await page.goto('/connections');

    await expect(
      page.getByRole('heading', { name: 'Connections' }),
    ).toBeVisible();
    await expect(page.getByText('Model Connections')).toBeVisible();
    await expect(
      page.getByRole('button', { name: /Local Ollama/ }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /Codex Runtime/ }),
    ).toBeVisible();
    await expect(page.getByText('ACP Connections')).toBeVisible();
    await expect(page.getByRole('button', { name: /Kiro CLI/ })).toBeVisible();
    await expect(
      page.getByRole('button', { name: /Filesystem Tools/ }),
    ).toBeVisible();
  });

  test('provider create flow and runtime save flow settle', async ({
    page,
  }) => {
    await page.goto('/connections/providers');

    await expect(
      page.getByRole('heading', { name: 'Model Connections' }),
    ).toBeVisible();
    await forceClickRole(page, 'button', '+ Add Model Connection');
    await expect(
      page.getByRole('heading', { name: 'Add Model Connection' }),
    ).toBeVisible();
    await forceClickRole(page, 'button', /Ollama/);
    await fillStable(
      page,
      'input[placeholder="My Model Connection"]',
      'Team Ollama',
    );
    await page.locator('.editor-btn--primary').click();

    await expect(
      page.locator('input[placeholder="My Model Connection"]'),
    ).toHaveValue('Team Ollama');
    await expect(page.getByRole('button', { name: 'Save' })).toBeVisible();

    await page.goto('/connections/runtimes/codex-runtime');
    await fillStable(
      page,
      '.editor-field .editor-input',
      'Codex Runtime Updated',
    );
    await page.getByRole('button', { name: 'Save Changes' }).click();

    await expect(
      page.locator('.editor-field .editor-input').first(),
    ).toHaveValue('Codex Runtime Updated');
    await page.getByRole('button', { name: 'Test Connection' }).click();
    await expect(page.getByText(/Healthy/)).toBeVisible();
  });

  test('tool server create and delete flows settle', async ({ page }) => {
    await page.goto('/connections/tools');

    await expect(
      page.getByRole('heading', { name: 'Tool Servers' }),
    ).toBeVisible();
    await forceClickRole(page, 'button', '+ Add Tool Server');
    await page.waitForSelector('#int-id', { timeout: 15_000 });
    await fillStable(page, '#int-id', 'browser-tools');
    await fillStable(page, '#int-name', 'Browser Tools');
    await fillStable(page, '#int-cmd', 'npx');
    await fillStable(page, '#int-args', '-y @example/browser-tools');
    await page.locator('.editor-btn--primary').click();

    await expect(page.getByText('Saved')).toBeVisible();
    await expect(page.locator('#int-name')).toHaveValue('Browser Tools');

    await page.getByRole('button', { name: 'Delete' }).click();
    await page.getByRole('button', { name: 'Delete' }).last().click();

    await expect(page.locator('#int-name')).not.toBeVisible();
  });
});
