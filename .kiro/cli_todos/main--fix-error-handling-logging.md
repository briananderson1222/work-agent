# Fix Error Handling Logging

branch: main
worktree: main
created: 2024-02-23
status: complete
modified_files:
  - src-server/routes/scheduler.ts
  - src-server/routes/auth.ts
  - src-server/services/acp-bridge.ts

- [x] Fix scheduler.ts:16 - SSE write error logging
- [x] Fix scheduler.ts:20 - SSE ping error logging  
- [x] Fix auth.ts:43 - enrichUser error logging
- [x] Fix acp-bridge.ts:349 - cancel error logging
- [x] Fix acp-bridge.ts:379 - usage update error logging
- [x] Fix acp-bridge.ts:396 - operation error logging
- [x] Fix acp-bridge.ts:678 - cleanup error logging