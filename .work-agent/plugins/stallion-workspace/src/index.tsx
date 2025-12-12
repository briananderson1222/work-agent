import { Calendar } from './Calendar';
import { CRM } from './CRM';
import { SalesProvider } from './StallionContext';
import { SalesDataProvider } from './SalesDataContext';

// Wrap components with workspace context
const CalendarWithContext = (props: any) => (
  <SalesDataProvider>
    <SalesProvider>
      <Calendar {...props} />
    </SalesProvider>
  </SalesDataProvider>
);

const CRMWithContext = (props: any) => (
  <SalesDataProvider>
    <SalesProvider>
      <CRM {...props} />
    </SalesProvider>
  </SalesDataProvider>
);

export const components = {
  'stallion-workspace-calendar': CalendarWithContext,
  'stallion-workspace-crm': CRMWithContext,
};

export default CalendarWithContext;
