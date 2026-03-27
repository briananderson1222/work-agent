import { expect, test } from '@playwright/test';

const LOCAL_SKILLS = [
  { name: 'my-skill', description: 'A local skill', version: '1.0.0' },
];

const REGISTRY_SKILLS = [
  {
    id: 'my-skill',
    displayName: 'my-skill',
    description: 'A local skill',
    version: '2.0.0',
    installed: false,
  },
  {
    id: 'new-skill',
    displayName: 'new-skill',
    description: 'A registry-only skill',
    version: '1.0.0',
    installed: false,
  },
];

function mockSkillsApi(page: import('@playwright/test').Page) {
  return Promise.all([
    page.route('**/api/system/skills', (route) =>
      route.fulfill({ json: { success: true, data: LOCAL_SKILLS } }),
    ),
    page.route('**/api/registry/skills', (route) =>
      route.fulfill({ json: { success: true, data: REGISTRY_SKILLS } }),
    ),
  ]);
}

test.describe('SkillsView', () => {
  test('renders skills list with local and registry items', async ({
    page,
  }) => {
    await mockSkillsApi(page);
    await page.goto('/skills');

    // Both local and registry skills should appear
    await expect(page.getByText('my-skill')).toBeVisible();
    await expect(page.getByText('new-skill')).toBeVisible();
  });

  test('shows Update button when registry version is newer', async ({
    page,
  }) => {
    await mockSkillsApi(page);
    await page.goto('/skills');

    // Select the installed skill that has an update
    await page.getByText('my-skill').first().click();

    // Should show Installed badge
    await expect(page.locator('.skill-detail__badge--installed')).toBeVisible();

    // Should show Update button since registry v2.0.0 > local v1.0.0
    await expect(page.getByRole('button', { name: 'Update' })).toBeVisible();
    // Should also show Uninstall
    await expect(page.getByRole('button', { name: 'Uninstall' })).toBeVisible();
  });

  test('shows Install button for registry-only skill', async ({ page }) => {
    await mockSkillsApi(page);
    await page.goto('/skills');

    await page.getByText('new-skill').click();

    await expect(page.locator('.skill-detail__badge--registry')).toBeVisible();
    await expect(
      page.getByRole('button', { name: /^↓ Install$/ }),
    ).toBeVisible();
    // No Update or Uninstall for non-installed skills
    await expect(
      page.getByRole('button', { name: 'Update' }),
    ).not.toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Uninstall' }),
    ).not.toBeVisible();
  });

  test('install flow calls API and refreshes', async ({ page }) => {
    await mockSkillsApi(page);
    let installCalled = false;
    await page.route('**/api/registry/skills/install', (route) => {
      installCalled = true;
      return route.fulfill({ json: { success: true, message: 'Installed' } });
    });
    await page.goto('/skills');

    await page.getByText('new-skill').click();
    await page.getByRole('button', { name: /^↓ Install$/ }).click();

    // Wait for the mutation to fire
    await page.waitForTimeout(500);
    expect(installCalled).toBe(true);
  });

  test('update flow calls update endpoint', async ({ page }) => {
    await mockSkillsApi(page);
    let updateCalled = false;
    await page.route('**/api/registry/skills/my-skill/update', (route) => {
      updateCalled = true;
      return route.fulfill({ json: { success: true, message: 'Updated' } });
    });
    await page.goto('/skills');

    await page.getByText('my-skill').first().click();
    await page.getByRole('button', { name: 'Update' }).click();

    await page.waitForTimeout(500);
    expect(updateCalled).toBe(true);
  });

  test('uninstall flow calls delete endpoint', async ({ page }) => {
    await mockSkillsApi(page);
    let uninstallCalled = false;
    await page.route('**/api/registry/skills/my-skill', (route) => {
      if (route.request().method() === 'DELETE') {
        uninstallCalled = true;
        return route.fulfill({ json: { success: true, message: 'Removed' } });
      }
      return route.continue();
    });
    await page.goto('/skills');

    await page.getByText('my-skill').first().click();
    await page.getByRole('button', { name: 'Uninstall' }).click();

    await page.waitForTimeout(500);
    expect(uninstallCalled).toBe(true);
  });
});
