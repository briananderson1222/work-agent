import type { Notification } from '@stallion-ai/contracts/notification';
import { useQueryClient } from '@tanstack/react-query';
import { _getApiBase } from '../api';
import { type QueryConfig, useApiMutation, useApiQuery } from '../query-core';

export async function fetchNotifications(input?: {
  category?: string[];
  status?: string[];
}): Promise<Notification[]> {
  const apiBase = await _getApiBase();
  const params = new URLSearchParams();
  input?.status?.forEach((status) => params.append('status', status));
  input?.category?.forEach((category) => params.append('category', category));
  const query = params.toString();
  const response = await fetch(
    `${apiBase}/notifications${query ? `?${query}` : ''}`,
  );
  const result = (await response.json()) as {
    success: boolean;
    data?: Notification[];
    error?: string;
  };
  if (!result.success) {
    throw new Error(result.error || 'Failed to fetch notifications');
  }
  return result.data ?? [];
}

export async function dismissNotification(id: string): Promise<void> {
  const apiBase = await _getApiBase();
  const response = await fetch(`${apiBase}/notifications/${id}`, {
    method: 'DELETE',
  });
  const result = (await response.json()) as {
    success: boolean;
    error?: string;
  };
  if (!result.success) {
    throw new Error(result.error || 'Failed to dismiss notification');
  }
}

export async function clearNotifications(): Promise<void> {
  const apiBase = await _getApiBase();
  const response = await fetch(`${apiBase}/notifications`, {
    method: 'DELETE',
  });
  const result = (await response.json()) as {
    success: boolean;
    error?: string;
  };
  if (!result.success) {
    throw new Error(result.error || 'Failed to clear notifications');
  }
}

export async function actOnNotification(input: {
  actionId: string;
  id: string;
}): Promise<void> {
  const apiBase = await _getApiBase();
  const response = await fetch(
    `${apiBase}/notifications/${encodeURIComponent(input.id)}/action/${encodeURIComponent(input.actionId)}`,
    {
      method: 'POST',
    },
  );
  const result = (await response.json()) as {
    success: boolean;
    error?: string;
  };
  if (!result.success) {
    throw new Error(result.error || 'Failed to act on notification');
  }
}

export function useNotificationsQuery(
  input?: { category?: string[]; status?: string[] },
  config?: QueryConfig<Notification[]>,
) {
  return useApiQuery(
    ['notifications', input ?? {}],
    () => fetchNotifications(input),
    config,
  );
}

export function useDismissNotificationMutation() {
  return useApiMutation(dismissNotification, {
    invalidateKeys: [['notifications']],
  });
}

export function useNotificationActionMutation() {
  return useApiMutation(actOnNotification, {
    invalidateKeys: [['notifications']],
  });
}

export function useClearNotificationsMutation() {
  return useApiMutation(clearNotifications, {
    invalidateKeys: [['notifications']],
  });
}

export function useInvalidateNotifications() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['notifications'] });
}
