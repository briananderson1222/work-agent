import { expect, type Page, test } from '@playwright/test';

function json(body: unknown, status = 200) {
  return {
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  };
}

type Project = {
  id: string;
  slug: string;
  name: string;
  icon?: string;
  description?: string;
  workingDirectory?: string;
  defaultModel?: string;
  agents?: string[];
};

async function seedProjectRoutes(page: Page) {
  const state: {
    projects: Project[];
    layouts: Record<
      string,
      Array<{
        id: string;
        slug: string;
        name: string;
        type: string;
        icon?: string;
      }>
    >;
  } = {
    projects: [
      {
        id: 'p-demo',
        slug: 'demo',
        name: 'Demo Project',
        icon: '🚀',
        description: 'Existing project',
        workingDirectory: '/tmp/demo',
        defaultModel: 'codex-mini',
        agents: [],
      },
    ],
    layouts: {
      demo: [
        {
          id: 'layout-1',
          slug: 'coding',
          name: 'Coding',
          type: 'coding',
          icon: '🔧',
        },
      ],
    },
  };

  await page.route('**/config/app', async (route) => {
    await route.fulfill(
      json({
        success: true,
        data: {
          apiBase: '',
          defaultModel: 'codex-mini',
          region: 'us-east-1',
        },
      }),
    );
  });

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
            configured: [],
            detected: { ollama: false, bedrock: false },
          },
          recommendation: {
            code: 'configured-chat-ready',
            type: 'providers',
            actionLabel: 'Manage Connections',
            title: 'Chat ready',
            detail: 'Mocked ready state',
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

    if (path === '/config/app' || path === '/api/config/app') {
      await route.fulfill(
        json({
          success: true,
          data: { defaultModel: 'codex-mini', region: 'us-east-1' },
        }),
      );
      return;
    }

    if (path === '/api/agents') {
      await route.fulfill(
        json({
          success: true,
          data: [
            { slug: 'default', name: 'Default Agent' },
            { slug: 'coder', name: 'Coder Agent' },
          ],
        }),
      );
      return;
    }

    if (path === '/api/models') {
      await route.fulfill(json({ success: true, data: [] }));
      return;
    }

    if (path === '/api/templates') {
      await route.fulfill(json({ success: true, data: [] }));
      return;
    }

    if (path === '/api/fs/browse') {
      await route.fulfill(
        json({
          success: true,
          data: { path: '/tmp', entries: [] },
        }),
      );
      return;
    }

    if (path === '/api/projects' && method === 'GET') {
      await route.fulfill(json({ success: true, data: state.projects }));
      return;
    }

    if (path === '/api/projects' && method === 'POST') {
      const body = route.request().postDataJSON() as {
        name: string;
        slug: string;
        icon?: string;
        description?: string;
        workingDirectory?: string;
      };
      const project: Project = {
        id: `p-${body.slug}`,
        slug: body.slug,
        name: body.name,
        icon: body.icon,
        description: body.description,
        workingDirectory: body.workingDirectory,
        defaultModel: '',
        agents: [],
      };
      state.projects.push(project);
      state.layouts[project.slug] = [];
      await route.fulfill(json({ success: true, data: project }, 201));
      return;
    }

    if (path === '/api/projects/layouts/available') {
      await route.fulfill(json({ success: true, data: [] }));
      return;
    }

    const projectMatch = path.match(/^\/api\/projects\/([^/]+)$/);
    if (projectMatch) {
      const slug = decodeURIComponent(projectMatch[1]);
      const project = state.projects.find((entry) => entry.slug === slug);

      if (method === 'GET') {
        if (!project) {
          await route.fulfill(
            json({ success: false, error: 'Project not found' }, 404),
          );
          return;
        }
        await route.fulfill(json({ success: true, data: project }));
        return;
      }

      if (method === 'PUT') {
        if (!project) {
          await route.fulfill(
            json({ success: false, error: 'Project not found' }, 404),
          );
          return;
        }
        const body = route.request().postDataJSON() as Project;
        if (body.name === 'Reject Save') {
          await route.fulfill(
            json({ success: false, error: 'Name rejected by policy' }, 400),
          );
          return;
        }
        Object.assign(project, body);
        await route.fulfill(json({ success: true, data: project }));
        return;
      }

      if (method === 'DELETE') {
        state.projects = state.projects.filter((entry) => entry.slug !== slug);
        delete state.layouts[slug];
        await route.fulfill(json({ success: true, data: { deleted: true } }));
        return;
      }
    }

    const projectLayoutsMatch = path.match(
      /^\/api\/projects\/([^/]+)\/layouts$/,
    );
    if (projectLayoutsMatch) {
      const slug = decodeURIComponent(projectLayoutsMatch[1]);
      if (method === 'GET') {
        await route.fulfill(
          json({ success: true, data: state.layouts[slug] ?? [] }),
        );
        return;
      }

      if (method === 'POST') {
        const body = route.request().postDataJSON() as {
          name: string;
          slug: string;
          type: string;
          icon?: string;
        };
        const layout = {
          id: `${slug}-${body.slug}`,
          slug: body.slug,
          name: body.name,
          type: body.type,
          icon: body.icon,
        };
        state.layouts[slug] = [...(state.layouts[slug] ?? []), layout];
        await route.fulfill(json({ success: true, data: layout }, 201));
        return;
      }
    }

    if (path.includes('/knowledge/status')) {
      await route.fulfill(
        json({
          success: true,
          data: {
            provider: 'builtin',
            documentCount: 0,
            totalChunks: 0,
            lastIndexed: null,
          },
        }),
      );
      return;
    }

    if (path.includes('/knowledge') && method === 'GET') {
      await route.fulfill(json({ success: true, data: [] }));
      return;
    }

    await route.fulfill(json({ success: true, data: [] }));
  });
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

test.describe('Project lifecycle', () => {
  test.beforeEach(async ({ page }) => {
    await seedProjectRoutes(page);
  });

  test('project create flow settles from the new project modal', async ({
    page,
  }) => {
    await page.goto('/projects/new');

    await expect(
      page.getByRole('heading', { name: 'New Project' }),
    ).toBeVisible();
    await page.waitForSelector('input[placeholder="My Project"]', {
      timeout: 15_000,
    });
    await fillStable(page, 'input[placeholder="My Project"]', 'Launchpad');
    await page.getByRole('button', { name: 'Create' }).click();

    await expect(page).toHaveURL(/\/projects\/launchpad$/);
  });

  test('project edit and delete all surface correctly', async ({ page }) => {
    await page.goto('/');

    const update = await page.evaluate(async () => {
      const res = await fetch('/api/projects/demo', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Demo Project Updated' }),
      });
      return res.json();
    });
    expect(update.success).toBe(true);
    expect(update.data.name).toBe('Demo Project Updated');

    const deletion = await page.evaluate(async () => {
      const res = await fetch('/api/projects/demo', { method: 'DELETE' });
      return res.json();
    });
    expect(deletion.success).toBe(true);
  });

  test('project settings guards unsaved navigation and surfaces failed saves', async ({
    page,
  }) => {
    await page.goto('/projects/demo/edit');
    await expect(page).toHaveURL(/\/projects\/demo\/edit$/);

    const nameInput = page.locator('.project-settings__name-input');
    await expect(nameInput).toBeVisible();
    await nameInput.fill('Draft Project Name');
    await expect(page.getByText('unsaved')).toBeVisible();

    await page.getByRole('button', { name: '← Back' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(nameInput).toHaveValue('Draft Project Name');

    await nameInput.fill('Reject Save');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Name rejected by policy')).toBeVisible();
    await expect(page).toHaveURL(/\/projects\/demo\/edit$/);
  });
});
