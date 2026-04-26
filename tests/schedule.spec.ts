import { expect, type Page, test } from '@playwright/test';

type ScheduleJobRecord = {
  name: string;
  provider: string;
  cron: string;
  schedule: string;
  prompt: string;
  agent: string;
  enabled: boolean;
  lastRun?: string;
  nextRun?: string;
  retryCount?: number;
  retryDelaySecs?: number;
};

function makeJob(
  overrides: Partial<ScheduleJobRecord> & Pick<ScheduleJobRecord, 'name'>,
): ScheduleJobRecord {
  const cron = overrides.cron ?? '0 9 * * *';
  return {
    provider: 'built-in',
    cron,
    schedule: `cron ${cron}`,
    prompt: 'Generate the daily report',
    agent: 'default',
    enabled: true,
    lastRun: '2026-04-25T15:00:00.000Z',
    nextRun: '2026-04-26T15:00:00.000Z',
    retryCount: 0,
    retryDelaySecs: 60,
    ...overrides,
  };
}

async function seedScheduleCrudApi(page: Page) {
  const jobs = new Map<string, ScheduleJobRecord>([
    [
      'daily-report',
      makeJob({
        name: 'daily-report',
        prompt: 'Generate the daily report',
        agent: 'codex',
      }),
    ],
  ]);
  const runCalls: string[] = [];

  await page.route('**/scheduler/providers', (route) =>
    route.fulfill({
      json: {
        success: true,
        data: [
          {
            id: 'built-in',
            displayName: 'Built-in Scheduler',
            capabilities: ['prompt'],
          },
        ],
      },
    }),
  );
  await page.route('**/scheduler/status', (route) =>
    route.fulfill({
      json: {
        success: true,
        data: {
          providers: {
            'built-in': {
              id: 'built-in',
              displayName: 'Built-in Scheduler',
              running: true,
              healthy: true,
              lastTickAt: '2026-04-25T15:01:00.000Z',
            },
          },
        },
      },
    }),
  );
  await page.route('**/scheduler/stats', (route) =>
    route.fulfill({
      json: {
        success: true,
        data: {
          providers: {
            'built-in': {
              jobs: Array.from(jobs.values()).map((job) => ({
                name: job.name,
                total: 1,
                successes: job.enabled ? 1 : 0,
                failures: job.enabled ? 0 : 1,
                success_rate: job.enabled ? 100 : 0,
              })),
            },
          },
          summary: {
            totalJobs: jobs.size,
            totalRuns: jobs.size,
            successRate: jobs.size ? 100 : -1,
          },
        },
      },
    }),
  );
  await page.route('**/scheduler/jobs/preview-schedule**', (route) =>
    route.fulfill({
      json: {
        success: true,
        data: ['2026-04-26T15:00:00.000Z'],
      },
    }),
  );
  await page.route('**/scheduler/jobs', async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();
      const job = makeJob({
        name: body.name,
        provider: body.provider ?? 'built-in',
        cron: body.cron ?? '* * * * *',
        prompt: body.prompt ?? '',
        agent: body.agent ?? 'default',
        retryCount: body.retryCount ?? 0,
        retryDelaySecs: body.retryDelaySecs ?? 60,
      });
      jobs.set(job.name, job);
      await route.fulfill({ json: { success: true, data: job } });
      return;
    }
    await route.fulfill({
      json: { success: true, data: Array.from(jobs.values()) },
    });
  });
  await page.route('**/scheduler/jobs/**', async (route) => {
    const request = route.request();
    const pathParts = new URL(request.url()).pathname.split('/');
    const target = decodeURIComponent(pathParts[3] ?? '');
    const action = pathParts[4];
    const current = jobs.get(target);

    if (action === 'run' && request.method() === 'POST') {
      runCalls.push(target);
      await route.fulfill({ json: { success: true, data: current } });
      return;
    }
    if (
      (action === 'enable' || action === 'disable') &&
      request.method() === 'PUT'
    ) {
      if (current) {
        jobs.set(target, { ...current, enabled: action === 'enable' });
      }
      await route.fulfill({ json: { success: true, data: jobs.get(target) } });
      return;
    }
    if (request.method() === 'PUT') {
      const body = request.postDataJSON();
      if (current) {
        const cron = body.cron ?? current.cron;
        jobs.set(target, {
          ...current,
          ...body,
          cron,
          schedule: `cron ${cron}`,
        });
      }
      await route.fulfill({ json: { success: true, data: jobs.get(target) } });
      return;
    }
    if (request.method() === 'DELETE') {
      jobs.delete(target);
      await route.fulfill({ json: { success: true } });
      return;
    }
    await route.fulfill({ status: 404, json: { success: false } });
  });
  await page.route('**/api/runs', (route) =>
    route.fulfill({ json: { success: true, data: [] } }),
  );

  return { runCalls };
}

async function fillCron(
  page: Page,
  cron: [string, string, string, string, string],
) {
  const labels = ['minute', 'hour', 'day', 'month', 'weekday'];
  for (const [index, value] of cron.entries()) {
    await page.getByLabel(labels[index], { exact: true }).fill(value);
  }
}

test.describe('Schedule Page', () => {
  test('covers add, edit, duplicate, run, filter, toggle, and delete', async ({
    page,
  }) => {
    const { runCalls } = await seedScheduleCrudApi(page);
    await page.goto('/schedule');

    await expect(page.getByRole('heading', { name: 'Schedule' })).toBeVisible();
    await expect(page.getByTestId('job-row-daily-report')).toBeVisible();
    await expect(
      page.getByLabel('Scheduler statistics').getByText('100%'),
    ).toBeVisible();

    await page.getByPlaceholder('Filter jobs…').fill('missing');
    await expect(page.getByText('No matching jobs')).toBeVisible();
    await page.reload();
    await expect(page.getByTestId('job-row-daily-report')).toBeVisible();

    await page.getByRole('button', { name: '+ Add Job' }).click();
    await page.getByPlaceholder('my-daily-briefing').fill('weekly-brief');
    await page
      .getByPlaceholder('What should the agent do?')
      .fill('Summarize weekly work');
    await fillCron(page, ['30', '8', '*', '*', '1']);
    await page.getByRole('button', { name: 'Add Job', exact: true }).click();
    await expect(page.getByTestId('job-row-weekly-brief')).toBeVisible();

    await page.getByRole('button', { name: 'Edit weekly-brief' }).click();
    await page
      .getByPlaceholder('What should the agent do?')
      .fill('Summarize weekly work and risks');
    await page.getByRole('button', { name: 'Save Changes' }).click();
    await page.getByTestId('job-row-weekly-brief').click();
    await expect(
      page.getByText('Summarize weekly work and risks'),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Run weekly-brief' }).click();
    await expect.poll(() => runCalls).toEqual(['weekly-brief']);

    await page.getByTestId('job-row-weekly-brief').locator('td').nth(2).click();
    await expect(
      page.getByTestId('job-row-weekly-brief').getByText('off'),
    ).toBeVisible();
    await page.getByTestId('job-row-weekly-brief').locator('td').nth(2).click();
    await expect(
      page.getByTestId('job-row-weekly-brief').getByText('on'),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Duplicate weekly-brief' }).click();
    await expect(page.getByPlaceholder('my-daily-briefing')).toHaveValue(
      'weekly-brief-copy',
    );
    await page.getByRole('button', { name: 'Add Job', exact: true }).click();
    await expect(page.getByTestId('job-row-weekly-brief-copy')).toBeVisible();

    await page
      .getByRole('button', { name: 'Delete weekly-brief-copy' })
      .click();
    await expect(page.getByRole('dialog')).toContainText(
      'Delete job "weekly-brief-copy"?',
    );
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Delete', exact: true })
      .click();
    await expect(page.getByTestId('job-row-weekly-brief-copy')).toHaveCount(0);
  });
});
