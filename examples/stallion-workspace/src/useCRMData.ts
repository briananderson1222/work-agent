import { useState, useRef } from 'react';
import { useToast } from '@stallion-ai/sdk';
import { salesforceProvider } from './data';

interface Account {
  id: string;
  name: string;
  owner?: { name: string };
  website?: string;
  geo_Text__c?: string;
  awsci_customer?: {
    customerRevenue?: {
      tShirtSize?: string;
    };
  };
  _sources?: Array<{
    type: 'owner' | 'territory';
    label: string;
  }>;
}

interface Opportunity {
  id: string;
  name: string;
  amount?: number;
  closeDate: string;
  stageName: string;
  probability: number;
  owner: {
    id: string;
    name: string;
    email: string;
  };
}

interface Task {
  id: string;
  subject: string;
  status: string;
  activityDate?: string;
  description?: string;
  priority?: string;
  sa_Activity__c?: string;
  type?: string;
  createdDate?: string;
  lastModifiedDate?: string;
  isClosed?: boolean;
  ownerId?: string;
  whatId?: string;
  what?: {
    __typename: string;
    name: string;
  };
}

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export function useCRMData(userDetails: { alias: string; sfdcId: string } | null) {
  const { showToast } = useToast();
  const accountDetailsCache = useRef<Map<string, Account>>(new Map());
  
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingOpportunities, setLoadingOpportunities] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState(false);

  const getCacheKey = (type: string, key: string) => `sfdc-${type}-${key}`;

  const loadAccountDetails = async (account: Account, forceRefresh = false) => {
    setOpportunities([]);
    setTasks([]);
    
    let enrichedAccount = accountDetailsCache.current.get(account.id);
    
    if (!enrichedAccount || forceRefresh) {
      try {
        const details = await salesforceProvider.getAccountDetails(account.id);
        enrichedAccount = {
          ...account,
          owner: details.owner,
          geo_Text__c: details.geo,
          awsci_customer: details.segment ? { customerRevenue: { tShirtSize: details.segment } } : undefined,
          website: details.website
        };
        accountDetailsCache.current.set(account.id, enrichedAccount);
      } catch (error) {
        console.error('Failed to fetch account details:', error);
        enrichedAccount = account;
      }
    }
    
    setSelectedAccount(enrichedAccount);
    
    setTimeout(() => {
      const accountElement = document.querySelector(`[data-account-id="${account.id}"]`);
      if (accountElement) {
        accountElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }, 100);
    
    const oppsCacheKey = getCacheKey('opportunities', account.id);
    const tasksCacheKey = getCacheKey('tasks', account.id);
    
    if (!forceRefresh) {
      const cachedOpps = sessionStorage.getItem(oppsCacheKey);
      const cachedTasks = sessionStorage.getItem(tasksCacheKey);
      
      if (cachedOpps && cachedTasks) {
        setOpportunities(JSON.parse(cachedOpps));
        setTasks(JSON.parse(cachedTasks));
        return;
      }
    }
    
    setLoadingOpportunities(true);
    setLoadingTasks(true);
    
    try {
      const [oppsVMs, tasksVMs] = await Promise.all([
        salesforceProvider.getAccountOpportunities(account.id).finally(() => setLoadingOpportunities(false)),
        userDetails?.sfdcId 
          ? salesforceProvider.getUserTasks(userDetails.sfdcId, { accountId: account.id }).finally(() => setLoadingTasks(false)) 
          : Promise.resolve([])
      ]);

      const oppsResult = oppsVMs.map(o => ({
        id: o.id,
        name: o.name,
        amount: o.amount,
        closeDate: o.closeDate.toISOString().split('T')[0],
        stageName: o.stage,
        probability: o.probability,
        owner: o.owner
      }));
      
      const tasksResult = tasksVMs.map(t => ({
        id: t.id,
        subject: t.subject,
        status: t.status,
        activityDate: t.dueDate?.toISOString().split('T')[0],
        description: t.description,
        priority: t.priority,
        sa_Activity__c: t.activityType,
        what: t.relatedTo ? { __typename: t.relatedTo.type, name: t.relatedTo.name } : undefined,
        whatId: t.relatedTo?.id
      }));

      setOpportunities(oppsResult || []);
      setTasks(tasksResult || []);
      
      sessionStorage.setItem(oppsCacheKey, JSON.stringify(oppsResult || []));
      sessionStorage.setItem(tasksCacheKey, JSON.stringify(tasksResult || []));
    } catch (error) {
      console.error('Failed to load account details:', error);
      showToast('Failed to load account details', 'error');
      setLoadingOpportunities(false);
      setLoadingTasks(false);
    }
  };

  const createOpportunity = async (oppFormData: {
    name: string;
    stageName: string;
    closeDate: string;
    amount: string;
    probability: string;
  }) => {
    if (!selectedAccount || !oppFormData.name || !oppFormData.closeDate) return;
    
    setLoading(true);
    try {
      await salesforceProvider.createOpportunity({
        name: oppFormData.name,
        accountId: selectedAccount.id,
        stage: oppFormData.stageName,
        closeDate: new Date(oppFormData.closeDate),
        amount: oppFormData.amount ? parseFloat(oppFormData.amount) : undefined,
        probability: parseInt(oppFormData.probability),
        owner: { id: '', name: '', email: '' }
      });
      
      showToast('Opportunity created successfully', 'success');
      await loadAccountDetails(selectedAccount, true);
    } catch (error) {
      console.error('Failed to create opportunity:', error);
      showToast('Failed to create opportunity', 'error');
    } finally {
      setLoading(false);
    }
  };

  return {
    accounts,
    setAccounts,
    selectedAccount,
    setSelectedAccount,
    opportunities,
    tasks,
    loading,
    setLoading,
    loadingOpportunities,
    loadingTasks,
    loadAccountDetails,
    createOpportunity,
    getCacheKey
  };
}