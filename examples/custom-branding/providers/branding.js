/**
 * Custom branding provider example
 *
 * This shows how a plugin can override the default Stallion branding.
 * The server loads this module and calls each method to build the
 * branding response served at GET /api/branding.
 *
 * To install:
 *   cp -r examples/custom-branding .stallion-ai/plugins/custom-branding
 *
 * To revert to defaults, disable the branding provider in the UI
 * (Plugins → custom-branding → Providers → branding toggle)
 * or remove the plugin.
 */

module.exports = () => ({
  async getAppName() {
    return 'Project Stallion';
  },

  async getLogo() {
    return { src: '/favicon.png', alt: 'Stallion' };
  },

  async getTheme() {
    // Return CSS custom property overrides, or null to keep defaults
    return null;
  },

  async getWelcomeMessage() {
    return 'Welcome to Project Stallion — your AI-powered workspace';
  },
});
