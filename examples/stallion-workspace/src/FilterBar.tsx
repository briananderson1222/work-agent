interface FilterBarProps {
  mode: 'my-accounts' | 'search';
  searchType: 'owner' | 'territory';
  searchInput: string;
  showAutocomplete: boolean;
  autocompleteItems: Array<{
    id: string;
    title: string;
    description?: string;
    badge?: string;
  }>;
  activeFilters: Array<{
    type: 'owner' | 'territory' | 'error';
    label: string;
    value?: string;
    id?: string;
    error?: string;
  }>;
  filterExpanded: boolean;
  selectedGeos: Set<string>;
  selectedSizes: Set<string>;
  nameFilter: string;
  allGeos: string[];
  allSizes: string[];
  filteredAccounts: any[];
  accounts: any[];
  displayLimit: number;
  onModeChange: (mode: 'my-accounts' | 'search') => void;
  onSearchTypeChange: (type: 'owner' | 'territory') => void;
  onSearchInputChange: (value: string) => void;
  onAutocompleteSelect: (item: any) => void;
  onFilterRemove: (index: number) => void;
  onFilterExpandToggle: () => void;
  onNameFilterChange: (value: string) => void;
  onGeoToggle: (geo: string) => void;
  onSizeToggle: (size: string) => void;
  onClearFilters: () => void;
  onSearchSubmit: (query: string) => void;
  setShowAutocomplete: (show: boolean) => void;
  loadMyAccounts: () => void;
  restoreSearchResults: () => void;
}

export function FilterBar({
  mode,
  searchType,
  searchInput,
  showAutocomplete,
  autocompleteItems,
  activeFilters,
  filterExpanded,
  selectedGeos,
  selectedSizes,
  nameFilter,
  allGeos,
  allSizes,
  filteredAccounts,
  accounts,
  displayLimit,
  onModeChange,
  onSearchTypeChange,
  onSearchInputChange,
  onAutocompleteSelect,
  onFilterRemove,
  onFilterExpandToggle,
  onNameFilterChange,
  onGeoToggle,
  onSizeToggle,
  onClearFilters,
  onSearchSubmit,
  setShowAutocomplete,
  loadMyAccounts,
  restoreSearchResults
}: FilterBarProps) {
  return (
    <div className="workspace-dashboard__sidebar-header">
      <h3>Accounts</h3>
      
      {/* Mode Toggle */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <button
          onClick={() => {
            if (mode !== 'my-accounts') {
              onModeChange('my-accounts');
              loadMyAccounts();
            }
          }}
          style={{
            flex: 1,
            padding: '0.5rem',
            fontSize: '0.875rem',
            border: mode === 'my-accounts' ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
            borderRadius: '6px',
            background: mode === 'my-accounts' ? 'var(--color-bg)' : 'var(--color-bg)',
            color: 'var(--color-text-primary)',
            cursor: 'pointer',
            fontWeight: mode === 'my-accounts' ? 600 : 400
          }}
        >
          My Accounts
        </button>
        <button
          onClick={() => {
            if (mode !== 'search') {
              onModeChange('search');
              restoreSearchResults();
            }
          }}
          style={{
            flex: 1,
            padding: '0.5rem',
            fontSize: '0.875rem',
            border: mode === 'search' ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
            borderRadius: '6px',
            background: 'var(--color-bg)',
            color: 'var(--color-text-primary)',
            cursor: 'pointer',
            fontWeight: mode === 'search' ? 600 : 400
          }}
        >
          Search
        </button>
      </div>

      {/* Search Controls - Only show in search mode */}
      {mode === 'search' && (
        <div>
          {/* Search Type Selector */}
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <button
              onClick={() => onSearchTypeChange('owner')}
              style={{
                flex: 1,
                padding: '0.5rem',
                fontSize: '0.75rem',
                border: '1px solid var(--color-border)',
                borderRadius: '6px',
                background: searchType === 'owner' ? 'var(--color-primary)' : 'var(--color-bg)',
                color: searchType === 'owner' ? 'white' : 'var(--color-text-primary)',
                cursor: 'pointer',
                fontWeight: searchType === 'owner' ? 600 : 400
              }}
            >
              By Owner
            </button>
            <button
              onClick={() => onSearchTypeChange('territory')}
              style={{
                flex: 1,
                padding: '0.5rem',
                fontSize: '0.75rem',
                border: '1px solid var(--color-border)',
                borderRadius: '6px',
                background: searchType === 'territory' ? 'var(--success-text)' : 'var(--color-bg)',
                color: searchType === 'territory' ? 'white' : 'var(--color-text-primary)',
                cursor: 'pointer',
                fontWeight: searchType === 'territory' ? 600 : 400
              }}
            >
              By Territory
            </button>
          </div>

          {/* Search Input with Autocomplete */}
          <div style={{ marginBottom: '0.75rem', position: 'relative' }}>
            <input
              type="text"
              placeholder={searchType === 'owner' ? 'First Last...' : 'Territory name...'}
              value={searchInput}
              onChange={(e) => onSearchInputChange(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter' && searchInput.trim()) {
                  if (searchType === 'owner') {
                    onSearchSubmit(searchInput);
                  }
                }
              }}
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
                fontSize: '0.875rem',
                border: '1px solid var(--color-border)',
                borderRadius: '6px',
                background: 'var(--color-bg)',
                color: 'var(--color-text-primary)',
                outline: 'none',
                transition: 'border-color 0.2s'
              }}
              onFocus={(e) => e.target.style.borderColor = 'var(--color-primary)'}
              onBlur={(e) => {
                e.target.style.borderColor = 'var(--color-border)';
                setTimeout(() => setShowAutocomplete(false), 200);
              }}
            />
            
            {showAutocomplete && autocompleteItems.length > 0 && (
              <div style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                background: 'var(--color-bg-secondary)',
                border: '1px solid var(--color-border)',
                borderRadius: '4px',
                marginTop: '4px',
                maxHeight: '200px',
                overflowY: 'auto',
                zIndex: 1000,
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
              }}>
                {autocompleteItems.map((item, idx) => (
                  <div
                    key={item.id}
                    onClick={() => onAutocompleteSelect(item)}
                    style={{
                      padding: '8px 10px',
                      cursor: 'pointer',
                      borderBottom: idx < autocompleteItems.length - 1 ? '1px solid var(--color-border)' : 'none',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'var(--color-bg-hover)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    <div style={{ fontWeight: 600, fontSize: '0.8rem', marginBottom: item.description ? '2px' : '0', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>{item.title}</span>
                      {item.badge && (
                        <span style={{
                          fontSize: '0.65rem',
                          padding: '1px 6px',
                          borderRadius: '10px',
                          background: 'var(--color-primary)',
                          color: 'white',
                          fontWeight: 500,
                        }}>
                          {item.badge}
                        </span>
                      )}
                    </div>
                    {item.description && (
                      <div style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary)' }}>
                        {item.description}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Active Filters */}
      {mode === 'search' && activeFilters.length > 0 && (
        <div style={{ marginBottom: '0.75rem', display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
          {activeFilters.map((filter, idx) => {
            const getFilterColor = () => {
              if (filter.type === 'error') return 'var(--error-text)';
              if (filter.type === 'owner') return 'var(--accent-primary)';
              if (filter.type === 'territory') return 'var(--success-text)';
              return 'var(--color-primary)';
            };
            
            return (
              <span
                key={idx}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  padding: '0.25rem 0.5rem',
                  background: getFilterColor(),
                  color: 'white',
                  borderRadius: '12px',
                  fontSize: '0.7rem',
                  fontWeight: 500
                }}
              >
                {filter.label}
                <button
                  onClick={() => onFilterRemove(idx)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'white',
                    cursor: 'pointer',
                    padding: 0,
                    fontSize: '0.9rem',
                    lineHeight: 1
                  }}
                  title="Remove"
                >
                  ×
                </button>
              </span>
            );
          })}
        </div>
      )}
      
      {/* Filter Bar */}
      {accounts.length > 0 && (
        <div style={{ marginTop: '0.75rem', borderTop: '1px solid var(--color-border)' }}>
          <div 
            onClick={onFilterExpandToggle}
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between',
              fontSize: '0.85rem', 
              fontWeight: 600, 
              color: 'var(--color-text-secondary)',
              cursor: 'pointer',
              padding: '0.75rem 0'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <span>Filter</span>
              {(selectedGeos.size > 0 || selectedSizes.size > 0 || nameFilter) && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onClearFilters();
                  }}
                  style={{
                    padding: 0,
                    fontSize: '0.75rem',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--color-primary)',
                    fontWeight: 500,
                    marginLeft: '0.25rem'
                  }}
                >
                  Clear
                </button>
              )}
            </div>
            <span>{filterExpanded ? '▼' : '▶'}</span>
          </div>
          
          {!filterExpanded && (selectedGeos.size > 0 || selectedSizes.size > 0 || nameFilter) && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginTop: '0.5rem' }}>
              {nameFilter && (
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  fontSize: '0.75rem',
                  padding: '2px 6px',
                  borderRadius: '8px',
                  background: 'var(--color-primary)',
                  color: 'var(--text-inverted)'
                }}>
                  Name: "{nameFilter}"
                  <button
                    onClick={() => onNameFilterChange('')}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'white',
                      cursor: 'pointer',
                      padding: 0,
                      marginLeft: '0.25rem',
                      fontSize: '0.9rem',
                      lineHeight: 1
                    }}
                    title="Clear filter"
                  >
                    ×
                  </button>
                </span>
              )}
              {Array.from(selectedGeos).map(geo => (
                <span key={geo} style={{
                  fontSize: '0.75rem',
                  padding: '2px 6px',
                  borderRadius: '8px',
                  background: 'var(--color-primary)',
                  color: 'var(--text-inverted)'
                }}>
                  {geo}
                </span>
              ))}
              {Array.from(selectedSizes).map(size => (
                <span key={size} style={{
                  fontSize: '0.75rem',
                  padding: '2px 6px',
                  borderRadius: '8px',
                  background: 'var(--color-success)',
                  color: 'var(--text-inverted)'
                }}>
                  {size}
                </span>
              ))}
            </div>
          )}
          
          {filterExpanded && (
            <>
              <div style={{ marginTop: '0.5rem' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem' }}>Account Name</div>
                <input
                  type="text"
                  placeholder="Filter by name..."
                  value={nameFilter}
                  onChange={(e) => onNameFilterChange(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.25rem 0.5rem',
                    fontSize: '0.75rem',
                    border: '1px solid var(--color-border)',
                    borderRadius: '4px',
                    background: 'var(--color-bg)',
                    color: 'var(--color-text-primary)'
                  }}
                />
              </div>
              
              {allGeos.length > 0 && (
                <div style={{ marginTop: '0.5rem' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem' }}>Geo</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                    {allGeos.map(geo => (
                      <button 
                        key={geo}
                        onClick={() => onGeoToggle(geo)}
                        style={{ 
                          padding: '0.25rem 0.5rem',
                          background: selectedGeos.has(geo) ? 'var(--color-primary)' : 'var(--color-bg)',
                          color: selectedGeos.has(geo) ? 'white' : 'var(--color-text)',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          fontSize: '0.75rem',
                          border: '1px solid',
                          borderColor: selectedGeos.has(geo) ? 'var(--color-primary)' : 'var(--color-border)',
                          transition: 'all 0.15s'
                        }}
                      >
                        {geo}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              
              {allSizes.length > 0 && (
                <div style={{ marginTop: '0.5rem' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.25rem' }}>Size</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                    {allSizes.map(size => (
                      <button 
                        key={size}
                        onClick={() => onSizeToggle(size)}
                        style={{ 
                          padding: '0.25rem 0.5rem',
                          background: selectedSizes.has(size) ? 'var(--color-success)' : 'var(--color-bg)',
                          color: selectedSizes.has(size) ? 'white' : 'var(--color-text)',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          fontSize: '0.75rem',
                          border: '1px solid',
                          borderColor: selectedSizes.has(size) ? 'var(--color-success)' : 'var(--color-border)',
                          transition: 'all 0.15s'
                        }}
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              
              {(selectedGeos.size > 0 || selectedSizes.size > 0 || nameFilter) && (
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginTop: '0.5rem' }}>
                  Showing {Math.min(filteredAccounts.length, displayLimit)} of {filteredAccounts.length} accounts
                  {filteredAccounts.length > accounts.length && ` (${accounts.length} total)`}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}