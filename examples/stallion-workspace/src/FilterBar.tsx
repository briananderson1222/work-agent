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
      <div className="filter-bar-mode-toggle">
        <button
          onClick={() => {
            if (mode !== 'my-accounts') {
              onModeChange('my-accounts');
              loadMyAccounts();
            }
          }}
          className={`filter-bar-mode-btn ${mode === 'my-accounts' ? 'filter-bar-mode-btn--active' : 'filter-bar-mode-btn--inactive'}`}
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
          className={`filter-bar-mode-btn ${mode === 'search' ? 'filter-bar-mode-btn--active' : 'filter-bar-mode-btn--inactive'}`}
        >
          Search
        </button>
      </div>

      {/* Search Controls - Only show in search mode */}
      {mode === 'search' && (
        <div>
          {/* Search Type Selector */}
          <div className="filter-bar-search-type-toggle">
            <button
              onClick={() => onSearchTypeChange('owner')}
              className={`filter-bar-search-type-btn ${searchType === 'owner' ? 'filter-bar-search-type-btn--owner-active' : 'filter-bar-search-type-btn--inactive'}`}
            >
              By Owner
            </button>
            <button
              onClick={() => onSearchTypeChange('territory')}
              className={`filter-bar-search-type-btn ${searchType === 'territory' ? 'filter-bar-search-type-btn--territory-active' : 'filter-bar-search-type-btn--inactive'}`}
            >
              By Territory
            </button>
          </div>

          {/* Search Input with Autocomplete */}
          <div className="filter-bar-search-container">
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
              className="filter-bar-search-input"
              onBlur={() => {
                setTimeout(() => setShowAutocomplete(false), 200);
              }}
            />
            
            {showAutocomplete && autocompleteItems.length > 0 && (
              <div className="filter-bar-autocomplete">
                {autocompleteItems.map((item, idx) => (
                  <div
                    key={item.id}
                    onClick={() => onAutocompleteSelect(item)}
                    className="filter-bar-autocomplete-item"
                  >
                    <div className={`filter-bar-autocomplete-title ${item.description ? 'filter-bar-autocomplete-title--with-desc' : ''}`}>
                      <span>{item.title}</span>
                      {item.badge && (
                        <span className="filter-bar-autocomplete-badge">
                          {item.badge}
                        </span>
                      )}
                    </div>
                    {item.description && (
                      <div className="filter-bar-autocomplete-desc">
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
        <div className="filter-bar-active-filters">
          {activeFilters.map((filter, idx) => {
            const getFilterClass = () => {
              if (filter.type === 'error') return 'filter-bar-active-filter--error';
              if (filter.type === 'owner') return 'filter-bar-active-filter--owner';
              if (filter.type === 'territory') return 'filter-bar-active-filter--territory';
              return 'filter-bar-active-filter--default';
            };
            
            return (
              <span
                key={idx}
                className={`filter-bar-active-filter ${getFilterClass()}`}
              >
                {filter.label}
                <button
                  onClick={() => onFilterRemove(idx)}
                  className="filter-bar-filter-remove-btn"
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
        <div className="filter-bar-filter-section">
          <div 
            onClick={onFilterExpandToggle}
            className="filter-bar-filter-header"
          >
            <div className="filter-bar-filter-header-left">
              <span>Filter</span>
              {(selectedGeos.size > 0 || selectedSizes.size > 0 || nameFilter) && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onClearFilters();
                  }}
                  className="filter-bar-clear-btn"
                >
                  Clear
                </button>
              )}
            </div>
            <span>{filterExpanded ? '▼' : '▶'}</span>
          </div>
          
          {!filterExpanded && (selectedGeos.size > 0 || selectedSizes.size > 0 || nameFilter) && (
            <div className="filter-bar-collapsed-filters">
              {nameFilter && (
                <span className="filter-bar-collapsed-filter filter-bar-collapsed-filter--name">
                  Name: "{nameFilter}"
                  <button
                    onClick={() => onNameFilterChange('')}
                    className="filter-bar-collapsed-filter-remove"
                    title="Clear filter"
                  >
                    ×
                  </button>
                </span>
              )}
              {Array.from(selectedGeos).map(geo => (
                <span key={geo} className="filter-bar-collapsed-filter filter-bar-collapsed-filter--geo">
                  {geo}
                </span>
              ))}
              {Array.from(selectedSizes).map(size => (
                <span key={size} className="filter-bar-collapsed-filter filter-bar-collapsed-filter--size">
                  {size}
                </span>
              ))}
            </div>
          )}
          
          {filterExpanded && (
            <>
              <div className="filter-bar-expanded-section">
                <div className="filter-bar-field-label">Account Name</div>
                <input
                  type="text"
                  placeholder="Filter by name..."
                  value={nameFilter}
                  onChange={(e) => onNameFilterChange(e.target.value)}
                  className="filter-bar-name-input"
                />
              </div>
              
              {allGeos.length > 0 && (
                <div className="filter-bar-expanded-section">
                  <div className="filter-bar-field-label">Geo</div>
                  <div className="filter-bar-option-grid">
                    {allGeos.map(geo => (
                      <button 
                        key={geo}
                        onClick={() => onGeoToggle(geo)}
                        className={`filter-bar-option-btn ${selectedGeos.has(geo) ? 'filter-bar-option-btn--geo-active' : 'filter-bar-option-btn--geo-inactive'}`}
                      >
                        {geo}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              
              {allSizes.length > 0 && (
                <div className="filter-bar-expanded-section">
                  <div className="filter-bar-field-label">Size</div>
                  <div className="filter-bar-option-grid">
                    {allSizes.map(size => (
                      <button 
                        key={size}
                        onClick={() => onSizeToggle(size)}
                        className={`filter-bar-option-btn ${selectedSizes.has(size) ? 'filter-bar-option-btn--size-active' : 'filter-bar-option-btn--size-inactive'}`}
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              
              {(selectedGeos.size > 0 || selectedSizes.size > 0 || nameFilter) && (
                <div className="filter-bar-summary">
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