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
  onToggleCollapse,
}: CalendarHeaderProps) {
  return (
    <div className="cal-header-container">
      <div
        className={`cal-header-widget ${calendarCollapsed ? 'cal-header-widget--collapsed' : 'cal-header-widget--expanded'}`}
      >
        <div className="cal-header-nav">
          <button
            onClick={() =>
              onViewMonthChange(
                new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1),
              )
            }
            className="cal-header-nav-btn"
          >
            ←
          </button>
          <strong className="cal-header-month-title">
            {viewMonth.toLocaleDateString('en-US', {
              month: 'short',
              year: 'numeric',
            })}
          </strong>
          <button
            onClick={() =>
              onViewMonthChange(
                new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1),
              )
            }
            className="cal-header-nav-btn"
          >
            →
          </button>
        </div>
        <div className="cal-header-grid">
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, i) => (
            <div key={i} className="cal-header-day-label">
              {day}
            </div>
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
              const isSelected =
                date.toDateString() === selectedDate.toDateString();
              const isTodayDate = date.toDateString() === today.toDateString();

              let buttonClass = 'cal-header-day-btn';
              if (isSelected) {
                buttonClass += ' cal-header-day-btn--selected';
              } else if (isTodayDate) {
                buttonClass += ' cal-header-day-btn--today';
              } else {
                buttonClass += ' cal-header-day-btn--normal';
              }
              if (loading && !isSelected) {
                buttonClass += ' cal-header-day-btn--loading';
              }

              days.push(
                <button
                  key={day}
                  onClick={() => onDateSelect(date)}
                  disabled={loading}
                  className={buttonClass}
                >
                  {day}
                </button>,
              );
            }

            return days;
          })()}
        </div>
      </div>
      <div
        className={`cal-header-collapse-container ${calendarCollapsed ? 'cal-header-collapse-container--no-margin' : 'cal-header-collapse-container--with-margin'}`}
      >
        <button
          onClick={onToggleCollapse}
          className="cal-header-collapse-btn"
          title={calendarCollapsed ? 'Expand calendar' : 'Collapse calendar'}
        >
          <svg
            className={`cal-header-collapse-icon ${calendarCollapsed ? 'cal-header-collapse-icon--collapsed' : 'cal-header-collapse-icon--expanded'}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </button>
      </div>
      <h3 className="cal-header-title">
        <span className="cal-header-title-content">
          {loading && <span className="cal-header-spinner">⟳</span>}
          {loading
            ? 'Loading...'
            : isToday
              ? "Today's Meetings"
              : selectedDate.toLocaleDateString('en-US', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                })}
        </span>
        {!isToday ? (
          <button onClick={onTodayClick} className="cal-header-action-btn">
            Today
          </button>
        ) : isToday && events.length > 0 && !isNowLineVisible ? (
          <button onClick={onNowClick} className="cal-header-action-btn">
            Now
          </button>
        ) : null}
      </h3>
    </div>
  );
}
