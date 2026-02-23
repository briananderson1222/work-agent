import { useState, useEffect } from 'react';
import { salesforceProvider } from '../data';
import { log } from '../log';

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
        let results: any[] = [];
        if (type === 'account') {
          const accounts = await salesforceProvider.searchAccounts({ field: 'name', operator: 'CONTAINS', value: searchInput });
          results = accounts.map(a => ({ id: a.id, name: a.name, website: a.website }));
        } else if (type === 'campaign') {
          results = await salesforceProvider.searchCampaigns(searchInput);
        } else if (type === 'opportunity') {
          const opps = await salesforceProvider.searchOpportunities({ field: 'name', operator: 'CONTAINS', value: searchInput });
          results = opps.map(o => ({ id: o.id, name: o.name, type: o.stage }));
        }
        setSearchResults(results);
      } catch (err) {
        log('Search failed:', err);
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
        className="search-modal-overlay"
        onClick={onClose}
      />
      <div
        className="search-modal-content"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="search-modal-header">
          <h3 className="search-modal-title">
            Search
          </h3>
          <button
            onClick={onClose}
            className="search-modal-close-btn"
          >
            ✕
          </button>
        </div>
        <div className="search-modal-body">
          <div className="search-modal-type-toggle">
            <button
              onClick={() => { setType('account'); setSearchResults([]); setSearchInput(''); }}
              className={`search-modal-type-btn ${type === 'account' ? 'search-modal-type-btn--active' : 'search-modal-type-btn--inactive'}`}
            >
              Accounts
            </button>
            <button
              onClick={() => { setType('campaign'); setSearchResults([]); setSearchInput(''); }}
              className={`search-modal-type-btn ${type === 'campaign' ? 'search-modal-type-btn--active' : 'search-modal-type-btn--inactive'}`}
            >
              Campaigns
            </button>
            <button
              onClick={() => { setType('opportunity'); setSearchResults([]); setSearchInput(''); }}
              className={`search-modal-type-btn ${type === 'opportunity' ? 'search-modal-type-btn--active' : 'search-modal-type-btn--inactive'}`}
            >
              Opportunities
            </button>
          </div>
          <input
            type="text"
            placeholder={`Search ${getTypeLabel(type).toLowerCase()}...`}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="search-modal-input"
            autoFocus
          />
          {searchLoading && (
            <div className="search-modal-loading">
              Searching...
            </div>
          )}
        </div>
        {searchResults.length > 0 && (
          <div className="search-modal-results">
            {searchResults.map((item) => (
              <div
                key={item.id}
                onClick={() => handleSelect(item)}
                className="search-modal-result-item"
              >
                <div className="search-modal-result-name">
                  {item.name}
                </div>
                {item.website && (
                  <div className="search-modal-result-meta">
                    {item.website}
                  </div>
                )}
                {item.type && (
                  <div className="search-modal-result-meta">
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
