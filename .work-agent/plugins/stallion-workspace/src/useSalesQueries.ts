import { useApiQuery, transformTool } from '@stallion-ai/sdk';

/**
 * Fetch calendar events for a specific date
 */
export function useCalendarEvents(date: Date) {
  const dateStr = date.toISOString().split('T')[0];
  
  return useApiQuery(
    ['calendar', 'events', dateStr],
    async () => {
      const data = await transformTool('work-agent', 'sat-outlook_calendar_view', {
        view: 'day',
        start_date: dateStr.split('-').slice(1).join('-') + '-' + dateStr.split('-')[0]
      }, `(data) => ({
        events: data.map(e => ({
          meetingId: e.meetingId,
          meetingChangeKey: e.meetingChangeKey,
          subject: e.subject,
          start: e.start,
          end: e.end,
          location: e.location || '',
          organizer: e.organizer?.name || '',
          status: e.status,
          isCanceled: e.isCanceled || false,
          categories: e.categories || [],
          isAllDay: e.isAllDay || false
        }))
      })`);
      return data.events;
    },
    { staleTime: 2 * 60 * 1000 } // 2 min cache
  );
}

/**
 * Fetch meeting details
 */
export function useMeetingDetails(meetingId: string | null, meetingChangeKey?: string) {
  return useApiQuery(
    ['calendar', 'meeting', meetingId],
    async () => {
      const data = await transformTool('work-agent', 'sat-outlook_calendar_meeting', {
        meeting_id: meetingId,
        meeting_change_key: meetingChangeKey
      }, 'data => data');
      return data;
    },
    { 
      enabled: !!meetingId,
      staleTime: 5 * 60 * 1000 // 5 min cache
    }
  );
}

/**
 * Fetch opportunities for account
 */
export function useAccountOpportunities(accountId: string | null) {
  return useApiQuery(
    ['sfdc', 'opportunities', accountId],
    async () => {
      const result = await transformTool('work-agent', 'sat-sfdc_search_opportunities', { 
        condition: { field: 'accountId', operator: 'EXACT_MATCH', value: accountId }
      }, 'data => data.data');
      return result?.opportunities || [];
    },
    { 
      enabled: !!accountId,
      staleTime: 5 * 60 * 1000
    }
  );
}

/**
 * Fetch user tasks
 */
export function useUserTasks(userAlias: string | undefined, params?: { accountId?: string; opportunityId?: string }) {
  return useApiQuery(
    ['sfdc', 'tasks', userAlias, params],
    async () => {
      const result = await transformTool('work-agent', 'sat-sfdc_list_user_tasks', { userAlias, ...params }, 'data => data.data');
      return result?.tasks || [];
    },
    { 
      enabled: !!userAlias,
      staleTime: 2 * 60 * 1000 
    }
  );
}
