import { z } from 'zod';

export const CalendarEventSchema = z.object({
  events: z.array(z.object({
    meetingId: z.string(),
    meetingChangeKey: z.string(),
    subject: z.string(),
    start: z.string(),
    end: z.string(),
    location: z.string().optional(),
    organizer: z.string().optional(),
    status: z.string().optional(),
    isCanceled: z.boolean().optional(),
    categories: z.array(z.string()).optional(),
    isAllDay: z.boolean().optional(),
  }))
});

export interface CalendarEvent {
  meetingId: string;
  meetingChangeKey: string;
  subject: string;
  start: string;
  end: string;
  location?: string;
  organizer?: string;
  status?: string;
  isCanceled?: boolean;
  categories?: string[];
  isAllDay?: boolean;
}

export interface MeetingDetails extends CalendarEvent {
  body?: string;
  attendees?: Array<{email: string, name?: string, status: string}>;
  responseStatus?: string;
}

export interface SFDCContext {
  accounts?: any[];
  campaigns?: any[];
  opportunities?: any[];
  tasks?: any[];
  suggestedKeyword?: string;
  selectedAccountId?: string;
}

export interface CalendarProps {
  activeTab?: any;
}

export function getCacheKey(type: 'calendar' | 'sfdc', identifier?: string): string {
  const today = new Date().toISOString().split('T')[0];
  return type === 'calendar' 
    ? `sa-calendar-${today}` 
    : `sa-sfdc-${identifier}`;
}

export function getFromCache<T>(key: string): T | null {
  try {
    const cached = sessionStorage.getItem(key);
    if (cached) {
      const { data, timestamp } = JSON.parse(cached);
      if (Date.now() - timestamp < 5 * 60 * 1000) {
        return data;
      }
      sessionStorage.removeItem(key);
    }
  } catch {
    // Ignore cache errors
  }
  return null;
}

export function setCache(key: string, data: any): void {
  try {
    sessionStorage.setItem(key, JSON.stringify({ data, timestamp: Date.now() }));
  } catch {
    // Ignore cache errors (quota exceeded, etc)
  }
}

export function parseCalendarResponse(text: string): CalendarEvent[] {
  try {
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return [];
  } catch {
    return [];
  }
}

export function formatOrganizerName(organizer?: { name: string; email: string }): string {
  if (!organizer?.name) return 'Unknown';
  
  if (organizer.name.includes(',')) {
    const [last, first] = organizer.name.split(',').map(s => s.trim());
    return `${first} ${last}`;
  }
  
  return organizer.name;
}

export function detectMeetingProvider(location?: string, body?: string): { provider: string; url: string } | null {
  const providers = [
    { name: 'Teams', patterns: ['teams.microsoft.com', 'teams.live.com'], regex: /https?:\/\/[^\s<]+teams\.(microsoft|live)\.com[^\s<]*/i },
    { name: 'Zoom', patterns: ['zoom.us'], regex: /https?:\/\/[^\s<]+zoom\.us[^\s<]*/i },
    { name: 'Chime', patterns: ['chime.aws'], regex: /https?:\/\/[^\s<]+chime\.aws[^\s<]*/i },
    { name: 'Google Meet', patterns: ['meet.google.com'], regex: /https?:\/\/meet\.google\.com[^\s<]*/i },
    { name: 'Webex', patterns: ['webex.com'], regex: /https?:\/\/[^\s<]+webex\.com[^\s<]*/i },
  ];

  const checkText = (text: string) => {
    const lowerText = text.toLowerCase();
    for (const provider of providers) {
      if (provider.patterns.some(p => lowerText.includes(p))) {
        const match = text.match(provider.regex);
        if (match) return { provider: provider.name, url: match[0] };
      }
    }
    return null;
  };

  return checkText(location || '') || checkText(body || '');
}
