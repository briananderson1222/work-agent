/**
 * Salesforce Provider - implements ICRMProvider and IUserProvider using sat-sfdc tools
 */

import { transformTool } from '@stallion-ai/sdk';
import type { ICRMProvider, IUserProvider, SearchCondition } from '../providers';
import type { AccountVM, AccountSpendVM, OpportunityVM, TaskVM, TerritoryVM, UserProfileVM } from '../viewmodels';

const AGENT = 'work-agent';

function mapAccount(raw: any): AccountVM {
  const acct = raw.account || raw.data || raw;
  return {
    id: acct.id,
    name: acct.name,
    owner: acct.owner ? { id: acct.owner.id || '', name: acct.owner.name } : undefined,
    website: acct.website,
    geo: acct.sub_BU__c || acct.geo_Text__c,
    segment: acct.gtmSector || acct.awsci_customer?.customerRevenue?.tShirtSize,
    healthScore: acct.healthScore?.overallHealthScore,
    adoptionPhase: acct.adoptionPhase,
    territory: acct.territory?.name || acct.territory,
    sources: acct._sources,
  };
}

function mapOpportunity(raw: any): OpportunityVM {
  return {
    id: raw.id,
    name: raw.name,
    accountId: raw.accountId,
    amount: raw.amount,
    closeDate: new Date(raw.closeDate),
    stage: raw.stageName,
    probability: raw.probability,
    owner: { id: raw.owner?.id || '', name: raw.owner?.name || '', email: raw.owner?.email || '' },
  };
}

function mapTask(raw: any): TaskVM {
  return {
    id: raw.id,
    subject: raw.subject,
    status: raw.isClosed ? 'completed' : raw.status === 'Deferred' ? 'deferred' : 'open',
    dueDate: raw.activityDate ? new Date(raw.activityDate) : undefined,
    description: raw.description,
    priority: raw.priority?.toLowerCase() as TaskVM['priority'],
    activityType: raw.sa_Activity__c || raw.type,
    relatedTo: raw.what ? { type: raw.what.__typename, id: raw.whatId, name: raw.what.name } : undefined,
  };
}

export const salesforceProvider: ICRMProvider & IUserProvider = {
  async getMyProfile() {
    const r = await transformTool(AGENT, 'sat-sfdc_get_my_personal_details', {}, 'data => data.data || data');
    // Enrich with full name from search_users
    try {
      const users = await transformTool(AGENT, 'sat-sfdc_search_users', { alias: r.alias }, 'data => data.data?.users || data.users || []');
      const me = Array.isArray(users) && users[0];
      if (me) {
        return { id: r.sfdcId, name: me.name, email: me.email, alias: r.alias, role: me.businessTitle, title: me.businessTitle, manager: me.directManager?.name };
      }
    } catch { /* fall through */ }
    return { id: r.sfdcId, name: r.alias, email: r.email || `${r.alias}@amazon.com`, alias: r.alias, role: r.role };
  },

  async getMyAccounts(userId: string) {
    const r = await transformTool(AGENT, 'sat-sfdc_list_user_assigned_accounts', { userId }, 'data => data.data?.accountTeamMembers || data.accountTeamMembers || []');
    return (r || []).map(mapAccount);
  },

  async searchAccounts(condition: SearchCondition) {
    const params: any = condition.field === 'owner' 
      ? { owner: condition.value, ownerFilterType: condition.operator === 'CONTAINS' ? 'CONTAINS_WORD' : 'EXACT_MATCH' }
      : { condition };
    const r = await transformTool(AGENT, 'sat-sfdc_search_accounts', params, 'data => data || []');
    return (r || []).map(mapAccount);
  },

  async getAccountDetails(accountId: string) {
    const r = await transformTool(AGENT, 'sat-sfdc_fetch_account_details', { accountId }, 'data => data');
    return mapAccount(r);
  },

  // Spend
  async getAccountSpend(accountId: string): Promise<AccountSpendVM> {
    const r = await transformTool(AGENT, 'sat-sfdc_get_account_spend_summary', { sfdcAccountId: accountId }, 'data => data');
    const m = r?.data?.currentMetrics || r?.currentMetrics || {};
    return {
      accountId,
      mtdSpend: m.monthToDate?.charge,
      ytdSpend: m.yearToDate?.charge,
      mtdGrowth: m.weekOverWeek?.chargePercent,
      ytdGrowth: m.weekOverWeek?.chargePercent,
      lastUpdated: m.effectiveDate,
    };
  },

  async getAccountSpendByService(accountId: string, options?: { period?: string; limit?: number }) {
    const r = await transformTool(AGENT, 'sat-sfdc_get_account_spend_by_service', 
      { sfdcAccountId: accountId, period: options?.period, limit: options?.limit || 10 }, 
      'data => data.services || data || []');
    return r || [];
  },

  async getRegistryAssignments(userId: string) {
    const r = await transformTool(AGENT, 'sat-sfdc_get_registry_assignments', { employeeIdentifier: userId }, 'data => data.assignments || data || []');
    return r || [];
  },

  // Territories
  async getMyTerritories(userId: string) {
    const r = await transformTool(AGENT, 'sat-sfdc_list_user_assigned_territories', { userId }, 'data => data.data?.territories || data.territories || []');
    return (r || []).map((t: any): TerritoryVM => ({ id: t.id, name: t.name }));
  },

  async searchTerritories(query: string) {
    const r = await transformTool(AGENT, 'sat-sfdc_search_territories', { queryTerm: query }, 'data => data.territories || data || []');
    return (r || []).map((t: any): TerritoryVM => ({ id: t.id, name: t.name }));
  },

  async getTerritoryAccounts(territoryId: string) {
    const r = await transformTool(AGENT, 'sat-sfdc_list_territory_accounts', { territoryId }, 'data => data.accounts || data || []');
    return (r || []).map(mapAccount);
  },

  // Opportunities
  async getAccountOpportunities(accountId: string) {
    const r = await transformTool(AGENT, 'sat-sfdc_search_opportunities', 
      { condition: { field: 'accountId', operator: 'EXACT_MATCH', value: accountId } },
      'data => data.data?.resultRecords || data.resultRecords || []');
    return (r || []).map(mapOpportunity);
  },

  async searchOpportunities(condition: SearchCondition) {
    const r = await transformTool(AGENT, 'sat-sfdc_search_opportunities', { condition }, 'data => data.data?.resultRecords || data.resultRecords || []');
    return (r || []).map(mapOpportunity);
  },

  async createOpportunity(data: Omit<OpportunityVM, 'id'>) {
    const r = await transformTool(AGENT, 'sat-sfdc_create_opportunity', {
      accountId: data.accountId, name: data.name, stageName: data.stage,
      closeDate: data.closeDate.toISOString().split('T')[0], amount: data.amount, probability: data.probability,
    }, 'data => data');
    return mapOpportunity(r);
  },

  // Tasks
  async getUserTasks(userId: string, filters?: { accountId?: string; opportunityId?: string }) {
    const conditions: any[] = [{ field: 'ownerId', operator: 'EXACT_MATCH', value: userId }];
    const whatId = filters?.opportunityId || filters?.accountId;
    if (whatId) conditions.push({ field: 'whatId', operator: 'EXACT_MATCH', value: whatId });
    const condition = conditions.length === 1 ? conditions[0] : { operator: 'AND', conditions };
    const r = await transformTool(AGENT, 'sat-sfdc_search_tasks', { condition }, 'data => data.data?.resultRecords || data.resultRecords || []');
    return (r || []).map(mapTask);
  },

  async getTaskDetails(taskId: string) {
    const r = await transformTool(AGENT, 'sat-sfdc_fetch_task_details', { taskId }, 'data => data');
    return mapTask(r);
  },

  async createTask(data: Omit<TaskVM, 'id'>) {
    const r = await transformTool(AGENT, 'sat-sfdc_create_tech_activity', {
      subject: data.subject, activityDate: data.dueDate?.toISOString().split('T')[0],
      description: data.description, saActivity: data.activityType, whatId: data.relatedTo?.id,
    }, 'data => data');
    return mapTask(r);
  },

  async updateTask(taskId: string, data: Partial<TaskVM>) {
    const r = await transformTool(AGENT, 'sat-sfdc_update_tech_activity', {
      taskId, subject: data.subject, activityDate: data.dueDate?.toISOString().split('T')[0],
      description: data.description, saActivity: data.activityType,
    }, 'data => data');
    return mapTask(r);
  },

  // Campaigns
  async searchCampaigns(query: string) {
    const r = await transformTool(AGENT, 'sat-sfdc_search_campaigns', { queryTerm: query }, 'data => data.campaigns || data || []');
    return r || [];
  },
};
