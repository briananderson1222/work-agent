export function ConnectionIcon({
  icon,
  size = 24,
}: {
  icon?: string;
  size?: number;
}) {
  if (icon && (icon.startsWith('http') || icon.startsWith('/'))) {
    return (
      <img
        src={icon}
        alt=""
        style={{ width: size, height: size, borderRadius: 4 }}
      />
    );
  }
  if (icon) return <span style={{ fontSize: size * 0.75 }}>{icon}</span>;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ color: 'var(--text-muted)' }}
    >
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <circle cx="9" cy="11" r="2.5" />
      <path d="M5 18c0-2 1.8-3.5 4-3.5s4 1.5 4 3.5" />
      <line x1="16" y1="9" x2="20" y2="9" />
      <line x1="16" y1="13" x2="20" y2="13" />
    </svg>
  );
}
