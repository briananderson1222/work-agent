import { test, expect } from '@playwright/test';

test.describe('Schedule Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/schedule');
    // Wait for the schedule view to render (may show empty state or job table)
    await page.waitForSelector('.schedule__table-wrap, .schedule__loading, .schedule__empty, .schedule__error', { timeout: 10_000 });
  });

  test('shows job list with stats bar', async ({ page }) => {
    // Stats bar should have Scheduler, Jobs, etc.
    await expect(page.getByText('Scheduler')).toBeVisible();
    await expect(page.getByText('Jobs', { exact: true })).toBeVisible();
    await expect(page.getByText('Success Rate')).toBeVisible();
  });

  test('run now triggers job and shows running indicator', async ({ page }) => {
    // Skip if no jobs are present
    const hasJobs = await page.locator('tbody tr').count() > 0;
    test.skip(!hasJobs, 'No scheduled jobs — skipping run-now test');

    const firstRunBtn = page.locator('button[title="Run now"]').first();
    await expect(firstRunBtn).toBeVisible();
    await firstRunBtn.click();

    // Running indicator should appear
    await expect(page.getByTestId('running-indicator').first()).toBeVisible({ timeout: 5_000 });
  });

  test('toast appears on job completion event', async ({ page }) => {
    const hasJobs = await page.locator('tbody tr').count() > 0;
    test.skip(!hasJobs, 'No scheduled jobs — skipping completion test');

    const jobName = await page.locator('tbody tr td').first().innerText();
    // Send completion event through the main server's scheduler proxy
    await fetch('http://localhost:3141/scheduler/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'job.completed',
        job: jobName.trim(),
        success: true,
        duration_secs: 12.5,
      }),
    });

    await expect(page.getByText(/completed/i).first()).toBeVisible({ timeout: 5_000 });
  });

  test('expanded detail shows run history', async ({ page }) => {
    const hasJobs = await page.locator('tbody tr').count() > 0;
    test.skip(!hasJobs, 'No scheduled jobs — skipping detail test');

    await page.locator('tbody tr').first().click();
    await expect(page.getByText('Run History')).toBeVisible({ timeout: 5_000 });
  });

  test('toggle enable/disable works', async ({ page }) => {
    const hasJobs = await page.locator('tbody tr').count() > 0;
    test.skip(!hasJobs, 'No scheduled jobs — skipping toggle test');

    const toggleBtn = page.locator('button[title="Disable"], button[title="Enable"]').first();
    const title = await toggleBtn.getAttribute('title');
    await toggleBtn.click();
    await page.waitForTimeout(1000);

    if (title === 'Disable') {
      await expect(page.locator('button[title="Enable"]').first()).toBeVisible();
    } else {
      await expect(page.locator('button[title="Disable"]').first()).toBeVisible();
    }

    // Toggle back
    await page.locator('button[title="Disable"], button[title="Enable"]').first().click();
  });
});
