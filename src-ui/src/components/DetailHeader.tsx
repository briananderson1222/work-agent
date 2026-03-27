/**
 * DetailHeader — Shared sticky header for all SplitPaneLayout detail panels.
 * Enforces consistent placement: title left, action buttons right.
 */
import './DetailHeader.css';

interface DetailHeaderProps {
  title: string;
  subtitle?: string;
  badge?: { label: string; variant?: 'success' | 'warning' | 'info' | 'muted' };
  statusDot?: 'connected' | 'disconnected';
  icon?: React.ReactNode;
  children?: React.ReactNode; // Action buttons go here
}

export function DetailHeader({
  title,
  subtitle,
  badge,
  statusDot,
  icon,
  children,
}: DetailHeaderProps) {
  return (
    <div className="detail-header">
      <div className="detail-header__left">
        {icon && <div className="detail-header__icon">{icon}</div>}
        <div>
          <div className="detail-header__title-row">
            <h2 className="detail-header__title">{title}</h2>
            {badge && (
              <span
                className={`detail-header__badge detail-header__badge--${badge.variant || 'muted'}`}
              >
                {badge.label}
              </span>
            )}
            {statusDot && (
              <span className={`status-dot status-dot--${statusDot}`} />
            )}
          </div>
          {subtitle && (
            <div className="detail-header__subtitle">{subtitle}</div>
          )}
        </div>
      </div>
      {children && <div className="detail-header__actions">{children}</div>}
    </div>
  );
}
