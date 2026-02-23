import { test, expect } from '@playwright/test';

const API_BASE = 'http://localhost:3142';

test.describe('Schedule Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/schedule');
    // Wait for jobs to load
    await expect(page.locator('table')).toBeVisible({ timeout: 10_000 });
  });

  test('shows job list with stats bar', async ({ page }) => {
    // Stats bar should have Daemon, Jobs, etc.
    await expect(page.getByText('Daemon')).toBeVisible();
    await expect(page.getByText('Jobs')).toBeVisible();
    await expect(page.getByText('Success Rate')).toBeVisible();

    // At least one job row should exist
    const rows = page.locator('tbody tr');
    await expect(rows.first()).toBeVisible();
  });

  test('run now triggers job and shows running indicator', async ({ page }) => {
    // Find the first run button
    const firstRunBtn = page.locator('button[title="Run now"]').first();
    await expect(firstRunBtn).toBeVisible();

    // Click run
    await firstRunBtn.click();

    // Simulate a webhook event via the backend to trigger SSE
    // (boo fires this, but we can also POST directly for testing)
    const jobName = await page.locator('tbody tr td').first().innerText();
    await fetch(`${API_BASE}/scheduler/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'job.started', job: jobName.trim() }),
    });

    // Running indicator should appear
    await expect(page.getByTestId('running-indicator').first()).toBeVisible({ timeout: 5_000 });

    // Status column should show "running"
    await expect(page.getByText('● running').first()).toBeVisible();
  });

  test('toast appears on job completion event', async ({ page }) => {
    // Send a completion webhook event
    const jobName = await page.locator('tbody tr td').first().innerText();
    await fetch(`${API_BASE}/scheduler/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'job.completed',
        job: jobName.trim(),
        success: true,
        duration_secs: 12.5,
      }),
    });

    // Toast should appear with completion message
    await expect(page.getByText(/completed/i).first()).toBeVisible({ timeout: 5_000 });
  });

  test('expanded detail shows run history', async ({ page }) => {
    // Click on a job row to expand
    const firstRow = page.locator('tbody tr').first();
    await firstRow.click();

    // Run history panel should appear
    await expect(page.getByText('Run History')).toBeVisible({ timeout: 5_000 });
  });

  test('toggle enable/disable works', async ({ page }) => {
    const toggleBtn = page.locator('button[title="Disable"], button[title="Enable"]').first();
    const title = await toggleBtn.getAttribute('title');
    await toggleBtn.click();

    // Wait for query invalidation
    await page.waitForTimeout(1000);

    // Button title should have flipped
    if (title === 'Disable') {
      await expect(page.locator('button[title="Enable"]').first()).toBeVisible();
    } else {
      await expect(page.locator('button[title="Disable"]').first()).toBeVisible();
    }

    // Toggle back
    await page.locator('button[title="Disable"], button[title="Enable"]').first().click();
  });
});
