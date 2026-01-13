/**
 * Provider Type Map - Correlates string identifiers to interfaces
 */

import type { ICalendarProvider, ICRMProvider, IUserProvider } from './providers';

export type ProviderTypeMap = {
  calendar: ICalendarProvider;
  crm: ICRMProvider;
  user: IUserProvider;
};

export type ProviderType = keyof ProviderTypeMap;

// Required providers for this workspace (matches workspace.json)
export const requiredProviders: ProviderType[] = ['calendar', 'crm', 'user'];
