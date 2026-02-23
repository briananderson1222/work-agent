/**
 * Workspace Constants
 * 
 * Configurable URLs and settings for the stallion workspace.
 * These can be customized per deployment/environment.
 */

export const WORKSPACE_CONSTANTS = {
  // CRM instance URL - customize for your org
  CRM_BASE_URL: 'https://aws-crm.lightning.force.com',
} as const;

// Export individual constants for convenience
export const { CRM_BASE_URL } = WORKSPACE_CONSTANTS;
