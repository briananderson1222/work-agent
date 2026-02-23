import React from 'react';
import { EventCard } from './EventCard';

interface CalendarEvent {
  meetingId: string;
  subject: string;
  start: string;
  end: string;
  categories?: string[];
  isAllDay?: boolean;
}

interface CalendarGridProps {
  events: CalendarEvent[];
  visibleEvents: CalendarEvent[];
  selectedEventId: string | null;
  selectedDate: Date;
  currentTime: Date;
  isToday: boolean;
  loading: boolean;
  error: string | null;
  selectedCategories: Set<string>;
  filterExpanded: boolean;
  allDayExpanded: boolean;
  hidePastEvents: boolean;
  hideCanceledEvents: boolean;
  hasCanceledEvents: boolean;
  allCategories: string[];
  onEventSelect: (eventId: string) => void;
  onCategoryToggle: (category: string) => void;
  onFilterToggle: () => void;
  onAllDayToggle: (expanded: boolean) => void;
  onClearFilters: () => void;
  onToggleHidePast: () => void;
  onToggleHideCanceled: () => void;
}

export function CalendarGrid({
  events,
  visibleEvents,
  selectedEventId,
  selectedDate,
  currentTime,
  isToday,
  loading,
  error,
  selectedCategories,
  filterExpanded,
  allDayExpanded,
  hidePastEvents,
  hideCanceledEvents,
  hasCanceledEvents,
  allCategories,
  onEventSelect,
  onCategoryToggle,
  onFilterToggle,
  onAllDayToggle,
  onClearFilters,
  onToggleHidePast,
  onToggleHideCanceled
}: CalendarGridProps) {
  if (loading) {
    return (
      <div style={{ padding: '1rem', color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>
        <p>Loading events...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '1rem' }}>
        <p style={{ color: 'var(--color-error)', fontSize: '0.9rem' }}>{error}</p>
      </div>
    );
  }

  return (
    <>
      {/* Filter Section */}
      {!loading && allCategories.length > 0 && !(allCategories.length === 1 && allCategories[0] === 'Uncategorized') && (
        <div style={{ 
          marginTop: '0.5rem',
          padding: '0.125rem 0.75rem', 
          background: 'var(--color-bg-secondary)', 
          borderRadius: '4px',
          border: '1px solid var(--color-border)'
        }}>
          <div 
            onClick={onFilterToggle}
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
                    onClearFilters();
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
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleHidePast();
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
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleHideCanceled();
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
                  color: 'var(--text-inverted)'
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
                    onClick={() => onCategoryToggle(cat)}
                    style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '0.35rem',
                      padding: '0.35rem 0.6rem',
                      background: selectedCategories.has(cat) ? 'var(--color-primary)' : 'var(--color-bg)',
                      color: selectedCategories.has(cat) ? 'var(--text-inverted)' : 'var(--color-text)',
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
                  Showing {visibleEvents.length} of {events.length} events
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Events List */}
      {events.length === 0 ? (
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
          {/* All-Day Events */}
          {visibleEvents.filter(e => e.isAllDay).length > 0 && (
            <details 
              open={allDayExpanded} 
              onToggle={(e) => onAllDayToggle((e.target as HTMLDetailsElement).open)}
              style={{ marginBottom: '1rem', border: '1px solid var(--color-border)', borderRadius: '4px', padding: '0.5rem' }}
            >
              <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
                All-Day Events ({visibleEvents.filter(e => e.isAllDay).length})
              </summary>
              <ul style={{ marginTop: '0.5rem' }}>
                {visibleEvents.filter(e => e.isAllDay).map((event) => (
                  <EventCard
                    key={event.meetingId}
                    event={event}
                    isSelected={event.meetingId === selectedEventId}
                    onClick={() => onEventSelect(event.meetingId)}
                  />
                ))}
              </ul>
            </details>
          )}
          
          {/* Timed Events */}
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
                
                const showTimeLineBefore = isToday && !showedIndicator && (
                  (idx === 0 && currentTime < eventStart) ||
                  (prevEventEnd && currentTime > prevEventEnd && currentTime < eventStart) ||
                  isActiveEvent
                );
                
                if (showTimeLineBefore) {
                  showedIndicator = true;
                  
                  let indicatorText = '';
                  let nextMeetingLink: JSX.Element | null = null;
                  let joinButton: JSX.Element | null = null;
                  
                  if (isActiveEvent) {
                    indicatorText = `Now ${currentTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} - `;
                    
                    nextMeetingLink = (
                      <button
                        onClick={() => onEventSelect(event.meetingId)}
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
                    
                    joinButton = <span> in progress</span>;
                  } else {
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
                              onClearFilters();
                            }
                            onEventSelect(nextMeeting.meetingId);
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
                
                const eventItem = (
                  <EventCard
                    key={event.meetingId}
                    event={event}
                    isSelected={event.meetingId === selectedEventId}
                    isActive={isActiveEvent}
                    onClick={() => onEventSelect(event.meetingId)}
                  />
                );
                
                if (isActiveEvent) {
                  activeGroup.push(eventItem);
                } else {
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
    </>
  );
}