import { expect, test } from '@playwright/test';

const runId = 'schedule:built-in:daily-report:log-1';
const outputRef = {
  source: 'schedule',
  providerId: 'built-in',
  runId,
  artifactId: 'log-1',
  kind: 'text',
};

async function mockScheduleRunsApi(page: import('@playwright/test').Page) {
  const job = {
    name: 'daily-report',
    provider: 'built-in',
    cron: '0 9 * * *',
    prompt: 'Generate the daily report',
    enabled: true,
    lastRun: '2026-04-25T15:00:00.000Z',
    nextRun: '2026-04-26T15:00:00.000Z',
  };

  const run = {
    runId,
    source: 'schedule',
    sourceId: 'daily-report',
    providerId: 'built-in',
    status: 'completed',
    startedAt: '2026-04-25T15:00:00.000Z',
    updatedAt: '2026-04-25T15:00:03.000Z',
    completedAt: '2026-04-25T15:00:03.000Z',
    attempt: 1,
    maxAttempts: 1,
    retryEligible: false,
    eventCount: 1,
    outputRef,
    metadata: {
      durationSecs: 3,
      manual: true,
      legacyLogId: 'log-1',
    },
  };

  await page.route('**/scheduler/providers', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: [{ id: 'built-in', displayName: 'Built-in Scheduler' }],
      }),
    }),
  );
  await page.route('**/scheduler/jobs', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: [job] }),
    }),
  );
  await page.route('**/scheduler/stats', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          providers: {
            'built-in': {
              jobs: [
                {
                  name: 'daily-report',
                  total: 1,
                  successes: 1,
                  failures: 0,
                  success_rate: 100,
                },
              ],
            },
          },
          summary: { totalJobs: 1, totalRuns: 1, successRate: 100 },
        },
      }),
    }),
  );
  await page.route('**/scheduler/status', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          providers: {
            'built-in': {
              running: true,
              healthy: true,
              lastTickAt: '2026-04-25T15:01:00.000Z',
            },
          },
        },
      }),
    }),
  );
  await page.route('**/api/runs', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: [run] }),
    }),
  );
  await page.route('**/api/runs/output', async (route) => {
    expect(route.request().method()).toBe('POST');
    expect(route.request().postDataJSON()).toEqual(outputRef);
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: { content: 'Daily report output from opaque run ref' },
      }),
    });
  });
}

test.describe('Schedule run history', () => {
  test('shows run history and reads output through the runs API', async ({
    page,
  }) => {
    await mockScheduleRunsApi(page);
    await page.goto('/schedule');

    await expect(page.getByRole('heading', { name: 'Schedule' })).toBeVisible();
    await expect(page.getByText('daily-report')).toBeVisible();
    await expect(
      page.getByLabel('Scheduler statistics').getByText('100%'),
    ).toBeVisible();

    await page.getByTestId('job-row-daily-report').click();
    await expect(page.getByText(/daily-report.*Run History/)).toBeVisible();
    await expect(
      page.getByRole('button', { name: /open artifact/i }),
    ).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Output' })).toBeVisible();

    await page.getByRole('button', { name: 'Output' }).click();
    await expect(page.getByText(/daily-report.*Run Output/)).toBeVisible();
    await expect(
      page.getByText('Daily report output from opaque run ref'),
    ).toBeVisible();
  });

  test('deep-links directly to schedule run output', async ({ page }) => {
    await mockScheduleRunsApi(page);
    await page.goto(`/schedule?run=${encodeURIComponent(runId)}`);

    await expect(page.getByText(/daily-report.*Run History/)).toBeVisible();
    await expect(
      page.getByText('Daily report output from opaque run ref'),
    ).toBeVisible();
  });
});
