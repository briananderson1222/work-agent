import { useState, useEffect } from 'react';
import { useCalendarEvents, useMeetingDetails, outlookProvider } from './data';
import type { CalendarEvent, MeetingDetails } from './calendar-utils';

function getCacheKey(type: 'calendar' | 'sfdc', identifier?: string): string {
  const today = new Date().toISOString().split('T')[0];
  return type === 'calendar' 
    ? `sa-calendar-${today}` 
    : `sa-sfdc-${identifier}`;
}

function getFromCache<T>(key: string): T | null {
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

function setCache(key: string, data: any): void {
  try {
    sessionStorage.setItem(key, JSON.stringify({ data, timestamp: Date.now() }));
  } catch {
    // Ignore cache errors (quota exceeded, etc)
  }
}

export function useCalendarData(selectedDate: Date) {
  const [todayEvents, setTodayEvents] = useState<CalendarEvent[]>([]);
  const [meetingDetails, setMeetingDetails] = useState<MeetingDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Use React Query for calendar events
  const { data: rawEvents = [], isLoading: loading, error: eventsError } = useCalendarEvents(selectedDate);
  
  // Map CalendarEventVM (id) to Calendar's expected shape (meetingId)
  const events: CalendarEvent[] = rawEvents.map((e: any) => ({
    meetingId: e.id || e.meetingId,
    meetingChangeKey: e.changeKey || e.meetingChangeKey || '',
    subject: e.subject,
    start: typeof e.start === 'string' ? e.start : e.start.toISOString(),
    end: typeof e.end === 'string' ? e.end : e.end.toISOString(),
    location: e.location || '',
    organizer: e.organizer || '',
    status: e.status,
    isCanceled: e.isCancelled || e.isCanceled || false,
    categories: e.categories || [],
    isAllDay: e.isAllDay || false,
  }));

  const error = eventsError ? (eventsError as Error).message : null;

  // Always fetch today's events for notifications
  useEffect(() => {
    const fetchTodayEvents = async () => {
      const today = new Date();
      const dateStr = today.toISOString().split('T')[0];
      const cacheKey = `sa-calendar-${dateStr}`;
      
      const cached = getFromCache<CalendarEvent[]>(cacheKey);
      if (cached) {
        setTodayEvents(cached);
        return;
      }
      
      try {
        const events = await outlookProvider.getEvents(today);
        const mapped = events.map(e => ({
          meetingId: e.id,
          meetingChangeKey: e.changeKey || '',
          subject: e.subject,
          start: e.start.toISOString(),
          end: e.end.toISOString(),
          location: e.location || '',
          organizer: e.organizer || '',
          status: e.status,
          isCanceled: e.isCancelled || false,
          categories: e.categories || [],
          isAllDay: e.isAllDay || false
        }));
        
        setTodayEvents(mapped);
        setCache(cacheKey, mapped);
      } catch (err) {
        console.error('Failed to fetch today events:', err);
      }
    };
    
    const timeout = setTimeout(fetchTodayEvents, 100);
    const interval = setInterval(fetchTodayEvents, 5 * 60 * 1000);
    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, []);

  const fetchMeetingDetails = async (meetingId: string, meetingChangeKey?: string) => {
    if (!meetingChangeKey) {
      return;
    }

    const cacheKey = getCacheKey('sfdc', `details-${meetingId}`);
    const cached = getFromCache<MeetingDetails>(cacheKey);
    if (cached) {
      setMeetingDetails(cached);
      return;
    }

    setLoadingDetails(true);
    
    try {
      const vm = await outlookProvider.getMeetingDetails(meetingId, meetingChangeKey);
      
      const details: MeetingDetails = {
        meetingId: vm.id,
        meetingChangeKey: vm.changeKey || '',
        subject: vm.subject,
        body: vm.body || '',
        attendees: (vm.attendees || []).map(a => ({
          email: a.email,
          name: a.name,
          status: a.status === 'none' ? 'No Response' : a.status === 'accepted' ? 'Accepted' : a.status === 'declined' ? 'Declined' : a.status
        })),
        start: vm.start.toISOString(),
        end: vm.end.toISOString(),
        location: vm.location || '',
        organizer: vm.organizer || '',
        responseStatus: 'No Response'
      };
      
      setMeetingDetails(details);
      setCache(cacheKey, details);
    } catch (err) {
      console.error('Failed to fetch meeting details:', err);
    } finally {
      setLoadingDetails(false);
    }
  };

  return {
    events,
    todayEvents,
    meetingDetails,
    loading,
    loadingDetails,
    error,
    fetchMeetingDetails,
    setMeetingDetails
  };
}