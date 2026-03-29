# Reverse Engineering — Knowledge System

## Current Architecture

### Data Flow (today)
```
Upload → chunkText(content) → embed(chunks) → vectorDb.addDocuments()
                                                    ↓
                                            optionally writeFileToDisk()
                                                    ↓
                                            saveMeta() → metadata.json
```

### Key Files

| File | Role |
|---|---|
| `packages/shared/src/index.ts` | KnowledgeDocumentMeta, KnowledgeNamespaceConfig, BUILTIN_KNOWLEDGE_NAMESPACES |
| `src-server/services/knowledge-service.ts` | Monolithic service: namespace mgmt, upload/chunk/embed/store, search, content retrieval, directory scan, RAG/inject context |
| `src-server/routes/knowledge.ts` | Hono routes: CRUD, search, scan, namespace management |
| `src-server/routes/schemas.ts` | Zod validation schemas |
| `packages/sdk/src/api.ts` | Client-side fetch functions (knowledgeBase helper, 10 functions) |
| `packages/sdk/src/queries.ts` | React Query hooks (9 knowledge hooks) |
| `packages/sdk/src/queryFactories.ts` | Query key factories (namespaces, list, search) |
| `packages/sdk/src/index.ts` | Public exports |

### KnowledgeDocumentMeta (current)
```ts
{ id, filename, namespace, source, chunkCount, createdAt, eventId?, eventSubject?, enhancedFrom?, enhancedTo?, status? }
```
Missing: `path`, `updatedAt`, `metadata: Record<string, any>`

### KnowledgeService Methods
- `uploadDocument(slug, filename, content, source, namespace, extraMeta)` — chunks → embeds → vector store → optionally writes file → saves metadata
- `searchDocuments(slug, query, topK, namespace?)` — embed query → vector search
- `listDocuments(slug, namespace?)` — reads metadata.json, no filtering
- `deleteDocument(slug, docId, namespace?)` — removes from vector + optionally deletes file + updates metadata
- `getDocumentContent(slug, docId, namespace?)` — reconstructs from vector chunks (lossy!)
- `getRAGContext(slug, message, topK, threshold)` — search → format for system prompt
- `getInjectContext(slug)` — concatenate all inject-namespace content
- `scanDirectories(slug, extensions?, include?, exclude?, namespace)` — walk dir → uploadDocument each file

### Helper Functions
- `chunkText(text, maxChunkSize=500)` — naive paragraph split, no heading awareness, no overlap
- `loadMeta(storageDir, dataDir, slug, ns)` — reads metadata.json with 3-tier migration (new → legacy ns → legacy flat)
- `saveMeta(storageDir, docs)` — writes metadata.json
- `writeFileToDisk(storageDir, filename, content)` — writes to `<storageDir>/files/<filename>`
- `deleteFileFromDisk(storageDir, filename)` — removes file
- `vectorNs(slug, ns)` — `project-<slug>` or `project-<slug>:<ns>`
- `defaultStorageDir(dataDir, slug, ns)` — `<dataDir>/projects/<slug>/knowledge/<ns>/`

### Routes (knowledgeHandlers)
- `GET /` — listDocuments
- `GET /status` — doc count + chunk stats
- `POST /upload` — uploadDocument
- `POST /scan` — scanDirectories
- `POST /search` — searchDocuments
- `POST /bulk-delete` — loop deleteDocument
- `GET /:docId/content` — getDocumentContent
- `DELETE /:docId` — deleteDocument
- `DELETE /` — delete all

### What's Missing
1. No `updateDocument` method — edit = delete + recreate (loses ID)
2. No frontmatter parsing — YAML frontmatter gets chunked as searchable text
3. No metadata filtering on `listDocuments`
4. No directory tree API
5. `getDocumentContent` reconstructs from chunks — lossy and fragile
6. `writeFiles` is opt-in, not default
7. `chunkText` has no heading awareness or overlap
8. No `path` field on KnowledgeDocumentMeta
