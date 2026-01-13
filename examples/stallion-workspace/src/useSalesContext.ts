import { useUserProfile, useMyTerritories, useMyAccounts } from './data';

/**
 * Hook to subscribe to sales context data
 */
export function useSalesContext() {
  const { data: profile, isLoading: profileLoading } = useUserProfile();
  const { data: territories = [], isLoading: territoriesLoading } = useMyTerritories(profile?.id);
  const { data: accounts = [], isLoading: accountsLoading } = useMyAccounts(profile?.id);

  return {
    myDetails: profile ? {
      userId: profile.id,
      name: profile.alias || profile.name,
      email: profile.email,
      role: profile.role,
    } : null,
    myTerritories: territories,
    myAccounts: accounts.map(a => ({ account: { id: a.id, name: a.name, owner: a.owner } })),
    loading: profileLoading || territoriesLoading || accountsLoading,
    error: null,
  };
}
