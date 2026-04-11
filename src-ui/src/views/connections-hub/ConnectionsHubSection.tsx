import type { ReactNode } from 'react';

interface ConnectionsHubSectionProps {
  title: string;
  description: string;
  manageLabel?: string;
  onManage?: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

export function ConnectionsHubSection({
  title,
  description,
  manageLabel,
  onManage,
  children,
  footer,
}: ConnectionsHubSectionProps) {
  return (
    <div className="connections-hub__section">
      <div className="connections-hub__section-header">
        <span className="connections-hub__section-label">{title}</span>
        {manageLabel && onManage && (
          <button className="connections-hub__add-btn" onClick={onManage}>
            {manageLabel}
          </button>
        )}
      </div>
      <p className="connections-hub__section-desc">{description}</p>
      <div className="connections-hub__cards">{children}</div>
      {footer}
    </div>
  );
}
