/**
 * Provider Type Map - Correlates string identifiers to interfaces
 */

import type { ICalendarProvider, ICRMProvider, IUserProvider, IEmailProvider, IInternalProvider, ISiftProvider } from './providers';

export type ProviderTypeMap = {
  calendar: ICalendarProvider;
  crm: ICRMProvider;
  user: IUserProvider;
  email: IEmailProvider;
  internal: IInternalProvider;
  sift: ISiftProvider;
};

export type ProviderType = keyof ProviderTypeMap;

// Required providers for this workspace (matches workspace.json)
export const requiredProviders: ProviderType[] = ['calendar', 'crm', 'user'];
