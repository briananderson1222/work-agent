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

export function useUserTasks(userId: string | undefined, filters?: { accountId?: string; opportunityId?: string; limit?: number; after?: string }) {
  const providerId = activeId('crm');
  return useQuery({
    queryKey: ['crm', 'userTasks', userId, filters, providerId],
    queryFn: () => get('crm').getUserTasks(userId!, filters),
    staleTime: 2 * 60 * 1000,
    enabled: !!userId && has('crm'),
  });
}

/** Convenience: my recent tasks (newest first, paginated) */
export function useMyTasks(userId: string | undefined, limit = 10) {
  return useUserTasks(userId, { limit });
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
  const providerId = activeId('sift');
  return useQuery({
    queryKey: ['sift', 'enrichment', insightId, providerId],
    queryFn: () => get('sift').getEnrichment(insightId!),
    staleTime: 5 * 60 * 1000,
    enabled: !!insightId && has('sift'),
  });
}

export function useMyInsights(filters?: any) {
  const providerId = activeId('sift');
  return useQuery({
    queryKey: ['sift', 'myInsights', filters, providerId],
    queryFn: () => get('sift').listMyInsights(filters),
    staleTime: 5 * 60 * 1000,
    enabled: has('sift'),
  });
}

// ============ Spend Hooks ============

export function useAccountSpend(accountId: string | null) {
  const providerId = activeId('crm');
  return useQuery({
    queryKey: ['crm', 'accountSpend', accountId, providerId],
    queryFn: () => get('crm').getAccountSpend(accountId!),
    staleTime: 5 * 60 * 1000,
    enabled: !!accountId && has('crm'),
  });
}

export function useAccountSpendByService(accountId: string | null) {
  const providerId = activeId('crm');
  return useQuery({
    queryKey: ['crm', 'accountSpendByService', accountId, providerId],
    queryFn: () => get('crm').getAccountSpendByService(accountId!),
    staleTime: 5 * 60 * 1000,
    enabled: !!accountId && has('crm'),
  });
}

// ============ Email Hooks ============

export function useEmailInbox(options?: { count?: number; filter?: string }) {
  const providerId = activeId('email');
  return useQuery({
    queryKey: ['email', 'inbox', options, providerId],
    queryFn: () => get('email').getInbox(options),
    staleTime: 2 * 60 * 1000,
    enabled: has('email'),
  });
}

export function useEmailSearch(query: string | null) {
  const providerId = activeId('email');
  return useQuery({
    queryKey: ['email', 'search', query, providerId],
    queryFn: () => get('email').searchEmails(query!),
    staleTime: 2 * 60 * 1000,
    enabled: !!query && has('email'),
  });
}

export function useReadEmail(id: string | null) {
  const providerId = activeId('email');
  return useQuery({
    queryKey: ['email', 'read', id, providerId],
    queryFn: () => get('email').readEmail(id!),
    staleTime: 5 * 60 * 1000,
    enabled: !!id && has('email'),
  });
}

// ============ Internal (People) Hooks ============

export function usePersonLookup(alias: string | null) {
  const providerId = activeId('internal');
  return useQuery({
    queryKey: ['internal', 'person', alias, providerId],
    queryFn: () => get('internal').lookupPerson(alias!),
    staleTime: 10 * 60 * 1000,
    enabled: !!alias && has('internal'),
  });
}

export function usePeopleSearch(query: string | null) {
  const providerId = activeId('internal');
  return useQuery({
    queryKey: ['internal', 'search', query, providerId],
    queryFn: () => get('internal').searchPeople(query!),
    staleTime: 5 * 60 * 1000,
    enabled: !!query && has('internal'),
  });
}

// ============ SIFT Hooks ============

export function useSiftQueue(filters?: any) {
  const providerId = activeId('sift');
  return useQuery({
    queryKey: ['sift', 'queue', filters, providerId],
    queryFn: () => get('sift').listMyInsights(filters),
    staleTime: 2 * 60 * 1000,
    enabled: has('sift'),
  });
}

export function useSiftInsight(id: string | null) {
  const providerId = activeId('sift');
  return useQuery({
    queryKey: ['sift', 'insight', id, providerId],
    queryFn: () => get('sift').getInsight(id!),
    staleTime: 5 * 60 * 1000,
    enabled: !!id && has('sift'),
  });
}

export function useCreateSift() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => get('sift').createInsight(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sift'] }),
  });
}

export function useUpdateSift() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => get('sift').updateInsight(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sift'] }),
  });
}

export function useDeleteSift() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => get('sift').deleteInsight(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sift'] }),
  });
}

export function useEnrichSift() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => get('sift').enrichInsight(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sift'] }),
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
    mutationFn: (data: any) => get('sift').enrichInsight(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sift', 'enrichment'] }),
  });
}

export function useCreateLeadershipInsight() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => get('sift').createInsight(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sift'] }),
  });
}

// Re-export types
export * from './viewmodels';
export * from './providers';
export * from './providerTypes';

// Export provider implementations for registration
export { outlookProvider } from './providers/outlook';
export { emailProvider } from './providers/outlook-email';
export { salesforceProvider } from './providers/salesforce';
export { builderProvider } from './providers/builder';
export { siftProvider } from './providers/sift';
