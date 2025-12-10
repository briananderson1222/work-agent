import { useEffect } from 'react';
import { transformTool } from '@stallion-ai/sdk';
import { useSales } from './StallionContext';

export function useSalesContext() {
  const { state, setState } = useSales();

  useEffect(() => {
    if (state.contextLoaded) {
      console.log('[Sales Context] Already loaded from cache:', {
        user: state.myDetails?.name,
        territories: state.myTerritories.length,
        accounts: state.myAccounts.length,
      });
      return;
    }

    const loadContext = async () => {
      console.log('[Sales Context] Starting fresh load...');
      
      try {
        // Get current user details first
        console.log('[Sales Context] Fetching personal details...');
        const details = await transformTool('work-agent', 'satSfdc_getMyPersonalDetails', {}, 'data => data');
        console.log('[Sales Context] Personal details:', details);
        
        if (!details?.sfdcId) {
          throw new Error('No user ID returned from personal details');
        }
        
        // Get territories and accounts in parallel with individual error handling
        console.log('[Sales Context] Fetching territories and accounts...');
        const [territoriesResult, accountsResult] = await Promise.allSettled([
          transformTool('work-agent', 'satSfdc_listUserAssignedTerritories', { userId: details.sfdcId }, 'data => data'),
          transformTool('work-agent', 'satSfdc_listUserAssignedAccounts', { userId: details.sfdcId }, 'data => data')
        ]);
        
        const territoriesData = territoriesResult.status === 'fulfilled' ? territoriesResult.value : [];
        const accountsData = accountsResult.status === 'fulfilled' ? accountsResult.value : [];
        
        if (territoriesResult.status === 'rejected') {
          console.error('[Sales Context] Failed to fetch territories:', territoriesResult.reason);
        }
        if (accountsResult.status === 'rejected') {
          console.error('[Sales Context] Failed to fetch accounts:', accountsResult.reason);
        }
        
        console.log('[Sales Context] Territories:', territoriesData);
        console.log('[Sales Context] Accounts:', accountsData);

        setState({
          myDetails: {
            userId: details.sfdcId,
            name: details.alias,
            email: details.email,
            role: details.role,
          },
          myTerritories: territoriesData.territories || [],
          myAccounts: accountsData.accountTeamMembers || [],
          contextLoaded: true,
          lastRefresh: Date.now(),
        });

        console.log('[Sales Context] ✅ Loaded successfully:', {
          user: details.alias,
          territories: (territoriesData.territories || []).length,
          accounts: (accountsData.accountTeamMembers || []).length,
        });
      } catch (err) {
        console.error('[Sales Context] ❌ Failed to load:', err);
        setState({ contextLoaded: true }); // Mark as attempted
      }
    };

    loadContext();
  }, [state.contextLoaded, setState]);

  return state;
}
