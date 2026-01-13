// Initialize providers (must be first)
import './data/init';

import { Calendar } from './Calendar';
import { CRM } from './CRM';
import { SalesProvider } from './StallionContext';

// Wrap components with workspace context
const CalendarWithContext = (props: any) => (
  <SalesProvider>
    <Calendar {...props} />
  </SalesProvider>
);

const CRMWithContext = (props: any) => (
  <SalesProvider>
    <CRM {...props} />
  </SalesProvider>
);

export const components = {
  'stallion-workspace-calendar': CalendarWithContext,
  'stallion-workspace-crm': CRMWithContext,
};

// Export provider types for this workspace
export { requiredProviders } from './data/providerTypes';
export type { ProviderTypeMap, ProviderType } from './data/providerTypes';

export default CalendarWithContext;
