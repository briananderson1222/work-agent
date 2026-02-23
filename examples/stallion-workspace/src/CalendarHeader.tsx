import React from 'react';

interface CalendarHeaderProps {
  selectedDate: Date;
  viewMonth: Date;
  loading: boolean;
  isToday: boolean;
  isNowLineVisible: boolean;
  events: any[];
  onDateSelect: (date: Date) => void;
  onViewMonthChange: (date: Date) => void;
  onTodayClick: () => void;
  onNowClick: () => void;
  calendarCollapsed: boolean;
  onToggleCollapse: () => void;
}

export function CalendarHeader({
  selectedDate,
  viewMonth,
  loading,
  isToday,
  isNowLineVisible,
  events,
  onDateSelect,
  onViewMonthChange,
  onTodayClick,
  onNowClick,
  calendarCollapsed,
  onToggleCollapse
}: CalendarHeaderProps) {
  return (
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
            onClick={() => onViewMonthChange(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', color: 'var(--color-text)', padding: '2px 6px' }}
          >←</button>
          <strong style={{ fontSize: '0.8rem' }}>
            {viewMonth.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
          </strong>
          <button 
            onClick={() => onViewMonthChange(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))}
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
              const isTodayDate = date.toDateString() === today.toDateString();
              
              days.push(
                <button
                  key={day}
                  onClick={() => onDateSelect(date)}
                  disabled={loading}
                  style={{
                    padding: '6px 4px',
                    background: isSelected ? 'var(--color-primary)' : 'transparent',
                    color: isSelected ? 'var(--color-bg)' : 'var(--color-text)',
                    border: isTodayDate && !isSelected ? '2px solid var(--color-primary)' : '1px solid transparent',
                    borderRadius: '4px',
                    cursor: loading ? 'wait' : 'pointer',
                    fontSize: '0.75rem',
                    fontWeight: isSelected || isTodayDate ? 'bold' : 'normal',
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
          onClick={onToggleCollapse}
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
          {loading ? 'Loading...' : isToday 
            ? "Today's Meetings" 
            : selectedDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
        </span>
        {!isToday ? (
          <button
            onClick={onTodayClick}
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
        ) : isToday && events.length > 0 && !isNowLineVisible ? (
          <button
            onClick={onNowClick}
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
    </div>
  );
}