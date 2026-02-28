import { useEffect, useState } from 'react';
import { useApiBase } from '../contexts/ApiBaseContext';

function getInitials(name: string): string {
  return (
    name
      .split(' ')
      .map((w) => w[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?'
  );
}

export function UserDetailModal({
  alias,
  onClose,
}: {
  alias: string;
  onClose: () => void;
}) {
  const [person, setPerson] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { apiBase } = useApiBase();

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(
        `${apiBase}/api/users/${encodeURIComponent(alias)}`,
      );
      const data = await r.json();
      if (data.error && !data.name) throw new Error(data.error);
      setPerson(data);
    } catch (e: any) {
      setError(e.message || 'Lookup failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const hasDetails =
    person &&
    (person.title ||
      person.team ||
      person.email ||
      person.manager ||
      person.location);
  const displayName =
    person?.name && person.name !== person.alias ? person.name : null;
  const initials = displayName
    ? getInitials(displayName)
    : alias[0]?.toUpperCase() || '?';

  return (
    <div className="user-detail-overlay" onClick={onClose}>
      <div className="user-detail-modal" onClick={(e) => e.stopPropagation()}>
        {loading ? (
          <div className="user-detail-loading">Loading...</div>
        ) : error ? (
          <>
            <div className="user-detail-hero">
              <div className="user-detail-avatar-wrap">
                <div className="user-detail-avatar">
                  <span className="user-detail-avatar-initial">
                    {alias[0]?.toUpperCase() || '?'}
                  </span>
                </div>
              </div>
              <div className="user-detail-hero-info">
                <div className="user-detail-name">{alias}</div>
                <div
                  className="user-detail-subtitle"
                  style={{ color: 'var(--warning-text, #f59e0b)' }}
                >
                  Could not load profile
                </div>
              </div>
              <button onClick={onClose} className="user-detail-close-btn">
                ✕
              </button>
            </div>
            <div
              style={{
                padding: '1rem 1.25rem',
                fontSize: '0.85rem',
                color: 'var(--text-secondary)',
              }}
            >
              <p style={{ margin: '0 0 0.75rem' }}>{error}</p>
              <button
                onClick={fetchData}
                style={{
                  padding: '0.4rem 0.75rem',
                  fontSize: '0.8rem',
                  borderRadius: '0.375rem',
                  border: '1px solid var(--accent-primary)',
                  background: 'transparent',
                  color: 'var(--accent-primary)',
                  cursor: 'pointer',
                }}
              >
                Retry
              </button>
            </div>
          </>
        ) : person ? (
          <>
            <div className="user-detail-hero">
              <div className="user-detail-avatar-wrap">
                <div className="user-detail-avatar">
                  {person.avatarUrl ? (
                    <img
                      src={person.avatarUrl}
                      alt={displayName || alias}
                      className="user-detail-avatar-img"
                    />
                  ) : (
                    <span className="user-detail-avatar-initial">
                      {initials}
                    </span>
                  )}
                </div>
                {person.badges?.length > 0 && (
                  <span className="user-detail-badge-pill">
                    {person.badges[0]}
                  </span>
                )}
              </div>
              <div className="user-detail-hero-info">
                <div className="user-detail-name">{displayName || alias}</div>
                {displayName && (
                  <div className="user-detail-alias">{person.alias}</div>
                )}
                {person.title && (
                  <div className="user-detail-subtitle">{person.title}</div>
                )}
              </div>
              <button onClick={onClose} className="user-detail-close-btn">
                ✕
              </button>
            </div>

            {hasDetails ? (
              <div className="user-detail-body">
                {person.team && <Row label="Team" value={person.team} />}
                {person.location && (
                  <Row label="Location" value={person.location} />
                )}
                {person.manager && (
                  <div className="user-detail-row">
                    <span className="user-detail-label">Manager</span>
                    <span>{person.manager.name || person.manager.alias}</span>
                  </div>
                )}
                {person.email && (
                  <div className="user-detail-row">
                    <span className="user-detail-label">Email</span>
                    <a
                      href={`mailto:${person.email}`}
                      className="user-detail-link"
                    >
                      {person.email}
                    </a>
                  </div>
                )}
                {person.tenure && <Row label="Tenure" value={person.tenure} />}
                {person.directReports != null && person.directReports > 0 && (
                  <div className="user-detail-tags">
                    <span className="user-detail-tag">
                      {person.directReports} reports
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div
                style={{
                  padding: '1rem 1.25rem',
                  fontSize: '0.85rem',
                  color: 'var(--text-secondary)',
                }}
              >
                No additional details available. Install a user directory plugin
                for richer profiles.
              </div>
            )}

            {person.profileUrl && (
              <div className="user-detail-footer">
                <a
                  href={person.profileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="user-detail-link"
                >
                  View Profile →
                </a>
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="user-detail-row">
      <span className="user-detail-label">{label}</span>
      <span>{value}</span>
    </div>
  );
}
