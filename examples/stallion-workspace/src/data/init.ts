/**
 * Provider Registration - Register and configure providers for this workspace
 */

import { registerProvider, configureProvider } from '@stallion-ai/sdk';
import { outlookProvider } from './providers/outlook';
import { salesforceProvider } from './providers/salesforce';

const WORKSPACE = 'stallion';

// Register workspace-specific providers
registerProvider('stallion/outlook', { workspace: WORKSPACE, type: 'calendar' }, () => outlookProvider);
registerProvider('stallion/salesforce-crm', { workspace: WORKSPACE, type: 'crm' }, () => salesforceProvider);
registerProvider('stallion/salesforce-user', { workspace: WORKSPACE, type: 'user' }, () => salesforceProvider);

// Set defaults (would be loaded from user config in production)
configureProvider(WORKSPACE, 'calendar', 'stallion/outlook');
configureProvider(WORKSPACE, 'crm', 'stallion/salesforce-crm');
configureProvider(WORKSPACE, 'user', 'stallion/salesforce-user');
