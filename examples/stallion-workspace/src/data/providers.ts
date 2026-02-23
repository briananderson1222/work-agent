/**
 * Provider Interfaces - Contracts for data fetching
 */

import type {
  CalendarEventVM,
  MeetingDetailsVM,
  AccountVM,
  AccountSpendVM,
  OpportunityVM,
  TaskVM,
  TerritoryVM,
  UserProfileVM,
  EmailVM,
  EmailDetailVM,
  PersonVM,
  InsightVM,
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
  
  // Spend
  getAccountSpend(accountId: string): Promise<AccountSpendVM>;
  getAccountSpendByService(accountId: string, options?: { period?: string; limit?: number }): Promise<any[]>;
  getRegistryAssignments(userId: string): Promise<any[]>;
  
  // Territories
  getMyTerritories(userId: string): Promise<TerritoryVM[]>;
  searchTerritories(query: string): Promise<TerritoryVM[]>;
  getTerritoryAccounts(territoryId: string): Promise<AccountVM[]>;
  
  // Opportunities
  getAccountOpportunities(accountId: string): Promise<OpportunityVM[]>;
  searchOpportunities(condition: SearchCondition): Promise<OpportunityVM[]>;
  createOpportunity(data: Omit<OpportunityVM, 'id'>): Promise<OpportunityVM>;
  
  // Tasks
  getUserTasks(userId: string, filters?: { accountId?: string; opportunityId?: string }): Promise<TaskVM[]>;
  getTaskDetails(taskId: string): Promise<TaskVM>;
  createTask(data: Omit<TaskVM, 'id'>): Promise<TaskVM>;
  updateTask(taskId: string, data: Partial<TaskVM>): Promise<TaskVM>;
  
  // Campaigns
  searchCampaigns(query: string): Promise<any[]>;
}

export interface IEmailProvider {
  getInbox(options?: { count?: number; filter?: string }): Promise<EmailVM[]>;
  searchEmails(query: string): Promise<EmailVM[]>;
  readEmail(id: string): Promise<EmailDetailVM>;
}

export interface IInternalProvider {
  lookupPerson(alias: string): Promise<PersonVM>;
  searchPeople(query: string): Promise<PersonVM[]>;
}

export interface ISiftProvider {
  listMyInsights(filters?: any): Promise<InsightVM[]>;
  searchInsights(query: string, filters?: any): Promise<InsightVM[]>;
  getInsight(id: string): Promise<InsightVM>;
  getEnrichment(enrichmentId: string): Promise<any>;
  createInsight(data: any): Promise<InsightVM>;
  updateInsight(id: string, data: any): Promise<InsightVM>;
  deleteInsight(id: string): Promise<void>;
  enrichInsight(data: any): Promise<any>;
}

export interface IUserProvider {
  getMyProfile(): Promise<UserProfileVM>;
}
