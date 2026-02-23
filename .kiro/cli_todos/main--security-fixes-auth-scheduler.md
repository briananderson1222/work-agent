# Security Fixes: Auth Terminal and Scheduler Path Validation

branch: main
worktree: main
created: 2024-02-23
status: complete
modified_files:
  - src-server/routes/auth.ts
  - src-server/services/scheduler-service.ts

## Tasks
- [x] Fix 1: Lock down /auth/terminal endpoint to only allow 'mwinit -o'
- [x] Fix 2: Add path validation to scheduler-service.ts readRunFile method