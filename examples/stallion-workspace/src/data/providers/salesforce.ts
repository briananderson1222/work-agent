/**
 * Salesforce Provider - Mock implementation
 * Replace with actual MCP tool integration for production use
 */

import type { ICRMProvider, IUserProvider, SearchCondition } from '../providers';
import type { AccountVM, OpportunityVM, TaskVM, TerritoryVM, UserProfileVM } from '../viewmodels';

/** Provider metadata for registration */
export const crmMetadata = { workspace: 'stallion', type: 'crm' };
export const userMetadata = { workspace: 'stallion', type: 'user' };

const mockProfile: UserProfileVM = { id: 'user-1', name: 'Demo User', email: 'demo@example.com', alias: 'demo', role: 'SA' };
const mockAccounts: AccountVM[] = [
  { id: 'acct-1', name: 'Acme Corp', owner: { id: 'user-1', name: 'Demo User' }, website: 'https://example.com' },
];
const mockOpportunities: OpportunityVM[] = [
  { id: 'opp-1', name: 'Demo Opportunity', accountId: 'acct-1', amount: 100000, closeDate: new Date(), stage: 'Prospecting', probability: 25, owner: { id: 'user-1', name: 'Demo User', email: 'demo@example.com' } },
];
const mockTasks: TaskVM[] = [
  { id: 'task-1', subject: 'Follow up', status: 'open', priority: 'normal' },
];
const mockTerritories: TerritoryVM[] = [
  { id: 'terr-1', name: 'Demo Territory' },
];

export const salesforceProvider: ICRMProvider & IUserProvider = {
  async getMyProfile() { return mockProfile; },
  async getMyAccounts(_userId: string) { return mockAccounts; },
  async getMyTerritories(_userId: string) { return mockTerritories; },
  async searchAccounts(_condition: SearchCondition) { return mockAccounts; },
  async getTerritoryAccounts(_territoryId: string) { return mockAccounts; },
  async getAccountDetails(_accountId: string) { return mockAccounts[0]; },
  async getAccountOpportunities(_accountId: string) { return mockOpportunities; },
  async searchOpportunities(_condition: SearchCondition) { return mockOpportunities; },
  async getUserTasks(_userAlias: string, _filters?: { accountId?: string; opportunityId?: string }) { return mockTasks; },
  async createOpportunity(data: Omit<OpportunityVM, 'id'>) { return { id: 'new-opp', ...data } as OpportunityVM; },
  async createTask(data: Omit<TaskVM, 'id'>) { return { id: 'new-task', ...data } as TaskVM; },
  async searchTerritories(_query: string) { return mockTerritories; },
  async getTaskDetails(_taskId: string) { return mockTasks[0]; },
  async updateTask(_taskId: string, data: Partial<TaskVM>) { return { ...mockTasks[0], ...data }; },
  async fetchInsightEnrichment(_insightId: string) { return {}; },
  async listMyInsights(_filters?: any) { return []; },
  async createInsightEnrichment(_data: any) { return {}; },
  async createLeadershipInsight(_data: any) { return {}; },
  async searchCampaigns(_query: string) { return []; },
};
