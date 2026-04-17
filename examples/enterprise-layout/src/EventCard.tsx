interface CalendarEvent {
  meetingId: string;
  subject: string;
  start: string;
  end: string;
  categories?: string[];
  isAllDay?: boolean;
}

interface EventCardProps {
  event: CalendarEvent;
  isSelected: boolean;
  isActive?: boolean;
  onClick: () => void;
}

export function EventCard({
  event,
  isSelected,
  isActive,
  onClick,
}: EventCardProps) {
  return (
    <li
      data-event-id={event.meetingId}
      className={`workspace-dashboard__calendar-item ${isSelected ? 'is-active' : ''} ${isActive ? 'cal-event--active' : ''}`}
    >
      <button
        type="button"
        onClick={onClick}
        className={isSelected ? 'cal-event-btn--selected' : undefined}
      >
        {!event.isAllDay && (
          <span className="workspace-dashboard__time">
            {new Date(event.start).toLocaleTimeString('en-US', {
              hour: 'numeric',
              minute: '2-digit',
            })}
            {' - '}
            {new Date(event.end).toLocaleTimeString('en-US', {
              hour: 'numeric',
              minute: '2-digit',
            })}
          </span>
        )}
        <span className="workspace-dashboard__title">{event.subject}</span>
        {event.categories && event.categories.length > 0 && (
          <div className="cal-event-categories">
            {event.categories.map((cat) => (
              <span key={cat} className="cal-event-category-badge">
                {cat}
              </span>
            ))}
          </div>
        )}
      </button>
    </li>
  );
}
