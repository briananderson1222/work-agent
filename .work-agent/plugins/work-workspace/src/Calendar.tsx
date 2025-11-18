import { useState, useEffect, useMemo } from 'react';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import DOMPurify from 'dompurify';
import { useAgent, useSendMessage, useNavigation, useToast } from '@stallion-ai/sdk';

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

const API_BASE = 'http://localhost:3141';

function getCacheKey(type: 'calendar' | 'sfdc', identifier?: string): string {
  const today = new Date().toISOString().split('T')[0];
  return type === 'calendar' 
    ? `stallion-calendar-${today}` 
    : `stallion-sfdc-${identifier}`;
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

export function Calendar() {
  const agent = useAgent('stallion-workspace:work-agent');
  const sendMessage = useSendMessage();
  const { setDockState } = useNavigation();
  const { showToast } = useToast();

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
    
    if (!hash) {
      hash = sessionStorage.getItem('stallion-calendar-hash') || '';
    }
    
    const params = new URLSearchParams(hash);
    const dateStr = params.get('date');
    const date = dateStr ? new Date(dateStr + 'T00:00:00') : new Date();
    
    return {
      date,
      categories: params.get('categories')?.split(',').filter(Boolean) || [],
      eventId: params.get('event') || null,
      filterExpanded: params.get('filterExpanded') === 'true',
      allDayExpanded: params.get('allDayExpanded') === 'true'
    };
  }, []);

  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [todayEvents, setTodayEvents] = useState<CalendarEvent[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(initialState.eventId);
  const [meetingDetails, setMeetingDetails] = useState<MeetingDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(initialState.date);
  const [viewMonth, setViewMonth] = useState<Date>(initialState.date);
  const [showAllAttendees, setShowAllAttendees] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set(initialState.categories));
  const [filterExpanded, setFilterExpanded] = useState(initialState.filterExpanded);
  const [allDayExpanded, setAllDayExpanded] = useState(initialState.allDayExpanded);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [hidePastEvents, setHidePastEvents] = useState(false);
  const [hideCanceledEvents, setHideCanceledEvents] = useState(false);
  const [isNowLineVisible, setIsNowLineVisible] = useState(true);

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

  // Update URL hash when state changes
  useEffect(() => {
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
    
    const newHash = params.toString();
    window.location.hash = newHash;
    sessionStorage.setItem('stallion-calendar-hash', newHash);
  }, [selectedDate, selectedCategories, selectedEventId, filterExpanded, allDayExpanded]);

  const fetchCalendar = async (date: Date, forceRefresh = false) => {
    const dateStr = formatLocalDate(date);
    const cacheKey = getCacheKey('calendar', dateStr);
    
    // Check cache first unless forcing refresh
    if (!forceRefresh) {
      const cached = getFromCache<{events: CalendarEvent[]}>(cacheKey);
      if (cached) {
        setEvents(cached.events);
        setLoading(false);
        return;
      }
    }
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(
        `${API_BASE}/agents/stallion-workspace:work-agent/invoke/transform`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            toolName: 'sat-outlook_calendar_view',
            toolArgs: { view: 'day', start_date: dateStr.split('-').slice(1).join('-') + '-' + dateStr.split('-')[0] },
            transform: `(data) => ({
              events: data.map(e => ({
                meetingId: e.meetingId,
                meetingChangeKey: e.meetingChangeKey,
                subject: e.subject,
                start: e.start,
                end: e.end,
                location: e.location,
                organizer: e.organizer,
                status: e.status,
                isCanceled: e.isCanceled,
                categories: e.categories,
                isAllDay: e.isAllDay
              }))
            })`
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Request failed');
      }

      const result = data.response;
      setEvents(result.events || []);
      setCache(cacheKey, result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load calendar');
      showToast('Failed to load calendar events', 'error');
    } finally {
      setLoading(false);
    }
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
      const response = await fetch(
        `${API_BASE}/agents/stallion-workspace:work-agent/invoke/transform`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            toolName: 'sat-outlook_calendar_meeting',
            toolArgs: { 
              operation: 'read',
              meetingId: meetingId, 
              meetingChangeKey: event.meetingChangeKey 
            },
            transform: `(data) => ({
              ...data,
              body: data.body,
              attendees: data.attendees || [],
              responseStatus: data.responseStatus
            })`
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Request failed');
      }

      const details = {
        ...event,
        ...data.response
      };
      
      setMeetingDetails(details);
      setCache(cacheKey, details);
    } catch (err) {
      showToast('Failed to load meeting details', 'error');
    } finally {
      setLoadingDetails(false);
    }
  };

  useEffect(() => {
    fetchCalendar(selectedDate);
  }, [selectedDate]);

  // Load today's events for notifications
  useEffect(() => {
    const today = new Date();
    if (selectedDate.toDateString() !== today.toDateString()) {
      fetchCalendar(today).then(() => {
        setTodayEvents(events);
      });
    } else {
      setTodayEvents(events);
    }
  }, [events, selectedDate]);

  // Auto-select event from URL
  useEffect(() => {
    if (initialState.eventId && events.length > 0) {
      const event = events.find(e => e.meetingId === initialState.eventId);
      if (event) {
        fetchMeetingDetails(event.meetingId);
      }
    }
  }, [events.length, initialState.eventId]);

  const handleRefresh = () => {
    // Clear all cache
    const dateStr = formatLocalDate(selectedDate);
    sessionStorage.removeItem(getCacheKey('calendar', dateStr));
    events.forEach(e => {
      sessionStorage.removeItem(getCacheKey('sfdc', `details-${e.meetingId}`));
      sessionStorage.removeItem(getCacheKey('sfdc', e.meetingId));
    });
    
    fetchCalendar(selectedDate, true);
  };

  const handleEventClick = (event: CalendarEvent) => {
    setSelectedEventId(event.meetingId);
    fetchMeetingDetails(event.meetingId);
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  // Filter events based on selected criteria
  const filteredEvents = events.filter(event => {
    if (hideCanceledEvents && event.isCanceled) return false;
    if (hidePastEvents && isToday) {
      const eventEnd = new Date(event.end);
      if (eventEnd < currentTime) return false;
    }
    if (selectedCategories.size > 0) {
      const eventCategories = event.categories || [];
      if (!eventCategories.some(cat => selectedCategories.has(cat))) return false;
    }
    return true;
  });

  // Separate all-day and timed events
  const allDayEvents = filteredEvents.filter(e => e.isAllDay);
  const timedEvents = filteredEvents.filter(e => !e.isAllDay);

  // Get unique categories for filter
  const allCategories = [...new Set(events.flatMap(e => e.categories || []))].sort();

  return (
    <div className="calendar-workspace">
      <div className="calendar-header">
        <h2>Calendar - {formatDate(selectedDate)}</h2>
        <div className="calendar-controls">
          <input
            type="date"
            value={selectedDate.toISOString().split('T')[0]}
            onChange={(e) => setSelectedDate(new Date(e.target.value + 'T00:00:00'))}
            className="date-picker"
          />
          <button onClick={handleRefresh} disabled={loading}>
            {loading ? 'Loading...' : 'Refresh'}
          </button>
          <button onClick={() => setFilterExpanded(!filterExpanded)}>
            Filters {filterExpanded ? '▼' : '▶'}
          </button>
        </div>
      </div>

      {filterExpanded && (
        <div className="calendar-filters">
          <div className="filter-section">
            <label>
              <input
                type="checkbox"
                checked={hidePastEvents}
                onChange={(e) => setHidePastEvents(e.target.checked)}
              />
              Hide past events
            </label>
            <label>
              <input
                type="checkbox"
                checked={hideCanceledEvents}
                onChange={(e) => setHideCanceledEvents(e.target.checked)}
              />
              Hide canceled events
            </label>
          </div>
          
          {allCategories.length > 0 && (
            <div className="filter-section">
              <h4>Categories:</h4>
              {allCategories.map(category => (
                <label key={category}>
                  <input
                    type="checkbox"
                    checked={selectedCategories.has(category)}
                    onChange={(e) => {
                      const newCategories = new Set(selectedCategories);
                      if (e.target.checked) {
                        newCategories.add(category);
                      } else {
                        newCategories.delete(category);
                      }
                      setSelectedCategories(newCategories);
                    }}
                  />
                  {category}
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="calendar-content">
        {loading ? (
          <div className="loading">Loading calendar events...</div>
        ) : error ? (
          <div className="error">
            <p>Error: {error}</p>
            <button onClick={handleRefresh}>Retry</button>
          </div>
        ) : (
          <>
            {allDayEvents.length > 0 && (
              <div className="all-day-section">
                <h3 onClick={() => setAllDayExpanded(!allDayExpanded)}>
                  All Day Events ({allDayEvents.length}) {allDayExpanded ? '▼' : '▶'}
                </h3>
                {allDayExpanded && (
                  <div className="all-day-events">
                    {allDayEvents.map((event) => (
                      <div
                        key={event.meetingId}
                        className={`event-card all-day ${event.isCanceled ? 'canceled' : ''} ${selectedEventId === event.meetingId ? 'selected' : ''}`}
                        onClick={() => handleEventClick(event)}
                      >
                        <div className="event-title">{event.subject}</div>
                        {event.location && <div className="event-location">{event.location}</div>}
                        {event.categories && event.categories.length > 0 && (
                          <div className="event-categories">
                            {event.categories.map(cat => (
                              <span key={cat} className="category-tag">{cat}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="timed-events">
              {timedEvents.length === 0 ? (
                <div className="empty-state">
                  <p>No timed events for {formatDate(selectedDate)}</p>
                  <button onClick={() => setDockState(true)}>
                    Ask Work Agent
                  </button>
                </div>
              ) : (
                timedEvents.map((event) => {
                  const meetingProvider = detectMeetingProvider(event.location);
                  return (
                    <div
                      key={event.meetingId}
                      className={`event-card ${event.isCanceled ? 'canceled' : ''} ${selectedEventId === event.meetingId ? 'selected' : ''}`}
                      onClick={() => handleEventClick(event)}
                    >
                      <div className="event-time">
                        {formatTime(event.start)} - {formatTime(event.end)}
                      </div>
                      <div className="event-title">{event.subject}</div>
                      {event.organizer && (
                        <div className="event-organizer">
                          Organizer: {formatOrganizerName(event.organizer as any)}
                        </div>
                      )}
                      {meetingProvider && (
                        <div className="meeting-provider">
                          <a href={meetingProvider.url} target="_blank" rel="noopener noreferrer">
                            Join {meetingProvider.provider}
                          </a>
                        </div>
                      )}
                      {event.categories && event.categories.length > 0 && (
                        <div className="event-categories">
                          {event.categories.map(cat => (
                            <span key={cat} className="category-tag">{cat}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>

      {meetingDetails && (
        <div className="meeting-details">
          <h3>Meeting Details</h3>
          {loadingDetails ? (
            <div className="loading">Loading details...</div>
          ) : (
            <div className="details-content">
              <h4>{meetingDetails.subject}</h4>
              <p><strong>Time:</strong> {formatTime(meetingDetails.start)} - {formatTime(meetingDetails.end)}</p>
              {meetingDetails.location && <p><strong>Location:</strong> {meetingDetails.location}</p>}
              {meetingDetails.organizer && <p><strong>Organizer:</strong> {formatOrganizerName(meetingDetails.organizer as any)}</p>}
              
              {meetingDetails.attendees && (
                <div className="attendees-section">
                  <h5>Attendees ({meetingDetails.attendees.length})</h5>
                  <div className="attendees-list">
                    {(showAllAttendees ? meetingDetails.attendees : meetingDetails.attendees.slice(0, 5)).map((attendee, idx) => (
                      <div key={idx} className="attendee">
                        {attendee.email} - {attendee.status}
                      </div>
                    ))}
                    {meetingDetails.attendees.length > 5 && (
                      <button onClick={() => setShowAllAttendees(!showAllAttendees)}>
                        {showAllAttendees ? 'Show Less' : `Show ${meetingDetails.attendees.length - 5} More`}
                      </button>
                    )}
                  </div>
                </div>
              )}
              
              {meetingDetails.body && (
                <div className="meeting-body">
                  <h5>Description</h5>
                  <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(meetingDetails.body) }} />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="quick-actions">
        <button onClick={() => {
          setDockState(true);
          sendMessage('What meetings do I have today?', 'stallion-workspace:work-agent');
        }}>
          Today's Meetings
        </button>
        <button onClick={() => {
          setDockState(true);
          sendMessage('Show me my schedule for tomorrow', 'stallion-workspace:work-agent');
        }}>
          Tomorrow's Schedule
        </button>
        <button onClick={() => {
          setDockState(true);
          sendMessage('Find any scheduling conflicts this week', 'stallion-workspace:work-agent');
        }}>
          Check Conflicts
        </button>
      </div>
    </div>
  );
}
