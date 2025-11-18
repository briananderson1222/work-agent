import { Calendar } from './Calendar';
import { CRM } from './CRM';

// Export components for plugin registry
export const components = {
  'stallion-workspace-calendar': Calendar,
  'stallion-workspace-crm': CRM,
};

// Default export for workspace
export default Calendar;
