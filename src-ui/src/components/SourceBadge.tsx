export function SourceBadge({ source }: { source?: string }) {
  const label = source && source !== 'local' ? source : 'Local';
  return <span className="page__tag">{label}</span>;
}
