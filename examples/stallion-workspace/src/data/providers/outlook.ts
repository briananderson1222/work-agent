/**
 * Outlook Calendar Provider - Mock implementation
 * Replace with actual MCP tool integration for production use
 */

import type { ICalendarProvider } from '../providers';
import type { CalendarEventVM, MeetingDetailsVM } from '../viewmodels';

/** Provider metadata for registration */
export const metadata = { workspace: 'stallion', type: 'calendar' };

const mockEvents: CalendarEventVM[] = [
  {
    id: 'mock-1',
    changeKey: 'ck-1',
    subject: 'Team Standup',
    start: new Date(),
    end: new Date(Date.now() + 30 * 60 * 1000),
    location: 'Virtual',
    organizer: 'Demo User',
    status: 'confirmed',
    isCancelled: false,
    categories: [],
    isAllDay: false,
  },
];

export const outlookProvider: ICalendarProvider = {
  async getEvents(_date: Date) {
    return mockEvents;
  },

  async getMeetingDetails(meetingId: string, _changeKey?: string): Promise<MeetingDetailsVM> {
    const event = mockEvents.find(e => e.id === meetingId) || mockEvents[0];
    return {
      ...event,
      body: 'Mock meeting body content',
      attendees: [{ email: 'demo@example.com', name: 'Demo User', status: 'accepted' }],
    };
  },
};
