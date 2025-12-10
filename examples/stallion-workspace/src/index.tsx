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

export default CalendarWithContext;
