import { useState, useEffect } from 'react';
import { transformTool } from '@stallion-ai/sdk';
import type { PersonVM } from './data/viewmodels';

export function PhoneLookupModal({ alias, onClose }: { alias: string; onClose: () => void }) {
  const [person, setPerson] = useState<PersonVM | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await transformTool('work-agent', 'builder-mcp_ReadInternalWebsites',
          { inputs: [`https://phonetool.amazon.com/users/${alias}`] }, 'data => data');
        if (!cancelled) {
          const raw = Array.isArray(r) ? r[0] : r;
          setPerson({
            alias: raw?.alias || raw?.login || alias,
            name: raw?.name || raw?.displayName || alias,
            title: raw?.jobTitle || raw?.title,
            team: raw?.team || raw?.department,
            manager: raw?.manager?.name || raw?.manager,
            location: raw?.location || raw?.building,
            email: raw?.email || `${alias}@amazon.com`,
          });
        }
      } catch (e: any) {
        if (!cancelled) setError(e.message || 'Lookup failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [alias]);

  return (
    <div className="phone-lookup-overlay" onClick={onClose}>
      <div className="phone-lookup-modal" onClick={e => e.stopPropagation()}>
        <div className="phone-lookup-header">
          <strong className="phone-lookup-title">📞 {alias}</strong>
          <button onClick={onClose} className="phone-lookup-close-btn">✕</button>
        </div>
        {loading ? <p>Loading...</p> : error ? <p className="phone-lookup-error">{error}</p> : person ? (
          <div className="phone-lookup-details">
            <div><strong>Name:</strong> {person.name}</div>
            {person.title && <div><strong>Title:</strong> {person.title}</div>}
            {person.team && <div><strong>Team:</strong> {person.team}</div>}
            {person.manager && <div><strong>Manager:</strong> {person.manager}</div>}
            {person.location && <div><strong>Location:</strong> {person.location}</div>}
            {person.email && <div><strong>Email:</strong> <a href={`mailto:${person.email}`} className="phone-lookup-email-link">{person.email}</a></div>}
            <div className="phone-lookup-footer">
              <a href={`https://phonetool.amazon.com/users/${alias}`} target="_blank" rel="noopener noreferrer"
                className="phone-lookup-phonetool-link">
                Open in Phonetool →
              </a>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
