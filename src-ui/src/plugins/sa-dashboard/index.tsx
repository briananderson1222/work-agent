import { useState, useEffect, useMemo } from 'react';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import DOMPurify from 'dompurify';
import { useSDK, useAgents, useWorkspace, type WorkspaceProps } from '@stallion-ai/sdk';

const CalendarEventSchema = z.object({
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

interface CalendarEvent {
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

interface MeetingDetails extends CalendarEvent {
  body?: string;
  attendees?: Array<{email: string, status: string}>;
  responseStatus?: string;
}

interface SFDCContext {
  accounts?: any[];
  opportunities?: any[];
  tasks?: any[];
}



async function ensureStoragePermission(workspace: any): Promise<boolean> {
  if (!workspace.hasCapability('storage')) {
    return false;
  }
  return await workspace.requestPermission('storage.session');
}

function getCacheKey(type: 'calendar' | 'sfdc', identifier?: string): string {
  const today = new Date().toISOString().split('T')[0];
  return type === 'calendar' 
    ? `sa-calendar-${today}` 
    : `sa-sfdc-${identifier}`;
}

async function getFromCache<T>(key: string, workspace: any): Promise<T | null> {
  const hasPermission = await ensureStoragePermission(workspace);
  if (!hasPermission) return null;
  
  try {
    const cached = sessionStorage.getItem(key);
    if (cached) {
      const { data, timestamp } = JSON.parse(cached);
      // Cache valid for 5 minutes
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

async function setCache(key: string, data: any, workspace: any): Promise<void> {
  const hasPermission = await ensureStoragePermission(workspace);
  if (!hasPermission) return;
  
  try {
    sessionStorage.setItem(key, JSON.stringify({ data, timestamp: Date.now() }));
  } catch {
    // Ignore cache errors (quota exceeded, etc)
  }
}

function parseCalendarResponse(text: string): CalendarEvent[] {
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

function formatOrganizerName(organizer?: { name: string; email: string }): string {
  if (!organizer?.name) return 'Unknown';
  
  // Handle "Last, First" format
  if (organizer.name.includes(',')) {
    const [last, first] = organizer.name.split(',').map(s => s.trim());
    return `${first} ${last}`;
  }
  
  return organizer.name;
}

function detectMeetingProvider(location?: string): { provider: string; url: string } | null {
  if (!location) return null;
  
  const lowerLocation = location.toLowerCase();
  
  if (lowerLocation.includes('zoom.us')) {
    return { provider: 'Zoom', url: location };
  }
  if (lowerLocation.includes('teams.microsoft.com') || lowerLocation.includes('teams.live.com')) {
    return { provider: 'Teams', url: location };
  }
  if (lowerLocation.includes('chime.aws')) {
    return { provider: 'Chime', url: location };
  }
  if (lowerLocation.includes('meet.google.com')) {
    return { provider: 'Google Meet', url: location };
  }
  if (lowerLocation.includes('webex.com')) {
    return { provider: 'Webex', url: location };
  }
  
  return null;
}

interface SADashboardProps extends WorkspaceProps {
  agent?: any;
  onLaunchPrompt?: (prompt: any) => void;
  onShowChat?: () => void;
  onRequestAuth?: () => Promise<boolean>;
  onSendToChat?: (text: string, agent?: string) => void;
}

export default function SADashboard(props: SADashboardProps) {
  const sdk = useSDK();
  const agents = useAgents();
  const workspace = useWorkspace();
  
  // Extract props
  const { agentSlug, onLaunchPrompt, onShowChat, onRequestAuth, onSendToChat } = props;
  
  // Load config for notification settings
  const [notificationConfig, setNotificationConfig] = useState<{ enabled: boolean; thresholds: number[] }>({
    enabled: true,
    thresholds: [30, 10, 1]
  });

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const response = await fetch(`${sdk.apiBase}/config/app`);
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.config?.meetingNotifications) {
            setNotificationConfig({
              enabled: data.config.meetingNotifications.enabled !== false,
              thresholds: data.config.meetingNotifications.thresholds || [30, 10, 1]
            });
          }
        }
      } catch (err) {
        console.error('Failed to load notification config:', err);
      }
    };
    loadConfig();
  }, [sdk]);

  // Helper to format date as YYYY-MM-DD in local timezone
  const formatLocalDate = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Parse initial state from URL hash
  const initialState = useMemo(() => {
    let hash = window.location.hash.slice(1);
    
    // Fallback to sessionStorage if hash is empty
    if (!hash) {
      hash = sessionStorage.getItem('sa-dashboard-hash') || '';
    }
    
    const params = new URLSearchParams(hash);
    const dateStr = params.get('date');
    const date = dateStr ? new Date(dateStr + 'T00:00:00') : new Date();
    
    return {
      date,
      categories: params.get('categories')?.split(',').filter(Boolean) || [],
      eventId: params.get('event') || null,
      filterExpanded: params.get('filterExpanded') === 'true',
      allDayExpanded: params.get('allDayExpanded') === 'true' // Default to false (collapsed)
    };
  }, []);

  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [todayEvents, setTodayEvents] = useState<CalendarEvent[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(initialState.eventId);
  const [meetingDetails, setMeetingDetails] = useState<MeetingDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rawResponse, setRawResponse] = useState<string>('');
  const [sfdcContext, setSfdcContext] = useState<SFDCContext | null>(null);
  const [loadingSFDC, setLoadingSFDC] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>(initialState.date);
  const [viewMonth, setViewMonth] = useState<Date>(initialState.date);
  const [showAllAttendees, setShowAllAttendees] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set(initialState.categories));
  const [filterExpanded, setFilterExpanded] = useState(initialState.filterExpanded);
  const [allDayExpanded, setAllDayExpanded] = useState(initialState.allDayExpanded);
  const [isInitialMount, setIsInitialMount] = useState(true);
  const [contentExpanded, setContentExpanded] = useState(false);
  const [showAllTasks, setShowAllTasks] = useState(false);
  const [hidePastEvents, setHidePastEvents] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [dismissedNotifications, setDismissedNotifications] = useState<Set<string>>(new Set());

  const isToday = selectedDate.toDateString() === new Date().toDateString();

  // Update current time every minute when viewing today
  useEffect(() => {
    if (!isToday) return;
    
    const updateTime = () => setCurrentTime(new Date());
    const msUntilNextMinute = 60000 - (Date.now() % 60000);
    
    const timeout = setTimeout(() => {
      updateTime();
      const interval = setInterval(updateTime, 60000);
      return () => clearInterval(interval);
    }, msUntilNextMinute);
    
    return () => clearTimeout(timeout);
  }, [isToday]);

  // Check for upcoming meeting notifications
  const upcomingNotification = useMemo(() => {
    if (isToday || todayEvents.length === 0 || !notificationConfig.enabled) return null;
    
    const now = new Date();
    const upcomingMeeting = todayEvents
      .filter(e => !e.isAllDay)
      .find(e => {
        const start = new Date(e.start);
        const minutesUntil = Math.round((start.getTime() - now.getTime()) / 60000);
        return minutesUntil > 0 && minutesUntil <= Math.max(...notificationConfig.thresholds);
      });
    
    if (!upcomingMeeting) return null;
    
    const start = new Date(upcomingMeeting.start);
    const minutesUntil = Math.round((start.getTime() - now.getTime()) / 60000);
    
    // Find the appropriate threshold
    const threshold = notificationConfig.thresholds
      .sort((a, b) => a - b)
      .find(t => minutesUntil <= t);
    
    if (!threshold) return null;
    
    const notificationId = `${upcomingMeeting.meetingId}-${threshold}`;
    
    if (dismissedNotifications.has(notificationId)) return null;
    
    return {
      meeting: upcomingMeeting,
      minutesUntil,
      threshold,
      notificationId
    };
  }, [isToday, todayEvents, currentTime, dismissedNotifications, notificationConfig]);

  // Update URL hash when state changes (skip on initial mount)
  useEffect(() => {
    if (isInitialMount) {
      setIsInitialMount(false);
      return;
    }
    const params = new URLSearchParams();
    params.set('date', formatLocalDate(selectedDate));
    if (selectedCategories.size > 0) {
      params.set('categories', Array.from(selectedCategories).join(','));
    }
    if (selectedEventId) {
      params.set('event', selectedEventId);
    }
    if (filterExpanded) {
      params.set('filterExpanded', 'true');
    }
    if (allDayExpanded) {
      params.set('allDayExpanded', 'true');
    }
    const hashString = params.toString();
    window.history.pushState(null, '', `#${hashString}`);
    sessionStorage.setItem('sa-dashboard-hash', hashString);
  }, [selectedDate, selectedCategories, selectedEventId, filterExpanded, allDayExpanded, isInitialMount]);

  const selectedEvent = events.find((e) => e.meetingId === selectedEventId) ?? null;
  
  // Get unique categories from events
  const allCategories = Array.from(new Set(events.flatMap(e => e.categories || [])));
  const hasUncategorized = events.some(e => !e.categories || e.categories.length === 0);
  if (hasUncategorized) {
    allCategories.push('Uncategorized');
  }
  
  // Filter events by selected categories
  const filteredEvents = selectedCategories.size === 0
    ? events 
    : events.filter(e => {
        if (selectedCategories.has('Uncategorized') && (!e.categories || e.categories.length === 0)) {
          return true;
        }
        return e.categories?.some(cat => selectedCategories.has(cat));
      });
  
  const visibleEvents = (hidePastEvents && isToday)
    ? filteredEvents.filter(e => new Date(e.end) > currentTime)
    : filteredEvents;

  const fetchCalendarData = async (date: Date = new Date(), preserveEventId?: string) => {
    setLoading(true);
    setError(null);
    setEvents([]);
    
    if (!preserveEventId) {
      setSelectedEventId(null);
    }
    
    const dateStr = date.toISOString().split('T')[0];
    const cacheKey = `sa-calendar-${dateStr}`;
    
    // Check cache first
    const cached = await getFromCache<CalendarEvent[]>(cacheKey, workspace);
    if (cached) {
      setEvents(cached);
      if (preserveEventId) {
        setSelectedEventId(preserveEventId);
      } else {
        const now = new Date();
        const activeEvent = cached.find(e => !e.isAllDay && new Date(e.start) <= now && new Date(e.end) > now);
        const upcomingEvent = cached.find(e => !e.isAllDay && new Date(e.start) > now);
        const firstNonAllDay = cached.find(e => !e.isAllDay);
        const eventId = activeEvent?.meetingId || upcomingEvent?.meetingId || firstNonAllDay?.meetingId || cached[0]?.meetingId;
        setSelectedEventId(eventId);
      }
      setLoading(false);
      return;
    }
    
    try {
      const result = await agents.invoke(agentSlug, `Get today's calendar events for ${dateStr}`, {
        tools: ['sat-outlook_calendar_view'],
        maxSteps: 5
      });
      
      const parsedEvents = typeof result.output === 'string' ? JSON.parse(result.output).events : result.output.events;
      
      if (parsedEvents && parsedEvents.length > 0) {
        setEvents(parsedEvents);
        
        if (preserveEventId) {
          setSelectedEventId(preserveEventId);
        } else {
          const now = new Date();
          const activeEvent = parsedEvents.find((e: CalendarEvent) => !e.isAllDay && new Date(e.start) <= now && new Date(e.end) > now);
          const upcomingEvent = parsedEvents.find((e: CalendarEvent) => !e.isAllDay && new Date(e.start) > now);
          const firstNonAllDay = parsedEvents.find((e: CalendarEvent) => !e.isAllDay);
          const eventId = activeEvent?.meetingId || upcomingEvent?.meetingId || firstNonAllDay?.meetingId || parsedEvents[0]?.meetingId;
          setSelectedEventId(eventId);
        }
        
        await setCache(cacheKey, parsedEvents, workspace);
      }
    } catch (err) {
      if (err instanceof Error && (err.message.includes('401') || err.message.includes('authentication'))) {
        if (onRequestAuth) {
          const success = await onRequestAuth();
          if (success) {
            return fetchCalendarData(date, preserveEventId);
          }
        }
      }
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCalendarData(selectedDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  // Always fetch today's events for notifications
  useEffect(() => {
    const fetchTodayEvents = async () => {
      const today = new Date();
      const dateStr = formatLocalDate(today);
      const cacheKey = `sa-calendar-${dateStr}`;
      
      const cached = await getFromCache<CalendarEvent[]>(cacheKey, workspace);
      if (cached) {
        setTodayEvents(cached);
        return;
      }
      
      try {
        const result = await agents.invoke(agentSlug, `Get today's calendar events for ${dateStr}`, {
          tools: ['sat-outlook_calendar_view'],
          maxSteps: 5
        });
        
        const parsedEvents = typeof result.output === 'string' ? JSON.parse(result.output).events : result.output.events;
        if (parsedEvents) {
          setTodayEvents(parsedEvents);
          await setCache(cacheKey, parsedEvents, workspace);
        }
      } catch (err) {
        console.error('Failed to fetch today events:', err);
      }
    };
    
    fetchTodayEvents();
    const interval = setInterval(fetchTodayEvents, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [agents, agentSlug, workspace]);
  
  useEffect(() => {
    const handlePopState = () => {
      const hash = window.location.hash.slice(1);
      const params = new URLSearchParams(hash);
      
      const dateStr = params.get('date');
      if (dateStr) {
        const date = new Date(dateStr + 'T00:00:00');
        setSelectedDate(date);
        setViewMonth(date);
      }
      
      const categories = params.get('categories')?.split(',').filter(Boolean) || [];
      setSelectedCategories(new Set(categories));
      
      const eventId = params.get('event');
      setSelectedEventId(eventId);
      
      setFilterExpanded(params.get('filterExpanded') === 'true');
      setAllDayExpanded(params.get('allDayExpanded') === 'true');
    };
    
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Auto-fetch meeting details when event is selected
  useEffect(() => {
    if (selectedEventId && events.length > 0) {
      fetchMeetingDetails(selectedEventId);
      
      // Scroll to selected event
      setTimeout(() => {
        const element = document.querySelector(`[data-event-id="${selectedEventId}"]`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }, 100);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEventId, events.length]);

  // Restore selected event from URL after events load
  useEffect(() => {
    if (events.length > 0 && initialState.eventId) {
      const eventExists = events.find(e => e.meetingId === initialState.eventId);
      if (eventExists && selectedEventId !== initialState.eventId) {
        setSelectedEventId(initialState.eventId);
        fetchMeetingDetails(initialState.eventId);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events.length, initialState.eventId]);

  const handleRefresh = () => {
    // Clear all cache
    const dateStr = formatLocalDate(selectedDate);
    sessionStorage.removeItem(`sa-calendar-${dateStr}`);
    events.forEach(e => {
      sessionStorage.removeItem(getCacheKey('sfdc', `details-${e.meetingId}`));
      sessionStorage.removeItem(getCacheKey('sfdc', e.meetingId));
    });
    
    // Reload the page - hash will be preserved and everything will restore correctly
    window.location.reload();
  };

  const fetchMeetingDetails = async (meetingId: string) => {
    const event = events.find(e => e.meetingId === meetingId);
    if (!event?.meetingChangeKey) {
      console.error('Missing meetingChangeKey for event:', meetingId);
      return;
    }

    const cacheKey = getCacheKey('sfdc', `details-${meetingId}`);
    const cached = await getFromCache<MeetingDetails>(cacheKey, workspace);
    if (cached) {
      setMeetingDetails(cached);
      return;
    }

    setLoadingDetails(true);
    
    try {
      const result = await agents.invoke(agentSlug, `Get meeting details for meeting ID ${meetingId}`, {
        tools: ['sat-outlook_calendar_get_event'],
        maxSteps: 3
      });
      
      const details = typeof result.output === 'string' ? JSON.parse(result.output) : result.output;
      setMeetingDetails(details);
      await setCache(cacheKey, details, workspace);
    } catch (err) {
      if (err instanceof Error && (err.message.includes('401') || err.message.includes('authentication'))) {
        if (onRequestAuth) {
          const success = await onRequestAuth();
          if (success) {
            return fetchMeetingDetails(meetingId);
          }
        }
      }
      console.error('Failed to fetch meeting details:', err);
    } finally {
      setLoadingDetails(false);
    }
  };

  const fetchSFDCContext = async () => {
    if (!selectedEvent) return;
    
    const cacheKey = getCacheKey('sfdc', selectedEvent.meetingId);
    const cached = await getFromCache<SFDCContext>(cacheKey, workspace);
    if (cached) {
      setSfdcContext(cached);
      return;
    }
    
    setLoadingSFDC(true);
    
    const meetingContext = `
Meeting: ${selectedEvent.subject}
Time: ${new Date(selectedEvent.start).toLocaleString()} - ${new Date(selectedEvent.end).toLocaleTimeString()}
${selectedEvent.organizer ? `Organizer: ${selectedEvent.organizer}` : ''}
${selectedEvent.location ? `Location: ${selectedEvent.location}` : ''}
${selectedEvent.categories?.length ? `Categories: ${selectedEvent.categories.join(', ')}` : ''}
${meetingDetails?.attendees?.length ? `Attendees: ${meetingDetails.attendees.map(a => a.email).join(', ')}` : ''}
    `.trim();
    
    try {
      const result = await agents.invoke(agentSlug, `Find related Salesforce accounts, opportunities, and tasks for: ${meetingContext}`, {
        tools: ['sat-sfdc_query'],
        maxSteps: 5
      });

      const context = typeof result.output === 'string' ? JSON.parse(result.output) : result.output;
      setSfdcContext(context || { accounts: [], opportunities: [], tasks: [] });
      await setCache(cacheKey, context, workspace);
    } catch (err) {
      console.error('Failed to fetch SFDC context:', err);
      setSfdcContext({ accounts: [], opportunities: [], tasks: [] });
    } finally {
      setLoadingSFDC(false);
    }
  };

  return (
    <div className="workspace-dashboard">
      {upcomingNotification && (
        <div style={{
          position: 'fixed',
          top: '1rem',
          right: '1rem',
          zIndex: 1000,
          background: 'var(--color-bg-secondary)',
          border: '2px solid var(--color-primary)',
          borderRadius: '8px',
          padding: '1rem',
          maxWidth: '400px',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.5rem' }}>
            <strong style={{ color: 'var(--color-primary)' }}>
              {upcomingNotification.threshold === 1 ? 'Meeting starting in 1 minute!' :
               `Meeting in ${upcomingNotification.threshold} minutes`}
            </strong>
            <button
              onClick={() => setDismissedNotifications(prev => new Set(prev).add(upcomingNotification.notificationId))}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--color-text-secondary)',
                cursor: 'pointer',
                fontSize: '1.2rem',
                padding: 0,
                lineHeight: 1
              }}
            >
              ×
            </button>
          </div>
          <div style={{ marginBottom: '0.5rem' }}>
            <button
              onClick={() => {
                setSelectedDate(new Date());
                setViewMonth(new Date());
                setTimeout(() => {
                  setSelectedEventId(upcomingNotification.meeting.meetingId);
                  fetchMeetingDetails(upcomingNotification.meeting.meetingId);
                  setSfdcContext(null);
                }, 100);
              }}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--color-primary)',
                textDecoration: 'underline',
                cursor: 'pointer',
                padding: 0,
                font: 'inherit',
                textAlign: 'left'
              }}
            >
              {upcomingNotification.meeting.subject}
            </button>
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
            {new Date(upcomingNotification.meeting.start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
            {upcomingNotification.threshold === 1 && upcomingNotification.meeting.location && (
              <>
                {' • '}
                <a
                  href={upcomingNotification.meeting.location}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: 'var(--color-primary)', textDecoration: 'underline' }}
                >
                  Join Meeting
                </a>
              </>
            )}
          </div>
        </div>
      )}
      <header className="workspace-dashboard__header">
        <div>
          <h2>SA Workspace</h2>
          <p>Calendar, Email, and Salesforce integration</p>
        </div>
        <div className="workspace-dashboard__actions">
          <button 
            className="workspace-dashboard__action" 
            onClick={handleRefresh}
            disabled={loading}
            type="button"
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
          <button className="workspace-dashboard__action" onClick={() => onShowChat?.()} type="button">
            Open Chat
          </button>
        </div>
      </header>

      <div className="workspace-dashboard__content">
        <aside className="workspace-dashboard__calendar">
          <div style={{ position: 'sticky', top: 0, background: 'var(--color-bg)', paddingBottom: '1rem' }}>
            <div className="calendar-widget" style={{ padding: '0.75rem', background: 'var(--color-bg-secondary)', borderRadius: '4px', maxWidth: '260px', marginLeft: 'auto', marginRight: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <button 
                onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', color: 'var(--color-text)', padding: '2px 6px' }}
              >←</button>
              <strong style={{ fontSize: '0.8rem' }}>
                {viewMonth.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
              </strong>
              <button 
                onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', color: 'var(--color-text)', padding: '2px 6px' }}
              >→</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', fontSize: '0.7rem' }}>
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
                <div key={i} style={{ textAlign: 'center', fontWeight: 'bold', padding: '4px 0', color: 'var(--color-text-secondary)' }}>{day}</div>
              ))}
              {(() => {
                const year = viewMonth.getFullYear();
                const month = viewMonth.getMonth();
                const firstDay = new Date(year, month, 1).getDay();
                const daysInMonth = new Date(year, month + 1, 0).getDate();
                const today = new Date();
                const days = [];
                
                for (let i = 0; i < firstDay; i++) {
                  days.push(<div key={`empty-${i}`} />);
                }
                
                for (let day = 1; day <= daysInMonth; day++) {
                  const date = new Date(year, month, day);
                  const isSelected = date.toDateString() === selectedDate.toDateString();
                  const isToday = date.toDateString() === today.toDateString();
                  
                  days.push(
                    <button
                      key={day}
                      onClick={() => {
                        setSelectedDate(date);
                      }}
                      disabled={loading}
                      style={{
                        padding: '6px 4px',
                        background: isSelected ? 'var(--color-primary)' : 'transparent',
                        color: isSelected ? 'var(--color-bg)' : 'var(--color-text)',
                        border: isToday && !isSelected ? '2px solid var(--color-primary)' : '1px solid transparent',
                        borderRadius: '4px',
                        cursor: loading ? 'wait' : 'pointer',
                        fontSize: '0.75rem',
                        fontWeight: isSelected || isToday ? 'bold' : 'normal',
                        opacity: loading && !isSelected ? 0.5 : 1,
                        transition: 'all 0.2s'
                      }}
                    >
                      {day}
                    </button>
                  );
                }
                
                return days;
              })()}
            </div>
          </div>
          </div>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            {loading && <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⟳</span>}
            {loading ? 'Loading...' : selectedDate.toDateString() === new Date().toDateString() 
              ? "Today's Meetings" 
              : selectedDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
          </h3>
          {!loading && allCategories.length > 0 && !(allCategories.length === 1 && allCategories[0] === 'Uncategorized') && (
            <div style={{ 
              marginBottom: '1rem', 
              padding: '0.75rem', 
              background: 'var(--color-bg-secondary)', 
              borderRadius: '4px',
              border: '1px solid var(--color-border)'
            }}>
              <div 
                onClick={() => setFilterExpanded(!filterExpanded)}
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between',
                  fontSize: '0.85rem', 
                  fontWeight: 600, 
                  color: 'var(--color-text-secondary)',
                  cursor: 'pointer'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <span>Filter</span>
                  {selectedCategories.size > 0 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedCategories(new Set());
                      }}
                      style={{
                        padding: 0,
                        fontSize: '0.75rem',
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--color-primary)',
                        fontWeight: 500,
                        marginLeft: '0.25rem'
                      }}
                    >
                      Clear
                    </button>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {isToday && (
                    <label 
                      onClick={(e) => e.stopPropagation()}
                      style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 400 }}
                    >
                      <input 
                        type="checkbox" 
                        checked={hidePastEvents} 
                        onChange={(e) => setHidePastEvents(e.target.checked)}
                      />
                      Hide past
                    </label>
                  )}
                  <span>{filterExpanded ? '▼' : '▶'}</span>
                </div>
              </div>
              
              {!filterExpanded && selectedCategories.size > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginTop: '0.5rem' }}>
                  {Array.from(selectedCategories).map(cat => (
                    <span key={cat} style={{
                      fontSize: '0.75rem',
                      padding: '2px 6px',
                      borderRadius: '8px',
                      background: 'var(--color-primary)',
                      color: '#fff'
                    }}>
                      {cat}
                    </span>
                  ))}
                </div>
              )}
              
              {filterExpanded && (
                <>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem' }}>
                    {allCategories.map(cat => (
                      <button 
                        key={cat}
                        onClick={() => {
                          const newSet = new Set(selectedCategories);
                          if (selectedCategories.has(cat)) {
                            newSet.delete(cat);
                          } else {
                            newSet.add(cat);
                          }
                          setSelectedCategories(newSet);
                        }}
                        style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: '0.35rem',
                          padding: '0.35rem 0.6rem',
                          background: selectedCategories.has(cat) ? 'var(--color-primary)' : 'var(--color-bg)',
                          color: selectedCategories.has(cat) ? '#fff' : 'var(--color-text)',
                          borderRadius: '12px',
                          cursor: 'pointer',
                          fontSize: '0.85rem',
                          border: '1px solid',
                          borderColor: selectedCategories.has(cat) ? 'var(--color-primary)' : 'var(--color-border)',
                          transition: 'all 0.15s'
                        }}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                  {selectedCategories.size > 0 && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginTop: '0.5rem' }}>
                      Showing {filteredEvents.length} of {events.length} events
                    </div>
                  )}
                </>
              )}
            </div>
          )}
          {loading ? (
            <div style={{ padding: '1rem', color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>
              <p>Loading events...</p>
            </div>
          ) : error ? (
            <div style={{ padding: '1rem' }}>
              <p style={{ color: 'var(--color-error)', fontSize: '0.9rem' }}>{error}</p>
            </div>
          ) : filteredEvents.length === 0 ? (
            <div style={{ padding: '1rem', color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>
              <p>{selectedCategories.size === 0 ? 'No events for this date' : 'No events match selected categories'}</p>
            </div>
          ) : visibleEvents.length === 0 ? (
            <div style={{ padding: '1rem', color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>
              <p>No upcoming events</p>
            </div>
          ) : (
            <>
              {visibleEvents.filter(e => e.isAllDay).length > 0 && (
                <details 
                  open={allDayExpanded} 
                  onToggle={(e) => setAllDayExpanded((e.target as HTMLDetailsElement).open)}
                  style={{ marginBottom: '1rem', border: '1px solid var(--color-border)', borderRadius: '4px', padding: '0.5rem' }}
                >
                  <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
                    All-Day Events ({visibleEvents.filter(e => e.isAllDay).length})
                  </summary>
                  <ul style={{ marginTop: '0.5rem' }}>
                    {visibleEvents.filter(e => e.isAllDay).map((event) => (
                      <li
                        key={event.meetingId}
                        data-event-id={event.meetingId}
                        className={`workspace-dashboard__calendar-item ${event.meetingId === selectedEventId ? 'is-active' : ''}`}
                      >
                        <button type="button" onClick={() => {
                          setSelectedEventId(event.meetingId);
                          fetchMeetingDetails(event.meetingId);
                          setSfdcContext(null);
                        }}>
                          <span className="workspace-dashboard__title">{event.subject}</span>
                          {event.categories && event.categories.length > 0 && (
                            <div style={{ display: 'flex', gap: '0.25rem', marginTop: '0.25rem', flexWrap: 'wrap' }}>
                              {event.categories.map(cat => (
                                <span key={cat} style={{
                                  fontSize: '0.7rem',
                                  padding: '2px 6px',
                                  borderRadius: '8px',
                                  background: 'var(--color-bg)',
                                  border: '1px solid var(--color-border)',
                                  color: 'var(--color-text-secondary)'
                                }}>
                                  {cat}
                                </span>
                              ))}
                            </div>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              
              {visibleEvents.filter(e => !e.isAllDay).length > 0 && (
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '0.5rem' }}>
                  Events ({visibleEvents.filter(e => !e.isAllDay).length})
                </div>
              )}
              
              <ul>
                {(() => {
                  const nonAllDayEvents = visibleEvents.filter(e => !e.isAllDay);
                  const result: JSX.Element[] = [];
                  let activeGroup: JSX.Element[] = [];
                  let showedIndicator = false;
                  
                  nonAllDayEvents.forEach((event, idx) => {
                    const eventStart = new Date(event.start);
                    const eventEnd = new Date(event.end);
                    const prevEvent = idx > 0 ? nonAllDayEvents[idx - 1] : null;
                    const prevEventEnd = prevEvent ? new Date(prevEvent.end) : null;
                    
                    const isActiveEvent = currentTime >= eventStart && currentTime < eventEnd;
                    const isPrevActive = prevEvent && currentTime >= new Date(prevEvent.start) && currentTime < new Date(prevEvent.end);
                    
                    const showTimeLineBefore = isToday && !showedIndicator && (
                      (idx === 0 && currentTime < eventStart) || // Before first event
                      (prevEventEnd && currentTime > prevEventEnd && currentTime < eventStart) || // Between events
                      isActiveEvent // Before first active event only
                    );
                    
                    if (showTimeLineBefore) {
                      showedIndicator = true;
                      
                      let indicatorText = '';
                      let nextMeetingLink: JSX.Element | null = null;
                      let joinButton: JSX.Element | null = null;
                      
                      if (isActiveEvent) {
                        const meetingProvider = detectMeetingProvider(event.location);
                        
                        indicatorText = `Now ${currentTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} - `;
                        
                        nextMeetingLink = (
                          <button
                            onClick={() => {
                              setSelectedEventId(event.meetingId);
                              fetchMeetingDetails(event.meetingId);
                              setSfdcContext(null);
                            }}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: 'var(--color-primary)',
                              textDecoration: 'underline',
                              cursor: 'pointer',
                              padding: 0,
                              font: 'inherit'
                            }}
                          >
                            {event.subject}
                          </button>
                        );
                        
                        if (meetingProvider) {
                          joinButton = (
                            <>
                              {' in progress • '}
                              <a
                                href={meetingProvider.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                  color: 'var(--color-primary)',
                                  textDecoration: 'underline',
                                  fontWeight: 600
                                }}
                              >
                                Join Now
                              </a>
                            </>
                          );
                        } else {
                          joinButton = <span> in progress</span>;
                        }
                      } else {
                        // Find next meeting (could be filtered out)
                        const allNonAllDay = events.filter(e => !e.isAllDay);
                        const nextMeeting = allNonAllDay.find(e => new Date(e.start) > currentTime);
                        
                        if (nextMeeting) {
                          const nextStart = new Date(nextMeeting.start);
                          const minutesUntil = Math.round((nextStart.getTime() - currentTime.getTime()) / 60000);
                          const hoursUntil = Math.floor(minutesUntil / 60);
                          const remainingMinutes = minutesUntil % 60;
                          
                          let timeText = '';
                          if (hoursUntil > 0) {
                            timeText = `${hoursUntil}h ${remainingMinutes}m`;
                          } else {
                            timeText = `${minutesUntil}m`;
                          }
                          
                          const isFiltered = !visibleEvents.some(e => e.meetingId === nextMeeting.meetingId);
                          
                          nextMeetingLink = (
                            <button
                              onClick={() => {
                                if (isFiltered) {
                                  setSelectedCategories(new Set());
                                  setHidePastEvents(false);
                                }
                                setSelectedEventId(nextMeeting.meetingId);
                                fetchMeetingDetails(nextMeeting.meetingId);
                                setSfdcContext(null);
                              }}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: 'var(--color-primary)',
                                textDecoration: 'underline',
                                cursor: 'pointer',
                                padding: 0,
                                font: 'inherit'
                              }}
                            >
                              {nextMeeting.subject}
                            </button>
                          );
                          
                          indicatorText = `Now ${currentTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} - ${timeText} until next meeting: `;
                        } else {
                          indicatorText = `Now - ${currentTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
                        }
                      }
                      
                      result.push(
                        <div key={`indicator-${event.meetingId}`} className="time-indicator" style={{ 
                          margin: '0.5rem 0 0',
                          padding: '0.125rem 0.5rem 0',
                          borderTop: '2px dotted var(--color-primary)',
                          fontSize: '0.75rem',
                          color: 'var(--color-primary)',
                          fontWeight: 600
                        }}>
                          {indicatorText}{nextMeetingLink}{joinButton}
                        </div>
                      );
                    }
                    
                    const isSelected = event.meetingId === selectedEventId;
                    
                    const eventItem = (
                      <li
                        key={event.meetingId}
                        data-event-id={event.meetingId}
                        className={`workspace-dashboard__calendar-item ${isSelected ? 'is-active' : ''}`}
                        style={isActiveEvent ? { marginBottom: '0.5rem' } : undefined}
                      >
                        <button 
                          type="button" 
                          onClick={() => {
                            setSelectedEventId(event.meetingId);
                            fetchMeetingDetails(event.meetingId);
                            setSfdcContext(null);
                          }}
                          style={isSelected ? {
                            backgroundColor: 'var(--accent-light)',
                            border: '2px solid var(--color-accent)',
                            borderRadius: '4px'
                          } : undefined}
                        >
                          <span className="workspace-dashboard__time">
                            {new Date(event.start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                            {' - '}
                            {new Date(event.end).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                          </span>
                          <span className="workspace-dashboard__title">{event.subject}</span>
                          {event.categories && event.categories.length > 0 && (
                            <div style={{ display: 'flex', gap: '0.25rem', marginTop: '0.25rem', flexWrap: 'wrap' }}>
                              {event.categories.map(cat => (
                                <span key={cat} style={{
                                  fontSize: '0.7rem',
                                  padding: '2px 6px',
                                  borderRadius: '8px',
                                  background: 'var(--color-bg)',
                                  border: '1px solid var(--color-border)',
                                  color: 'var(--color-text-secondary)'
                                }}>
                                  {cat}
                                </span>
                              ))}
                            </div>
                          )}
                        </button>
                      </li>
                    );
                    
                    if (isActiveEvent) {
                      activeGroup.push(eventItem);
                    } else {
                      // If we have accumulated active events, close the group first
                      if (activeGroup.length > 0) {
                        result.push(
                          <div key={`active-group-${activeGroup[0].key}`} className="active-events-group" style={{ border: '2px solid var(--color-primary)', borderRadius: '4px', padding: '0.5rem 0.25rem 0' }}>
                            {activeGroup}
                          </div>
                        );
                        activeGroup = [];
                      }
                      result.push(eventItem);
                    }
                  });
                  
                  // Close any remaining active group
                  if (activeGroup.length > 0) {
                    result.push(
                      <div key={`active-group-final`} className="active-events-group" style={{ border: '2px solid var(--color-primary)', borderRadius: '4px', padding: '0.5rem 0.25rem 0' }}>
                        {activeGroup}
                      </div>
                    );
                  }
                  
                  return result;
                })()}
                {isToday && visibleEvents.filter(e => !e.isAllDay).length > 0 && 
                 currentTime > new Date(visibleEvents.filter(e => !e.isAllDay)[visibleEvents.filter(e => !e.isAllDay).length - 1].end) && (
                  <div style={{ 
                    margin: '0.5rem 0',
                    padding: '0.25rem 0.5rem',
                    borderTop: '2px dotted var(--color-primary)',
                    fontSize: '0.75rem',
                    color: 'var(--color-primary)',
                    fontWeight: 600
                  }}>
                    Now - {currentTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                  </div>
                )}
              </ul>
            </>
          )}
          </aside>

          <section className="workspace-dashboard__details">
              {selectedEvent && (() => {
                const meetingProvider = detectMeetingProvider(meetingDetails?.location);
                
                return (
                <div className="workspace-dashboard__card">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1rem' }}>
                    <div>
                      <h3 style={{ minWidth: 'fit-content', marginBottom: '0.5rem' }}>{selectedEvent.subject}</h3>
                      {meetingDetails?.organizer && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>
                          <span>
                            Organized by{' '}
                            <a href={`mailto:${meetingDetails.organizer}`} style={{ color: 'var(--color-primary)' }}>
                              {meetingDetails.organizer}
                            </a>
                          </span>
                          {meetingProvider && (
                            <a
                              href={meetingProvider.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.25rem',
                                padding: '0.25rem 0.5rem',
                                background: 'var(--color-primary)',
                                color: 'var(--color-bg)',
                                border: 'none',
                                borderRadius: '4px',
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                textDecoration: 'none',
                                cursor: 'pointer',
                                transition: 'opacity 0.2s'
                              }}
                              onMouseEnter={(e) => e.currentTarget.style.opacity = '0.9'}
                              onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
                            >
                              Join {meetingProvider.provider} →
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      {meetingDetails?.attendees && meetingDetails.attendees.length > 0 && (
                        <>
                          <a
                            href={`mailto:${meetingDetails.attendees.map(a => a.email).join(';')}?subject=${encodeURIComponent(meetingDetails.subject)}`}
                            style={{
                              padding: '0.4rem 0.8rem',
                              background: 'var(--color-bg-secondary)',
                              color: 'var(--color-text)',
                              border: '1px solid var(--color-border)',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '0.85rem',
                              textDecoration: 'none',
                              display: 'inline-block',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            Email All
                          </a>
                          <button
                            onClick={() => {
                              const attendeeList = meetingDetails.attendees!.map(a => a.email).join(', ');
                              const prompt = `Draft an email to the following attendees about "${meetingDetails.subject}":\n\nAttendees: ${attendeeList}\n\nMeeting: ${meetingDetails.subject}\nTime: ${new Date(meetingDetails.start).toLocaleString()} - ${new Date(meetingDetails.end).toLocaleTimeString()}\nLocation: ${meetingDetails.location || 'Not specified'}`;
                              onSendToChat?.(prompt);
                            }}
                            style={{
                              padding: '0.4rem 0.8rem',
                              background: 'var(--color-bg-secondary)',
                              color: 'var(--color-text)',
                              border: '1px solid var(--color-border)',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '0.85rem',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            Draft via Chat
                          </button>
                          <button
                            onClick={() => {
                              const attendeeList = meetingDetails.attendees!.map(a => a.email).join(', ');
                              const prompt = `Schedule a follow-up meeting for "${meetingDetails.subject}" with the same attendees:\n\nAttendees: ${attendeeList}\n\nOriginal meeting was on ${new Date(meetingDetails.start).toLocaleString()}. Please help me find a suitable time and draft the meeting invite.`;
                              onSendToChat?.(prompt);
                            }}
                            style={{
                              padding: '0.4rem 0.8rem',
                              background: 'var(--color-bg-secondary)',
                              color: 'var(--color-text)',
                              border: '1px solid var(--color-border)',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '0.85rem',
                              whiteSpace: 'nowrap'
                            }}
                          >
                            Schedule Follow-up
                          </button>
                        </>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      {new Date(selectedEvent.end) < new Date() && (
                        <button 
                          onClick={() => {
                            onLaunchPrompt?.({
                              id: `meeting-notes-${selectedEvent.meetingId}`,
                              label: 'Check email for meeting notes',
                              prompt: `Search my email for meeting notes or follow-ups related to: "${selectedEvent.subject}"`
                            });
                            onShowChat?.();
                          }}
                          className="workspace-dashboard__action"
                        >
                          Fetch Meeting Summary
                        </button>
                      )}
                      <button 
                        onClick={fetchSFDCContext}
                        disabled={loadingSFDC}
                        className="workspace-dashboard__action"
                      >
                        {loadingSFDC ? 'Loading...' : 'Enrich with Salesforce'}
                      </button>
                    </div>
                  </div>
                  
                  {loadingDetails ? (
                    <p>Loading meeting details...</p>
                  ) : meetingDetails ? (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: sfdcContext ? '3fr 1fr' : '1fr', gap: '1.5rem', marginBottom: '1rem' }}>
                        <div>
                        <p><strong>Time:</strong> {new Date(meetingDetails.start).toLocaleString()} - {new Date(meetingDetails.end).toLocaleTimeString()}</p>
                        {selectedEvent.categories && selectedEvent.categories.length > 0 && (
                          <p><strong>Categories:</strong> {selectedEvent.categories.join(', ')}</p>
                        )}
                        {meetingDetails.attendees && meetingDetails.attendees.length > 0 && (
                          <div>
                            <strong>Attendees ({meetingDetails.attendees.length}):</strong>
                            <ul style={{ marginTop: '0.5rem', paddingLeft: '1.5rem' }}>
                              {(showAllAttendees ? meetingDetails.attendees : meetingDetails.attendees.slice(0, 5)).map((a, i) => (
                                <li key={i}>
                                  <a href={`mailto:${a.email}`} style={{ color: 'var(--color-primary)' }}>
                                    {a.email}
                                  </a>
                                  <span 
                                    className={`attendee-status attendee-status--${a.status.toLowerCase().replace(' ', '-')}`}
                                    style={{ marginLeft: '0.5rem', fontSize: '0.85em' }}
                                  >
                                    ({a.status})
                                  </span>
                                </li>
                              ))}
                            </ul>
                            {meetingDetails.attendees.length > 5 && (
                              <button 
                                onClick={() => setShowAllAttendees(!showAllAttendees)}
                                style={{ 
                                  marginTop: '0.5rem',
                                  background: 'none',
                                  border: 'none',
                                  color: 'var(--color-primary)',
                                  cursor: 'pointer',
                                  fontSize: '0.9rem',
                                  textDecoration: 'underline'
                                }}
                              >
                                {showAllAttendees ? 'Show less' : `Show ${meetingDetails.attendees.length - 5} more`}
                              </button>
                            )}
                          </div>
                        )}
                        
                        {meetingDetails.categories && meetingDetails.categories.length > 0 && (
                          <p><strong>Categories:</strong> {meetingDetails.categories.join(', ')}</p>
                        )}
                        {meetingDetails.isCanceled && <p style={{ color: 'red' }}><strong>⚠️ Canceled</strong></p>}
                      
                      {meetingDetails.body?.replace(/<[^>]*>/g, '').trim() ? (
                        <div style={{ marginTop: '1rem' }}>
                          <div style={{ marginBottom: '0.5rem' }}>
                            <strong>Content:</strong>
                          </div>
                          <div style={{ position: 'relative' }}>
                            <div 
                              className="meeting-body-content"
                              style={{ 
                                padding: '1rem', 
                                background: 'var(--color-bg-secondary)', 
                                borderRadius: '4px', 
                                border: '1px solid var(--color-border)',
                                maxHeight: contentExpanded ? 'none' : '200px',
                                overflow: 'hidden'
                              }}
                              dangerouslySetInnerHTML={{ 
                              __html: DOMPurify.sanitize(meetingDetails.body, {
                                FORBID_ATTR: ['style'],
                                FORBID_TAGS: ['style'],
                                HOOKS: {
                                  afterSanitizeAttributes: (node) => {
                                    // Remove images that reference attachments
                                    if (node.tagName === 'IMG') {
                                      const src = node.getAttribute('src');
                                      if (src?.startsWith('cid:') || src?.includes('GetFileAttachment')) {
                                        node.remove();
                                      }
                                    }
                                  }
                                }
                              })
                            }}
                          />
                          {!contentExpanded && (
                            <div style={{
                              position: 'absolute',
                              bottom: 0,
                              left: 0,
                              right: 0,
                              height: '60px',
                              background: 'linear-gradient(transparent, var(--color-bg-secondary))',
                              display: 'flex',
                              alignItems: 'flex-end',
                              justifyContent: 'center',
                              paddingBottom: '0.5rem'
                            }}>
                              <button
                                onClick={() => setContentExpanded(true)}
                                style={{
                                  padding: '0.5rem 1rem',
                                  background: 'var(--color-bg)',
                                  border: '1px solid var(--color-border)',
                                  borderRadius: '4px',
                                  color: 'var(--color-primary)',
                                  cursor: 'pointer',
                                  fontSize: '0.85rem'
                                }}
                              >
                                Show more
                              </button>
                            </div>
                          )}
                          {contentExpanded && (
                            <div style={{ textAlign: 'center', marginTop: '0.5rem' }}>
                              <button
                                onClick={() => setContentExpanded(false)}
                                style={{
                                  padding: '0.5rem 1rem',
                                  background: 'var(--color-bg)',
                                  border: '1px solid var(--color-border)',
                                  borderRadius: '4px',
                                  color: 'var(--color-primary)',
                                  cursor: 'pointer',
                                  fontSize: '0.85rem'
                                }}
                              >
                                Show less
                              </button>
                            </div>
                          )}
                          </div>
                        </div>
                      ) : (
                        <div style={{ marginTop: '1rem' }}>
                          <p style={{ fontStyle: 'italic', color: 'var(--color-text-secondary)' }}>No content to show.</p>
                        </div>
                      )}
                        </div>

                        {sfdcContext && (
                          <div style={{ position: 'sticky', top: '1rem', alignSelf: 'start' }}>
                            <>
                              <h4 style={{ marginBottom: '1rem', paddingBottom: '0.5rem', borderBottom: '1px solid var(--color-border)' }}>Salesforce Intelligence</h4>
                                
                  {sfdcContext.accounts && sfdcContext.accounts.length > 0 && (
                        <details open style={{ marginTop: '0.5rem' }}>
                          <summary><strong>Accounts ({sfdcContext.accounts.length})</strong></summary>
                          <ul style={{ marginLeft: '1rem', marginTop: '0.5rem', listStyle: 'none', padding: 0 }}>
                            {sfdcContext.accounts.map((acc: any, i: number) => (
                              <li key={i} style={{ marginBottom: '0.5rem', padding: '0.5rem', background: 'var(--color-bg-secondary)', borderRadius: '4px', border: '1px solid var(--color-border)', position: 'relative' }}>
                                {acc.id && (
                                  <a 
                                    href={`https://aws-crm.lightning.force.com/lightning/r/Account/${acc.id}/view`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title="Open in Salesforce"
                                    style={{ 
                                      position: 'absolute',
                                      top: '0.5rem',
                                      right: '0.5rem',
                                      fontSize: '0.75em',
                                      color: 'var(--color-primary)',
                                      textDecoration: 'none'
                                    }}
                                  >
                                    ↗
                                  </a>
                                )}
                                {acc.id ? (
                                  <a
                                    href={`https://aws-crm.lightning.force.com/lightning/r/Account/${acc.id}/view`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{ 
                                      fontWeight: 'bold',
                                      fontSize: '0.9em',
                                      marginBottom: '0.25rem',
                                      paddingRight: '1.5rem',
                                      display: 'block',
                                      color: 'inherit',
                                      textDecoration: 'none'
                                    }}
                                  >
                                    {acc.name || acc.id}
                                  </a>
                                ) : (
                                  <div style={{ fontWeight: 'bold', fontSize: '0.9em', marginBottom: '0.25rem', paddingRight: '1.5rem' }}>{acc.name || acc.id}</div>
                                )}
                                <div style={{ fontSize: '0.75em', color: 'var(--color-text-secondary)', marginBottom: '0.5rem' }}>
                                  {acc.owner && <span style={{ marginRight: '0.75rem' }}>Owner: {acc.owner}</span>}
                                  {acc.opportunities && <span style={{ marginRight: '0.75rem' }}>Opps: {acc.opportunities}</span>}
                                  {acc.spend && <span>Spend: {acc.spend}</span>}
                                </div>
                                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                  <button
                                    onClick={() => {
                                      onLaunchPrompt?.({
                                        id: `sfdc-account-${acc.id}`,
                                        label: 'Ask about account',
                                        prompt: `Tell me about this Salesforce account:\n\nAccount: ${acc.name || acc.id}`
                                      });
                                      onShowChat?.();
                                    }}
                                    title="Send to chat"
                                    style={{
                                      padding: '3px 10px',
                                      background: 'var(--color-bg)',
                                      border: '1px solid var(--color-border)',
                                      borderRadius: '12px',
                                      color: 'var(--color-text)',
                                      cursor: 'pointer',
                                      fontSize: '0.75em',
                                      transition: 'all 0.2s'
                                    }}
                                    onMouseOver={(e) => {
                                      e.currentTarget.style.background = 'var(--color-primary)';
                                      e.currentTarget.style.color = 'var(--color-bg)';
                                    }}
                                    onMouseOut={(e) => {
                                      e.currentTarget.style.background = 'var(--color-bg)';
                                      e.currentTarget.style.color = 'var(--color-text)';
                                    }}
                                  >
                                    Discuss Account
                                  </button>
                                  <button
                                    onClick={() => {
                                      onLaunchPrompt?.({
                                        id: `sfdc-account-plan-${acc.id}`,
                                        label: 'Create account plan',
                                        prompt: `Help me create a strategic plan for this Salesforce account:\n\nAccount: ${acc.name || acc.id}\n\nWhat should be my focus areas?`
                                      });
                                      onShowChat?.();
                                    }}
                                    title="Send to chat"
                                    style={{
                                      padding: '3px 10px',
                                      background: 'var(--color-bg)',
                                      border: '1px solid var(--color-border)',
                                      borderRadius: '12px',
                                      color: 'var(--color-text)',
                                      cursor: 'pointer',
                                      fontSize: '0.75em',
                                      transition: 'all 0.2s'
                                    }}
                                    onMouseOver={(e) => {
                                      e.currentTarget.style.background = 'var(--color-primary)';
                                      e.currentTarget.style.color = 'var(--color-bg)';
                                    }}
                                    onMouseOut={(e) => {
                                      e.currentTarget.style.background = 'var(--color-bg)';
                                      e.currentTarget.style.color = 'var(--color-text)';
                                    }}
                                  >
                                    Create Activity
                                  </button>
                                </div>
                                
                                {sfdcContext.tasks && sfdcContext.tasks.filter((t: any) => t.accountId === acc.id || !t.accountId).length > 0 && (
                                  <details style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--color-border)' }}>
                                    <summary style={{ cursor: 'pointer', fontSize: '0.8em', color: 'var(--color-text-secondary)', listStyle: 'none' }}>
                                      <span style={{ marginRight: '0.25rem' }}>▸</span>
                                      Log History ({sfdcContext.tasks.filter((t: any) => t.accountId === acc.id || !t.accountId).length})
                                    </summary>
                                    <ul style={{ listStyle: 'none', padding: '0.5rem 0 0 0', margin: 0 }}>
                                      {sfdcContext.tasks.filter((t: any) => t.accountId === acc.id || !t.accountId).slice(0, 3).map((task: any, ti: number) => (
                                        <li key={ti} style={{ marginBottom: '0.5rem', fontSize: '0.75em' }}>
                                          {task.id ? (
                                            <a
                                              href={`https://aws-crm.lightning.force.com/lightning/r/Task/${task.id}/view`}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              style={{ 
                                                display: 'block',
                                                color: 'inherit',
                                                textDecoration: 'none'
                                              }}
                                            >
                                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                                                <div style={{ flex: 1 }}>{task.subject || task.id}</div>
                                                <span style={{ 
                                                  fontSize: '0.9em',
                                                  color: 'var(--color-primary)',
                                                  marginLeft: '0.5rem'
                                                }}>
                                                  ↗
                                                </span>
                                              </div>
                                              <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.9em' }}>
                                                {task.status && <span style={{ marginRight: '0.5rem' }}>{task.status}</span>}
                                                {task.dueDate && <span>{task.dueDate}</span>}
                                              </div>
                                            </a>
                                          ) : (
                                            <div>
                                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                                                <div style={{ flex: 1 }}>{task.subject || task.id}</div>
                                              </div>
                                              <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.9em' }}>
                                                {task.status && <span style={{ marginRight: '0.5rem' }}>{task.status}</span>}
                                                {task.dueDate && <span>{task.dueDate}</span>}
                                              </div>
                                            </div>
                                          )}
                                        </li>
                                      ))}
                                    </ul>
                                  </details>
                                )}
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}

                  {sfdcContext.opportunities && sfdcContext.opportunities.length > 0 && (
                        <details open style={{ marginTop: '0.5rem' }}>
                          <summary><strong>Opportunities ({sfdcContext.opportunities.length})</strong></summary>
                          <ul style={{ marginLeft: '1rem', marginTop: '0.5rem', listStyle: 'none', padding: 0 }}>
                            {sfdcContext.opportunities.map((opp: any, i: number) => (
                              <li key={i} style={{ marginBottom: '0.5rem', padding: '0.5rem', background: 'var(--color-bg-secondary)', borderRadius: '4px', border: '1px solid var(--color-border)', position: 'relative' }}>
                                {opp.id && (
                                  <a 
                                    href={`https://aws-crm.lightning.force.com/lightning/r/Opportunity/${opp.id}/view`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title="Open in Salesforce"
                                    style={{ 
                                      position: 'absolute',
                                      top: '0.5rem',
                                      right: '0.5rem',
                                      fontSize: '0.75em',
                                      color: 'var(--color-primary)',
                                      textDecoration: 'none'
                                    }}
                                  >
                                    ↗
                                  </a>
                                )}
                                {opp.id ? (
                                  <a
                                    href={`https://aws-crm.lightning.force.com/lightning/r/Opportunity/${opp.id}/view`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{ 
                                      fontWeight: 'bold',
                                      fontSize: '0.9em',
                                      marginBottom: '0.25rem',
                                      paddingRight: '1.5rem',
                                      display: 'block',
                                      color: 'inherit',
                                      textDecoration: 'none'
                                    }}
                                  >
                                    {opp.name || opp.id}
                                  </a>
                                ) : (
                                  <div style={{ fontWeight: 'bold', fontSize: '0.9em', marginBottom: '0.25rem', paddingRight: '1.5rem' }}>{opp.name || opp.id}</div>
                                )}
                                <div style={{ fontSize: '0.75em', color: 'var(--color-text-secondary)', marginBottom: '0.5rem' }}>
                                  {opp.owner && <span style={{ marginRight: '0.75rem' }}>Owner: {opp.owner}</span>}
                                  {opp.stage && <span style={{ marginRight: '0.75rem' }}>Stage: {opp.stage}</span>}
                                  {opp.amount && <span style={{ marginRight: '0.75rem' }}>Amount: ${typeof opp.amount === 'number' ? opp.amount.toLocaleString() : opp.amount}</span>}
                                  {opp.closeDate && <span>Close: {opp.closeDate}</span>}
                                </div>
                                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                  <button
                                    onClick={() => {
                                      const accountContext = sfdcContext.accounts?.map(a => a.name || a.id).join(', ') || 'N/A';
                                      onLaunchPrompt?.({
                                        id: `sfdc-opportunity-${opp.id}`,
                                        label: 'Ask about opportunity',
                                        prompt: `Tell me about this Salesforce opportunity:\n\nAccount(s): ${accountContext}\nOpportunity: ${opp.name || opp.id}`
                                      });
                                      onShowChat?.();
                                    }}
                                    title="Send to chat"
                                    style={{
                                      padding: '3px 10px',
                                      background: 'var(--color-bg)',
                                      border: '1px solid var(--color-border)',
                                      borderRadius: '12px',
                                      color: 'var(--color-text)',
                                      cursor: 'pointer',
                                      fontSize: '0.75em',
                                      transition: 'all 0.2s'
                                    }}
                                    onMouseOver={(e) => {
                                      e.currentTarget.style.background = 'var(--color-primary)';
                                      e.currentTarget.style.color = 'var(--color-bg)';
                                    }}
                                    onMouseOut={(e) => {
                                      e.currentTarget.style.background = 'var(--color-bg)';
                                      e.currentTarget.style.color = 'var(--color-text)';
                                    }}
                                  >
                                    Discuss Opportunity
                                  </button>
                                  <button
                                    onClick={() => {
                                      const accountContext = sfdcContext.accounts?.map(a => a.name || a.id).join(', ') || 'N/A';
                                      onLaunchPrompt?.({
                                        id: `sfdc-opportunity-create-${opp.id}`,
                                        label: 'Help create opportunity plan',
                                        prompt: `Help me create a plan for this Salesforce opportunity:\n\nAccount(s): ${accountContext}\nOpportunity: ${opp.name || opp.id}\n\nWhat should I focus on to move this opportunity forward?`
                                      });
                                      onShowChat?.();
                                    }}
                                    title="Send to chat"
                                    style={{
                                      padding: '3px 10px',
                                      background: 'var(--color-bg)',
                                      border: '1px solid var(--color-border)',
                                      borderRadius: '12px',
                                      color: 'var(--color-text)',
                                      cursor: 'pointer',
                                      fontSize: '0.75em',
                                      transition: 'all 0.2s'
                                    }}
                                    onMouseOver={(e) => {
                                      e.currentTarget.style.background = 'var(--color-primary)';
                                      e.currentTarget.style.color = 'var(--color-bg)';
                                    }}
                                    onMouseOut={(e) => {
                                      e.currentTarget.style.background = 'var(--color-bg)';
                                      e.currentTarget.style.color = 'var(--color-text)';
                                    }}
                                  >
                                    Create Activity
                                  </button>
                                </div>
                              </li>
                            ))}
                          </ul>
                        </details>
                      )}

                            </>
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <div style={{ padding: '1rem', color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>
                      <p>Select an event to view details</p>
                    </div>
                  )}
                </div>
              );
              })()}
            </section>
      </div>
    </div>
  );
}
