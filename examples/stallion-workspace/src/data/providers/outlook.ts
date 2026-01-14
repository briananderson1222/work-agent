/**
 * Outlook Calendar Provider - implements ICalendarProvider using sat-outlook tools
 */

import { transformTool } from '@stallion-ai/sdk';
import type { ICalendarProvider } from '../providers';
import type { CalendarEventVM, MeetingDetailsVM, AttendeeVM } from '../viewmodels';

/** Provider metadata for registration */
export const metadata = { workspace: 'stallion', type: 'calendar' };

const AGENT = 'work-agent';

function mapEvent(raw: any): CalendarEventVM {
  return {
    id: raw.meetingId,
    changeKey: raw.meetingChangeKey,
    subject: raw.subject,
    start: new Date(raw.start),
    end: new Date(raw.end),
    location: raw.location || undefined,
    organizer: raw.organizer?.name || raw.organizer,
    status: raw.isCanceled ? 'cancelled' : raw.status === 'tentative' ? 'tentative' : 'confirmed',
    isCancelled: raw.isCanceled || false,
    categories: raw.categories || [],
    isAllDay: raw.isAllDay || false,
  };
}

function mapAttendeeStatus(status: string): AttendeeVM['status'] {
  if (!status || status === 'Unknown' || status === 'NoResponseReceived') return 'none';
  if (status === 'Accept' || status === 'Accepted') return 'accepted';
  if (status === 'Decline' || status === 'Declined') return 'declined';
  return 'tentative';
}

export const outlookProvider: ICalendarProvider = {
  async getEvents(date: Date) {
    const dateStr = date.toISOString().split('T')[0];
    const formatted = dateStr.split('-').slice(1).join('-') + '-' + dateStr.split('-')[0];
    const data = await transformTool(AGENT, 'sat-outlook_calendar_view', { view: 'day', start_date: formatted }, 'data => data');
    return (data || []).map(mapEvent);
  },

  async getMeetingDetails(meetingId: string, changeKey?: string) {
    const data = await transformTool(AGENT, 'sat-outlook_calendar_meeting', {
      operation: 'read', meetingId, meetingChangeKey: changeKey
    }, 'data => data.success ? data.content : data');
    
    return {
      ...mapEvent(data),
      body: data.body,
      attendees: (data.attendees || []).map((a: any): AttendeeVM => ({
        email: a.emailAddress?.address || a.email,
        name: a.emailAddress?.name || a.name,
        status: mapAttendeeStatus(a.responseStatus || a.status),
      })),
    };
  },
};
