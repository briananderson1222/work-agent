import { useState, useMemo } from 'react';

interface Account {
  id: string;
  name: string;
  geo_Text__c?: string;
  awsci_customer?: {
    customerRevenue?: {
      tShirtSize?: string;
    };
  };
}

interface Filter {
  type: 'owner' | 'territory' | 'error';
  label: string;
  value?: string;
  id?: string;
  error?: string;
}

export function useCRMFilters(accounts: Account[]) {
  const [activeFilters, setActiveFilters] = useState<Filter[]>([]);
  const [filterExpanded, setFilterExpanded] = useState(false);
  const [selectedGeos, setSelectedGeos] = useState<Set<string>>(new Set());
  const [selectedSizes, setSelectedSizes] = useState<Set<string>>(new Set());
  const [nameFilter, setNameFilter] = useState('');
  const [displayLimit, setDisplayLimit] = useState(50);

  const allGeos = useMemo(() => 
    [...new Set(accounts.map(acc => acc.geo_Text__c).filter(Boolean))].sort(),
    [accounts]
  );
  
  const allSizes = useMemo(() => 
    [...new Set(accounts.map(acc => acc.awsci_customer?.customerRevenue?.tShirtSize).filter(Boolean))].sort(),
    [accounts]
  );

  const filteredAccounts = useMemo(() => 
    accounts.filter(account => {
      if (nameFilter && !account.name.toLowerCase().includes(nameFilter.toLowerCase())) {
        return false;
      }
      if (selectedGeos.size > 0 && !selectedGeos.has(account.geo_Text__c || '')) {
        return false;
      }
      if (selectedSizes.size > 0 && !selectedSizes.has(account.awsci_customer?.customerRevenue?.tShirtSize || '')) {
        return false;
      }
      return true;
    }),
    [accounts, nameFilter, selectedGeos, selectedSizes]
  );

  const clearAllFilters = () => {
    setSelectedGeos(new Set());
    setSelectedSizes(new Set());
    setNameFilter('');
  };

  return {
    activeFilters,
    setActiveFilters,
    filterExpanded,
    setFilterExpanded,
    selectedGeos,
    setSelectedGeos,
    selectedSizes,
    setSelectedSizes,
    nameFilter,
    setNameFilter,
    displayLimit,
    setDisplayLimit,
    allGeos,
    allSizes,
    filteredAccounts,
    clearAllFilters
  };
}