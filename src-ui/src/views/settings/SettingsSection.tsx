import type { ReactNode } from 'react';

export function SettingsSection({
  id,
  icon,
  title,
  children,
}: {
  id?: string;
  icon: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div id={id} className="settings__section">
      <div className="settings__section-head">
        <span className="settings__section-icon" aria-hidden="true">
          {icon}
        </span>
        <span className="settings__section-title">{title}</span>
      </div>
      <div className="settings__section-body">{children}</div>
    </div>
  );
}
