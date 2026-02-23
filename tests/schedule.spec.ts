import { test, expect } from '@playwright/test';

const API = process.env.API_BASE || 'http://localhost:3142';
const UI = process.env.UI_BASE || 'http://localhost:5174';

// Backend API tests — verify scheduler proxy routes work
test.describe('Scheduler API', () => {
  test('GET /scheduler/jobs returns job list', async ({ request }) => {
    const res = await request.get(`${API}/scheduler/jobs`);
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(Array.isArray(json.data)).toBe(true);
    expect(json.data.length).toBeGreaterThan(0);
    // Verify job shape
    const job = json.data[0];
    expect(job).toHaveProperty('name');
    expect(job).toHaveProperty('schedule');
    expect(job).toHaveProperty('enabled');
  });

  test('GET /scheduler/stats returns stats with totals', async ({ request }) => {
    const res = await request.get(`${API}/scheduler/stats`);
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data).toHaveProperty('jobs');
    expect(json.data).toHaveProperty('total');
    expect(Array.isArray(json.data.jobs)).toBe(true);
    // Verify stats shape
    const total = json.data.total;
    expect(total).toHaveProperty('total_runs');
    expect(total).toHaveProperty('success_rate');
    expect(total).toHaveProperty('last_7d');
  });

  test('GET /scheduler/stats/:target returns single job stats', async ({ request }) => {
    const res = await request.get(`${API}/scheduler/stats/good-morning`);
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.jobs).toHaveLength(1);
    expect(json.data.jobs[0].name).toBe('good-morning');
  });

  test('GET /scheduler/status returns daemon status', async ({ request }) => {
    const res = await request.get(`${API}/scheduler/status`);
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data).toHaveProperty('daemon_running');
    expect(json.data).toHaveProperty('enabled_jobs');
    expect(typeof json.data.daemon_running).toBe('boolean');
  });

  test('GET /scheduler/jobs/:target/logs returns run history', async ({ request }) => {
    const res = await request.get(`${API}/scheduler/jobs/good-morning/logs`);
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(Array.isArray(json.data)).toBe(true);
    if (json.data.length > 0) {
      const record = json.data[0];
      expect(record).toHaveProperty('fired_at');
      expect(record).toHaveProperty('success');
      expect(record).toHaveProperty('duration_secs');
    }
  });

  test('GET /scheduler/jobs returns ISO timestamps and schedule_human', async ({ request }) => {
    const res = await request.get(`${API}/scheduler/jobs`);
    const json = await res.json();
    const job = json.data.find((j: any) => j.last_run !== null);
    if (job) {
      // last_run should be ISO 8601, not "02-20 15:03 UTC"
      expect(job.last_run).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(new Date(job.last_run).getTime()).not.toBeNaN();
    }
    // next_fire should be ISO 8601
    const enabled = json.data.find((j: any) => j.next_fire !== null);
    if (enabled) {
      expect(enabled.next_fire).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
    // schedule_human should exist
    expect(json.data[0]).toHaveProperty('schedule_human');
    expect(json.data[0].schedule_human.length).toBeGreaterThan(0);
  });
});

// Frontend UI tests — verify Schedule tab renders with data
test.describe('Schedule Tab UI', () => {
  test('Schedule tab is visible and loads jobs', async ({ page }) => {
    await page.goto(UI);
    // Wait for app to load
    await page.waitForSelector('[class*="workspace"]', { timeout: 10_000 });

    // Find and click the Schedule tab
    const scheduleTab = page.locator('button', { hasText: 'Schedule' });
    await expect(scheduleTab).toBeVisible({ timeout: 5_000 });
    await scheduleTab.click();

    // Verify stats bar renders
    await expect(page.locator('text=Daemon')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('text=Success Rate')).toBeVisible();

    // Verify job table renders with at least one job
    await expect(page.locator('text=Scheduled Jobs')).toBeVisible();
    await expect(page.locator('text=good-morning')).toBeVisible({ timeout: 10_000 });
  });

  test('Clicking a job row expands run history', async ({ page }) => {
    await page.goto(UI);
    await page.waitForSelector('[class*="workspace"]', { timeout: 10_000 });

    const scheduleTab = page.locator('button', { hasText: 'Schedule' });
    await scheduleTab.click();

    // Wait for jobs to load then click first job row
    const jobRow = page.locator('text=good-morning');
    await expect(jobRow).toBeVisible({ timeout: 10_000 });
    await jobRow.click();

    // Verify run history panel appears
    await expect(page.locator('text=Run History')).toBeVisible({ timeout: 5_000 });
  });
});

// Daemon lifecycle tests — stop daemon, verify status, restart
test.describe('Daemon Lifecycle', () => {
  test('stopping daemon shows offline status via API', async ({ request }) => {
    // Stop the daemon
    const { execSync } = require('child_process');
    try { execSync('boo uninstall', { timeout: 5000 }); } catch {}
    // Kill any running daemon
    try { execSync('pkill -f "boo daemon"', { timeout: 5000 }); } catch {}

    // Wait a moment for PID file cleanup
    await new Promise(r => setTimeout(r, 1000));

    // Verify status shows not running
    const res = await request.get(`${API}/scheduler/status`);
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.daemon_running).toBe(false);

    // Jobs should still be listable even with daemon stopped
    const jobsRes = await request.get(`${API}/scheduler/jobs`);
    expect(jobsRes.ok()).toBeTruthy();
    const jobsJson = await jobsRes.json();
    expect(jobsJson.success).toBe(true);
    expect(jobsJson.data.length).toBeGreaterThan(0);

    // Restore daemon
    try { execSync('boo install', { timeout: 5000 }); } catch {}
  });
});

// Frontend UI tests — verify Schedule tab renders with data
test.describe('Schedule Tab UI', () => {
  test('Schedule tab is visible and loads jobs', async ({ page }) => {
    await page.goto(UI);
    await page.waitForSelector('[class*="workspace"]', { timeout: 10_000 });

    const scheduleTab = page.locator('button', { hasText: 'Schedule' });
    await expect(scheduleTab).toBeVisible({ timeout: 5_000 });
    await scheduleTab.click();

    // Verify stats bar renders
    await expect(page.locator('text=Daemon')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('text=Success Rate')).toBeVisible();

    // Verify job table renders with at least one job
    await expect(page.locator('text=Scheduled Jobs')).toBeVisible();
    await expect(page.locator('text=good-morning')).toBeVisible({ timeout: 10_000 });
  });

  test('Schedule column shows localized times (no UTC suffix)', async ({ page }) => {
    await page.goto(UI);
    await page.waitForSelector('[class*="workspace"]', { timeout: 10_000 });

    const scheduleTab = page.locator('button', { hasText: 'Schedule' });
    await scheduleTab.click();
    await expect(page.locator('text=good-morning')).toBeVisible({ timeout: 10_000 });

    // The schedule column should NOT contain "UTC" — it should be localized
    const cells = page.locator('table tbody td:nth-child(2)');
    const count = await cells.count();
    for (let i = 0; i < count; i++) {
      const text = await cells.nth(i).textContent();
      expect(text).not.toContain('UTC');
    }
  });

  test('Clicking a job row expands run history', async ({ page }) => {
    await page.goto(UI);
    await page.waitForSelector('[class*="workspace"]', { timeout: 10_000 });

    const scheduleTab = page.locator('button', { hasText: 'Schedule' });
    await scheduleTab.click();

    const jobRow = page.locator('text=good-morning');
    await expect(jobRow).toBeVisible({ timeout: 10_000 });
    await jobRow.click();

    await expect(page.locator('text=Run History')).toBeVisible({ timeout: 5_000 });
  });
});
