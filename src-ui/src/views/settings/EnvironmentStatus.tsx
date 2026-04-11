import { useEffect, useState } from 'react';
import { useSystemStatusForApiBaseQuery } from '@stallion-ai/sdk';

interface Prerequisite {
  id: string;
  name: string;
  description: string;
  status: 'installed' | 'error' | 'missing';
  category: 'required' | 'optional';
  source?: string;
  installGuide?: { steps: string[]; commands?: string[] };
}

export function EnvironmentStatus({ apiBase }: { apiBase: string }) {
  const [expanded, setExpanded] = useState(false);
  const [guideOpen, setGuideOpen] = useState<Set<string>>(new Set());

  const { data: systemStatus, isLoading: loading } =
    useSystemStatusForApiBaseQuery(apiBase);
  const prerequisites = Array.isArray(systemStatus?.prerequisites)
    ? (systemStatus.prerequisites as Prerequisite[])
    : [];

  useEffect(() => {
    if (
      Array.isArray(prerequisites) &&
      prerequisites.some(
        (prerequisite) =>
          prerequisite.category === 'required' &&
          prerequisite.status !== 'installed',
      )
    ) {
      setExpanded(true);
    }
  }, [prerequisites]);

  if (loading || !Array.isArray(prerequisites) || prerequisites.length === 0) {
    return null;
  }

  const allRequiredMet = prerequisites
    .filter((prerequisite) => prerequisite.category === 'required')
    .every((prerequisite) => prerequisite.status === 'installed');
  const missingCount = prerequisites.filter(
    (prerequisite) => prerequisite.status !== 'installed',
  ).length;

  const toggleGuide = (id: string) =>
    setGuideOpen((previous) => {
      const next = new Set(previous);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const icon = (status: string) =>
    status === 'installed' ? '✓' : status === 'error' ? '⚠' : '✗';

  const stripClass = allRequiredMet
    ? 'settings__env'
    : 'settings__env settings__env--error';

  const grouped = new Map<string, Prerequisite[]>();
  for (const prerequisite of prerequisites) {
    const source = prerequisite.source || 'Core';
    if (!grouped.has(source)) grouped.set(source, []);
    grouped.get(source)!.push(prerequisite);
  }

  const renderItem = (prerequisite: Prerequisite) => (
    <div key={prerequisite.id}>
      <div
        className={`settings__env-item${prerequisite.status !== 'installed' && prerequisite.installGuide ? ' settings__env-item--clickable' : ''}`}
        onClick={() =>
          prerequisite.status !== 'installed' &&
          prerequisite.installGuide &&
          toggleGuide(prerequisite.id)
        }
      >
        <span
          className={`settings__env-status settings__env-status--${prerequisite.status}`}
        >
          {icon(prerequisite.status)}
        </span>
        <span>
          <span className="settings__env-name">{prerequisite.name}</span>
          <span className="settings__env-desc">
            {' '}
            — {prerequisite.description}
          </span>
          {prerequisite.category === 'optional' && (
            <span className="settings__env-optional"> (optional)</span>
          )}
        </span>
      </div>
      {guideOpen.has(prerequisite.id) && prerequisite.installGuide && (
        <div className="settings__env-guide">
          <ol>
            {prerequisite.installGuide.steps.map((step, index) => (
              <li key={index}>{step}</li>
            ))}
          </ol>
          {(prerequisite.installGuide.commands?.length ?? 0) > 0 && (
            <div className="settings__env-guide-cmds">
              {prerequisite.installGuide.commands?.map((command, index) => (
                <div key={index}>$ {command}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <>
      <div className={stripClass}>
        <span className="settings__env-icon">{allRequiredMet ? '●' : '○'}</span>
        <span className="settings__env-label">
          {allRequiredMet
            ? 'Environment Ready'
            : `${missingCount} issue${missingCount !== 1 ? 's' : ''} to resolve`}
        </span>
        <button
          type="button"
          className="settings__env-toggle"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? 'Hide' : 'Details'}
        </button>
      </div>

      {expanded && (
        <div className="settings__env-panel">
          {[...grouped.entries()].map(([source, items]) => (
            <div key={source}>
              <div className="settings__env-source">{source}</div>
              {items.map(renderItem)}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
