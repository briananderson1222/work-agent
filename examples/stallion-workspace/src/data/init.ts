/**
 * Provider Registration - Register and configure providers for this workspace
 * 
 * Deferred initialization: providers are registered when the SDK is ready.
 */

import { registerProvider, configureProvider } from '@stallion-ai/sdk';
import { outlookProvider } from './providers/outlook';
import { emailProvider } from './providers/outlook-email';
import { salesforceProvider } from './providers/salesforce';
import { builderProvider } from './providers/builder';
import { siftProvider } from './providers/sift';

const WORKSPACE = 'stallion';

let initialized = false;

export function ensureProviders(): boolean {
  if (initialized) return true;
  try {
    registerProvider('stallion/outlook', { workspace: WORKSPACE, type: 'calendar' }, () => outlookProvider);
    registerProvider('stallion/outlook-email', { workspace: WORKSPACE, type: 'email' }, () => emailProvider);
    registerProvider('stallion/salesforce-crm', { workspace: WORKSPACE, type: 'crm' }, () => salesforceProvider);
    registerProvider('stallion/salesforce-user', { workspace: WORKSPACE, type: 'user' }, () => salesforceProvider);
    registerProvider('stallion/builder', { workspace: WORKSPACE, type: 'internal' }, () => builderProvider);
    registerProvider('stallion/salesforce-sift', { workspace: WORKSPACE, type: 'sift' }, () => siftProvider);

    configureProvider(WORKSPACE, 'calendar', 'stallion/outlook');
    configureProvider(WORKSPACE, 'email', 'stallion/outlook-email');
    configureProvider(WORKSPACE, 'crm', 'stallion/salesforce-crm');
    configureProvider(WORKSPACE, 'user', 'stallion/salesforce-user');
    configureProvider(WORKSPACE, 'internal', 'stallion/builder');
    configureProvider(WORKSPACE, 'sift', 'stallion/salesforce-sift');
    initialized = true;
    return true;
  } catch {
    // SDK not ready yet — will retry on next render
    return false;
  }
}
