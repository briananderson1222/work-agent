/**
 * Branding routes — serves resolved branding config to the UI
 */

import { Hono } from 'hono';
import { getBrandingProvider } from '../providers/registry.js';

export function createBrandingRoutes() {
  const app = new Hono();

  app.get('/', async (c) => {
    const provider = getBrandingProvider();
    const [name, logo, theme, welcomeMessage] = await Promise.all([
      provider.getAppName(),
      provider.getLogo?.() ?? null,
      provider.getTheme?.() ?? null,
      provider.getWelcomeMessage?.() ?? null,
    ]);
    return c.json({ name, logo, theme, welcomeMessage });
  });

  return app;
}