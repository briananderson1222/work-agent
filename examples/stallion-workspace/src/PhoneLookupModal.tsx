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
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }} onClick={onClose}>
      <div style={{ background: 'var(--color-bg, var(--text-inverted))', borderRadius: 8, padding: '1.5rem', minWidth: 320, maxWidth: 420, boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <strong style={{ fontSize: '1.1rem' }}>📞 {alias}</strong>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: 'var(--color-text-secondary)' }}>✕</button>
        </div>
        {loading ? <p>Loading...</p> : error ? <p style={{ color: 'red' }}>{error}</p> : person ? (
          <div style={{ display: 'grid', gap: '0.5rem', fontSize: '0.9rem' }}>
            <div><strong>Name:</strong> {person.name}</div>
            {person.title && <div><strong>Title:</strong> {person.title}</div>}
            {person.team && <div><strong>Team:</strong> {person.team}</div>}
            {person.manager && <div><strong>Manager:</strong> {person.manager}</div>}
            {person.location && <div><strong>Location:</strong> {person.location}</div>}
            {person.email && <div><strong>Email:</strong> <a href={`mailto:${person.email}`} style={{ color: 'var(--color-primary)' }}>{person.email}</a></div>}
            <div style={{ marginTop: '0.5rem' }}>
              <a href={`https://phonetool.amazon.com/users/${alias}`} target="_blank" rel="noopener noreferrer"
                style={{ color: 'var(--color-primary)', fontSize: '0.85rem' }}>
                Open in Phonetool →
              </a>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
