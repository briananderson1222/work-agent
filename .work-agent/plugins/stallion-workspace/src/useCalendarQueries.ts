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
