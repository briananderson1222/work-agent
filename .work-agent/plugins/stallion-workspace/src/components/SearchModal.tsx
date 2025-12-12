import { useState, useEffect } from 'react';
import { transformTool } from '@stallion-ai/sdk';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (item: any) => void;
  type: 'account' | 'campaign' | 'opportunity';
  agentSlug: string;
}

export function SearchModal({ isOpen, onClose, onSelect, type: initialType, agentSlug }: SearchModalProps) {
  const [type, setType] = useState<'account' | 'campaign' | 'opportunity'>(initialType);
  const [searchInput, setSearchInput] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  useEffect(() => {
    setType(initialType);
  }, [initialType]);

  // Debounced search
  useEffect(() => {
    if (!searchInput.trim() || !isOpen) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setSearchLoading(true);
      try {
        let toolName = '';
        let transformFn = '';
        if (type === 'account') {
          toolName = 'sat-sfdc_search_accounts';
          transformFn = '(data) => data.accounts || []';
        } else if (type === 'campaign') {
          toolName = 'sat-sfdc_search_campaigns';
          transformFn = '(data) => data.campaigns || []';
        } else if (type === 'opportunity') {
          toolName = 'sat-sfdc_search_opportunities';
          transformFn = '(data) => data.opportunities || []';
        }

        const results = await transformTool(agentSlug, toolName,
          { queryTerm: searchInput },
          transformFn
        );
        setSearchResults(results);
      } catch (err) {
        console.error('Search failed:', err);
      } finally {
        setSearchLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchInput, type, isOpen, agentSlug]);

  const handleSelect = (item: any) => {
    onSelect(item);
    setSearchInput('');
    setSearchResults([]);
  };

  const getTypeLabel = (t: string) => {
    if (t === 'opportunity') return 'Opportunities';
    if (t === 'campaign') return 'Campaigns';
    return 'Accounts';
  };

  if (!isOpen) return null;

  return (
    <>
      <div 
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          zIndex: 10000,
        }}
        onClick={onClose}
      />
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'var(--bg-primary)',
          border: '1px solid var(--border-primary)',
          borderRadius: '0.5rem',
          width: '90vw',
          maxWidth: '500px',
          maxHeight: '70vh',
          zIndex: 10001,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{
          padding: '1rem 1.5rem',
          borderBottom: '1px solid var(--border-primary)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>
            Search
          </h3>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: '1.5rem',
            }}
          >
            ✕
          </button>
        </div>
        <div style={{ padding: '1rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={() => { setType('account'); setSearchResults([]); setSearchInput(''); }}
              style={{
                flex: 1,
                padding: '0.5rem',
                fontSize: '0.875rem',
                border: '1px solid var(--border-primary)',
                borderRadius: '6px',
                background: type === 'account' ? 'var(--color-primary)' : 'var(--bg-secondary)',
                color: type === 'account' ? 'white' : 'var(--text-primary)',
                cursor: 'pointer',
                fontWeight: type === 'account' ? 600 : 400
              }}
            >
              Accounts
            </button>
            <button
              onClick={() => { setType('campaign'); setSearchResults([]); setSearchInput(''); }}
              style={{
                flex: 1,
                padding: '0.5rem',
                fontSize: '0.875rem',
                border: '1px solid var(--border-primary)',
                borderRadius: '6px',
                background: type === 'campaign' ? 'var(--color-primary)' : 'var(--bg-secondary)',
                color: type === 'campaign' ? 'white' : 'var(--text-primary)',
                cursor: 'pointer',
                fontWeight: type === 'campaign' ? 600 : 400
              }}
            >
              Campaigns
            </button>
            <button
              onClick={() => { setType('opportunity'); setSearchResults([]); setSearchInput(''); }}
              style={{
                flex: 1,
                padding: '0.5rem',
                fontSize: '0.875rem',
                border: '1px solid var(--border-primary)',
                borderRadius: '6px',
                background: type === 'opportunity' ? 'var(--color-primary)' : 'var(--bg-secondary)',
                color: type === 'opportunity' ? 'white' : 'var(--text-primary)',
                cursor: 'pointer',
                fontWeight: type === 'opportunity' ? 600 : 400
              }}
            >
              Opportunities
            </button>
          </div>
          <input
            type="text"
            placeholder={`Search ${getTypeLabel(type).toLowerCase()}...`}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid var(--border-primary)',
              borderRadius: '0.25rem',
              background: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              fontSize: '0.875rem'
            }}
            autoFocus
          />
          {searchLoading && (
            <div style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
              Searching...
            </div>
          )}
        </div>
        {searchResults.length > 0 && (
          <div style={{ flex: 1, overflowY: 'auto', borderTop: '1px solid var(--border-primary)' }}>
            {searchResults.map((item) => (
              <div
                key={item.id}
                onClick={() => handleSelect(item)}
                style={{
                  padding: '1rem 1.5rem',
                  borderBottom: '1px solid var(--border-primary)',
                  cursor: 'pointer',
                  transition: 'background 0.15s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-secondary)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                  {item.name}
                </div>
                {item.website && (
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                    {item.website}
                  </div>
                )}
                {item.type && (
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                    Type: {item.type}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
