import React from 'react';

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

export function EventCard({ event, isSelected, isActive, onClick }: EventCardProps) {
  return (
    <li
      data-event-id={event.meetingId}
      className={`workspace-dashboard__calendar-item ${isSelected ? 'is-active' : ''}`}
      style={isActive ? { marginBottom: '0.5rem' } : undefined}
    >
      <button 
        type="button" 
        onClick={onClick}
        style={isSelected ? {
          backgroundColor: 'var(--accent-light)',
          border: '2px solid var(--color-accent)',
          borderRadius: '4px'
        } : undefined}
      >
        {!event.isAllDay && (
          <span className="workspace-dashboard__time">
            {new Date(event.start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
            {' - '}
            {new Date(event.end).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
          </span>
        )}
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
}