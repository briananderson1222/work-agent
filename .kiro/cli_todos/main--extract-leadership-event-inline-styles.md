# Extract LeadershipInsightModal and EventDetail Inline Styles

branch: main
worktree: main
created: 2025-01-27
status: in-progress
modified_files:
  - examples/stallion-workspace/src/LeadershipInsightModal.tsx
  - examples/stallion-workspace/src/EventDetail.tsx
  - examples/stallion-workspace/src/workspace.css

## Tasks
- [x] Read workspace.css to understand existing patterns
- [x] Read LeadershipInsightModal.tsx and identify all style={{}} blocks (85 expected)
- [x] Read EventDetail.tsx and identify all style={{}} blocks (39 expected)
- [ ] Create CSS classes with .insight-* and .event-detail-* prefixes
- [ ] Replace inline styles with className references
- [ ] Use CSS variables instead of hardcoded colors
- [ ] Keep dynamic styles as inline where needed
- [ ] Verify no TypeScript errors with npx tsc --noEmit