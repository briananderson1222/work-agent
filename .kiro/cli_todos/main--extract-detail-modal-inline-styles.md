# Extract Detail/Modal Inline Styles to CSS Classes

branch: main
worktree: main
created: 2025-01-27
status: in-progress
modified_files:
  - examples/stallion-workspace/src/LeadershipInsightModal.tsx
  - examples/stallion-workspace/src/EventDetail.tsx
  - examples/stallion-workspace/src/EventCard.tsx
  - examples/stallion-workspace/src/workspace.css

## Tasks
- [x] Read workspace.css to understand existing patterns
- [x] Read LeadershipInsightModal.tsx and identify all style={{}} blocks (85 expected)
- [x] Read EventDetail.tsx and identify all style={{}} blocks (39 expected)
- [x] Read EventCard.tsx and identify all style={{}} blocks (2 expected)
- [ ] Create CSS classes with descriptive names following existing patterns
- [ ] Replace inline styles with className references
- [ ] Use CSS variables instead of hardcoded colors
- [ ] Verify no TypeScript errors with npx tsc --noEmit