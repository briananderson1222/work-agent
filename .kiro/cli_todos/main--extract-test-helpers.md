# Extract Shared Test Helpers

branch: main
worktree: main
created: 2026-02-23
status: complete
modified_files:
  - src-server/runtime/streaming/__tests__/helpers.ts
  - src-server/runtime/streaming/__tests__/ReasoningHandler.test.ts
  - src-server/runtime/streaming/__tests__/TextDeltaHandler.test.ts
  - src-server/runtime/streaming/__tests__/ToolCallHandler.test.ts
  - src-server/runtime/streaming/__tests__/pipeline.integration.test.ts

- [x] Create helpers.ts with toStream() and collect() functions
- [x] Update ReasoningHandler.test.ts to import from helpers
- [x] Update TextDeltaHandler.test.ts to import from helpers  
- [x] Update ToolCallHandler.test.ts to import from helpers
- [x] Update pipeline.integration.test.ts to import from helpers
- [x] Run tests to verify all 53 tests still pass