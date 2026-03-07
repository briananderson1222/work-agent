# Project Architecture — Comprehensive Design Plan

> Stallion evolves from a workspace-centric UI to a project-centric platform.
> Projects are the isolation boundary. Layouts are the UI arrangement. Plugins provide capabilities.

---

## Table of Contents

1. [Conceptual Model](#1-conceptual-model)
2. [Data Model](#2-data-model)
3. [UI Architecture](#3-ui-architecture)
4. [Backend Architecture](#4-backend-architecture)
5. [Provider Interfaces (Core)](#5-provider-interfaces-core)
6. [Plugin Architecture](#6-plugin-architecture)
7. [Migration Path](#7-migration-path)
8. [Implementation Phases](#8-implementation-phases)

---

## 1. Conceptual Model

### What Changes

| Before | After |
|---|---|
| **Workspace** = UI layout (tabs + components + prompts). The top-level selector. | **Project** = the top-level context boundary. Contains working directories, knowledge, provider config, conversations, and layouts. |
| Workspace selector dropdown in header — pick ONE at a time | Project sidebar — ALL projects visible simultaneously (t3code pattern). No context switching. |
| Agents are global | Agents can be global OR scoped to a project |
| No vector DB | Per-project vector DB namespace with document isolation |
| Single provider (Bedrock) | Multi-provider with per-project override. Local-first defaults (Ollama + LanceDB) |
| No coding features | Coding layout provided by a built-in plugin |

### Key Principles

1. **Core stays thin.** Core defines interfaces (`ILLMProvider`, `IVectorDbProvider`, `IEmbeddingProvider`). Implementations live in plugins — even the defaults (Ollama, LanceDB, Bedrock).
2. **Projects don't force context switches.** All projects are visible in the sidebar. Conversations, threads, and layouts are scoped to projects but accessible without navigating away. Inspired by t3code's multi-project sidebar.
3. **A project is one or more working directories.** Not just a single folder. A monorepo project might have `frontend/`, `backend/`, `infra/` as separate working directories. A customer project might have no directories at all — just documents and conversations.
4. **Layouts replace workspaces.** The current `WorkspaceConfig` (tabs + components + prompts) becomes `LayoutConfig`. Layouts live within projects. A project can have multiple layouts (e.g., "Chat", "Coding", "Dashboard").
5. **Plugins provide layout types.** Core ships with a `chat` layout type. A coding plugin provides a `coding` layout type (with diff viewer, terminal, file tree). Plugins register layout types in the registry.

### Hierarchy

```
System
├── Global Settings (default provider, default model, system prompt)
├── Global Agents (available to all projects)
├── Plugin Registry (installed plugins providing providers, layout types, tools)
│
├── Project: "Stallion Dev"
│   ├── Working Directories: ["/Users/me/dev/stallion-new"]
│   ├── Provider Override: { llm: "bedrock", model: "claude-sonnet-4" }
│   ├── Knowledge: (vector namespace "stallion-dev", uploaded docs, embedded code)
│   ├── Agents: [global agents + project-scoped agents]
│   ├── Conversations: [thread-1, thread-2, ...]
│   └── Layouts:
│       ├── "Chat" (type: chat — tabs with chat components)
│       └── "Code" (type: coding — diff viewer, terminal, file tree)
│
├── Project: "Customer: Acme Corp"
│   ├── Working Directories: [] (no code — just docs)
│   ├── Provider Override: null (uses system default)
│   ├── Knowledge: (vector namespace "acme-corp", uploaded meeting notes, architecture docs)
│   ├── Conversations: [thread-1, ...]
│   └── Layouts:
│       └── "Research" (type: chat — single tab with RAG-enabled chat)
│
└── Project: "Local Experiments"
    ├── Working Directories: ["/Users/me/experiments/llm-tests"]
    ├── Provider Override: { llm: "ollama", model: "llama3.2", embedding: "ollama/nomic-embed-text" }
    ├── Knowledge: (vector namespace "local-experiments", LanceDB)
    ├── Conversations: [...]
    └── Layouts:
        └── "Chat" (type: chat)
```

---

## 2. Data Model

### ProjectConfig (new — replaces WorkspaceConfig as top-level entity)

```typescript
interface ProjectConfig {
  id: string;                          // UUID
  name: string;
  slug: string;                        // URL-safe, used as vector namespace
  icon?: string;                       // Emoji or image URL
  description?: string;
  
  // Working directories (zero or more)
  directories: ProjectDirectory[];
  
  // Provider overrides (null = use system default)
  llmProvider?: string;                // e.g., "ollama", "bedrock", "openai-compat"
  llmModel?: string;                   // e.g., "llama3.2", "claude-sonnet-4"
  embeddingProvider?: string;          // e.g., "ollama", "bedrock"
  embeddingModel?: string;             // e.g., "nomic-embed-text"
  vectorDbProvider?: string;           // e.g., "lancedb", "chroma" (null = system default)
  
  // RAG settings
  similarityThreshold?: number;        // 0.0 - 1.0, default 0.25
  topK?: number;                       // Number of context chunks, default 4
  
  // Scoped agents (in addition to global agents)
  agents?: string[];                   // Agent slugs available in this project
  
  // UI layouts
  layouts: LayoutConfig[];
  
  // Metadata
  createdAt: string;
  updatedAt: string;
}

interface ProjectDirectory {
  path: string;                        // Absolute filesystem path
  label?: string;                      // Display name (defaults to basename)
  role?: 'primary' | 'reference';      // Primary = active coding target, reference = read-only context
}

interface ProjectMetadata {
  id: string;
  slug: string;
  name: string;
  icon?: string;
  description?: string;
  directoryCount: number;
  layoutCount: number;
  conversationCount: number;
  hasKnowledge: boolean;               // Whether vector namespace has any documents
  llmProvider?: string;                // For display in sidebar
}
```

### LayoutConfig (renamed from WorkspaceConfig)

```typescript
interface LayoutConfig {
  id: string;
  name: string;
  slug: string;
  type: string;                        // "chat" (core), "coding" (plugin), etc.
  icon?: string;
  description?: string;
  
  // Type-specific config — interpreted by the layout type plugin
  config: Record<string, unknown>;
}

// For the built-in "chat" layout type, config would be:
interface ChatLayoutConfig {
  tabs: LayoutTab[];
  globalPrompts?: LayoutPrompt[];
  defaultAgent?: string;
}

interface LayoutTab {
  id: string;
  label: string;
  component: string;                   // "chat", "canvas", "custom"
  icon?: string;
  description?: string;
  actions?: LayoutPrompt[];
  prompts?: LayoutPrompt[];
}

interface LayoutPrompt {
  id: string;
  label: string;
  prompt: string;
  agent?: string;
}
```

### Conversations (scoped to project)

```typescript
interface Conversation {
  id: string;
  projectId: string;                   // FK to project
  title: string;
  agentSlug: string;
  layoutId?: string;                   // Which layout spawned this conversation
  createdAt: string;
  updatedAt: string;
}
```

### Knowledge / Documents (scoped to project)

```typescript
interface ProjectDocument {
  id: string;
  projectId: string;
  filename: string;
  mimeType: string;
  size: number;
  source: 'upload' | 'directory-scan' | 'url' | 'connector';
  sourceUri?: string;                  // Original URL, file path, etc.
  chunkCount: number;                  // Number of vector chunks
  embeddedAt?: string;                 // When last embedded
  status: 'pending' | 'processing' | 'embedded' | 'error';
  error?: string;
}
```

---

## 3. UI Architecture

### Navigation Model

The header workspace selector dropdown is replaced by a persistent sidebar that shows all projects. This is the primary navigation surface.

```
┌─────────────────────────────────────────────────────────────┐
│ [Logo] Stallion AI                    [Settings] [Profile]  │
├──────────────┬──────────────────────────────────────────────┤
│              │                                              │
│  PROJECTS    │   [Active Layout Content]                    │
│  ──────────  │                                              │
│              │   Rendered by the layout type plugin.         │
│  ▼ Stallion  │   For "chat" type: tabs + chat panels.       │
│    💬 Chat   │   For "coding" type: diff + terminal + chat. │
│    🔧 Code   │                                              │
│    Thread 1  │                                              │
│    Thread 2  │                                              │
│              │                                              │
│  ▼ Acme Corp │                                              │
│    💬 Research│                                              │
│    Thread 1  │                                              │
│              │                                              │
│  ▶ Local Exp │                                              │
│              │                                              │
│  [+ Project] │                                              │
│              │                                              │
│  ──────────  │                                              │
│  GLOBAL      │                                              │
│  ⚙ Agents    │                                              │
│  🔌 Plugins  │                                              │
│  📊 Monitor  │                                              │
│  ⏰ Schedule │                                              │
│              │                                              │
├──────────────┤                                              │
│  ChatDock    │                                              │
│  (minimized  │                                              │
│   sessions)  │                                              │
└──────────────┴──────────────────────────────────────────────┘
```

### Sidebar Behavior

- **All projects visible** — collapsible sections, no dropdown. Expand to see layouts and recent threads.
- **No context switch** — clicking a layout or thread under any project loads it in the main content area. The sidebar stays open showing all projects.
- **Project sections show:**
  - Project icon + name (collapsible header)
  - Layouts (clickable — loads the layout)
  - Recent threads (last 3-5, with "Show all" expand)
  - Status indicators: knowledge badge (📚 if has documents), provider badge (🏠 if local/Ollama)
- **Global section** at bottom: Agents, Plugins, Monitoring, Schedule, Settings — same as today's nav items.
- **ChatDock** remains at bottom for minimized chat sessions (cross-project).
- **"+ Project" button** at bottom of project list — opens new project form.

### Layout Rendering

The main content area renders whatever layout is selected. Layout types are registered by plugins:

```typescript
// Core registers the "chat" layout type
registry.registerLayoutType('chat', {
  name: 'Chat',
  icon: '💬',
  component: ChatLayout,              // React component
  configSchema: chatLayoutConfigSchema, // Zod schema for config validation
  defaultConfig: { tabs: [{ id: 'main', label: 'Main', component: 'chat' }] },
});

// Coding plugin registers the "coding" layout type
registry.registerLayoutType('coding', {
  name: 'Coding',
  icon: '🔧',
  component: CodingLayout,
  configSchema: codingLayoutConfigSchema,
  defaultConfig: { terminal: true, diffViewer: true, fileTree: true },
});
```

The `ChatLayout` component is essentially today's `WorkspaceView` — it renders tabs with chat components. The `CodingLayout` component (from the coding plugin) renders the diff viewer, terminal, file tree, and chat panel.

---

## 4. Backend Architecture

### New Services

| Service | Responsibility |
|---|---|
| `ProjectService` | CRUD for projects. Manages project configs in `.stallion-ai/projects/`. |
| `KnowledgeService` | Document upload, embedding pipeline, vector DB operations. Delegates to `IVectorDbProvider` and `IEmbeddingProvider`. |
| `ProviderService` | Resolves which LLM/embedding/vector provider to use for a given project (project override → system default). |

### Modified Services

| Service | Change |
|---|---|
| `WorkspaceService` | Renamed to `LayoutService`. Operates within project scope. |
| `ConversationManager` | Conversations gain a `projectId` field. Queries scoped to project. |
| `AgentService` | Agents can be global or project-scoped. |
| `ConfigLoader` | Loads project configs from `.stallion-ai/projects/<slug>/project.yaml`. |

### File Storage Layout

```
.stallion-ai/
├── config/
│   ├── app.json                       # System-level settings (default provider, etc.)
│   └── acp.json                       # ACP connections
├── projects/
│   ├── stallion-dev/
│   │   ├── project.yaml               # ProjectConfig
│   │   ├── layouts/
│   │   │   ├── chat.yaml              # LayoutConfig (type: chat)
│   │   │   └── code.yaml              # LayoutConfig (type: coding)
│   │   ├── documents/                 # Uploaded files (pre-embedding)
│   │   └── conversations/             # Conversation history
│   └── acme-corp/
│       ├── project.yaml
│       ├── layouts/
│       │   └── research.yaml
│       ├── documents/
│       └── conversations/
├── agents/                            # Global agents (unchanged)
├── plugins/                           # Installed plugins (unchanged)
├── vectordb/                          # LanceDB data (namespaced by project slug)
│   ├── stallion-dev/                  # Vector tables for this project
│   └── acme-corp/
└── monitoring/                        # Unchanged
```

### API Routes

New routes (mounted under `/api/projects`):

```
GET    /api/projects                          # List all projects
POST   /api/projects                          # Create project
GET    /api/projects/:slug                    # Get project config
PUT    /api/projects/:slug                    # Update project
DELETE /api/projects/:slug                    # Delete project (+ vector namespace + docs)

# Layouts (within project)
GET    /api/projects/:slug/layouts            # List layouts
POST   /api/projects/:slug/layouts            # Create layout
GET    /api/projects/:slug/layouts/:id        # Get layout
PUT    /api/projects/:slug/layouts/:id        # Update layout
DELETE /api/projects/:slug/layouts/:id        # Delete layout

# Knowledge (within project)
GET    /api/projects/:slug/knowledge          # List documents
POST   /api/projects/:slug/knowledge/upload   # Upload document(s)
POST   /api/projects/:slug/knowledge/embed    # Trigger embedding for pending docs
DELETE /api/projects/:slug/knowledge/:docId   # Remove document + vectors
POST   /api/projects/:slug/knowledge/search   # Semantic search within project namespace
POST   /api/projects/:slug/knowledge/scan     # Scan working directories for indexable files

# Cross-project
POST   /api/knowledge/search                  # Search across ALL project namespaces
```

Existing routes remain for backwards compatibility during migration:
- `/workspaces` → proxies to default project's layouts
- `/api/agents/:slug/chat` → gains optional `projectId` query param for RAG context injection

---

## 5. Provider Interfaces (Core)

These interfaces live in `src-server/providers/types.ts` (or `packages/shared`). Core defines them. Plugins implement them.

### ILLMProvider

```typescript
interface ILLMProvider {
  readonly id: string;                 // e.g., "ollama", "bedrock", "openai-compat"
  readonly displayName: string;
  
  listModels(): Promise<LLMModel[]>;
  createStream(opts: LLMStreamOpts): AsyncIterable<LLMStreamChunk>;
  
  // Optional capabilities
  supportsStreaming?(): boolean;
  supportsToolCalling?(): boolean;
  healthCheck?(): Promise<boolean>;
}

interface LLMModel {
  id: string;
  name: string;
  contextWindow?: number;
  supportsTools?: boolean;
  supportsVision?: boolean;
}

interface LLMStreamOpts {
  model: string;
  messages: LLMMessage[];
  tools?: ToolDef[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}
```

### IEmbeddingProvider

```typescript
interface IEmbeddingProvider {
  readonly id: string;
  readonly displayName: string;
  
  embed(texts: string[]): Promise<number[][]>;
  dimensions(): number;
  
  healthCheck?(): Promise<boolean>;
}
```

### IVectorDbProvider

```typescript
interface IVectorDbProvider {
  readonly id: string;
  readonly displayName: string;
  
  // Namespace = project slug
  createNamespace(namespace: string): Promise<void>;
  deleteNamespace(namespace: string): Promise<void>;
  namespaceExists(namespace: string): Promise<boolean>;
  
  addDocuments(namespace: string, docs: VectorDocument[]): Promise<void>;
  deleteDocuments(namespace: string, docIds: string[]): Promise<void>;
  search(namespace: string, query: number[], topK: number, threshold?: number): Promise<VectorSearchResult[]>;
  
  count(namespace: string): Promise<number>;
}

interface VectorDocument {
  id: string;
  vector: number[];
  text: string;
  metadata: Record<string, unknown>;
}

interface VectorSearchResult {
  id: string;
  text: string;
  score: number;
  metadata: Record<string, unknown>;
}
```

### ILayoutTypeProvider (new — for plugin-provided layout types)

```typescript
interface ILayoutTypeProvider {
  readonly id: string;                 // e.g., "chat", "coding"
  readonly displayName: string;
  readonly icon: string;
  
  // React component to render this layout type
  getComponent(): React.ComponentType<LayoutRenderProps>;
  
  // Config schema for validation
  getConfigSchema(): ZodSchema;
  
  // Default config for new layouts of this type
  getDefaultConfig(): Record<string, unknown>;
}

interface LayoutRenderProps {
  project: ProjectConfig;
  layout: LayoutConfig;
  onConfigChange: (config: Record<string, unknown>) => void;
}
```

---

## 6. Plugin Architecture

### What's Core vs Plugin

| Component | Where | Rationale |
|---|---|---|
| Project CRUD, sidebar, navigation | **Core** | Fundamental to the platform |
| `ILLMProvider` / `IEmbeddingProvider` / `IVectorDbProvider` interfaces | **Core** | Contracts that plugins implement |
| `ProviderService` (resolution logic) | **Core** | Decides which provider to use |
| `KnowledgeService` (embedding pipeline) | **Core** | Orchestrates upload → chunk → embed → store |
| `chat` layout type | **Core** | The default layout — today's workspace tabs |
| Text chunking / splitting | **Core** | Shared utility for all vector DB plugins |
| Bedrock LLM provider | **Built-in plugin** | Ships with core, can be disabled |
| Ollama LLM + embedding provider | **Built-in plugin** | Ships with core, local-first default |
| OpenAI-compatible LLM provider | **Built-in plugin** | Ships with core, covers dozens of providers |
| LanceDB vector DB provider | **Built-in plugin** | Ships with core, embedded default |
| `coding` layout type | **Built-in plugin** | Ships in registry, installed on demand |
| Chroma / Qdrant / PGVector / etc. | **Community plugin** | Installable from registry |
| Anthropic direct API | **Community plugin** | Installable from registry |
| Data connectors (GitHub, Confluence, etc.) | **Community plugin** | Installable from registry |

### Built-in Plugin Registry

The built-in plugin registry (your existing JSON manifest registry) ships with entries for:

```json
[
  {
    "name": "@stallion-ai/provider-ollama",
    "description": "Ollama LLM and embedding provider. Local-first AI.",
    "provides": ["llmProvider", "embeddingProvider"],
    "builtin": true
  },
  {
    "name": "@stallion-ai/provider-bedrock",
    "description": "Amazon Bedrock LLM provider.",
    "provides": ["llmProvider"],
    "builtin": true
  },
  {
    "name": "@stallion-ai/provider-openai-compat",
    "description": "OpenAI-compatible API provider. Works with LMStudio, Groq, Mistral, OpenRouter, etc.",
    "provides": ["llmProvider", "embeddingProvider"],
    "builtin": true
  },
  {
    "name": "@stallion-ai/vectordb-lancedb",
    "description": "LanceDB embedded vector database. Zero config, local storage.",
    "provides": ["vectorDbProvider"],
    "builtin": true
  },
  {
    "name": "@stallion-ai/layout-coding",
    "description": "Coding layout with diff viewer, terminal, and file tree.",
    "provides": ["layoutType"],
    "builtin": false
  }
]
```

### Coding Plugin Specifics

The `@stallion-ai/layout-coding` plugin provides:

1. **`coding` layout type** — registers via `ILayoutTypeProvider`
2. **Terminal service** — real PTY via `node-pty`, exposed as a route (`/api/projects/:slug/terminal`)
3. **Diff service** — git-based diffs per conversation turn
4. **File tree service** — directory listing with fuzzy search, respects `.gitignore`

The coding layout renders:
- Chat panel (reuses core chat components, connected to project's agent)
- Diff viewer (per-turn diffs using `@pierre/diffs` or similar)
- Terminal panel (bottom drawer, multi-terminal, xterm.js)
- File tree panel (collapsible sidebar, fuzzy search)

The coding plugin can integrate with agents via:
- **ACP** — for external CLI agents (kiro-cli, etc.)
- **Direct child process** — spawn a coding agent (like Codex) as a subprocess with the project's working directory as cwd
- **MCP tools** — expose file operations, terminal, git as MCP tools that any agent can call

---

## 7. Migration Path

### Phase 0: Non-Breaking Preparation

1. Add `ProjectConfig` type and `ProjectService` alongside existing workspace code
2. Create a "Default" project that wraps all existing workspaces as layouts
3. Add `/api/projects` routes that coexist with `/workspaces` routes
4. No UI changes yet — existing workspace selector still works

### Phase 1: Sidebar Transition

1. Replace workspace selector dropdown with project sidebar
2. Existing workspaces appear as layouts under the "Default" project
3. Users can create new projects (the Default project remains for backwards compat)
4. `/workspaces` routes become aliases for `/api/projects/default/layouts`

### Phase 2: Provider + Knowledge

1. Install built-in provider plugins (Ollama, LanceDB, OpenAI-compat)
2. Add provider override fields to project settings UI
3. Add knowledge panel to project settings (document upload, embedding status)
4. RAG context injection into chat (when project has knowledge)

### Phase 3: Coding Plugin

1. Ship `@stallion-ai/layout-coding` in the built-in registry
2. Users install it and add a "Coding" layout to their project
3. Terminal, diff viewer, file tree become available

### Data Migration

Existing `.stallion-ai/workspaces/` configs are migrated to `.stallion-ai/projects/default/layouts/` on first startup after upgrade. The migration:

1. Creates a "Default" project with no working directories
2. Moves each workspace config into the project as a layout (type: "chat")
3. Maps `WorkspaceConfig` fields to `LayoutConfig`:
   - `name`, `slug`, `icon`, `description` → preserved
   - `tabs`, `globalPrompts` → moved into `config` (ChatLayoutConfig)
   - `plugin`, `requiredProviders`, `availableAgents`, `defaultAgent` → moved to project level
4. Existing conversations are associated with the Default project
5. Old `/workspaces` routes continue to work (proxied to Default project)

---

## 8. Implementation Phases

### Phase 1: Foundation (est. 1-2 weeks)

**Goal:** Project data model + sidebar + provider interfaces. No knowledge/vector yet.

- [ ] Define `ProjectConfig`, `LayoutConfig`, `ProjectMetadata` types in `packages/shared`
- [ ] Implement `ProjectService` (CRUD, file-based storage in `.stallion-ai/projects/`)
- [ ] Create `/api/projects` routes
- [ ] Implement migration logic (workspaces → Default project layouts)
- [ ] Build project sidebar component (replaces workspace selector)
- [ ] Update `NavigationContext` for project-based navigation
- [ ] Define `ILLMProvider`, `IEmbeddingProvider`, `IVectorDbProvider` interfaces in `providers/types.ts`
- [ ] Add `ILayoutTypeProvider` interface
- [ ] Register `chat` as the built-in layout type (wraps existing WorkspaceView logic)
- [ ] Update `Header` to remove workspace selector, show project context breadcrumb

### Phase 2: Multi-Provider (est. 1-2 weeks)

**Goal:** Ollama + OpenAI-compatible providers. Per-project provider override.

- [ ] Implement `@stallion-ai/provider-ollama` (LLM + embeddings)
- [ ] Implement `@stallion-ai/provider-openai-compat` (LLM + embeddings)
- [ ] Refactor existing Bedrock integration into `@stallion-ai/provider-bedrock`
- [ ] Implement `ProviderService` (resolves project override → system default)
- [ ] Add provider selection UI to project settings
- [ ] Add model selection UI (per-project, with system default fallback)
- [ ] Update `StallionRuntime` to use `ProviderService` for agent creation
- [ ] Add provider health checks to system status

### Phase 3: Knowledge / Vector DB (est. 2-3 weeks)

**Goal:** Document upload, embedding, per-project RAG.

- [ ] Implement `@stallion-ai/vectordb-lancedb` (embedded, zero-config)
- [ ] Implement `KnowledgeService` (upload → chunk → embed → store pipeline)
- [ ] Text chunking utility (RecursiveCharacterTextSplitter equivalent)
- [ ] Create `/api/projects/:slug/knowledge` routes
- [ ] Build document upload UI in project settings
- [ ] Build embedding status/progress UI
- [ ] Implement RAG context injection into chat pipeline (StreamOrchestrator)
- [ ] Implement cross-project search (`/api/knowledge/search`)
- [ ] Add directory scanning (index files from working directories)
- [ ] Supported file types (Phase 3a): TXT, MD, PDF, DOCX, CSV, JSON, HTML, code files
- [ ] Supported file types (Phase 3b): PPTX, XLSX, images (OCR), audio (transcription)

### Phase 4: Coding Plugin (est. 3-4 weeks)

**Goal:** `@stallion-ai/layout-coding` with terminal, diff viewer, file tree.

- [ ] Implement `coding` layout type provider
- [ ] Terminal service: `node-pty` backend + xterm.js frontend
- [ ] Terminal routes: `/api/projects/:slug/terminal` (WebSocket)
- [ ] File tree service: directory listing, fuzzy search, `.gitignore` respect
- [ ] File tree routes: `/api/projects/:slug/files`
- [ ] Diff viewer component (using `@pierre/diffs` or equivalent)
- [ ] Git integration: branch list, status, checkpoint diffs
- [ ] Coding layout component: chat + diff + terminal + file tree panels
- [ ] Agent integration: direct child process spawn for coding agents
- [ ] Approval flow for file writes and command execution

### Phase 5: Polish & Ecosystem (est. 2 weeks)

**Goal:** Refinement, additional providers, data connectors.

- [ ] Chroma vector DB plugin
- [ ] Qdrant vector DB plugin
- [ ] Anthropic direct API plugin
- [ ] Data connector framework (GitHub repos, URLs, etc.)
- [ ] Cross-project query UI (search across all project knowledge bases)
- [ ] Project templates (pre-configured layouts + settings for common use cases)
- [ ] Import/export projects
- [ ] Project-level agent scoping UI

---

## 9. Open Design Questions (Iteration 2)

### 9.1 Working Directories — Scope & Management

**Question:** Are working directories managed at the project level? Conversation level? Can they be hierarchical?

**Proposed model: Project owns directories. Conversations can narrow focus.**

```
Project: "Stallion Platform"
├── Directories:
│   ├── /Users/me/dev/stallion-new        (label: "core", role: primary)
│   ├── /Users/me/dev/stallion-plugins    (label: "plugins", role: primary)
│   └── /Users/me/dev/stallion-docs       (label: "docs", role: reference)
│
├── Conversation: "Refactor streaming pipeline"
│   └── focus: "core"                     ← narrows to one directory
│       └── branch: "feat/stream-refactor" ← optional git context
│
├── Conversation: "Fix plugin build"
│   └── focus: "plugins"
│       └── branch: "fix/build-issue"
│
└── Conversation: "General architecture chat"
    └── focus: null                       ← has access to ALL project directories
```

**Rules:**
- **Project level:** Directories are added/removed in project settings. Each has a `label` and `role` (primary vs reference). Primary directories are where agents can write. Reference directories are read-only context.
- **Conversation level:** When starting a conversation (or mid-conversation), you can "focus" on a specific directory. This sets the `cwd` for any coding agent, terminal, or file operations. If no focus is set, the conversation has access to all project directories.
- **Git context:** A focused conversation can optionally track a branch. The coding plugin could create git worktrees for parallel conversations on different branches (t3code pattern). This is a plugin concern, not core.
- **No hierarchy within directories.** A directory is a flat entry — it's a filesystem path. The filesystem itself provides the hierarchy. We don't model subdirectories.

**Why not conversation-scoped directories?**
Conversations are ephemeral. Directories are infrastructure. You don't want to re-add `/Users/me/dev/stallion-new` every time you start a new chat. The project is the stable home for directories. Conversations just pick which one to focus on.

**Management UI:**
- Project settings → "Directories" section → add/remove paths, set labels and roles
- New conversation modal → optional "Focus" dropdown showing project directories
- Conversation header → shows current focus (clickable to change)

---

### 9.2 LLM Providers — Global Definition, Local Application

**Question:** How do we handle switching providers? Is it global? Per-project? Per-conversation?

**Proposed model: Three-tier resolution with global provider registry.**

```
┌─────────────────────────────────────────────────────┐
│ SYSTEM LEVEL (global)                               │
│                                                     │
│ Configured Providers:                               │
│   ├── ollama    (url: http://localhost:11434)        │
│   ├── bedrock   (region: us-east-1)                 │
│   └── openai-compat (url: https://api.groq.com)    │
│                                                     │
│ System Default: ollama / llama3.2                   │
└──────────────────────┬──────────────────────────────┘
                       │ fallback
┌──────────────────────▼──────────────────────────────┐
│ PROJECT LEVEL                                       │
│                                                     │
│ Project "Stallion Dev":                             │
│   Default: bedrock / claude-sonnet-4                │
│                                                     │
│ Project "Local Experiments":                        │
│   Default: null (inherits system → ollama/llama3.2) │
└──────────────────────┬──────────────────────────────┘
                       │ fallback
┌──────────────────────▼──────────────────────────────┐
│ CONVERSATION LEVEL                                  │
│                                                     │
│ Thread "Refactor streaming":                        │
│   Override: bedrock / claude-haiku (cheaper/faster)  │
│   (persisted — stays for this conversation)         │
│                                                     │
│ Thread "Architecture review":                       │
│   Override: null (inherits project → bedrock/sonnet) │
└─────────────────────────────────────────────────────┘
```

**Key decisions:**

1. **Providers are configured globally.** Like agents today — you set up Ollama, Bedrock, OpenAI-compat connections in system settings. Each provider has its own config (URL, credentials, etc.). This is the "provider registry."

2. **Projects pick a default from the global registry.** A project says "use bedrock/claude-sonnet-4" — it doesn't configure Bedrock itself, it references the global provider. If the project doesn't specify, it inherits the system default.

3. **Conversations can override.** Just like today's model switcher in chat. The override persists for that conversation (stored in conversation metadata). The UI shows the current provider+model in the conversation header with a dropdown to change it.

4. **Switching providers mid-conversation is allowed but noted.** If you switch from Ollama to Bedrock mid-conversation, the conversation metadata records the switch. Previous messages keep their original provider attribution. New messages use the new provider. No re-processing of history.

5. **Model switching within a provider is lightweight.** Switching from `llama3.2` to `llama3.1` within Ollama is just a config change. Switching from Ollama to Bedrock is heavier (different API, different capabilities) but still just a config change from the conversation's perspective.

**Provider configuration UI:**
- System Settings → "Providers" tab → add/configure/test provider connections
- Project Settings → "Model" section → dropdown of configured providers + models, or "Use system default"
- Conversation header → provider+model indicator (clickable → dropdown to switch)

**Resolution function:**
```typescript
function resolveProvider(conversationId: string, projectSlug: string): { provider: string, model: string } {
  const conversation = getConversation(conversationId);
  if (conversation.llmProvider && conversation.llmModel) {
    return { provider: conversation.llmProvider, model: conversation.llmModel };
  }
  
  const project = getProject(projectSlug);
  if (project.llmProvider && project.llmModel) {
    return { provider: project.llmProvider, model: project.llmModel };
  }
  
  const system = getSystemConfig();
  return { provider: system.defaultLLMProvider, model: system.defaultLLMModel };
}
```

---

### 9.3 Chat Dock — Stays Global, Carries Context

**Question:** How does the ChatDock work with projects?

**Proposed: ChatDock remains global. Chats carry their project context.**

The ChatDock is one of stallion's best UX features — minimized chat sessions always accessible at the bottom of the screen regardless of what you're looking at. This should NOT become project-scoped.

```
┌─────────────────────────────────────────────────────────────┐
│ [Sidebar: Projects]  │  [Main Content: Active Layout]       │
│                      │                                      │
│  ▼ Stallion Dev      │  (whatever layout is selected)       │
│    💬 Chat           │                                      │
│    🔧 Code           │                                      │
│                      │                                      │
│  ▼ Acme Corp         │                                      │
│    💬 Research        │                                      │
│                      │                                      │
├──────────────────────┴──────────────────────────────────────┤
│ ChatDock: [🟢 Stallion: stream refactor] [🔵 Acme: Q3 plan]│
│           ↑ from Stallion Dev project    ↑ from Acme project│
└─────────────────────────────────────────────────────────────┘
```

**Rules:**
- ChatDock shows minimized sessions from ANY project
- Each dock item shows a project badge/color so you know which project it belongs to
- Opening a docked chat restores its full project context (provider, knowledge, directory focus)
- You can have chats from different projects open simultaneously
- "Quick chat" (no project) is also possible — a chat with system defaults, no project context, no RAG. Just a fast question.

**Quick Chat:**
This is important — sometimes you just want to ask a question without creating a project or navigating to one. The ChatDock should have a "+" button that opens a quick chat with system defaults. No project, no knowledge, no directory. Just chat. If the conversation becomes important, you can "move" it to a project later.

---

### 9.4 Layouts — Types are Global, Instances are Project-Scoped, Templates Bridge the Gap

**Question:** Are layouts scoped to projects or global? How do we keep the "always accessible" feel?

**Proposed: Three concepts working together.**

| Concept | Scope | What it is |
|---|---|---|
| **Layout Type** | Global (plugin-provided) | A registered type like "chat" or "coding". Defines what components are available. Installed via plugins. |
| **Layout Instance** | Project-scoped | A specific configuration of a layout type within a project. "My Chat Layout" with these tabs and prompts. |
| **Layout Template** | Global (user-created) | A reusable starting point. "My SA Workspace" template that can be applied to any project. Creates a layout instance from the template. |

**How this works in practice:**

1. You install the `coding` plugin → the "Coding" layout type becomes available globally.
2. You create a project "Stallion Dev" → you add a layout instance of type "coding" with your preferred panel arrangement.
3. You create another project "Other Repo" → you add another "coding" layout instance. It can have different settings.
4. You create a template "My Coding Setup" from your Stallion Dev coding layout → now you can apply it to any new project with one click.

**The "always accessible" feel:**

Today, workspaces feel always accessible because they're in the header dropdown. With projects in the sidebar, layouts are one click deeper (expand project → click layout). To keep the quick-access feel:

- **Recent layouts** in the sidebar header (last 3 used, across projects)
- **Keyboard shortcut** to switch layouts (Cmd+1/2/3 for layouts within current project)
- **ChatDock** for ongoing conversations (always visible, any project)
- **Quick Chat** button in the dock (no project needed)

**What about today's workspace prompts and tabs?**

Today's `WorkspaceConfig` with tabs and globalPrompts becomes a layout instance of type "chat":

```yaml
# Before (workspace)
name: "SA Workspace"
slug: "sa-workspace"
tabs:
  - id: main
    label: Chat
    component: chat
  - id: research
    label: Research
    component: chat
globalPrompts:
  - id: p1
    label: "Summarize meeting"
    prompt: "Summarize the following meeting notes..."

# After (layout instance within a project)
type: chat
name: "SA Workspace"
config:
  tabs:
    - id: main
      label: Chat
      component: chat
    - id: research
      label: Research
      component: chat
  globalPrompts:
    - id: p1
      label: "Summarize meeting"
      prompt: "Summarize the following meeting notes..."
```

Functionally identical. The layout instance just lives within a project now instead of being a top-level entity.

---

### 9.5 Storage Abstraction — Planning for Structured Data

**Question:** Do we need to reimagine the file storage layout? How do we support DB-backed storage?

**Proposed: Storage adapter interface now, SQLite migration later.**

**Current state:** Everything is YAML/JSON files on disk. This works for:
- Agent configs (YAML) ✅
- App config (JSON) ✅
- Workspace configs (YAML) ✅
- Conversations (JSON files) ✅ (but gets slow at scale)

**What breaks with projects + knowledge:**
- Document metadata (status, chunk count, embedding timestamps) — relational, needs queries
- Conversation search across projects — needs indexing
- Vector document tracking (which chunks belong to which document) — relational
- Provider connection configs — simple but growing
- Usage analytics — append-heavy, needs aggregation

**Proposed approach: `IStorageAdapter` interface**

```typescript
interface IStorageAdapter {
  // Project CRUD
  listProjects(): Promise<ProjectMetadata[]>;
  getProject(slug: string): Promise<ProjectConfig>;
  saveProject(config: ProjectConfig): Promise<void>;
  deleteProject(slug: string): Promise<void>;
  
  // Layout CRUD (within project)
  listLayouts(projectSlug: string): Promise<LayoutConfig[]>;
  getLayout(projectSlug: string, layoutId: string): Promise<LayoutConfig>;
  saveLayout(projectSlug: string, config: LayoutConfig): Promise<void>;
  deleteLayout(projectSlug: string, layoutId: string): Promise<void>;
  
  // Conversations (within project)
  listConversations(projectSlug: string, opts?: { limit?: number, offset?: number }): Promise<ConversationMetadata[]>;
  getConversation(id: string): Promise<Conversation>;
  saveConversation(conv: Conversation): Promise<void>;
  deleteConversation(id: string): Promise<void>;
  searchConversations(query: string, projectSlug?: string): Promise<ConversationMetadata[]>;
  
  // Documents (within project)
  listDocuments(projectSlug: string): Promise<ProjectDocument[]>;
  getDocument(id: string): Promise<ProjectDocument>;
  saveDocument(doc: ProjectDocument): Promise<void>;
  deleteDocument(id: string): Promise<void>;
  
  // Provider configs (global)
  listProviderConfigs(): Promise<ProviderConnectionConfig[]>;
  getProviderConfig(id: string): Promise<ProviderConnectionConfig>;
  saveProviderConfig(config: ProviderConnectionConfig): Promise<void>;
  deleteProviderConfig(id: string): Promise<void>;
}
```

**Phase 1: `FileStorageAdapter`** — implements `IStorageAdapter` using the current file-based approach. YAML/JSON files in `.stallion-ai/`. This is what ships first.

**Phase 2 (future): `SQLiteStorageAdapter`** — implements the same interface backed by SQLite (via `better-sqlite3` or Drizzle ORM). Faster queries, proper indexing, transaction support. Migration tool converts file-based data to SQLite.

**Why not SQLite from day one?**
- File-based is debuggable (you can `cat` a config file)
- File-based works with git (you can version your project configs)
- File-based has zero dependencies
- SQLite adds a native dependency (`better-sqlite3`) that complicates cross-platform builds
- The adapter interface means we can switch later without touching any service code

**What DOES need structured storage sooner:**
- Vector document tracking → this is handled by LanceDB itself (it tracks its own tables)
- Conversation messages at scale → the `FileMemoryAdapter` already exists and works. If it gets slow, that's when we add SQLite.

**The key abstraction:** Services never touch the filesystem directly. They go through `IStorageAdapter`. This is the investment that pays off later.

---

### 9.6 Updated Data Model (Iteration 2)

Incorporating the decisions above:

```typescript
// ── Global (System Level) ──

interface SystemConfig {
  defaultLLMProvider: string;          // ID of a configured provider connection
  defaultLLMModel: string;
  defaultEmbeddingProvider: string;
  defaultEmbeddingModel: string;
  defaultVectorDbProvider: string;     // "lancedb" etc.
  region?: string;                     // For Bedrock
}

interface ProviderConnectionConfig {
  id: string;                          // UUID
  type: 'ollama' | 'bedrock' | 'openai-compat' | string;
  name: string;                        // Display name, e.g., "Local Ollama", "Groq Cloud"
  config: Record<string, unknown>;     // Type-specific: { url, apiKey, region, ... }
  enabled: boolean;
  capabilities: ('llm' | 'embedding')[];
}

// ── Project Level ──

interface ProjectConfig {
  id: string;
  name: string;
  slug: string;
  icon?: string;
  description?: string;
  
  // Working directories
  directories: ProjectDirectory[];
  
  // Provider defaults (reference global provider connections by ID)
  defaultProviderId?: string;          // FK to ProviderConnectionConfig.id
  defaultModel?: string;
  defaultEmbeddingProviderId?: string;
  defaultEmbeddingModel?: string;
  
  // RAG settings
  similarityThreshold?: number;
  topK?: number;
  
  // Scoped agents
  agents?: string[];
  
  // Metadata
  createdAt: string;
  updatedAt: string;
}

interface ProjectDirectory {
  id: string;                          // UUID (stable reference for conversations)
  path: string;
  label?: string;
  role: 'primary' | 'reference';
}

// ── Layout Level (within project) ──

interface LayoutConfig {
  id: string;
  projectSlug: string;                 // Parent project
  type: string;                        // Layout type ID ("chat", "coding", etc.)
  name: string;
  slug: string;
  icon?: string;
  description?: string;
  config: Record<string, unknown>;     // Type-specific config
  createdAt: string;
  updatedAt: string;
}

// ── Conversation Level (within project) ──

interface ConversationConfig {
  id: string;
  projectId: string;
  title: string;
  agentSlug: string;
  layoutId?: string;                   // Which layout spawned this
  
  // Overrides (null = inherit from project → system)
  providerId?: string;                 // FK to ProviderConnectionConfig.id
  model?: string;
  
  // Directory focus (null = all project directories)
  focusDirectoryId?: string;           // FK to ProjectDirectory.id
  branch?: string;                     // Git branch context
  
  createdAt: string;
  updatedAt: string;
}
```

---

## Appendix: Codebase Integration Audit

### Server-Side Change Map

| File | Scope | What Changes |
|---|---|---|
| `packages/shared/src/index.ts` | **Medium** | Add `ProjectConfig`, `ProjectDirectory`, `ProjectMetadata`, `LayoutConfig` (rename from WorkspaceConfig), `ProviderConnectionConfig`, `ConversationConfig`. Keep old names as aliases during migration. |
| `src-server/domain/config-loader.ts` | **Large** | Becomes `FileStorageAdapter` implementing `IStorageAdapter`. New project/layout/provider CRUD. New directory structure under `.stallion-ai/projects/`. Migration logic (workspaces → default project). |
| `src-server/providers/registry.ts` | **Small** | Add provider types: `llmProvider`, `embeddingProvider`, `vectorDbProvider`, `layoutType` (all additive). Rename workspace→project in scoping. |
| `src-server/providers/types.ts` | **Medium** | Add `ILLMProvider`, `IEmbeddingProvider`, `IVectorDbProvider`, `ILayoutTypeProvider`, `ProviderConnectionConfig`. Update `PROVIDER_TYPE_META`. |
| `src-server/routes/workspaces.ts` | **Medium** | Keep as backwards-compat aliases → proxy to `/api/projects/default/layouts`. |
| `src-server/routes/system.ts` | **Small** | Add provider management endpoints (`/system/providers` CRUD + test). Extend status/capabilities. |
| `src-server/routes/models.ts` | **Medium** | Accept `?provider=` param. Aggregate models from all configured providers (Ollama `/api/tags`, OpenAI-compat `/v1/models`, Bedrock existing). |
| `src-server/routes/conversations.ts` | **Medium** | Add `projectId` to conversation model. Add project-scoped listing. Add `focusDirectoryId`/`providerId` to PATCH. |
| `src-server/services/workspace-service.ts` | **Medium** | Rename to `LayoutService`. Add `projectSlug` scoping. Move workflow methods to `AgentService`. |
| `src-server/services/agent-service.ts` | **Small** | Optional project scoping for `listAgents`. Update `deleteAgent` dependency check. |
| `src-server/runtime/stallion-runtime.ts` | **Medium** | Add `ProjectService`, `ProviderService`, `KnowledgeService`. Mount new routes. Make `memoryAdapters` project-aware. |
| `src-server/index.ts` | **Minimal** | No changes. Migration runs inside `runtime.initialize()`. |

**New server files:**
- `src-server/domain/storage-adapter.ts` — `IStorageAdapter` interface
- `src-server/domain/file-storage-adapter.ts` — File-based implementation
- `src-server/domain/migration.ts` — Workspace → project migration
- `src-server/services/project-service.ts` — Project CRUD
- `src-server/services/provider-service.ts` — Provider resolution (conversation → project → system)
- `src-server/services/knowledge-service.ts` — Document upload/embed pipeline
- `src-server/routes/projects.ts` — Project + layout + knowledge routes

### Client-Side Change Map

| File | Scope | What Changes |
|---|---|---|
| `src-ui/src/App.tsx` | **Large** | Add `<ProjectSidebar>`. New `NavigationView` types (`project`, `layout`, `project-new`, `project-edit`). Replace workspace auto-select with project-based routing. `Cmd+N` → new project/layout. |
| `src-ui/src/contexts/NavigationContext.tsx` | **Medium** | Add `selectedProject` to state. New URL patterns: `/projects/:slug/layouts/:layoutSlug`. Add `setProject()`, `setLayout()`. Rename `selectedWorkspace` → `selectedLayout` (keep alias). |
| `src-ui/src/contexts/WorkspacesContext.tsx` | **Medium** | Rename to `LayoutsContext`. All methods gain `projectSlug`. New `ProjectsContext` for project CRUD. Keep as shim during Phase 1. |
| `src-ui/src/contexts/ActiveChatsContext.tsx` | **Small** | Add `projectSlug`, `projectName`, `focusDirectoryId` to `ChatUIState`. Persist in sessionStorage. `useSendMessage()` passes `projectId` for RAG. |
| `src-ui/src/components/Header.tsx` | **Small** | Remove workspace indicator + autocomplete modal. Simplify to brand + breadcrumb (`Project / Layout`) + global actions. |
| `src-ui/src/components/WorkspaceSelector.tsx` | **Delete** | Dead code — not used anywhere (Header has its own inline modal). |
| `src-ui/src/components/ChatDock.tsx` | **Small** | Add project color/icon badges to session tabs. `NewChatModal` defaults to current project's agents + offers "Quick Chat." |
| `packages/sdk/src/queries.ts` | **Medium** | Add `useProjectsQuery`, `useProjectQuery`, `useProjectLayoutsQuery`. Keep workspace hooks as aliases. |
| `packages/sdk/src/hooks.ts` | **Small** | Add `useProjects()`, `useProject()`, `useProjectLayouts()`. `useResolveAgent` gains project-scoped resolution. |
| `packages/sdk/src/providers.tsx` | **Small** | Add `projects` to `SDKContextValue.contexts`. `WorkspaceProvider` gains `project` + `layout` props. |
| `packages/sdk/src/workspace/context.tsx` | **Small** | Storage key → `layout:${projectSlug}:${layoutSlug}:context`. `_setWorkspaceContext` → `_setLayoutContext`. |

**New UI files:**
- `src-ui/src/components/ProjectSidebar.tsx` — Main sidebar with project list
- `src-ui/src/components/ProjectSidebarItem.tsx` — Collapsible project section
- `src-ui/src/views/ProjectSettingsView.tsx` — Project config (directories, provider, knowledge)
- `src-ui/src/components/NewProjectModal.tsx` — Create project form
- `src-ui/src/contexts/ProjectsContext.tsx` — Project state management

### Dependency Chain (Build Order)

```
Phase 1a: Types + Storage
  packages/shared/src/index.ts          ← new types (ProjectConfig, LayoutConfig, etc.)
  src-server/domain/storage-adapter.ts  ← IStorageAdapter interface
  src-server/domain/file-storage-adapter.ts ← implements IStorageAdapter
  src-server/domain/migration.ts        ← workspace → project migration

Phase 1b: Services + Routes (depends on 1a)
  src-server/services/project-service.ts
  src-server/services/provider-service.ts
  src-server/routes/projects.ts
  src-server/runtime/stallion-runtime.ts ← mount new routes + services

Phase 1c: UI Foundation (depends on 1b)
  src-ui/src/contexts/NavigationContext.tsx ← add project state
  src-ui/src/contexts/ProjectsContext.tsx   ← new
  packages/sdk/src/queries.ts              ← add project queries
  src-ui/src/components/ProjectSidebar.tsx  ← new
  src-ui/src/App.tsx                       ← integrate sidebar + routing
  src-ui/src/components/Header.tsx         ← simplify

Phase 1d: Migration + Compat (depends on 1c)
  src-server/routes/workspaces.ts      ← backwards-compat aliases
  src-ui/src/contexts/WorkspacesContext.tsx ← shim to ProjectsContext
```

---

## Appendix: Defaults

### System Defaults (first-run)

```yaml
# .stallion-ai/config/app.json
{
  "defaultLLMProvider": "ollama",
  "defaultLLMModel": "llama3.2",
  "defaultEmbeddingProvider": "ollama",
  "defaultEmbeddingModel": "nomic-embed-text",
  "defaultVectorDbProvider": "lancedb",
  "region": "us-east-1"               # For Bedrock fallback
}
```

If Ollama is not running, the system detects this on startup and falls back to Bedrock (if AWS credentials are available) or prompts the user to configure a provider.

### Fully Local Stack

| Component | Default | Notes |
|---|---|---|
| LLM | Ollama + llama3.2 | Runs locally, no cloud calls |
| Embeddings | Ollama + nomic-embed-text | Same Ollama instance |
| Vector DB | LanceDB (embedded) | Stored in `.stallion-ai/vectordb/`, no external service |
| Storage | Local filesystem | Documents in `.stallion-ai/projects/<slug>/documents/` |

Zero cloud calls. Zero external services. Just `ollama serve` and `stallion start`.

---

## Appendix: Research Sources

This design is informed by a two-pass source code audit of:

- **AnythingLLM v1.11.1** (55.8k ⭐) — workspace-as-vector-namespace isolation, 38 LLM providers, 10 vector DBs, LanceDB embedded default, per-workspace LLM override, split-panel document manager
- **t3code v0.0.4-alpha** (2.7k ⭐) — directory-based projects, multi-project sidebar (no context switching), real PTY terminal, diff viewer per agent turn, git worktrees, CQRS event sourcing
- **Open WebUI v0.8.8** (126k ⭐) — 11 vector DBs, multi-provider (Ollama multi-instance, OpenAI-compat), knowledge bases with ACL, hybrid search (vector + BM25 + reranking), Jupyter code execution

Full analysis: `docs/research/competitive-analysis.html`
