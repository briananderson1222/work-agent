/**
 * Provider Interfaces - Contracts for data fetching
 */

import type {
  CalendarEventVM,
  MeetingDetailsVM,
  AccountVM,
  OpportunityVM,
  TaskVM,
  TerritoryVM,
  UserProfileVM,
} from './viewmodels';

export interface ICalendarProvider {
  getEvents(date: Date): Promise<CalendarEventVM[]>;
  getMeetingDetails(meetingId: string, changeKey?: string): Promise<MeetingDetailsVM>;
}

export interface SearchCondition {
  field: string;
  operator: 'EXACT_MATCH' | 'CONTAINS' | 'STARTS_WITH';
  value: string;
}

export interface ICRMProvider {
  // Accounts
  getMyAccounts(userId: string): Promise<AccountVM[]>;
  searchAccounts(condition: SearchCondition): Promise<AccountVM[]>;
  getAccountDetails(accountId: string): Promise<AccountVM>;
  
  // Territories
  getMyTerritories(userId: string): Promise<TerritoryVM[]>;
  searchTerritories(query: string): Promise<TerritoryVM[]>;
  getTerritoryAccounts(territoryId: string): Promise<AccountVM[]>;
  
  // Opportunities
  getAccountOpportunities(accountId: string): Promise<OpportunityVM[]>;
  searchOpportunities(condition: SearchCondition): Promise<OpportunityVM[]>;
  createOpportunity(data: Omit<OpportunityVM, 'id'>): Promise<OpportunityVM>;
  
  // Tasks
  getUserTasks(userAlias: string, filters?: { accountId?: string; opportunityId?: string }): Promise<TaskVM[]>;
  getTaskDetails(taskId: string): Promise<TaskVM>;
  createTask(data: Omit<TaskVM, 'id'>): Promise<TaskVM>;
  updateTask(taskId: string, data: Partial<TaskVM>): Promise<TaskVM>;
  
  // Insights
  fetchInsightEnrichment(insightId: string): Promise<any>;
  listMyInsights(filters?: any): Promise<any[]>;
  createInsightEnrichment(data: any): Promise<any>;
  createLeadershipInsight(data: any): Promise<any>;
  
  // Campaigns
  searchCampaigns(query: string): Promise<any[]>;
}

export interface IUserProvider {
  getMyProfile(): Promise<UserProfileVM>;
}
