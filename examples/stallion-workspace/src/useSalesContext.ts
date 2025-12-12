import { useSalesData } from './SalesDataContext';

/**
 * Hook to subscribe to sales context data
 * Does NOT trigger fetches - use useSalesDataActions().fetch() explicitly
 */
export function useSalesContext() {
  return useSalesData();
}
