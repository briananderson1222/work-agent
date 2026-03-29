# Workflow Plan — Knowledge System Redesign (Stream 1)

## Execution Plan

Requirements are fully specified in the shared contract (`knowledge-redesign-progress.md`). No ambiguity — proceeding directly to construction.

### Stages to Execute
- [x] Workspace Detection
- [x] Reverse Engineering
- [x] Requirements Analysis (absorbed — contract file is the spec)
- [x] Workflow Planning (this document)
- [ ] Code Generation — 5 units in dependency order
- [ ] Build and Test

### Stages Skipped (with rationale)
- **User Stories** — pure internal refactoring, no user-facing feature changes
- **Application Design** — no new components/services, refactoring existing
- **Units Generation** — user already defined 5 clear build units
- **Functional Design** — contract file defines exact type shapes and API contracts
- **NFR Requirements/Design** — no new performance/security concerns
- **Infrastructure Design** — no cloud resources

## Construction Units (dependency order)

### Unit 1: Shared Types
- File: `packages/shared/src/index.ts`
- Add `path`, `updatedAt`, `metadata` to KnowledgeDocumentMeta
- Add `source: 'sync'` to union
- Add KnowledgeTreeNode interface
- Add KnowledgeSearchFilter interface

### Unit 2: KnowledgeService Refactor
- File: `src-server/services/knowledge-service.ts`
- Improve chunkText: heading-aware splits, ~50 char overlap
- Add frontmatter parsing (YAML between --- delimiters)
- Refactor uploadDocument: file-first, parse frontmatter, chunk body only
- Refactor getDocumentContent: read file from disk, fallback to chunks
- Refactor deleteDocument: always delete file + vector
- Add updateDocument: overwrite file, re-parse, re-index, preserve ID
- Add getDirectoryTree: walk namespace dir, return KnowledgeTreeNode
- Modify listDocuments: accept optional KnowledgeSearchFilter
- writeFiles defaults to true for new namespaces

### Unit 3: Routes
- File: `src-server/routes/knowledge.ts` + `src-server/routes/schemas.ts`
- Add PUT /:docId → updateDocument
- Add GET /tree → getDirectoryTree
- Modify GET / → accept filter query params (tags, metadata.*, after, before, pathPrefix, status)
- Add knowledgeUpdateSchema to schemas.ts

### Unit 4: SDK Functions + Hooks
- Files: `packages/sdk/src/api.ts`, `queries.ts`, `queryFactories.ts`, `index.ts`
- Add fetchKnowledgeTree, fetchKnowledgeFiltered, updateKnowledgeDoc
- Add useKnowledgeTreeQuery, useKnowledgeFilteredQuery, useKnowledgeUpdateMutation
- Add tree/filtered query factories
- Export everything from index.ts

### Unit 5: Tests + Build
- Update existing tests for new behavior
- Add tests for new methods/routes
- Run build, fix any issues
