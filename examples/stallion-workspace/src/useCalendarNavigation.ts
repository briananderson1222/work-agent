import { useState, useEffect, useMemo } from 'react';
import { useWorkspaceNavigation } from '@stallion-ai/sdk';

export function useCalendarNavigation(activeTab?: any) {
  const { getTabState, setTabState } = useWorkspaceNavigation();

  // Helper to format date as YYYY-MM-DD in local timezone
  const formatLocalDate = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Parse initial state from sessionStorage
  const initialState = useMemo(() => {
    const storedState = activeTab ? getTabState('calendar') : '';
    const params = new URLSearchParams(storedState);
    const dateStr = params.get('date');
    const date = dateStr ? new Date(dateStr + 'T00:00:00') : new Date();
    
    return {
      date,
      categories: params.get('categories')?.split(',').filter(Boolean) || [],
      eventId: params.get('event') || null,
      filterExpanded: params.get('filterExpanded') === 'true',
      allDayExpanded: params.get('allDayExpanded') === 'true'
    };
  }, [activeTab, getTabState]);

  const [selectedDate, setSelectedDate] = useState<Date>(initialState.date);
  const [viewMonth, setViewMonth] = useState<Date>(initialState.date);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(initialState.eventId);
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set(initialState.categories));
  const [filterExpanded, setFilterExpanded] = useState(initialState.filterExpanded);
  const [allDayExpanded, setAllDayExpanded] = useState(initialState.allDayExpanded);
  const [isInitialMount, setIsInitialMount] = useState(true);

  // Restore state when tab becomes active
  useEffect(() => {
    if (activeTab) {
      const storedState = getTabState('calendar');
      if (storedState) {
        const params = new URLSearchParams(storedState);
        
        const dateStr = params.get('date');
        if (dateStr) {
          const date = new Date(dateStr + 'T00:00:00');
          if (!isNaN(date.getTime())) {
            setSelectedDate(date);
            setViewMonth(date);
          }
        }
        
        const categories = params.get('categories')?.split(',').filter(Boolean) || [];
        setSelectedCategories(new Set(categories));
        
        const eventId = params.get('event');
        if (eventId) {
          setSelectedEventId(eventId);
        }
        
        setFilterExpanded(params.get('filterExpanded') === 'true');
        setAllDayExpanded(params.get('allDayExpanded') === 'true');
      }
    }
  }, [activeTab, getTabState]);

  // Update URL hash when state changes (skip on initial mount)
  useEffect(() => {
    if (isInitialMount) {
      setIsInitialMount(false);
      return;
    }
    const params = new URLSearchParams();
    params.set('date', formatLocalDate(selectedDate));
    if (selectedCategories.size > 0) {
      params.set('categories', Array.from(selectedCategories).join(','));
    }
    if (selectedEventId) {
      params.set('event', selectedEventId);
    }
    if (filterExpanded) {
      params.set('filterExpanded', 'true');
    }
    if (allDayExpanded) {
      params.set('allDayExpanded', 'true');
    }
    const stateString = params.toString();
    setTabState('calendar', stateString);
  }, [selectedDate, selectedCategories, selectedEventId, filterExpanded, allDayExpanded, isInitialMount, setTabState]);

  return {
    selectedDate,
    setSelectedDate,
    viewMonth,
    setViewMonth,
    selectedEventId,
    setSelectedEventId,
    selectedCategories,
    setSelectedCategories,
    filterExpanded,
    setFilterExpanded,
    allDayExpanded,
    setAllDayExpanded,
    formatLocalDate
  };
}