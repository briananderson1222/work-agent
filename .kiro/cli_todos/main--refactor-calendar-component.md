# Refactor Calendar Component into Sub-components

branch: main
worktree: main
created: 2025-01-27
status: in-progress
modified_files:
  - examples/stallion-workspace/src/Calendar.tsx

## Task Items

- [x] Read Calendar.tsx to understand structure (3269 lines)
- [ ] Extract CalendarHeader.tsx (navigation bar, prev/next, view switcher)
- [ ] Extract CalendarGrid.tsx (main grid rendering for day/week/month)
- [ ] Extract EventCard.tsx (individual event rendering blocks)
- [ ] Extract EventDetail.tsx (event detail panel/modal)
- [ ] Extract useCalendarData.ts (data fetching custom hook)
- [ ] Extract useCalendarNavigation.ts (date navigation custom hook)
- [ ] Update Calendar.tsx to compose sub-components
- [ ] Validate with npx tsc --noEmit && npm run build