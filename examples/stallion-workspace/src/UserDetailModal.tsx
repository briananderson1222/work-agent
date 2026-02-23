import { useState, useEffect } from 'react';
import { transformTool, useApiBase } from '@stallion-ai/sdk';

function getInitials(name: string): string {
  return name.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?';
}

interface PhoneToolPerson {
  id?: number;
  login: string;
  name: string;
  first_name?: string;
  job_title?: string;
  job_level?: number;
  department_name?: string;
  building?: string;
  city?: string;
  country?: string;
  email?: string;
  badge_type?: string;
  total_tenure_formatted?: string;
  is_manager?: boolean;
  bar_raiser?: boolean;
  manager?: { login: string };
  direct_reports?: any[];
  person_id?: string;
}

interface Territory {
  name: string;
  level: string;
  nodeId: string;
}

const BADGE_COLORS: Record<string, string> = {
  blue: '#3b82f6',
  orange: '#f97316',
  yellow: '#eab308',
  red: '#ef4444',
  green: '#22c55e',
};

export function UserDetailModal({ alias, onClose, detailsUrl, detailsLabel }: { alias: string; onClose: () => void; detailsUrl?: string; detailsLabel?: string }) {
  const [person, setPerson] = useState<PhoneToolPerson | null>(null);
  const [territories, setTerritories] = useState<Territory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { apiBase } = useApiBase();

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    let cancelled = false;
    try {
      const r = await transformTool('work-agent', 'builder-mcp_ReadInternalWebsites',
        { inputs: [`https://phonetool.amazon.com/users/${alias}`] },
        'data => data?.content?.content || data?.content || data');
      if (!cancelled) setPerson(r);

      try {
        const t = await transformTool('work-agent', 'sat-sfdc_getRegistryAssignments',
          { employeeIdentifier: alias },
          'data => (data?.data?.resultRecords || []).map(r => ({ name: r.nodeName, level: r.hierarchyLevel, nodeId: r.nodeId }))');
        if (!cancelled && Array.isArray(t)) setTerritories(t);
      } catch { /* territories optional */ }
    } catch (e: any) {
      if (!cancelled) setError(e.message || 'Lookup failed');
    } finally {
      if (!cancelled) setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [alias]);

  const badgeUrl: string | null = null; // `${apiBase}/api/auth/badge-photo/${person.id}`
  const initials = person ? getInitials(person.name) : alias[0]?.toUpperCase() || '?';
  const badgeColor = BADGE_COLORS[(person?.badge_type || 'blue').toLowerCase()] || BADGE_COLORS.blue;

  return (
    <div className="user-detail-overlay" onClick={onClose}>
      <div className="user-detail-modal" onClick={e => e.stopPropagation()}>
        {loading ? (
          <div className="user-detail-loading">Loading...</div>
        ) : error ? (
          <>
            <div className="user-detail-hero">
              <div className="user-detail-avatar-wrap">
                <div className="user-detail-avatar">
                  <span className="user-detail-avatar-initial">{alias[0]?.toUpperCase() || '?'}</span>
                </div>
              </div>
              <div className="user-detail-hero-info">
                <div className="user-detail-name">{alias}@</div>
                <div className="user-detail-subtitle" style={{ color: 'var(--warning-text, #f59e0b)' }}>Could not load full profile</div>
              </div>
              <button onClick={onClose} className="user-detail-close-btn">✕</button>
            </div>
            <div style={{ padding: '1rem 1.25rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              <p style={{ margin: '0 0 0.75rem' }}>{error}</p>
              <button onClick={fetchData} style={{
                padding: '0.4rem 0.75rem', fontSize: '0.8rem', borderRadius: '0.375rem',
                border: '1px solid var(--accent-primary)', background: 'transparent',
                color: 'var(--accent-primary)', cursor: 'pointer',
              }}>Retry</button>
            </div>
            <div className="user-detail-footer">
              <a href={`https://phonetool.amazon.com/users/${alias}`} target="_blank" rel="noopener noreferrer" className="user-detail-link">
                Open in Phonetool →
              </a>
            </div>
          </>
        ) : person ? (
          <>
            <div className="user-detail-hero">
              <div className="user-detail-avatar-wrap">
                <div className="user-detail-avatar" style={{ border: `3px solid ${badgeColor}` }}>
                  {badgeUrl ? (
                    <img src={badgeUrl} alt={person.name} className="user-detail-avatar-img" />
                  ) : (
                    <span className="user-detail-avatar-initial">{initials}</span>
                  )}
                </div>
                <span className="user-detail-badge-pill" style={{ background: badgeColor }}>{person.badge_type || 'blue'}</span>
              </div>
              <div className="user-detail-hero-info">
                <div className="user-detail-name">{person.name}</div>
                <div className="user-detail-alias">{person.login}@</div>
                {person.job_title && (
                  <div className="user-detail-subtitle">{person.job_title}{person.job_level ? ` · L${person.job_level}` : ''}</div>
                )}
              </div>
              <button onClick={onClose} className="user-detail-close-btn">✕</button>
            </div>

            <div className="user-detail-body">
              {person.department_name && <Row label="Team" value={person.department_name} />}
              {person.building && <Row label="Location" value={`${person.building}${person.city ? `, ${person.city}` : ''}`} />}
              {person.manager?.login && (
                <div className="user-detail-row">
                  <span className="user-detail-label">Manager</span>
                  <a href={`https://phonetool.amazon.com/users/${person.manager.login}`} target="_blank" rel="noopener noreferrer" className="user-detail-link">{person.manager.login}@</a>
                </div>
              )}
              {person.email && (
                <div className="user-detail-row">
                  <span className="user-detail-label">Email</span>
                  <a href={`mailto:${person.email}`} className="user-detail-link">{person.email}</a>
                </div>
              )}
              {person.total_tenure_formatted && <Row label="Tenure" value={person.total_tenure_formatted} />}

              <div className="user-detail-tags">
                {person.is_manager && <span className="user-detail-tag">👔 Manager</span>}
                {person.bar_raiser && <span className="user-detail-tag">⭐ Bar Raiser</span>}
                {person.direct_reports && person.direct_reports.length > 0 && (
                  <span className="user-detail-tag">{person.direct_reports.length} reports</span>
                )}
              </div>

              {territories.length > 0 && (
                <div className="user-detail-section">
                  <div className="user-detail-section-title">Territories ({territories.length})</div>
                  {territories.map(t => (
                    <div key={t.nodeId} className="user-detail-territory">
                      <span className="user-detail-tag">{t.level}</span>
                      <span>{t.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="user-detail-footer">
              <a href={detailsUrl || `https://phonetool.amazon.com/users/${alias}`} target="_blank" rel="noopener noreferrer" className="user-detail-link">
                {detailsLabel || 'Open in Phonetool'} →
              </a>
            </div>
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
