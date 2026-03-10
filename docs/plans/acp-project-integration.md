# ACP Integration with Project Architecture

> ACP agents are global capabilities. Projects provide the execution context.

---

## Current State

ACP (Agent Communication Protocol) connects Stallion to external CLI agents (kiro-cli, claude, etc.) via stdio. Today:

- `ACPManager` discovers ACP agents at startup from `.stallion-ai/config/acp.json`
- ACP agents appear in the global agent list alongside built-in agents
- When invoked, they receive `process.cwd()` as the working directory
- No project awareness — all ACP invocations use the same cwd
- ACP connections are managed in Settings → Connections (the `@stallion-ai/connect` package)

## Design

### Principle: Global Discovery, Per-Project Execution

```
System Level (global)
├── ACP Discovery
│   ├── kiro-cli (detected via PATH)
│   ├── claude (detected via PATH)
│   └── Custom ACP servers (from acp.json)
│
├── These agents are available to ALL projects
│
Project Level (per-invocation)
├── Project "Stallion Dev"
│   ├── Primary dir: /Users/me/dev/stallion-new
│   └── ACP invocation → cwd = /Users/me/dev/stallion-new
│
├── Project "Customer Acme"
│   ├── No directories
│   └── ACP invocation → cwd = process.cwd() (fallback)
```

### What Changes

#### 1. Chat Endpoint Passes Project cwd to ACP

When the chat endpoint receives `projectSlug` and the target agent is an ACP agent:

```typescript
// In stallion-runtime.ts chat handler
if (this.acpBridge.hasAgent(slug)) {
  let cwd = process.cwd(); // default
  if (projectSlug) {
    const project = this.storageAdapter.getProject(projectSlug);
    const primaryDir = project.directories?.find(d => d.role === 'primary');
    if (primaryDir) cwd = primaryDir.path;
  }
  return this.acpBridge.handleChat(c, slug, input, options, { cwd });
}
```

This is the minimal change — ACP agents automatically get the right working directory based on which project the chat belongs to.

#### 2. ChatDock Project Contextualization

The ChatDock needs to know which project a conversation belongs to so it can:
- Pass `projectSlug` in the chat request (for cwd resolution + RAG)
- Show project context in the session tab
- Filter sessions by project

**New behavior:**
- When viewing a project (sidebar shows it as active), new chats from the dock inherit that project
- The dock shows project filter pills: `[All] [Stallion Dev] [Customer Acme] [No Project]`
- Each session tab shows a small project badge (already implemented)
- "Quick Chat" creates a session with no project (system defaults)

#### 3. ACP Agent Cards Show Project Context

In the Agents view, ACP agents should show:
- Which projects they can operate on (any project with directories)
- The current working directory they'd use for each project
- A "Start Chat" button that pre-selects the project

#### 4. Project Dashboard Shows Available ACP Agents

The project dashboard should show which ACP agents are available:

```
📁 Directories
  stallion-project-arch
  primary | ⎇ feat/project-architecture | 68 changes

🤖 Available Agents
  kiro-cli (ACP) — will use /Users/.../stallion-project-arch
  claude (ACP) — will use /Users/.../stallion-project-arch
  sales-sa — built-in agent
```

This makes it clear that ACP agents are available and what directory they'll operate on.

### Implementation Phases

#### Phase 1: cwd from Project (minimal, high impact)
- [ ] Modify chat endpoint: when `projectSlug` + ACP agent, resolve primary directory as cwd
- [ ] Modify `ACPManager.handleChat` to accept optional `cwd` override
- [ ] Frontend: ensure `projectSlug` is passed in chat requests from dock (already done)

#### Phase 2: ChatDock Project Filter
- [ ] Add project filter pills to `ChatDockTabBar`
- [ ] Auto-select project filter when navigating to a project
- [ ] "Quick Chat" button (no project context)
- [ ] New chats inherit current project context

#### Phase 3: Dashboard + Agent Integration
- [ ] Project dashboard: show available ACP agents with resolved cwd
- [ ] Agents view: show project context for ACP agents
- [ ] "Start Chat in Project" action from agent cards

### Data Flow

```
User clicks "New Chat" while viewing Project X
  → ChatDock creates session with projectSlug = "project-x"
  → User sends message
  → Frontend sends { input, options, projectSlug: "project-x" }
  → Backend resolves:
      1. Provider: project-x default → system default
      2. RAG: query project-x knowledge base
      3. ACP cwd: project-x primary directory
  → ACP agent spawned with cwd = /path/to/project-x
  → Agent operates on the right files
```

### Edge Cases

- **Project with no directories**: ACP falls back to `process.cwd()`. RAG still works (knowledge base). Provider override still works.
- **Project with multiple directories**: Use the `primary` role directory. If none marked primary, use the first one.
- **ACP agent mid-conversation directory switch**: Not supported in v1. The cwd is set at session creation time. Changing project mid-conversation would require a new session.
- **Conversation-level directory focus**: The `focusDirectoryId` field on `ChatUIState` could override the project's primary directory for ACP cwd. This enables "focus on the frontend dir" within a monorepo project.

### Non-Goals (v1)

- ACP agent discovery per-project (agents are global)
- Multiple ACP agents in a single conversation
- ACP agent approval flow changes (existing elicitation works)
- ACP connection management changes (stays in Settings → Connections)
