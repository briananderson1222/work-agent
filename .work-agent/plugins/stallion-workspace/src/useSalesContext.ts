import { useSalesData } from './SalesDataContext';

/**
 * Hook to subscribe to sales context data
 */
export function useSalesContext() {
  const { data, isLoading, error } = useSalesData();
  
  return {
    myDetails: data.myDetails,
    myTerritories: data.myTerritories,
    myAccounts: data.myAccounts,
    loading: isLoading,
    error: error ? (error as Error).message : null,
  };
}

