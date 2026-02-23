# Extract Remaining CRM Inline Styles to CSS Classes

branch: main
worktree: main
created: 2025-01-27
status: in-progress
modified_files:
  - examples/stallion-workspace/src/CRM.tsx
  - examples/stallion-workspace/src/AccountDetail.tsx
  - examples/stallion-workspace/src/AccountList.tsx
  - examples/stallion-workspace/src/workspace.css

## Tasks
- [x] Read workspace.css to understand existing crm-* class patterns
- [x] Read CRM.tsx and identify remaining 87 inline styles
- [x] Read AccountDetail.tsx and identify 29 inline styles
- [x] Read AccountList.tsx and identify 13 inline styles
- [ ] Create CSS classes with descriptive names (.crm-*, .account-detail-*, .account-list-*)
- [ ] Replace style={{}} with className="..." in all files
- [ ] Use CSS variables instead of hardcoded colors
- [ ] Keep dynamic styles as inline but use CSS variables where possible
- [ ] Verify with npx tsc --noEmit