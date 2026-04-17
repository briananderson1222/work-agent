import type { JSX } from 'react';
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
  onToggleHideCanceled,
}: CalendarGridProps) {
  if (loading) {
    return (
      <div className="cal-grid-loading">
        <p>Loading events...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="cal-grid-error">
        <p className="cal-grid-error-text">{error}</p>
      </div>
    );
  }

  return (
    <>
      {/* Filter Section */}
      {allCategories.length > 0 &&
        !(
          allCategories.length === 1 && allCategories[0] === 'Uncategorized'
        ) && (
          <div className="cal-grid-filter-container">
            <div onClick={onFilterToggle} className="cal-grid-filter-header">
              <div className="cal-grid-filter-title">
                <span>Filter</span>
                {selectedCategories.size > 0 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onClearFilters();
                    }}
                    className="cal-grid-clear-btn"
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="cal-grid-filter-actions">
                {isToday && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleHidePast();
                    }}
                    className={`cal-grid-toggle-btn ${hidePastEvents ? 'cal-grid-toggle-btn--active' : 'cal-grid-toggle-btn--inactive'}`}
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
                    className={`cal-grid-toggle-btn ${hideCanceledEvents ? 'cal-grid-toggle-btn--active' : 'cal-grid-toggle-btn--inactive'}`}
                  >
                    Hide Canceled
                  </button>
                )}
                <span>{filterExpanded ? '▼' : '▶'}</span>
              </div>
            </div>

            {!filterExpanded && selectedCategories.size > 0 && (
              <div className="cal-grid-selected-categories">
                {Array.from(selectedCategories).map((cat) => (
                  <span key={cat} className="cal-grid-category-tag">
                    {cat}
                  </span>
                ))}
              </div>
            )}

            {filterExpanded && (
              <>
                <div className="cal-grid-category-list">
                  {allCategories.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => onCategoryToggle(cat)}
                      className={`cal-grid-category-btn ${selectedCategories.has(cat) ? 'cal-grid-category-btn--selected' : 'cal-grid-category-btn--unselected'}`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
                {selectedCategories.size > 0 && (
                  <div className="cal-grid-filter-count">
                    Showing {visibleEvents.length} of {events.length} events
                  </div>
                )}
              </>
            )}
          </div>
        )}

      {/* Events List */}
      {events.length === 0 ? (
        <div className="cal-grid-no-events">
          <p>
            {selectedCategories.size === 0
              ? 'No events for this date'
              : 'No events match selected categories'}
          </p>
        </div>
      ) : visibleEvents.length === 0 ? (
        isToday ? (
          <ul className="cal-grid-events-list">
            <div className="cal-grid-now-line">
              Now -{' '}
              {currentTime.toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
              })}
            </div>
            <div className="cal-grid-no-more-events">
              No more events for{' '}
              {selectedDate.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
              })}
              ...
            </div>
          </ul>
        ) : (
          <div className="cal-grid-no-events">
            <p>No upcoming events</p>
          </div>
        )
      ) : (
        <>
          {/* All-Day Events */}
          {visibleEvents.filter((e) => e.isAllDay).length > 0 && (
            <details
              open={allDayExpanded}
              onToggle={(e) =>
                onAllDayToggle((e.target as HTMLDetailsElement).open)
              }
              className="cal-grid-all-day-section"
            >
              <summary className="cal-grid-all-day-summary">
                All-Day Events ({visibleEvents.filter((e) => e.isAllDay).length}
                )
              </summary>
              <ul className="cal-grid-all-day-list">
                {visibleEvents
                  .filter((e) => e.isAllDay)
                  .map((event) => (
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
          {visibleEvents.filter((e) => !e.isAllDay).length > 0 && (
            <div className="cal-grid-timed-events-title">
              Events ({visibleEvents.filter((e) => !e.isAllDay).length})
            </div>
          )}

          <ul>
            {(() => {
              const nonAllDayEvents = visibleEvents.filter((e) => !e.isAllDay);
              const result: JSX.Element[] = [];
              let activeGroup: JSX.Element[] = [];
              let showedIndicator = false;

              nonAllDayEvents.forEach((event, idx) => {
                const eventStart = new Date(event.start);
                const eventEnd = new Date(event.end);
                const prevEvent = idx > 0 ? nonAllDayEvents[idx - 1] : null;
                const prevEventEnd = prevEvent ? new Date(prevEvent.end) : null;

                const isActiveEvent =
                  currentTime >= eventStart && currentTime < eventEnd;

                const showTimeLineBefore =
                  isToday &&
                  !showedIndicator &&
                  ((idx === 0 && currentTime < eventStart) ||
                    (prevEventEnd !== null &&
                      currentTime > prevEventEnd &&
                      currentTime < eventStart) ||
                    isActiveEvent);

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
                        className="cal-grid-meeting-link"
                      >
                        {event.subject}
                      </button>
                    );
                    joinButton = <span> in progress</span>;
                  } else {
                    const allNonAllDay = events.filter((e) => !e.isAllDay);
                    const nextMeeting = allNonAllDay.find(
                      (e) => new Date(e.start) > currentTime,
                    );

                    if (nextMeeting) {
                      const nextStart = new Date(nextMeeting.start);
                      const minutesUntil = Math.round(
                        (nextStart.getTime() - currentTime.getTime()) / 60000,
                      );
                      const hoursUntil = Math.floor(minutesUntil / 60);
                      const remainingMinutes = minutesUntil % 60;
                      const timeText =
                        hoursUntil > 0
                          ? `${hoursUntil}h ${remainingMinutes}m`
                          : `${minutesUntil}m`;
                      const isFiltered = !visibleEvents.some(
                        (e) => e.meetingId === nextMeeting.meetingId,
                      );

                      nextMeetingLink = (
                        <button
                          onClick={() => {
                            if (isFiltered) onClearFilters();
                            onEventSelect(nextMeeting.meetingId);
                          }}
                          className="cal-grid-meeting-link"
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
                    <div
                      key={`indicator-${event.meetingId}`}
                      className="cal-grid-now-line cal-grid-now-line--top"
                    >
                      {indicatorText}
                      {nextMeetingLink}
                      {joinButton}
                    </div>,
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
                      <div
                        key={`active-group-${activeGroup[0].key}`}
                        className="cal-grid-active-group"
                      >
                        {activeGroup}
                      </div>,
                    );
                    activeGroup = [];
                  }
                  result.push(eventItem);
                }
              });

              if (activeGroup.length > 0) {
                result.push(
                  <div
                    key="active-group-final"
                    className="cal-grid-active-group"
                  >
                    {activeGroup}
                  </div>,
                );
              }

              return result;
            })()}
            {isToday &&
              visibleEvents.filter((e) => !e.isAllDay).length > 0 &&
              currentTime >
                new Date(
                  visibleEvents.filter((e) => !e.isAllDay)[
                    visibleEvents.filter((e) => !e.isAllDay).length - 1
                  ].end,
                ) && (
                <>
                  <div className="cal-grid-now-line">
                    Now -{' '}
                    {currentTime.toLocaleTimeString('en-US', {
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </div>
                  <div className="cal-grid-no-more-events">
                    No more events for{' '}
                    {selectedDate.toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                    })}
                    ...
                  </div>
                </>
              )}
          </ul>
        </>
      )}
    </>
  );
}
