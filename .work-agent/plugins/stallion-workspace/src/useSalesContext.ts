import { useEffect } from 'react';
import { useSalesData } from './SalesDataContext';

/**
 * Hook to access sales context data
 * Automatically fetches on first mount, uses cached data on subsequent mounts
 */
export function useSalesContext() {
  const { data, fetch } = useSalesData();

  useEffect(() => {
    // Fetch will use cache if data is fresh, only makes API call if needed
    fetch();
  }, [fetch]);

  return {
    myDetails: data.myDetails,
    myTerritories: data.myTerritories,
    myAccounts: data.myAccounts,
    loading: data.loading,
    error: data.error,
  };
}

