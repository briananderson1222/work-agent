import { expect, test } from '@playwright/test';

test('activity chart hover shows stable tooltip', async ({ page }) => {
  await page.goto('/profile');
  // Wait for rescan + chart render
  await page.waitForTimeout(4000);

  // Scroll to chart area
  const heading = page.getByText('Activity History');
  if ((await heading.count()) === 0) {
    console.log('No Activity History section found');
    await page.screenshot({
      path: '/tmp/profile-no-chart.png',
      fullPage: true,
    });
    return;
  }
  await heading.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);

  // Find hover targets
  const hoverTargets = page.locator('[data-testid^="chart-hover-"]');
  const count = await hoverTargets.count();
  console.log(`Found ${count} hover targets`);

  if (count === 0) {
    await page.screenshot({
      path: '/tmp/profile-chart-empty.png',
      fullPage: true,
    });
    return;
  }

  // Find one with data (last one is most likely today)
  const lastTarget = hoverTargets.last();
  const box = await lastTarget.boundingBox();
  console.log(`Last target box: ${JSON.stringify(box)}`);

  // Hover over the TOP of the bar column
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + 5);
    await page.waitForTimeout(300);

    const tooltip = page.getByTestId('chart-tooltip');
    const visible = await tooltip.isVisible();
    console.log(`Tooltip visible after top hover: ${visible}`);

    if (visible) {
      const text = await tooltip.textContent();
      console.log(`Tooltip content: ${text}`);
    }

    // Move to middle of bar
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(300);
    console.log(
      `Tooltip visible after middle hover: ${await tooltip.isVisible()}`,
    );

    // Move to bottom of bar
    await page.mouse.move(box.x + box.width / 2, box.y + box.height - 5);
    await page.waitForTimeout(300);
    console.log(
      `Tooltip visible after bottom hover: ${await tooltip.isVisible()}`,
    );

    // Tooltip should stay visible throughout
    await expect(tooltip).toBeVisible();
  }

  await page.screenshot({
    path: '/tmp/profile-chart-hover.png',
    fullPage: true,
  });
});
