import { getProvider, hasProvider } from '@stallion-ai/sdk';
import { useCallback, useState } from 'react';
import type { CreateOpportunityInput } from './data/providers';
import type { AccountVM, OpportunityVM, TaskVM } from './data/viewmodels';

const WORKSPACE = 'enterprise';
const CACHE_KEY = 'enterprise-crm-cache';

/**
 * Legacy imperative CRM data hook.
 * Prefer the React Query hooks in src/data/index.ts for new code.
 */
export function useCRMData() {
  const [accounts, setAccounts] = useState<AccountVM[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<AccountVM | null>(
    null,
  );
  const [opportunities, setOpportunities] = useState<OpportunityVM[]>([]);
  const [tasks, setTasks] = useState<TaskVM[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const loadAccountDetails = useCallback(async (accountId: string) => {
    if (!hasProvider(WORKSPACE, 'crm')) return;
    setLoading(true);
    setError(null);
    try {
      const cacheKey = `${CACHE_KEY}-${accountId}`;
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        const { account, opps, taskList } = JSON.parse(cached);
        setSelectedAccount(account);
        setOpportunities(opps);
        setTasks(taskList);
        return;
      }
      const crm = getProvider(WORKSPACE, 'crm');
      const [account, opps, taskResult] = await Promise.all([
        crm.getAccountDetails(accountId),
        crm.getAccountOpportunities(accountId),
        crm.getUserTasks('', { limit: 25 }),
      ]);
      setSelectedAccount(account);
      setOpportunities(opps);
      setTasks(taskResult.tasks);
      sessionStorage.setItem(
        cacheKey,
        JSON.stringify({ account, opps, taskList: taskResult.tasks }),
      );
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, []);

  const createOpportunity = useCallback(
    async (data: CreateOpportunityInput) => {
      if (!hasProvider(WORKSPACE, 'crm')) return;
      const opp = await getProvider(WORKSPACE, 'crm').createOpportunity(data);
      setOpportunities((prev) => [opp, ...prev]);
      return opp;
    },
    [],
  );

  return {
    accounts,
    setAccounts,
    selectedAccount,
    setSelectedAccount,
    opportunities,
    tasks,
    loading,
    error,
    loadAccountDetails,
    createOpportunity,
  };
}
