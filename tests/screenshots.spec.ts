import { test } from '@playwright/test';

test('screenshot key pages', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/tmp/wa-home.png', fullPage: true });

  await page.goto('/profile');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/tmp/wa-profile.png', fullPage: true });

  await page.goto('/schedule');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/tmp/wa-schedule.png', fullPage: true });
});
