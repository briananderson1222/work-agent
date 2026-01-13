/**
 * Workspace Constants
 * 
 * Configurable URLs and settings for the stallion workspace.
 * These can be customized per deployment/environment.
 */

export const WORKSPACE_CONSTANTS = {
  // Salesforce instance URL - customize for your org
  SALESFORCE_BASE_URL: 'https://your-org.lightning.force.com',
} as const;

// Export individual constants for convenience
export const { SALESFORCE_BASE_URL } = WORKSPACE_CONSTANTS;
