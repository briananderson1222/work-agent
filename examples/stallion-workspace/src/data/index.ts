/**
 * Data Layer - Hooks that use SDK provider system
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getProvider, hasProvider, getActiveProviderId } from '@stallion-ai/sdk';
import type { ICalendarProvider, ICRMProvider, IUserProvider, SearchCondition } from './providers';
import type { ProviderTypeMap, ProviderType } from './providerTypes';
import type { OpportunityVM, TaskVM } from './viewmodels';

const WORKSPACE = 'stallion';

// Type-safe provider getter for this workspace
function get<K extends ProviderType>(type: K): ProviderTypeMap[K] {
  return getProvider<ProviderTypeMap[K]>(WORKSPACE, type);
}

function has(type: ProviderType): boolean {
  return hasProvider(WORKSPACE, type);
}

function activeId(type: ProviderType): string | null {
  return getActiveProviderId(WORKSPACE, type);
}

// ============ Calendar Hooks ============

export function useCalendarEvents(date: Date, enabled = true) {
  const providerId = activeId('calendar');
  return useQuery({
    queryKey: ['calendar', 'events', date.toISOString().split('T')[0], providerId],
    queryFn: () => get('calendar').getEvents(date),
    staleTime: 2 * 60 * 1000,
    enabled: enabled && has('calendar'),
  });
}

export function useMeetingDetails(meetingId: string | null, changeKey?: string) {
  const providerId = activeId('calendar');
  return useQuery({
    queryKey: ['calendar', 'meeting', meetingId, providerId],
    queryFn: () => get('calendar').getMeetingDetails(meetingId!, changeKey),
    staleTime: 5 * 60 * 1000,
    enabled: !!meetingId && has('calendar'),
  });
}

// ============ User Hooks ============

export function useUserProfile() {
  const providerId = activeId('user');
  return useQuery({
    queryKey: ['user', 'profile', providerId],
    queryFn: () => get('user').getMyProfile(),
    staleTime: 10 * 60 * 1000,
    enabled: has('user'),
  });
}

// ============ CRM Hooks ============

export function useMyAccounts(userId: string | undefined) {
  const providerId = activeId('crm');
  return useQuery({
    queryKey: ['crm', 'myAccounts', userId, providerId],
    queryFn: () => get('crm').getMyAccounts(userId!),
    staleTime: 5 * 60 * 1000,
    enabled: !!userId && has('crm'),
  });
}

export function useMyTerritories(userId: string | undefined) {
  const providerId = activeId('crm');
  return useQuery({
    queryKey: ['crm', 'myTerritories', userId, providerId],
    queryFn: () => get('crm').getMyTerritories(userId!),
    staleTime: 10 * 60 * 1000,
    enabled: !!userId && has('crm'),
  });
}

export function useSearchAccounts(condition: SearchCondition | null) {
  const providerId = activeId('crm');
  return useQuery({
    queryKey: ['crm', 'searchAccounts', condition, providerId],
    queryFn: () => get('crm').searchAccounts(condition!),
    staleTime: 5 * 60 * 1000,
    enabled: !!condition && has('crm'),
  });
}

export function useTerritoryAccounts(territoryId: string | null) {
  const providerId = activeId('crm');
  return useQuery({
    queryKey: ['crm', 'territoryAccounts', territoryId, providerId],
    queryFn: () => get('crm').getTerritoryAccounts(territoryId!),
    staleTime: 5 * 60 * 1000,
    enabled: !!territoryId && has('crm'),
  });
}

export function useAccountDetails(accountId: string | null) {
  const providerId = activeId('crm');
  return useQuery({
    queryKey: ['crm', 'accountDetails', accountId, providerId],
    queryFn: () => get('crm').getAccountDetails(accountId!),
    staleTime: 5 * 60 * 1000,
    enabled: !!accountId && has('crm'),
  });
}

export function useAccountOpportunities(accountId: string | null) {
  const providerId = activeId('crm');
  return useQuery({
    queryKey: ['crm', 'accountOpportunities', accountId, providerId],
    queryFn: () => get('crm').getAccountOpportunities(accountId!),
    staleTime: 5 * 60 * 1000,
    enabled: !!accountId && has('crm'),
  });
}

export function useSearchOpportunities(condition: SearchCondition | null) {
  const providerId = activeId('crm');
  return useQuery({
    queryKey: ['crm', 'searchOpportunities', condition, providerId],
    queryFn: () => get('crm').searchOpportunities(condition!),
    staleTime: 5 * 60 * 1000,
    enabled: !!condition && has('crm'),
  });
}

export function useUserTasks(userAlias: string | undefined, filters?: { accountId?: string; opportunityId?: string }) {
  const providerId = activeId('crm');
  return useQuery({
    queryKey: ['crm', 'userTasks', userAlias, filters, providerId],
    queryFn: () => get('crm').getUserTasks(userAlias!, filters),
    staleTime: 2 * 60 * 1000,
    enabled: !!userAlias && has('crm'),
  });
}

export function useSearchTerritories(query: string | null) {
  const providerId = activeId('crm');
  return useQuery({
    queryKey: ['crm', 'searchTerritories', query, providerId],
    queryFn: () => get('crm').searchTerritories(query!),
    staleTime: 5 * 60 * 1000,
    enabled: !!query && has('crm'),
  });
}

export function useTaskDetails(taskId: string | null) {
  const providerId = activeId('crm');
  return useQuery({
    queryKey: ['crm', 'taskDetails', taskId, providerId],
    queryFn: () => get('crm').getTaskDetails(taskId!),
    staleTime: 5 * 60 * 1000,
    enabled: !!taskId && has('crm'),
  });
}

export function useInsightEnrichment(insightId: string | null) {
  const providerId = activeId('crm');
  return useQuery({
    queryKey: ['crm', 'insightEnrichment', insightId, providerId],
    queryFn: () => get('crm').fetchInsightEnrichment(insightId!),
    staleTime: 5 * 60 * 1000,
    enabled: !!insightId && has('crm'),
  });
}

export function useMyInsights(filters?: any) {
  const providerId = activeId('crm');
  return useQuery({
    queryKey: ['crm', 'myInsights', filters, providerId],
    queryFn: () => get('crm').listMyInsights(filters),
    staleTime: 5 * 60 * 1000,
    enabled: has('crm'),
  });
}

// ============ Mutations ============

export function useCreateOpportunity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<OpportunityVM, 'id'>) => get('crm').createOpportunity(data),
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ['crm', 'accountOpportunities', v.accountId] }),
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<TaskVM, 'id'>) => get('crm').createTask(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['crm', 'userTasks'] }),
  });
}

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, data }: { taskId: string; data: Partial<TaskVM> }) => get('crm').updateTask(taskId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['crm', 'userTasks'] }),
  });
}

export function useCreateInsightEnrichment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => get('crm').createInsightEnrichment(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['crm', 'insightEnrichment'] }),
  });
}

export function useCreateLeadershipInsight() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => get('crm').createLeadershipInsight(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['crm', 'myInsights'] }),
  });
}

// Re-export types
export * from './viewmodels';
export * from './providers';
export * from './providerTypes';

// Export provider implementations for registration
export { outlookProvider } from './providers/outlook';
export { salesforceProvider } from './providers/salesforce';
