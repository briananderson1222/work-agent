/**
 * Salesforce Provider - implements ICRMProvider and IUserProvider using sat-sfdc tools
 */

import { transformTool } from '@stallion-ai/sdk';
import type { ICRMProvider, IUserProvider, SearchCondition } from '../providers';
import type { AccountVM, OpportunityVM, TaskVM, TerritoryVM, UserProfileVM } from '../viewmodels';

/** Provider metadata for registration */
export const crmMetadata = { workspace: 'stallion', type: 'crm' };
export const userMetadata = { workspace: 'stallion', type: 'user' };

const AGENT = 'work-agent';

function mapAccount(raw: any): AccountVM {
  const acct = raw.account || raw;
  return {
    id: acct.id,
    name: acct.name,
    owner: acct.owner ? { id: acct.owner.id || '', name: acct.owner.name } : undefined,
    website: acct.website,
    geo: acct.geo_Text__c,
    segment: acct.awsci_customer?.customerRevenue?.tShirtSize,
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
    return { id: r.sfdcId, name: r.alias, email: r.email, alias: r.alias, role: r.role };
  },

  async getMyAccounts(userId: string) {
    const r = await transformTool(AGENT, 'sat-sfdc_list_user_assigned_accounts', { userId }, 'data => data.data?.accountTeamMembers || data.accountTeamMembers || []');
    return (r || []).map(mapAccount);
  },

  async getMyTerritories(userId: string) {
    const r = await transformTool(AGENT, 'sat-sfdc_list_user_assigned_territories', { userId }, 'data => data.data?.territories || data.territories || []');
    return (r || []).map((t: any): TerritoryVM => ({ id: t.id, name: t.name }));
  },

  async searchAccounts(condition: SearchCondition) {
    const params: any = condition.field === 'owner' 
      ? { owner: condition.value, ownerFilterType: condition.operator === 'CONTAINS' ? 'CONTAINS_WORD' : 'EXACT_MATCH' }
      : { condition };
    const r = await transformTool(AGENT, 'sat-sfdc_search_accounts', params, 'data => data || []');
    return (r || []).map(mapAccount);
  },

  async getTerritoryAccounts(territoryId: string) {
    const r = await transformTool(AGENT, 'sat-sfdc_list_territory_accounts', { territoryId }, 'data => data.accounts || data || []');
    return (r || []).map(mapAccount);
  },

  async getAccountDetails(accountId: string) {
    const r = await transformTool(AGENT, 'sat-sfdc_fetch_account_details', { accountId }, 'data => data');
    return mapAccount(r);
  },

  async getAccountOpportunities(accountId: string) {
    const r = await transformTool(AGENT, 'sat-sfdc_search_opportunities', 
      { condition: { field: 'accountId', operator: 'EXACT_MATCH', value: accountId } },
      'data => data.data?.opportunities || data.opportunities || []');
    return (r || []).map(mapOpportunity);
  },

  async searchOpportunities(condition: SearchCondition) {
    const r = await transformTool(AGENT, 'sat-sfdc_search_opportunities', { condition }, 'data => data.data?.opportunities || data.opportunities || []');
    return (r || []).map(mapOpportunity);
  },

  async getUserTasks(userAlias: string, filters?: { accountId?: string; opportunityId?: string }) {
    const r = await transformTool(AGENT, 'sat-sfdc_list_user_tasks', { userAlias, ...filters }, 'data => data.data?.tasks || data.tasks || []');
    return (r || []).map(mapTask);
  },

  async createOpportunity(data: Omit<OpportunityVM, 'id'>) {
    const r = await transformTool(AGENT, 'sat-sfdc_create_opportunity', {
      accountId: data.accountId, name: data.name, stageName: data.stage,
      closeDate: data.closeDate.toISOString().split('T')[0], amount: data.amount, probability: data.probability,
    }, 'data => data');
    return mapOpportunity(r);
  },

  async createTask(data: Omit<TaskVM, 'id'>) {
    const r = await transformTool(AGENT, 'sat-sfdc_create_sa_activity', {
      subject: data.subject, activityDate: data.dueDate?.toISOString().split('T')[0],
      description: data.description, saActivity: data.activityType, whatId: data.relatedTo?.id,
    }, 'data => data');
    return mapTask(r);
  },

  async searchTerritories(query: string) {
    const r = await transformTool(AGENT, 'sat-sfdc_search_territories', { query }, 'data => data.territories || data || []');
    return (r || []).map((t: any): TerritoryVM => ({ id: t.id, name: t.name }));
  },

  async getTaskDetails(taskId: string) {
    const r = await transformTool(AGENT, 'sat-sfdc_fetch_task_details', { taskId }, 'data => data');
    return mapTask(r);
  },

  async updateTask(taskId: string, data: Partial<TaskVM>) {
    const r = await transformTool(AGENT, 'sat-sfdc_update_tech_activity', {
      taskId,
      subject: data.subject,
      activityDate: data.dueDate?.toISOString().split('T')[0],
      description: data.description,
      saActivity: data.activityType,
    }, 'data => data');
    return mapTask(r);
  },

  async fetchInsightEnrichment(insightId: string) {
    return transformTool(AGENT, 'sat-sfdc_fetch_insight_enrichment', { insightId }, 'data => data');
  },

  async listMyInsights(filters?: any) {
    const r = await transformTool(AGENT, 'sat-sfdc_list_my_insights', filters || {}, 'data => data.insights || data || []');
    return r || [];
  },

  async createInsightEnrichment(data: any) {
    return transformTool(AGENT, 'sat-sfdc_create_insight_enrichment', data, 'data => data');
  },

  async createLeadershipInsight(data: any) {
    return transformTool(AGENT, 'sat-sfdc_create_leadership_insight', data, 'data => data');
  },

  async searchCampaigns(query: string) {
    const r = await transformTool(AGENT, 'sat-sfdc_search_campaigns', { queryTerm: query }, 'data => data.campaigns || data || []');
    return r || [];
  },
};
