import { useEffect, useState } from 'react';

export type SearchType = 'account' | 'campaign' | 'opportunity';

export interface SearchResult {
  id: string;
  name: string;
  website?: string;
  type?: string;
}

export interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (item: SearchResult) => void;
  type: SearchType;
  /** Called to perform the search; returns matching results */
  onSearch: (query: string, type: SearchType) => Promise<SearchResult[]>;
}

export function SearchModal({
  isOpen,
  onClose,
  onSelect,
  type: initialType,
  onSearch,
}: SearchModalProps) {
  const [type, setType] = useState<SearchType>(initialType);
  const [searchInput, setSearchInput] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
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
        const results = await onSearch(searchInput, type);
        setSearchResults(results);
      } catch {
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchInput, type, isOpen, onSearch]);

  const handleSelect = (item: SearchResult) => {
    onSelect(item);
    setSearchInput('');
    setSearchResults([]);
  };

  const getTypeLabel = (t: SearchType) => {
    if (t === 'opportunity') return 'Opportunities';
    if (t === 'campaign') return 'Campaigns';
    return 'Accounts';
  };

  const switchType = (t: SearchType) => {
    setType(t);
    setSearchResults([]);
    setSearchInput('');
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="search-modal-overlay" onClick={onClose} />
      <div
        className="search-modal-content"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="search-modal-header">
          <h3 className="search-modal-title">Search</h3>
          <button onClick={onClose} className="search-modal-close-btn">
            ✕
          </button>
        </div>
        <div className="search-modal-body">
          <div className="search-modal-type-toggle">
            {(['account', 'campaign', 'opportunity'] as SearchType[]).map(
              (t) => (
                <button
                  key={t}
                  onClick={() => switchType(t)}
                  className={`search-modal-type-btn ${
                    type === t
                      ? 'search-modal-type-btn--active'
                      : 'search-modal-type-btn--inactive'
                  }`}
                >
                  {getTypeLabel(t)}
                </button>
              ),
            )}
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
            <div className="search-modal-loading">Searching...</div>
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
                <div className="search-modal-result-name">{item.name}</div>
                {item.website && (
                  <div className="search-modal-result-meta">{item.website}</div>
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
