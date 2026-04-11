import type { ReactNode } from 'react';

export function StatCard({
  color,
  icon,
  label,
  value,
}: {
  color: string;
  icon: string;
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="usage-stat-card">
      <div className="usage-stat-icon">{icon}</div>
      <div className="usage-stat-label">{label}</div>
      <div className="usage-stat-value" style={{ color }}>
        {value}
      </div>
    </div>
  );
}
