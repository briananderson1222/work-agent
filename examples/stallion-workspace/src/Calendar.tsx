import { useState, useEffect, useMemo } from 'react';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import DOMPurify from 'dompurify';
import { useToast, transformTool, useNavigation, useCreateChatSession, useWorkspaceNavigation, invokeAgent, invoke, useNotifications, useApiBase, useActiveChatActions, useAgents, resolveAgentName, useSendMessage } from '@stallion-ai/sdk';
import { useSalesContext } from './useSalesContext';
import { SearchModal } from './components/SearchModal';
import './workspace.css';

const SFDC_BASE_URL = 'https://aws-crm.lightning.force.com';

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
  attendees?: Array<{email: string, name?: string, status: string}>;
  responseStatus?: string;
}

interface SFDCContext {
  accounts?: any[];
  campaigns?: any[];
  opportunities?: any[];
  tasks?: any[];
  suggestedKeyword?: string;
  selectedAccountId?: string;
}

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

function setCache(key: string, data: any): void {
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

function detectMeetingProvider(location?: string, body?: string): { provider: string; url: string } | null {
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

interface CalendarProps {
  activeTab?: any; // Will be defined when this tab is active
}

export function Calendar({ activeTab }: CalendarProps) {
  // Subscribe to sales context data (React Query auto-fetches)
  const salesContext = useSalesContext();
  
  const { showToast } = useToast();
  const { notify } = useNotifications();
  const { setDockState, setActiveChat } = useNavigation();
  const { getTabState, setTabState } = useWorkspaceNavigation();
  const { apiBase } = useApiBase();
  const createChatSession = useCreateChatSession();
  const sendMessage = useSendMessage(apiBase);
  const agents = useAgents();
  
  const sendToChat = (message: string) => {
    const resolvedSlug = resolveAgentName('work-agent');
    const agent = agents.find(a => a.slug === resolvedSlug);
    if (!agent) return;
    const sessionId = createChatSession(resolvedSlug, agent.name);
    setDockState(true);
    setActiveChat(sessionId);
    sendMessage(sessionId, resolvedSlug, undefined, message);
  };

  // Helper to format date as YYYY-MM-DD in local timezone
  const formatLocalDate = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Parse initial state from sessionStorage (no hash)
  const initialState = useMemo(() => {
    // Get stored state from WorkspaceNavigationProvider
    const storedState = activeTab ? getTabState('calendar') : '';
    const params = new URLSearchParams(storedState);
    const dateStr = params.get('date');
    const date = dateStr ? new Date(dateStr + 'T00:00:00') : new Date();
    
    return {
      date,
      categories: params.get('categories')?.split(',').filter(Boolean) || [],
      eventId: params.get('event') || null,
      filterExpanded: params.get('filterExpanded') === 'true',
      allDayExpanded: params.get('allDayExpanded') === 'true' // Default to false (collapsed)
    };
  }, [activeTab]);

  // Restore state when tab becomes active
  useEffect(() => {
    if (activeTab) {
      const storedState = getTabState('calendar');
      if (storedState) {
        const params = new URLSearchParams(storedState);
        
        const dateStr = params.get('date');
        if (dateStr) {
          const date = new Date(dateStr + 'T00:00:00');
          if (!isNaN(date.getTime())) {
            setSelectedDate(date);
            setViewMonth(date);
          }
        }
        
        const categories = params.get('categories')?.split(',').filter(Boolean) || [];
        setSelectedCategories(new Set(categories));
        
        const eventId = params.get('event');
        if (eventId) {
          setSelectedEventId(eventId);
        }
        
        setFilterExpanded(params.get('filterExpanded') === 'true');
        setAllDayExpanded(params.get('allDayExpanded') === 'true');
      }
    }
  }, [activeTab, getTabState]);

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
  const [calendarCollapsed, setCalendarCollapsed] = useState(false);
  const [showAllTasks, setShowAllTasks] = useState(false);
  const [hidePastEvents, setHidePastEvents] = useState(false);
  const [hideCanceledEvents, setHideCanceledEvents] = useState(false);
  const [isNowLineVisible, setIsNowLineVisible] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [dismissedNotifications, setDismissedNotifications] = useState<Set<string>>(new Set());
  const [showLogActivityModal, setShowLogActivityModal] = useState(false);
  const [selectedSfdcItem, setSelectedSfdcItem] = useState<{type: 'account' | 'opportunity' | 'campaign', data: any} | null>(null);
  const [activityFormData, setActivityFormData] = useState({
    subject: '',
    saActivity: '',
    activityDate: new Date().toISOString().split('T')[0],
    description: ''
  });
  const [loadingActivityPrefill, setLoadingActivityPrefill] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [submittingActivity, setSubmittingActivity] = useState(false);
  const [opportunityKeyword, setOpportunityKeyword] = useState('');
  const [loadingOpportunities, setLoadingOpportunities] = useState(false);
  const [hideClosedOpportunities, setHideClosedOpportunities] = useState(true);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [searchModalType, setSearchModalType] = useState<'account' | 'campaign' | 'opportunity'>('account');
  const [accountFilter, setAccountFilter] = useState('');
  const [showActivityDetailModal, setShowActivityDetailModal] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState<any>(null);
  const [loadingActivityDetails, setLoadingActivityDetails] = useState(false);
  const [showAssignOppModal, setShowAssignOppModal] = useState(false);
  const [activityToAssign, setActivityToAssign] = useState<any>(null);
  const [assigningActivity, setAssigningActivity] = useState(false);
  const [oppFilterText, setOppFilterText] = useState('');

  const isToday = selectedDate.toDateString() === new Date().toDateString();

  // Initialize opportunity keyword when SFDC context loads
  useEffect(() => {
    if (sfdcContext?.suggestedKeyword && !opportunityKeyword) {
      setOpportunityKeyword(sfdcContext.suggestedKeyword);
    }
  }, [sfdcContext?.suggestedKeyword]);

  // Prefill activity data when account/opportunity is selected
  // TODO: Re-enable once backend /invoke endpoint is fixed to handle empty conversation
  // useEffect(() => {
  //   if (selectedSfdcItem) {
  //     prefillActivityData(selectedSfdcItem);
  //   }
  // }, [selectedSfdcItem]);

  // Update current time every minute when viewing today
  useEffect(() => {
    if (!isToday) return;
    
    const updateTime = () => setCurrentTime(new Date());
    const msUntilNextMinute = 60000 - (Date.now() % 60000);
    
    let interval: NodeJS.Timeout;
    const timeout = setTimeout(() => {
      updateTime();
      interval = setInterval(updateTime, 60000);
    }, msUntilNextMinute);
    
    return () => {
      clearTimeout(timeout);
      if (interval) clearInterval(interval);
    };
  }, [isToday]);

  // Check for upcoming meeting notifications
  const upcomingNotification = useMemo(() => {
    if (!isToday || todayEvents.length === 0) return null;
    
    const now = new Date();
    const upcomingMeeting = todayEvents
      .filter(e => !e.isAllDay)
      .find(e => {
        const start = new Date(e.start);
        const minutesUntil = Math.round((start.getTime() - now.getTime()) / 60000);
        return minutesUntil > 0 && minutesUntil <= 30; // Notify within 30 minutes
      });
    
    if (!upcomingMeeting) return null;
    
    const start = new Date(upcomingMeeting.start);
    const minutesUntil = Math.round((start.getTime() - now.getTime()) / 60000);
    const notificationId = `${upcomingMeeting.meetingId}-${minutesUntil}`;
    
    if (dismissedNotifications.has(notificationId)) return null;
    
    return {
      meeting: upcomingMeeting,
      minutesUntil,
      notificationId
    };
  }, [isToday, todayEvents, currentTime, dismissedNotifications]);

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
    const stateString = params.toString();
    setTabState('calendar', stateString);
  }, [selectedDate, selectedCategories, selectedEventId, filterExpanded, allDayExpanded, isInitialMount, setTabState]);

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
  
  let visibleEvents = (hidePastEvents && isToday)
    ? filteredEvents.filter(e => new Date(e.end) > currentTime)
    : filteredEvents;
  
  if (hideCanceledEvents) {
    visibleEvents = visibleEvents.filter(e => !e.subject.startsWith('Canceled:'));
  }

  const hasCanceledEvents = events.some(e => e.subject.startsWith('Canceled:'));

  const fetchCalendarData = async (date: Date = new Date(), preserveEventId?: string) => {
    const startTime = performance.now();
    setLoading(true);
    setError(null);
    setRawResponse(''); // Clear previous
    setEvents([]); // Clear events list
    
    // Only clear selectedEventId if not preserving selection
    if (!preserveEventId) {
      setSelectedEventId(null);
    }
    
    const dateStr = date.toISOString().split('T')[0];
    
    // Check cache first
    const cacheKey = `sa-calendar-${dateStr}`;
    const cached = getFromCache<CalendarEvent[]>(cacheKey);
    if (cached) {
      setEvents(cached);
      
      // Only auto-select if not preserving a selection
      if (preserveEventId) {
        setSelectedEventId(preserveEventId);
      } else {
        // Select active event, or next upcoming event, or first non-all-day, or first event
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
    
    const apiStartTime = performance.now();
    try {
      // Use pure transformation (no LLM, instant)
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
      
      const apiTime = performance.now() - apiStartTime;
      
      const parsedEvents = data.events;
      
      if (parsedEvents.length === 0) {
        setEvents([]);
        setSelectedEventId(null);
      } else {
        setEvents(parsedEvents);
        
        // Only auto-select if not preserving a selection
        if (preserveEventId) {
          setSelectedEventId(preserveEventId);
        } else {
          // Select active event, or next upcoming event, or first non-all-day, or first event
          const now = new Date();
          const activeEvent = parsedEvents.find(e => !e.isAllDay && new Date(e.start) <= now && new Date(e.end) > now);
          const upcomingEvent = parsedEvents.find(e => !e.isAllDay && new Date(e.start) > now);
          const firstNonAllDay = parsedEvents.find(e => !e.isAllDay);
          const eventId = activeEvent?.meetingId || upcomingEvent?.meetingId || firstNonAllDay?.meetingId || parsedEvents[0]?.meetingId;
          setSelectedEventId(eventId);
        }
        
        setCache(cacheKey, parsedEvents);
      }
    } catch (err) {
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
      
      const cached = getFromCache<CalendarEvent[]>(cacheKey);
      if (cached) {
        setTodayEvents(cached);
        return;
      }
      
      try {
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
        
        setTodayEvents(data.events);
        setCache(cacheKey, data.events);
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
  
  // Removed popstate listener - WorkspaceNavigationProvider handles hash restoration
  // useEffect(() => {
  //   const handlePopState = () => {
  //     // Provider handles this now
  //   };
  //   window.addEventListener('popstate', handlePopState);
  //   return () => window.removeEventListener('popstate', handlePopState);
  // }, [activeTab]);

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

  // Track now line visibility
  useEffect(() => {
    const nowLine = document.querySelector('.calendar-now-line');
    if (!nowLine) {
      setIsNowLineVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsNowLineVisible(entry.isIntersecting);
      },
      { threshold: 0.1 }
    );

    observer.observe(nowLine);
    return () => observer.disconnect();
  }, [events, selectedDate, hidePastEvents]);

  const handleRefresh = () => {
    // Clear all calendar-related cache
    Object.keys(sessionStorage).forEach(key => {
      if (key.startsWith('sa-calendar-') || key.startsWith('sa-sfdc-')) {
        sessionStorage.removeItem(key);
      }
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

    // Check cache first
    const cacheKey = getCacheKey('sfdc', `details-${meetingId}`);
    const cached = getFromCache<MeetingDetails>(cacheKey);
    if (cached) {
      setMeetingDetails(cached);
      return;
    }

    setLoadingDetails(true);
    
    try {
      const data = await transformTool('work-agent', 'sat-outlook_calendar_meeting', {
        operation: 'read',
        meetingId: meetingId, 
        meetingChangeKey: event.meetingChangeKey 
      }, `(data) => {
        const meeting = data.success ? data.content : data;
        
        const normalizeStatus = (status) => {
          if (!status || status === 'Unknown' || status === 'NoResponseReceived') return 'No Response';
          if (status === 'Accept' || status === 'Accepted') return 'Accepted';
          if (status === 'Decline' || status === 'Declined') return 'Declined';
          return status;
        };
        const mapAttendees = (list) => (list || []).map(a => {
          if (typeof a === 'string') return { email: a, status: 'No Response' };
          const email = a.emailAddress?.address || a.email;
          const name = a.emailAddress?.name || a.name;
          
          return {
            email,
            name: name && name !== email ? name : undefined,
            status: normalizeStatus(a.responseStatus)
          };
        });
        return {
          meetingId: meeting.meetingId,
          meetingChangeKey: meeting.changeKey,
          subject: meeting.subject,
          body: meeting.body || '',
          attendees: [...mapAttendees(meeting.attendees), ...mapAttendees(meeting.optionalAttendees || [])],
          start: meeting.start,
          end: meeting.end,
          location: meeting.location || '',
          organizer: meeting.organizer || '',
          organizerEmail: meeting.organizer?.email,
          organizerName: meeting.organizer?.name,
          responseStatus: normalizeStatus(meeting.myResponseStatus || meeting.responseStatus)
        };
      }`);
      
      const details = data;
      
      // Populate emailToName map from organizer if available
      if (details.organizerEmail && details.organizerName) {
        addEmailName(details.organizerEmail, details.organizerName);
      }
      
      // Enrich attendee names from emailToName map
      if (details.attendees) {
        details.attendees = details.attendees.map(a => ({
          ...a,
          name: a.name || getNameForEmail(a.email)
        }));
      }
      
      setMeetingDetails(details);
      setCache(cacheKey, details);
    } catch (err) {
      console.error('Failed to fetch meeting details:', err);
    } finally {
      setLoadingDetails(false);
    }
  };

  const fetchSFDCContext = async (loadAllAccounts = false) => {
    if (!selectedEvent) return;
    
    setLoadingSFDC(true);
    
    try {
      let matchedAccounts = [];
      let suggestedKeyword = '';
      
      if (loadAllAccounts) {
        // Load all user's accounts
        matchedAccounts = salesContext?.myAccounts?.map(atm => atm.account) || [];
      } else {
        // Build meeting context
        const meetingContext = `
Meeting: ${selectedEvent.subject}
Organizer: ${selectedEvent.organizer || 'Unknown'}
Attendees: ${meetingDetails?.attendees?.map(a => a.email).join(', ') || 'None'}
Categories: ${selectedEvent.categories?.join(', ') || 'None'}
        `.trim();
        
        // Build account list with IDs for matching
        const myAccountsList = salesContext?.myAccounts
          ?.map(atm => `${atm.account.name} (${atm.account.id})`)
          .join('\n') || '';
        
        // Use LLM to match accounts and extract single keyword
        const analysisResult = await invoke({
          prompt: `Analyze this meeting and match it to customer accounts:\n\n${meetingContext}\n\nMy assigned accounts:\n${myAccountsList}\n\nTasks:\n1. Match meeting to accounts ONLY if there is clear evidence in the meeting subject, attendee emails, or categories. Look for:\n   - Company name in meeting subject\n   - Attendee email domains matching account names\n   - Direct mentions in categories\n   Return ONLY accounts with strong evidence of relevance. When in doubt, exclude the account.\n\n2. Extract ONE keyword from meeting subject for opportunity search. CRITICAL RULES:\n   - Return exactly ONE word or ONE compound word\n   - Examples: "Migration", "Modernization", "DataLake", "MIG"\n   - Extract ONLY the core technical/project term\n   - "MIG Welding Workshop" → "MIG"\n   - "Cloud Migration Planning" → "Migration"\n   - Exclude company names\n   - If no clear keyword exists, return empty string\n\nReturn matched accounts and single keyword.`,
          schema: {
            type: 'object',
            properties: {
              matchedAccounts: { 
                type: 'array', 
                items: { 
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    id: { type: 'string' }
                  },
                  required: ['name', 'id']
                },
                description: 'Matched accounts with name and Salesforce ID'
              },
              keyword: {
                type: 'string',
                description: 'Single keyword for opportunity search. Empty string if none.'
              }
            },
            required: ['matchedAccounts', 'keyword']
          },
          maxSteps: 1,
          model: 'us.amazon.nova-lite-v1:0'
        });
        
        const matchedAccountsFromLLM = analysisResult.matchedAccounts || [];
        suggestedKeyword = analysisResult.keyword || '';
        
        console.log('[SFDC] Matched accounts from LLM:', matchedAccountsFromLLM);
        console.log('[SFDC] Suggested keyword:', suggestedKeyword);
        
        // Build full account objects from matched IDs
        matchedAccounts = salesContext?.myAccounts
          ?.filter(atm => matchedAccountsFromLLM.some(ma => ma.id === atm.account.id))
          .map(atm => atm.account) || [];
        
        console.log('[SFDC] Matched accounts:', matchedAccounts.map(a => a.name));
      }
      
      const context = {
        accounts: matchedAccounts,
        opportunities: [],
        tasks: [],
        suggestedKeyword
      };
      
      setSfdcContext(context);
      
      // Auto-select first account if available
      if (matchedAccounts.length > 0) {
        const firstAccount = matchedAccounts[0];
        const item = { type: 'account' as const, data: firstAccount };
        setSelectedSfdcItem(item);
        fetchTasksForItem(item);
        prefillActivityData(item);
        // Fetch all opportunities for selected account
        fetchOpportunitiesForAccount(firstAccount.id, '');
      }
    } catch (err) {
      console.error('Failed to fetch SFDC context:', err);
      setSfdcContext({ accounts: [], opportunities: [], tasks: [] });
    } finally {
      setLoadingSFDC(false);
    }
  };

  // Fetch opportunities for selected account
  const fetchOpportunitiesForAccount = async (accountId: string, keyword: string) => {
    try {
      const result = await transformTool('work-agent', 'satSfdc_getOpportunitiesForAccount', { 
        accountId,
        includeClosed: true
      }, 'data => data');
      
      // Sort by lastModifiedDate descending (most recent first) and add accountId
      const opportunities = (result?.opportunities || [])
        .map((opp: any) => ({ ...opp, accountId }))
        .sort((a: any, b: any) => {
          const dateA = new Date(a.lastModifiedDate || 0).getTime();
          const dateB = new Date(b.lastModifiedDate || 0).getTime();
          return dateB - dateA;
        });
      
      setSfdcContext(prev => ({
        ...prev,
        opportunities,
        selectedAccountId: accountId
      }));
    } catch (err) {
      console.error('Failed to fetch opportunities:', err);
    }
  };

  const handleSelectSearchResult = (item: any) => {
    if (searchModalType === 'account') {
      // Add to accounts list if not already there
      setSfdcContext(prev => {
        const exists = prev?.accounts?.some(a => a.id === item.id);
        if (exists) return prev;
        return {
          ...prev,
          accounts: [...(prev?.accounts || []), item]
        };
      });
      // Select the account
      const accountItem = { type: 'account' as const, data: item };
      setSelectedSfdcItem(accountItem);
      fetchTasksForItem(accountItem);
      prefillActivityData(accountItem);
      setLoadingOpportunities(true);
      fetchOpportunitiesForAccount(item.id, '').finally(() => setLoadingOpportunities(false));
    } else {
      // Add to campaigns list if not already there
      setSfdcContext(prev => {
        const exists = prev?.campaigns?.some(c => c.id === item.id);
        if (exists) return prev;
        return {
          ...prev,
          campaigns: [...(prev?.campaigns || []), item]
        };
      });
      // Select the campaign
      const campaignItem = { type: 'campaign' as const, data: item };
      setSelectedSfdcItem(campaignItem);
      fetchTasksForItem(campaignItem);
      prefillActivityData(campaignItem);
    }
    setShowSearchModal(false);
  };

  // Fetch tasks for selected account or opportunity
  const fetchTasksForItem = async (item: {type: 'account' | 'opportunity' | 'campaign', data: any}) => {
    setLoadingTasks(true);
    try {
      // Use listUserTasks with appropriate filter
      const params: any = { limit: 50 };
      if (item.type === 'opportunity') {
        params.opportunityId = item.data.id;
      } else if (item.type === 'campaign') {
        params.campaignId = item.data.id;
      } else {
        params.accountId = item.data.id;
      }
      
      const tasksResult = await transformTool('work-agent', 'satSfdc_listUserTasks', params, 'data => data');
      
      // Update context with tasks
      setSfdcContext(prev => ({
        ...prev,
        tasks: tasksResult?.tasks || []
      }));
    } catch (err) {
      console.error('Failed to fetch tasks:', err);
    } finally {
      setLoadingTasks(false);
    }
  };

  const prefillActivityData = async (item: {type: 'account' | 'opportunity' | 'campaign', data: any}) => {
    if (!selectedEvent || !meetingDetails) return;
    
    setLoadingActivityPrefill(true);
    try {
      const meetingInfo = `Meeting: ${selectedEvent.subject}\nTime: ${new Date(selectedEvent.start).toLocaleString()}\nAttendees: ${meetingDetails.attendees?.map(a => a.email).join(', ') || 'None'}`;
      const meetingBody = meetingDetails.body ? `\nMeeting Notes:\n${meetingDetails.body.replace(/<[^>]*>/g, '').trim()}` : '';
      const itemContext = item.type === 'account' 
        ? `Account: ${item.data.name}` 
        : item.type === 'campaign'
        ? `Campaign: ${item.data.name}`
        : `Opportunity: ${item.data.name} (Stage: ${item.data.stageName})`;
      
      const response = await invoke({
        prompt: `Generate a tech activity log for ${item.type}: ${item.data.name}\n\nCRITICAL RULES:\n1. For the description field, you MUST use this exact format:\n\nAttendees:\n[List ONLY the attendees provided below - do NOT make up names or add people not listed]\n\nOverview:\n[Summarize what was discussed/accomplished based ONLY on the meeting body content provided below. If no meeting body/notes are provided, write "No meeting notes available." Do NOT invent or assume information.]\n\n2. EXCLUDE ALL meeting logistics:\n   - Do NOT mention Zoom, Teams, Chime, or any video conferencing links\n   - Do NOT mention dial-in numbers or meeting IDs\n   - Do NOT mention location or room details\n   - Do NOT mention scheduling information\n\n3. ONLY use information explicitly provided in the meeting body below. If the meeting body is empty or only contains logistics, state that no content is available.\n\n4. For SA Activity type: Default to "Meeting / Office Hours [Management]" unless the subject or meeting notes explicitly mention a workshop (Immersion Day, GameDay, Hackathon, etc.) or another specific activity type.\n\n---\nMEETING INFORMATION PROVIDED:\n${meetingInfo}${meetingBody}`,
        schema: {
          type: 'object',
          properties: {
            saActivity: { 
              type: 'string', 
              enum: [
                'Architecture Review [Architecture]',
                'Cloud Adoption Framework [Architecture]',
                'Demo [Architecture]',
                'Foundational Technical Review [Architecture]',
                'Migration Readiness Assessment [Architecture]',
                'Migration/Modernization Acceleration [Architecture]',
                'Other Architectural Guidance [Architecture]',
                'Partner Competency Assessment [Architecture]',
                'Partner Solution Engagement [Architecture]',
                'Prototype/PoC/Pilot [Architecture]',
                'Security, Resilience and Compliance [Architecture]',
                'Service Team Engagement [Architecture]',
                'Well Architected [Architecture]',
                'Account Planning [Management]',
                'Cost Optimization [Management]',
                'Meeting / Office Hours [Management]',
                'RFI and RFP response [Management]',
                'Support and Enablement of Partners [Management]',
                'Support of Proserve Engagement [Management]',
                'Support/Escalation [Management]',
                'Validation of Business Outcome after Launch [Management]',
                'Internal Narrative Authorship [Org Capabilities]',
                'Internal Speaking Engagement [Org Capabilities]',
                'Tech Mentoring [Org Capabilities]',
                'Technical Field Community Initiatives [Org Capabilities]',
                'CCoE (Cloud Center of Excellence) [Program Execution]',
                'CSM - Account Planning [Program Execution]',
                'CSM - Customer Success Plan [Program Execution]',
                'EBA (Experience Based Acceleration) [Program Execution]',
                'EBC (Executive Briefing Centre) [Program Execution]',
                'Innovation and Transformation [Program Execution]',
                'MAP (Migration Acceleration Program) [Program Execution]',
                'Other Program/ Strategic Initiative Execution [Program Execution]',
                'Customer PR-FAQ [Thought Leadership]',
                'General Tech Content [Thought Leadership]',
                'Other Thought Leadership [Thought Leadership]',
                'PFR Curation [Thought Leadership]',
                'Public Speaking Conference [Thought Leadership]',
                'Activation Day [Workshops]',
                'GameDay [Workshops]',
                'Hackathon [Workshops]',
                'Immersion Day [Workshops]',
                'Other Workshops [Workshops]'
              ],
              description: 'Type of SA activity'
            },
            description: { type: 'string', description: 'Must follow format: "Attendees:\n[list]\n\nOverview:\n[summary]"' }
          },
          required: ['saActivity', 'description']
        },
        maxSteps: 1,
        model: 'us.amazon.nova-lite-v1:0'
      });
      
      // Use meeting date directly
      const meetingDate = new Date(selectedEvent.start);
      const activityDate = `${meetingDate.getFullYear()}-${String(meetingDate.getMonth() + 1).padStart(2, '0')}-${String(meetingDate.getDate()).padStart(2, '0')}`;
      
      setActivityFormData({
        subject: selectedEvent.subject,
        saActivity: response.saActivity || 'Meeting / Office Hours [Management]',
        activityDate: activityDate,
        description: response.description || ''
      });
    } catch (err) {
      console.error('Failed to prefill activity data:', err);
    } finally {
      setLoadingActivityPrefill(false);
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
              {upcomingNotification.minutesUntil === 1 ? 'Meeting starting in 1 minute!' :
               `Meeting in ${upcomingNotification.minutesUntil} minutes`}
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


      <div className="workspace-dashboard__content">
        <aside className="workspace-dashboard__calendar">
          <div style={{ position: 'sticky', top: 0, background: 'var(--color-bg)', paddingBottom: '1rem' }}>
            <div className="calendar-widget" style={{ 
              padding: '0.75rem', 
              background: 'var(--color-bg-secondary)', 
              borderRadius: '4px', 
              maxWidth: '260px', 
              marginLeft: 'auto', 
              marginRight: 'auto',
              maxHeight: calendarCollapsed ? '0' : '500px',
              opacity: calendarCollapsed ? '0' : '1',
              overflow: 'hidden',
              transition: 'max-height 0.3s ease, opacity 0.2s ease',
              paddingTop: calendarCollapsed ? '0' : '0.75rem',
              paddingBottom: calendarCollapsed ? '0' : '0.75rem'
            }}>
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
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: calendarCollapsed ? '0' : '0.5rem' }}>
              <button
                onClick={() => setCalendarCollapsed(!calendarCollapsed)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px 8px',
                  color: 'var(--color-text-secondary)',
                  display: 'flex',
                  alignItems: 'center'
                }}
                title={calendarCollapsed ? 'Expand calendar' : 'Collapse calendar'}
              >
                <svg style={{ 
                  width: '16px', 
                  height: '16px',
                  transform: calendarCollapsed ? 'rotate(0deg)' : 'rotate(180deg)',
                  transition: 'transform 0.2s',
                }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>
          <h3 style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginTop: '0.5rem' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {loading && <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⟳</span>}
              {loading ? 'Loading...' : selectedDate.toDateString() === new Date().toDateString() 
                ? "Today's Meetings" 
                : selectedDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            </span>
            {selectedDate.toDateString() !== new Date().toDateString() ? (
              <button
                onClick={() => {
                  const today = new Date();
                  setSelectedDate(today);
                  setViewMonth(new Date(today.getFullYear(), today.getMonth(), 1));
                  // Trigger fetch without preserving selection to use smart selection logic
                  fetchEvents(formatLocalDate(today), null);
                }}
                style={{
                  background: 'var(--color-primary)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '4px 8px',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                  fontWeight: 'normal'
                }}
              >
                Today
              </button>
            ) : selectedDate.toDateString() === new Date().toDateString() && events.length > 0 && !isNowLineVisible ? (
              <button
                onClick={() => {
                  const nowLine = document.querySelector('.calendar-now-line');
                  if (nowLine) {
                    nowLine.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }
                }}
                style={{
                  background: 'var(--color-primary)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '4px 8px',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                  fontWeight: 'normal'
                }}
              >
                Now
              </button>
            ) : null}
          </h3>
          {!loading && allCategories.length > 0 && !(allCategories.length === 1 && allCategories[0] === 'Uncategorized') && (
            <div style={{ 
              marginTop: '0.5rem',
              padding: '0.125rem 0.75rem', 
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
                        setHideCanceledEvents(false);
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
                    <button
                      className="hide-past-toggle"
                      onClick={(e) => {
                        e.stopPropagation();
                        setHidePastEvents(!hidePastEvents);
                      }}
                      style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '0.35rem', 
                        fontSize: '0.7rem', 
                        cursor: 'pointer', 
                        fontWeight: 400,
                        padding: '0.25rem 0.5rem',
                        borderRadius: '10px',
                        background: hidePastEvents ? 'var(--color-primary)' : 'transparent',
                        color: hidePastEvents ? 'white' : 'var(--color-text-secondary)',
                        border: '1px solid',
                        borderColor: hidePastEvents ? 'var(--color-primary)' : 'var(--color-border)',
                        transition: 'all 0.15s'
                      }}
                    >
                      Hide past
                    </button>
                  )}
                  {hasCanceledEvents && (
                    <button
                      className="hide-canceled-toggle"
                      onClick={(e) => {
                        e.stopPropagation();
                        setHideCanceledEvents(!hideCanceledEvents);
                      }}
                      style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '0.35rem', 
                        fontSize: '0.7rem', 
                        cursor: 'pointer', 
                        fontWeight: 400,
                        padding: '0.25rem 0.5rem',
                        borderRadius: '10px',
                        background: hideCanceledEvents ? 'var(--color-primary)' : 'transparent',
                        color: hideCanceledEvents ? 'white' : 'var(--color-text-secondary)',
                        border: '1px solid',
                        borderColor: hideCanceledEvents ? 'var(--color-primary)' : 'var(--color-border)',
                        transition: 'all 0.15s'
                      }}
                    >
                      Hide Canceled
                    </button>
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
          </div>
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
            isToday ? (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                <div className="calendar-now-line" style={{ 
                  margin: '0.5rem 0',
                  padding: '0.25rem 0.5rem',
                  borderTop: '2px dotted var(--color-primary)',
                  fontSize: '0.75rem',
                  color: 'var(--color-primary)',
                  fontWeight: 600
                }}>
                  Now - {currentTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                </div>
                <div style={{
                  padding: '0 0.5rem 1rem',
                  fontSize: '0.85rem',
                  fontStyle: 'italic',
                  color: 'var(--color-text-secondary)',
                  textAlign: 'center'
                }}>
                  No more events for {selectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}...
                </div>
              </ul>
            ) : (
              <div style={{ padding: '1rem', color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>
                <p>No upcoming events</p>
              </div>
            )
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
                        const meetingProvider = detectMeetingProvider(event.location, meetingDetails?.body);
                        
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
                                  setHideCanceledEvents(false);
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
                        <div key={`indicator-${event.meetingId}`} className="calendar-now-line" style={{ 
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
                  <>
                    <div className="calendar-now-line" style={{ 
                      margin: '0.5rem 0',
                      padding: '0.25rem 0.5rem',
                      borderTop: '2px dotted var(--color-primary)',
                      fontSize: '0.75rem',
                      color: 'var(--color-primary)',
                      fontWeight: 600
                    }}>
                      Now - {currentTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                    </div>
                    <div style={{
                      padding: '0 0.5rem 1rem',
                      fontSize: '0.85rem',
                      fontStyle: 'italic',
                      color: 'var(--color-text-secondary)',
                      textAlign: 'center'
                    }}>
                      No more events for {selectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}...
                    </div>
                  </>
                )}
              </ul>
            </>
          )}
          </aside>

          <section className="workspace-dashboard__details">
              {selectedEvent && (() => {
                const meetingProvider = detectMeetingProvider(meetingDetails?.location, meetingDetails?.body);
                
                return (
                <div className="workspace-dashboard__card">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: '1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, flexWrap: 'wrap' }}>
                        <h3 style={{ minWidth: 'fit-content', marginBottom: '0' }}>{selectedEvent.subject}</h3>
                        {selectedEvent.categories && selectedEvent.categories.length > 0 && (
                          <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                            {selectedEvent.categories.map(cat => (
                              <span key={cat} style={{
                                fontSize: '0.7rem',
                                padding: '2px 6px',
                                borderRadius: '8px',
                                background: 'var(--color-bg)',
                                color: 'var(--color-text-secondary)',
                                border: '1px solid var(--color-border)'
                              }}>
                                {cat}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                        <button 
                          onClick={() => {
                            fetchSFDCContext();
                            setShowLogActivityModal(true);
                          }}
                          disabled={loadingSFDC}
                          style={{
                            padding: '0.5rem 1rem',
                            background: 'transparent',
                            color: 'var(--text-primary)',
                            border: '1px solid var(--border-primary)',
                            borderRadius: '0.375rem',
                            fontSize: '0.875rem',
                            fontWeight: 500,
                            cursor: loadingSFDC ? 'not-allowed' : 'pointer',
                            opacity: loadingSFDC ? 0.5 : 1,
                            transition: 'all 0.2s'
                          }}
                          onMouseEnter={(e) => !loadingSFDC && (e.currentTarget.style.background = 'var(--bg-tertiary)')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                        >
                          {loadingSFDC ? 'Loading...' : 'Log Activity'}
                        </button>
                        <button
                          onClick={() => {
                            const meetingInfo = `Meeting: ${meetingDetails.subject}\nTime: ${new Date(meetingDetails.start).toLocaleString()} - ${new Date(meetingDetails.end).toLocaleTimeString()}\nLocation: ${meetingDetails.location || 'Not specified'}${meetingDetails.attendees ? `\nAttendees: ${meetingDetails.attendees.map(a => a.email).join(', ')}` : ''}`;
                            sendToChat(`I need to log an SA activity for this meeting:\n\n${meetingInfo}\n\nWorkflow:\n- Search my email for meeting notes or follow-ups related to "${meetingDetails.subject}"\n- Use the attendee list and meeting subject to identify the relevant Salesforce account\n- Find any related opportunities for this account\n- Present matching accounts/opportunities as a numbered list for me to choose from\n- Help me create the SA activity log with the meeting notes and context`);
                          }}
                          style={{
                            padding: '0.5rem 0.75rem',
                            background: 'transparent',
                            color: 'var(--text-primary)',
                            border: '1px solid var(--border-primary)',
                            borderRadius: '0.375rem',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'all 0.2s'
                          }}
                          title="Ask agent for help"
                          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-tertiary)')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                          </svg>
                        </button>
                      </div>
                    </div>
                    {selectedEvent && salesContext?.state?.loggedActivities?.[selectedEvent.meetingId] && (
                      <div style={{ 
                        marginTop: '0.75rem',
                        padding: '0.75rem',
                        background: 'var(--bg-tertiary)',
                        border: '1px solid var(--color-primary)',
                        borderRadius: '6px',
                        fontSize: '0.875rem'
                      }}>
                        <div style={{ color: 'var(--color-primary)', fontWeight: 600, marginBottom: '0.25rem' }}>
                          ✓ Activity Logged
                        </div>
                        <a
                          href={`${SFDC_BASE_URL}/lightning/r/Task/${salesContext.state.loggedActivities[selectedEvent.meetingId].id}/view`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: 'var(--color-primary)', textDecoration: 'underline' }}
                        >
                          {salesContext.state.loggedActivities[selectedEvent.meetingId].subject}
                        </a>
                      </div>
                    )}
                    <div>
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
                  </div>
                  
                  {loadingDetails ? (
                    <p>Loading meeting details...</p>
                  ) : meetingDetails ? (
                    <>
                      <div>
                        <p><strong>Time:</strong> {new Date(meetingDetails.start).toLocaleString()} - {new Date(meetingDetails.end).toLocaleTimeString()}</p>
                        {meetingDetails.attendees && meetingDetails.attendees.length > 0 && (
                          <div>
                            <strong>Attendees ({meetingDetails.attendees.length}):</strong>
                            <ul style={{ marginTop: '0.5rem', paddingLeft: '1.5rem' }}>
                              {(showAllAttendees ? meetingDetails.attendees : meetingDetails.attendees.slice(0, 5)).map((a, i) => (
                                <li key={i}>
                                  <a href={`mailto:${a.email}`} style={{ color: 'var(--color-primary)' }}>
                                    {a.name || a.email}
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

      {/* Activity Detail Modal */}
      {showActivityDetailModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1002,
          backdropFilter: 'blur(4px)'
        }}>
          <div style={{
            background: 'var(--bg-primary)',
            borderRadius: '12px',
            width: '600px',
            maxWidth: '90vw',
            maxHeight: '80vh',
            overflow: 'auto',
            border: '1px solid var(--border-primary)',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
          }}>
            <div style={{
              padding: '1.5rem',
              borderBottom: '1px solid var(--border-primary)',
              background: 'var(--bg-secondary)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                Activity Details
              </h3>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <button
                  onClick={() => {
                    setActivityToAssign(selectedActivity);
                    setShowAssignOppModal(true);
                    setOppFilterText('');
                  }}
                  style={{
                    padding: '0.5rem 1rem',
                    background: 'transparent',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-primary)',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '0.875rem'
                  }}
                >
                  Assign To...
                </button>
                {selectedActivity?.id && (
                  <a
                    href={`${SFDC_BASE_URL}/lightning/r/Task/${selectedActivity.id}/view`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      color: 'var(--color-primary)',
                      fontSize: '1rem',
                      textDecoration: 'none'
                    }}
                    title="Open in Salesforce"
                  >
                    ↗
                  </a>
                )}
                <button
                  onClick={() => {
                    setShowActivityDetailModal(false);
                    setSelectedActivity(null);
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    fontSize: '1.5rem',
                    padding: 0,
                    lineHeight: 1,
                    width: '32px',
                    height: '32px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '4px',
                    transition: 'background 0.2s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-tertiary)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
                >
                  ×
                </button>
              </div>
            </div>
            <div style={{ padding: '1.5rem' }}>
              {loadingActivityDetails ? (
                <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '2rem' }}>
                  Loading details...
                </div>
              ) : selectedActivity ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Subject</div>
                  <div style={{ fontWeight: 600 }}>{selectedActivity.subject}</div>
                </div>
                {selectedActivity.sa_Activity__c && (
                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>SA Activity</div>
                    <div>{selectedActivity.sa_Activity__c}</div>
                  </div>
                )}
                {selectedActivity.what?.name && (
                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Related To</div>
                    <div>{selectedActivity.what.name}</div>
                  </div>
                )}
                {selectedActivity.activityDate && (
                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Activity Date</div>
                    <div>{selectedActivity.activityDate}</div>
                  </div>
                )}
                {selectedActivity.status && (
                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Status</div>
                    <div>{selectedActivity.status}</div>
                  </div>
                )}
                {selectedActivity.description && (
                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Description</div>
                    <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.875rem' }}>{selectedActivity.description}</div>
                  </div>
                )}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* Assign to Opportunity Modal */}
      {showAssignOppModal && activityToAssign && sfdcContext && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1002,
          backdropFilter: 'blur(4px)'
        }}>
          <div style={{
            background: 'var(--bg-primary)',
            borderRadius: '12px',
            width: '500px',
            maxWidth: '90vw',
            maxHeight: '80vh',
            overflow: 'hidden',
            border: '1px solid var(--border-primary)',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
            display: 'flex',
            flexDirection: 'column'
          }}>
            <div style={{
              padding: '1.5rem',
              borderBottom: '1px solid var(--border-primary)',
              background: 'var(--bg-secondary)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                Assign To
              </h3>
              <button
                onClick={() => {
                  setShowAssignOppModal(false);
                  setActivityToAssign(null);
                  setOppFilterText('');
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontSize: '1.5rem',
                  padding: 0,
                  lineHeight: 1,
                  width: '32px',
                  height: '32px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '4px',
                  transition: 'background 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-tertiary)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
              >
                ×
              </button>
            </div>
            <div style={{ padding: '1.5rem' }}>
              <div style={{ marginBottom: '1rem', padding: '0.75rem', background: 'var(--bg-tertiary)', borderRadius: '6px' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Activity</div>
                <div style={{ fontWeight: 600 }}>{activityToAssign.subject}</div>
              </div>
              <div style={{ marginBottom: '0.5rem' }}>
                <div style={{ position: 'relative' }}>
                  <input
                    type="text"
                    placeholder="Filter..."
                    value={oppFilterText}
                    onChange={(e) => setOppFilterText(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      paddingRight: oppFilterText ? '2rem' : '0.5rem',
                      border: '1px solid var(--border-primary)',
                      borderRadius: '4px',
                      background: 'var(--bg-primary)',
                      color: 'var(--text-primary)',
                      fontSize: '0.875rem'
                    }}
                  />
                  {oppFilterText && (
                    <button
                      onClick={() => setOppFilterText('')}
                      style={{
                        position: 'absolute',
                        right: '0.5rem',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-secondary)',
                        cursor: 'pointer',
                        fontSize: '1.2rem',
                        padding: 0,
                        lineHeight: 1
                      }}
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
              <div style={{ fontSize: '0.875rem', fontWeight: 600 }}>Select Record:</div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', borderTop: '1px solid var(--border-primary)' }}>
              {(() => {
                const items: Array<{id: string, name: string, type: 'Account' | 'Campaign' | 'Opportunity', meta?: string}> = [];
                
                // Add accounts
                (sfdcContext.accounts || []).forEach((acc: any) => {
                  items.push({ id: acc.id, name: acc.name, type: 'Account' });
                });
                
                // Add campaigns
                (sfdcContext.campaigns || []).forEach((camp: any) => {
                  items.push({ id: camp.id, name: camp.name, type: 'Campaign', meta: camp.type });
                });
                
                // Add opportunities
                (sfdcContext.opportunities || []).forEach((opp: any) => {
                  items.push({ id: opp.id, name: opp.name, type: 'Opportunity', meta: opp.stageName });
                });
                
                // Filter
                const filtered = oppFilterText 
                  ? items.filter(item => item.name.toLowerCase().includes(oppFilterText.toLowerCase()))
                  : items;
                
                return filtered.map((item) => (
                <button
                  key={item.id}
                  onClick={async () => {
                    setAssigningActivity(true);
                    try {
                      await transformTool('work-agent', 'satSfdc_updateTechActivity', {
                        taskId: activityToAssign.id,
                        parentRecord: item.id
                      }, 'data => data');
                      showToast(`Activity assigned to ${item.type.toLowerCase()}`, 'success');
                      setShowAssignOppModal(false);
                      setActivityToAssign(null);
                      // Refresh tasks
                      if (selectedSfdcItem) {
                        fetchTasksForItem(selectedSfdcItem);
                      }
                    } catch (err) {
                      console.error('Failed to assign activity:', err);
                      showToast('Failed to assign activity', 'error');
                    } finally {
                      setAssigningActivity(false);
                    }
                  }}
                  disabled={assigningActivity}
                  style={{
                    width: '100%',
                    padding: '1rem 1.5rem',
                    borderBottom: '1px solid var(--border-primary)',
                    background: 'transparent',
                    border: 'none',
                    borderBottom: '1px solid var(--border-primary)',
                    textAlign: 'left',
                    cursor: assigningActivity ? 'not-allowed' : 'pointer',
                    transition: 'background 0.15s',
                    opacity: assigningActivity ? 0.5 : 1
                  }}
                  onMouseEnter={(e) => !assigningActivity && (e.currentTarget.style.background = 'var(--bg-secondary)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                      {item.name}
                    </span>
                    <span style={{
                      fontSize: '0.7rem',
                      padding: '2px 6px',
                      borderRadius: '10px',
                      background: item.type === 'Account' ? '#0d6efd' : item.type === 'Campaign' ? '#198754' : '#6c757d',
                      color: 'white',
                      fontWeight: 500
                    }}>
                      {item.type}
                    </span>
                  </div>
                  {item.meta && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      {item.meta}
                    </div>
                  )}
                </button>
              ));
              })()}
            </div>
          </div>
        </div>
      )}

      <SearchModal
        isOpen={showSearchModal}
        onClose={() => setShowSearchModal(false)}
        onSelect={handleSelectSearchResult}
        type={searchModalType}
        agentSlug="work-agent"
      />

      {/* Log Activity Modal */}
      {showLogActivityModal && sfdcContext && (
        <div className="log-activity-modal-overlay" style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          backdropFilter: 'blur(4px)'
        }}>
          <div className="log-activity-modal-container" style={{
            background: 'var(--bg-primary)',
            borderRadius: '12px',
            width: '1000px',
            maxWidth: '90vw',
            height: '80vh',
            display: 'flex',
            flexDirection: 'column',
            border: '1px solid var(--border-primary)',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
          }} onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="log-activity-modal-header" style={{
              padding: '1.5rem',
              borderBottom: '1px solid var(--border-primary)',
              background: 'var(--bg-secondary)',
              borderRadius: '12px 12px 0 0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                Log Activity - {selectedEvent?.subject}
              </h3>
              <button
                onClick={() => {
                  setShowLogActivityModal(false);
                  setSelectedSfdcItem(null);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontSize: '1.5rem',
                  padding: '0',
                  lineHeight: 1,
                  width: '32px',
                  height: '32px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '4px',
                  transition: 'background 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-tertiary)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
              >
                ×
              </button>
            </div>

            {/* Content */}
            <div className="log-activity-modal-content" style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
              {/* Left: Accounts & Opportunities */}
              <div className="log-activity-modal-sidebar" style={{
                width: '300px',
                borderRight: '1px solid var(--border-primary)',
                overflow: 'auto',
                background: 'var(--bg-secondary)'
              }}>
                {/* Account Filter */}
                {sfdcContext.accounts && sfdcContext.accounts.length > 1 && (
                  <div style={{ padding: '1rem 1rem 0' }}>
                    <div style={{ position: 'relative' }}>
                      <input
                        type="text"
                        placeholder="Filter accounts..."
                        value={accountFilter}
                        onChange={(e) => setAccountFilter(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '0.5rem',
                          paddingRight: accountFilter ? '2rem' : '0.5rem',
                          border: '1px solid var(--border-primary)',
                          borderRadius: '4px',
                          background: 'var(--bg-primary)',
                          color: 'var(--text-primary)',
                          fontSize: '0.875rem'
                        }}
                      />
                      {accountFilter && (
                        <button
                          onClick={() => setAccountFilter('')}
                          style={{
                            position: 'absolute',
                            right: '0.5rem',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            background: 'none',
                            border: 'none',
                            color: 'var(--text-secondary)',
                            cursor: 'pointer',
                            fontSize: '1.2rem',
                            padding: 0,
                            lineHeight: 1
                          }}
                        >
                          ×
                        </button>
                      )}
                    </div>
                    {accountFilter && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                        Showing {sfdcContext.accounts.filter((a: any) => a.name.toLowerCase().includes(accountFilter.toLowerCase())).length} of {sfdcContext.accounts.length} accounts
                      </div>
                    )}
                  </div>
                )}
                
                {/* Accounts Section */}
                {sfdcContext.accounts && sfdcContext.accounts.length > 0 ? (
                  <details open className="log-activity-accounts-section" style={{ padding: '1rem' }}>
                    <summary style={{ cursor: 'pointer', marginBottom: '0.75rem', fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', listStyle: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span>▼</span> Accounts ({sfdcContext.accounts.length})
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowSearchModal(true);
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--text-secondary)',
                          cursor: 'pointer',
                          padding: '0.25rem',
                          display: 'flex',
                          alignItems: 'center'
                        }}
                        title="Search accounts or campaigns"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="11" cy="11" r="8"></circle>
                          <path d="m21 21-4.35-4.35"></path>
                        </svg>
                      </button>
                    </summary>
                    {sfdcContext.accounts.map((account: any) => {
                      // Apply filter
                      if (accountFilter && !account.name.toLowerCase().includes(accountFilter.toLowerCase())) {
                        return null;
                      }
                      
                      const isAccountSelected = selectedSfdcItem?.type === 'account' && selectedSfdcItem.data.id === account.id;
                      const isOpportunityOfThisAccount = selectedSfdcItem?.type === 'opportunity' && sfdcContext.selectedAccountId === account.id;
                      const isActive = isAccountSelected || isOpportunityOfThisAccount;
                      
                      return (
                      <button
                        key={account.id}
                        className="log-activity-account-item"
                        onClick={() => {
                          const item = { type: 'account' as const, data: account };
                          
                          // If account is already directly selected, do nothing
                          if (isAccountSelected) return;
                          
                          // If switching from opportunity to account, reload tasks
                          if (isOpportunityOfThisAccount) {
                            setSelectedSfdcItem(item);
                            fetchTasksForItem(item);
                            return;
                          }
                          
                          // New account selection - fetch tasks and prefill
                          setSelectedSfdcItem(item);
                          fetchTasksForItem(item);
                          prefillActivityData(item);
                          // Fetch opportunities when account is selected
                          setLoadingOpportunities(true);
                          fetchOpportunitiesForAccount(account.id, '').finally(() => setLoadingOpportunities(false));
                        }}
                        style={{
                          width: '100%',
                          padding: '0.75rem',
                          marginBottom: '0.5rem',
                          background: isAccountSelected ? 'var(--color-primary)' : 'var(--bg-primary)',
                          color: isAccountSelected ? 'white' : 'var(--text-primary)',
                          border: isOpportunityOfThisAccount ? '2px solid var(--color-primary)' : '1px solid var(--border-primary)',
                          borderRadius: '6px',
                          textAlign: 'left',
                          cursor: isAccountSelected ? 'default' : 'pointer',
                          fontSize: '0.875rem',
                          fontWeight: 500
                        }}
                      >
                        {account.name}
                      </button>
                      );
                    })}
                  </details>
                ) : (
                  <div style={{ padding: '2rem 1rem', textAlign: 'center' }}>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1rem' }}>
                      No related accounts found
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      <button
                        onClick={() => fetchSFDCContext(true)}
                        disabled={loadingSFDC}
                        style={{
                          padding: '0.5rem 1rem',
                          background: 'var(--color-primary)',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          fontSize: '0.875rem',
                          cursor: loadingSFDC ? 'not-allowed' : 'pointer',
                          opacity: loadingSFDC ? 0.5 : 1
                        }}
                      >
                        {loadingSFDC ? 'Loading...' : 'My Accounts'}
                      </button>
                      <button
                        onClick={() => setShowSearchModal(true)}
                        style={{
                          padding: '0.5rem 1rem',
                          background: 'transparent',
                          color: 'var(--text-primary)',
                          border: '1px solid var(--border-primary)',
                          borderRadius: '6px',
                          fontSize: '0.875rem',
                          cursor: 'pointer'
                        }}
                      >
                        Search Accounts/Campaigns
                      </button>
                    </div>
                  </div>
                )}

                {/* Opportunities Section - show if account or opportunity is selected */}
                {(selectedSfdcItem?.type === 'account' || selectedSfdcItem?.type === 'opportunity') && sfdcContext.opportunities && sfdcContext.opportunities.length > 0 && (
                  <div style={{ padding: '1rem 1rem 0', borderTop: '1px solid var(--border-primary)' }}>
                    <div style={{ marginBottom: '0.75rem' }}>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                        Filter Opportunities
                      </label>
                      <div style={{ position: 'relative' }}>
                        <input
                          type="text"
                          value={opportunityKeyword}
                          onChange={(e) => setOpportunityKeyword(e.target.value)}
                          placeholder="Filter by name..."
                          style={{
                            width: '100%',
                            padding: '0.5rem',
                            paddingRight: opportunityKeyword ? '2rem' : '0.5rem',
                            marginBottom: '0.5rem',
                            border: '1px solid var(--border-primary)',
                            borderRadius: '4px',
                            background: 'var(--bg-primary)',
                            color: 'var(--text-primary)',
                            fontSize: '0.875rem'
                          }}
                        />
                        {opportunityKeyword && (
                          <button
                            onClick={() => setOpportunityKeyword('')}
                            style={{
                              position: 'absolute',
                              right: '0.5rem',
                              top: 'calc(50% - 0.25rem)',
                              transform: 'translateY(-50%)',
                              background: 'none',
                              border: 'none',
                              color: 'var(--text-secondary)',
                              cursor: 'pointer',
                              fontSize: '1.2rem',
                              padding: 0,
                              lineHeight: 1
                            }}
                          >
                            ×
                          </button>
                        )}
                      </div>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={hideClosedOpportunities}
                          onChange={(e) => setHideClosedOpportunities(e.target.checked)}
                          style={{ cursor: 'pointer' }}
                        />
                        Hide Closed/Won
                      </label>
                    </div>
                    
                    {loadingOpportunities ? (
                      <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                        Loading opportunities...
                      </div>
                    ) : sfdcContext.opportunities && sfdcContext.opportunities.length > 0 ? (
                      (() => {
                        let filteredOpps = sfdcContext.opportunities;
                        
                        // Filter by closed/won status
                        if (hideClosedOpportunities) {
                          filteredOpps = filteredOpps.filter((opp: any) => 
                            !opp.stageName?.toLowerCase().includes('closed') && 
                            !opp.stageName?.toLowerCase().includes('won') &&
                            !opp.stageName?.toLowerCase().includes('lost')
                          );
                        }
                        
                        // Filter by keyword
                        if (opportunityKeyword.trim()) {
                          const keyword = opportunityKeyword.toLowerCase();
                          filteredOpps = filteredOpps.filter((opp: any) =>
                            opp.name?.toLowerCase().includes(keyword)
                          );
                        }
                        
                        return filteredOpps.length > 0 ? (
                          <details open>
                            <summary style={{ cursor: 'pointer', marginBottom: '0.75rem', fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', listStyle: 'none', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <span>▼</span> Opportunities ({filteredOpps.length})
                            </summary>
                            {filteredOpps.map((opp: any) => (
                              <button
                                key={opp.id}
                                onClick={() => {
                                  const item = { type: 'opportunity' as const, data: opp };
                                  setSelectedSfdcItem(item);
                                  fetchTasksForItem(item);
                                }}
                                style={{
                                  width: '100%',
                                  padding: '0.75rem',
                                  marginBottom: '0.5rem',
                                  background: selectedSfdcItem?.type === 'opportunity' && selectedSfdcItem.data.id === opp.id ? 'var(--color-primary)' : 'var(--bg-primary)',
                                  color: selectedSfdcItem?.type === 'opportunity' && selectedSfdcItem.data.id === opp.id ? 'white' : 'var(--text-primary)',
                                  border: '1px solid var(--border-primary)',
                                  borderRadius: '6px',
                                  textAlign: 'left',
                                  cursor: 'pointer',
                                  fontSize: '0.875rem'
                                }}
                              >
                                <div style={{ fontWeight: 500 }}>{opp.name}</div>
                                <div style={{ fontSize: '0.75rem', opacity: 0.8, marginTop: '0.25rem' }}>{opp.stageName}</div>
                              </button>
                            ))}
                          </details>
                        ) : (
                          <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                            {opportunityKeyword || hideClosedOpportunities ? 'No opportunities match the current filters' : 'No opportunities found'}
                          </div>
                        );
                      })()
                    ) : (
                      <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                        No opportunities found
                      </div>
                    )}
                  </div>
                )}

                {/* Campaigns Section */}
                {sfdcContext.campaigns && sfdcContext.campaigns.length > 0 && (
                  <div style={{ padding: '1rem 1rem 0', borderTop: '1px solid var(--border-primary)' }}>
                    <details open>
                      <summary style={{ cursor: 'pointer', marginBottom: '0.75rem', fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', listStyle: 'none', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span>▼</span> Campaigns ({sfdcContext.campaigns.length})
                      </summary>
                      {sfdcContext.campaigns.map((campaign: any) => (
                        <button
                          key={campaign.id}
                          onClick={() => {
                            const item = { type: 'campaign' as const, data: campaign };
                            setSelectedSfdcItem(item);
                            fetchTasksForItem(item);
                            prefillActivityData(item);
                          }}
                          style={{
                            width: '100%',
                            padding: '0.75rem',
                            marginBottom: '0.5rem',
                            background: selectedSfdcItem?.type === 'campaign' && selectedSfdcItem.data.id === campaign.id ? 'var(--color-primary)' : 'var(--bg-primary)',
                            color: selectedSfdcItem?.type === 'campaign' && selectedSfdcItem.data.id === campaign.id ? 'white' : 'var(--text-primary)',
                            border: '1px solid var(--border-primary)',
                            borderRadius: '6px',
                            textAlign: 'left',
                            cursor: 'pointer',
                            fontSize: '0.875rem'
                          }}
                        >
                          <div style={{ fontWeight: 500 }}>{campaign.name}</div>
                          {campaign.type && (
                            <div style={{ fontSize: '0.75rem', opacity: 0.8, marginTop: '0.25rem' }}>{campaign.type}</div>
                          )}
                        </button>
                      ))}
                    </details>
                  </div>
                )}
              </div>

              {/* Right: Activity Form */}
              <div className="log-activity-modal-form" style={{ flex: 1, overflow: 'auto', padding: '1.5rem', position: 'relative' }}>
                {selectedSfdcItem ? (
                  <div className="log-activity-form-content" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    {/* Context */}
                    <div className="log-activity-selected-context" style={{
                      padding: '1rem',
                      background: 'var(--bg-tertiary)',
                      borderRadius: '8px',
                      border: '1px solid var(--border-primary)',
                      position: 'relative'
                    }}>
                      <a
                        href={`${SFDC_BASE_URL}/lightning/r/${selectedSfdcItem.type === 'account' ? 'Account' : selectedSfdcItem.type === 'campaign' ? 'Campaign' : 'Opportunity'}/${selectedSfdcItem.data.id}/view`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          position: 'absolute',
                          top: '1rem',
                          right: '1rem',
                          color: 'var(--color-primary)',
                          fontSize: '1rem',
                          textDecoration: 'none'
                        }}
                        title="Open in Salesforce"
                      >
                        ↗
                      </a>
                      <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                        {selectedSfdcItem.type === 'account' ? 'Account' : selectedSfdcItem.type === 'campaign' ? 'Campaign' : 'Opportunity'}
                      </div>
                      <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', paddingRight: '2rem' }}>
                        {selectedSfdcItem.data.name}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem', opacity: 0.6 }}>
                        {selectedSfdcItem.data.id}
                      </div>
                      {selectedSfdcItem.type === 'opportunity' && selectedSfdcItem.data.stageName && (
                        <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                          Stage: {selectedSfdcItem.data.stageName}
                        </div>
                      )}
                      {selectedSfdcItem.type === 'campaign' && selectedSfdcItem.data.type && (
                        <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                          Type: {selectedSfdcItem.data.type}
                        </div>
                      )}
                    </div>

                    {/* Form Fields */}
                    <div style={{ position: 'relative' }}>
                      {loadingActivityPrefill && (
                        <div style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          right: 0,
                          bottom: 0,
                          background: 'rgba(0,0,0,0.5)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRadius: '8px',
                          zIndex: 10
                        }}>
                          <div style={{ color: 'white', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⟳</span>
                            Generating activity details...
                          </div>
                        </div>
                      )}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                    <div>
                      <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-primary)' }}>
                        Subject <span style={{ color: 'var(--color-error)' }}>*</span>
                      </label>
                      <input
                        type="text"
                        value={activityFormData.subject}
                        onChange={(e) => setActivityFormData({...activityFormData, subject: e.target.value})}
                        placeholder="Brief summary of the activity"
                        style={{
                          width: '100%',
                          padding: '0.75rem',
                          border: '1px solid var(--border-primary)',
                          borderRadius: '6px',
                          background: 'var(--bg-primary)',
                          color: 'var(--text-primary)',
                          fontSize: '0.875rem'
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-primary)' }}>
                        SA Activity <span style={{ color: 'var(--color-error)' }}>*</span>
                      </label>
                      <select
                        value={activityFormData.saActivity}
                        onChange={(e) => setActivityFormData({...activityFormData, saActivity: e.target.value})}
                        style={{
                          width: '100%',
                          padding: '0.75rem',
                          border: '1px solid var(--border-primary)',
                          borderRadius: '6px',
                          background: 'var(--bg-primary)',
                          color: 'var(--text-primary)',
                          fontSize: '0.875rem'
                        }}
                      >
                        <option value="">Select activity type...</option>
                        <optgroup label="Architecture">
                          <option value="Architecture Review [Architecture]">Architecture Review</option>
                          <option value="Cloud Adoption Framework [Architecture]">Cloud Adoption Framework</option>
                          <option value="Demo [Architecture]">Demo</option>
                          <option value="Foundational Technical Review [Architecture]">Foundational Technical Review</option>
                          <option value="Migration Readiness Assessment [Architecture]">Migration Readiness Assessment</option>
                          <option value="Migration/Modernization Acceleration [Architecture]">Migration/Modernization Acceleration</option>
                          <option value="Other Architectural Guidance [Architecture]">Other Architectural Guidance</option>
                          <option value="Partner Competency Assessment [Architecture]">Partner Competency Assessment</option>
                          <option value="Partner Solution Engagement [Architecture]">Partner Solution Engagement</option>
                          <option value="Prototype/PoC/Pilot [Architecture]">Prototype/PoC/Pilot</option>
                          <option value="Security, Resilience and Compliance [Architecture]">Security, Resilience and Compliance</option>
                          <option value="Service Team Engagement [Architecture]">Service Team Engagement</option>
                          <option value="Well Architected [Architecture]">Well Architected</option>
                        </optgroup>
                        <optgroup label="Management">
                          <option value="Account Planning [Management]">Account Planning</option>
                          <option value="Cost Optimization [Management]">Cost Optimization</option>
                          <option value="Meeting / Office Hours [Management]">Meeting / Office Hours</option>
                          <option value="RFI and RFP response [Management]">RFI and RFP response</option>
                          <option value="Support and Enablement of Partners [Management]">Support and Enablement of Partners</option>
                          <option value="Support of Proserve Engagement [Management]">Support of Proserve Engagement</option>
                          <option value="Support/Escalation [Management]">Support/Escalation</option>
                          <option value="Validation of Business Outcome after Launch [Management]">Validation of Business Outcome after Launch</option>
                        </optgroup>
                        <optgroup label="Workshops">
                          <option value="Activation Day [Workshops]">Activation Day</option>
                          <option value="GameDay [Workshops]">GameDay</option>
                          <option value="Hackathon [Workshops]">Hackathon</option>
                          <option value="Immersion Day [Workshops]">Immersion Day</option>
                          <option value="Other Workshops [Workshops]">Other Workshops</option>
                        </optgroup>
                        <optgroup label="Program Execution">
                          <option value="CCoE (Cloud Center of Excellence) [Program Execution]">CCoE (Cloud Center of Excellence)</option>
                          <option value="EBA (Experience Based Acceleration) [Program Execution]">EBA (Experience Based Acceleration)</option>
                          <option value="EBC (Executive Briefing Centre) [Program Execution]">EBC (Executive Briefing Centre)</option>
                          <option value="MAP (Migration Acceleration Program) [Program Execution]">MAP (Migration Acceleration Program)</option>
                          <option value="Other Program/ Strategic Initiative Execution [Program Execution]">Other Program/ Strategic Initiative Execution</option>
                        </optgroup>
                      </select>
                    </div>

                    <div>
                      <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-primary)' }}>
                        Activity Date <span style={{ color: 'var(--color-error)' }}>*</span>
                      </label>
                      <input
                        type="date"
                        value={activityFormData.activityDate}
                        onChange={(e) => setActivityFormData({...activityFormData, activityDate: e.target.value})}
                        style={{
                          width: '100%',
                          padding: '0.75rem',
                          border: '1px solid var(--border-primary)',
                          borderRadius: '6px',
                          background: 'var(--bg-primary)',
                          color: 'var(--text-primary)',
                          fontSize: '0.875rem',
                          colorScheme: 'dark'
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-primary)' }}>
                        Description
                      </label>
                      <textarea
                        value={activityFormData.description}
                        onChange={(e) => setActivityFormData({...activityFormData, description: e.target.value})}
                        placeholder="Detailed notes about the activity..."
                        rows={6}
                        style={{
                          width: '100%',
                          padding: '0.75rem',
                          border: '1px solid var(--border-primary)',
                          borderRadius: '6px',
                          background: 'var(--bg-primary)',
                          color: 'var(--text-primary)',
                          fontSize: '0.875rem',
                          resize: 'vertical',
                          fontFamily: 'inherit'
                        }}
                      />
                    </div>
                    </div>
                    </div>

                    {/* Actions */}
                    <div style={{ paddingTop: '1rem', borderTop: '1px solid var(--border-primary)' }}>
                      <button
                        onClick={async () => {
                          if (!selectedSfdcItem) return;
                          
                          setSubmittingActivity(true);
                          try {
                            const result = await transformTool('work-agent', 'satSfdc_createTechActivity', {
                              parentRecord: selectedSfdcItem.data.id,
                              subject: activityFormData.subject,
                              saActivity: activityFormData.saActivity,
                              activityDate: activityFormData.activityDate,
                              description: activityFormData.description
                            }, 'data => data');
                            
                            const taskId = result?.task?.id;
                            
                            // Store logged activity in workspace context
                            if (taskId && selectedEvent) {
                              salesContext.setState({
                                ...salesContext.state,
                                loggedActivities: {
                                  ...salesContext.state.loggedActivities,
                                  [selectedEvent.meetingId]: { id: taskId, subject: activityFormData.subject }
                                }
                              });
                            }
                            
                            // Show toast with clickable link
                            if (taskId) {
                              notify({
                                title: 'Activity logged successfully',
                                message: (
                                  <a
                                    href={`${SFDC_BASE_URL}/lightning/r/Task/${taskId}/view`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{ color: 'var(--color-primary)', textDecoration: 'underline' }}
                                  >
                                    {activityFormData.subject}
                                  </a>
                                ),
                                type: 'success'
                              });
                            } else {
                              showToast('Activity logged successfully', 'success');
                            }
                            
                            setShowLogActivityModal(false);
                            setSelectedSfdcItem(null);
                            
                            // Refresh tasks
                            if (selectedSfdcItem) {
                              fetchTasksForItem(selectedSfdcItem);
                            }
                          } catch (err) {
                            console.error('Failed to log activity:', err);
                            showToast('Failed to log activity', 'error');
                          } finally {
                            setSubmittingActivity(false);
                          }
                        }}
                        disabled={!activityFormData.subject || !activityFormData.saActivity || submittingActivity}
                        style={{
                          width: '100%',
                          padding: '0.75rem',
                          background: 'var(--color-primary)',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          fontSize: '0.875rem',
                          fontWeight: 600,
                          cursor: !activityFormData.subject || !activityFormData.saActivity || submittingActivity ? 'not-allowed' : 'pointer',
                          opacity: !activityFormData.subject || !activityFormData.saActivity || submittingActivity ? 0.5 : 1
                        }}
                      >
                        {submittingActivity ? 'Logging...' : 'Log Activity'}
                      </button>
                    </div>
                    
                    {/* Recent Tasks Section */}
                    {loadingTasks ? (
                      <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border-primary)', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                        <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block', marginRight: '0.5rem' }}>⟳</span>
                        Loading activities...
                      </div>
                    ) : sfdcContext.tasks && sfdcContext.tasks.length > 0 && (
                      <details open style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border-primary)' }}>
                        <summary style={{ cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', listStyle: 'none', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                          <span>▼</span> Recent Activities ({sfdcContext.tasks.length})
                        </summary>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                          {sfdcContext.tasks.slice(0, showAllTasks ? undefined : 5).map((task: any, idx: number) => (
                            <div key={task.id || idx} style={{
                              padding: '0.75rem',
                              background: 'var(--bg-tertiary)',
                              border: '1px solid var(--border-primary)',
                              borderRadius: '6px',
                              fontSize: '0.875rem',
                              position: 'relative'
                            }}>
                              <div style={{ display: 'flex', gap: '0.5rem', position: 'absolute', top: '0.75rem', right: '0.75rem' }}>
                                <button
                                  onClick={() => {
                                    setActivityToAssign(task);
                                    setShowAssignOppModal(true);
                                    setOppFilterText('');
                                  }}
                                  style={{
                                    padding: '0.25rem 0.5rem',
                                    fontSize: '0.7rem',
                                    background: 'transparent',
                                    color: 'var(--text-primary)',
                                    border: '1px solid var(--border-primary)',
                                    borderRadius: '4px',
                                    cursor: 'pointer'
                                  }}
                                  title="Assign to account, opportunity, or campaign"
                                >
                                  Assign To...
                                </button>
                                {task.id && (
                                  <a
                                    href={`${SFDC_BASE_URL}/lightning/r/Task/${task.id}/view`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{
                                      color: 'var(--color-primary)',
                                      fontSize: '0.875rem',
                                      textDecoration: 'none'
                                    }}
                                    title="Open in Salesforce"
                                  >
                                    ↗
                                  </a>
                                )}
                              </div>
                              <button
                                onClick={async () => {
                                  setShowActivityDetailModal(true);
                                  setLoadingActivityDetails(true);
                                  try {
                                    const details = await transformTool('work-agent', 'satSfdc_fetchTaskDetails', {
                                      taskId: task.id
                                    }, 'data => data');
                                    setSelectedActivity(details);
                                  } catch (err) {
                                    console.error('Failed to fetch task details:', err);
                                    setSelectedActivity(task);
                                  } finally {
                                    setLoadingActivityDetails(false);
                                  }
                                }}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  padding: 0,
                                  textAlign: 'left',
                                  cursor: 'pointer',
                                  width: '100%',
                                  color: 'var(--text-primary)'
                                }}
                              >
                                <div style={{ fontWeight: 500, marginBottom: '0.25rem', paddingRight: '5rem' }}>{task.subject}</div>
                                {task.sa_Activity__c && (
                                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                                    {task.sa_Activity__c}
                                  </div>
                                )}
                                {task.what?.name && (
                                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                                    {task.what.name}
                                  </div>
                                )}
                                {task.activityDate && (
                                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                                    {task.activityDate}
                                  </div>
                                )}
                                {task.status && (
                                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                                    Status: {task.status}
                                  </div>
                                )}
                              </button>
                            </div>
                          ))}
                          {sfdcContext.tasks.length > 5 && (
                            <button
                              onClick={() => setShowAllTasks(!showAllTasks)}
                              style={{
                                padding: '0.5rem',
                                background: 'transparent',
                                border: '1px solid var(--border-primary)',
                                borderRadius: '6px',
                                color: 'var(--color-primary)',
                                cursor: 'pointer',
                                fontSize: '0.875rem'
                              }}
                            >
                              {showAllTasks ? 'Show Less' : `Show ${sfdcContext.tasks.length - 5} More`}
                            </button>
                          )}
                        </div>
                      </details>
                    )}
                  </div>
                ) : (
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    height: '100%',
                    color: 'var(--text-secondary)',
                    fontSize: '0.875rem'
                  }}>
                    Select an account or opportunity to log activity
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
