# ACP Projects & Agent Orchestration — Design Doc

> Status: Draft
> Date: 2026-02-23
> Context: Builds on the multi-connection ACP integration (committed). Inspired by AntiGravity's Agent Manager concept.

## Problem

Today, ACP connections are global — one kiro-cli instance shared across all workspaces, pointing at a single working directory. This breaks down when:

- You work on multiple repos and want agents scoped to each
- Different projects need different agent modes (a frontend project doesn't need `tool-aws-operations`)
- You want to run the same agent CLI against different directories simultaneously
- Teams want shared project configs with curated agent setups

## Core Concept: Projects

A **Project** is a working context that binds together:
- A **directory** (the codebase root)
- One or more **ACP connections** (with per-project overrides)
- A **workspace** (the UI layout)
- **Curated modes** (which agent modes are visible/pinned for this project)

```
Project "stallion"
├── directory: /Users/me/dev/stallion-new
├── workspace: stallion-workspace
├── connections:
│   └── kiro (override: cwd → /Users/me/dev/stallion-new)
│       ├── pinned modes: [dev, builder, sales-sa]
│       └── hidden modes: [tool-*, gamma-*]
└── settings:
    └── defaultMode: dev
```

## Architecture

### Current State

```
Global ACP Config (.work-agent/config/acp.json)
└── connections[]
    └── { id, command, args, cwd, enabled }

Workspaces (.work-agent/workspaces/)
└── { name, tabs, prompts }

Agents (.work-agent/agents/)
└── { name, prompt, model, tools }
```

Workspaces, agents, and ACP connections are independent. No concept of "this workspace uses these connections with these settings."

### Proposed State

```
Global ACP Config (.work-agent/config/acp.json)
└── connections[]                          ← available connection pool
    └── { id, command, args, icon }

Projects (.work-agent/projects/)
└── <project-slug>/
    ├── project.json                       ← project definition
    │   ├── directory: string
    │   ├── workspace: string              ← workspace slug reference
    │   ├── connections: ConnectionOverride[]
    │   │   └── { connectionId, cwd?, pinnedModes?, hiddenModes?, enabled? }
    │   └── settings: { defaultMode?, autoConnect? }
    └── memory/                            ← project-scoped conversations
        ├── conversations/
        └── sessions/

Workspaces (.work-agent/workspaces/)       ← unchanged, UI layout only
Agents (.work-agent/agents/)               ← unchanged, local agents
```

### Key Design Decisions

**1. Projects reference connections, not own them**

Connections are defined globally (the CLI binary is the same regardless of project). Projects override connection settings — primarily `cwd` and mode visibility. This avoids duplicating connection configs.

**2. Projects scope conversations**

Today, conversations are scoped by agent slug (`kiro-dev`). With projects, they'd be scoped by project + agent (`stallion/kiro-dev`). This means chatting with `kiro-dev` in the stallion project has separate history from `kiro-dev` in another project.

**3. Projects are optional**

The current global behavior remains the default. Projects are an opt-in layer. If you never create a project, everything works as it does today.

**4. Mode curation**

With 43 modes from kiro-cli, the New Chat modal is overwhelming. Projects let you pin the 3-5 modes you actually use and hide the rest. The UI shows:
- Pinned modes (top, always visible)
- Other modes (collapsed, expandable)
- Hidden modes (not shown)

## User Flows

### Creating a Project

```
Agents Page → Projects Section → + New Project
├── Name: "Stallion"
├── Directory: /Users/me/dev/stallion-new  (folder picker)
├── Workspace: stallion-workspace          (dropdown)
└── Connections:
    └── kiro-cli
        ├── ☑ Enabled
        ├── Pinned: dev, builder, sales-sa
        └── cwd: (inherits from project directory)
```

### Switching Projects

The header workspace selector becomes a project selector. Switching projects:
1. Updates the active workspace (UI layout)
2. Switches ACP connection contexts (cwd, visible modes)
3. Scopes conversation history to the project

### Agent Manager View (AntiGravity-inspired)

A dedicated view showing all active agent sessions across the project:

```
┌─────────────────────────────────────────────────┐
│ Agent Manager — Stallion                        │
├─────────────────────────────────────────────────┤
│                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐     │
│  │ dev      │  │ builder  │  │ sales-sa │     │
│  │ ● active │  │ ○ idle   │  │ ● active │     │
│  │ 12 msgs  │  │          │  │ 5 msgs   │     │
│  │ [Open]   │  │ [Start]  │  │ [Open]   │     │
│  └──────────┘  └──────────┘  └──────────┘     │
│                                                 │
│  Recent Activity                                │
│  ├─ dev: Modified src/App.tsx (2m ago)         │
│  ├─ sales-sa: Drafted email to Acme (5m ago)   │
│  └─ dev: Ran tests — 15 passed (8m ago)        │
│                                                 │
└─────────────────────────────────────────────────┘
```

## Data Model

### ProjectConfig

```typescript
interface ProjectConfig {
  name: string;
  slug: string;
  directory: string;
  workspace?: string;           // workspace slug
  icon?: string;
  connections: ProjectConnectionOverride[];
  settings?: {
    defaultMode?: string;       // auto-select this mode on project switch
    autoConnect?: boolean;      // start connections when project loads
  };
}

interface ProjectConnectionOverride {
  connectionId: string;         // references ACPConnectionConfig.id
  enabled?: boolean;            // override global enabled
  cwd?: string;                 // override connection cwd (defaults to project.directory)
  pinnedModes?: string[];       // modes to show at top
  hiddenModes?: string[];       // modes to hide (glob patterns: "tool-*")
}
```

### Conversation Scoping

Current: `agent:kiro-dev:user:default:timestamp:random`
Proposed: `project:stallion:agent:kiro-dev:user:default:timestamp:random`

The memory adapter resolves the project prefix to a project-specific directory:
```
.work-agent/projects/stallion/memory/conversations/
.work-agent/projects/stallion/memory/sessions/
```

## Migration Path

1. **Phase 1 (done)**: Multi-connection ACP with global config
2. **Phase 2**: Project config schema + loader, project CRUD API
3. **Phase 3**: Project-scoped conversations (memory adapter prefix)
4. **Phase 4**: Mode curation UI (pin/hide modes per project)
5. **Phase 5**: Project selector in header (replaces workspace selector)
6. **Phase 6**: Agent Manager view (active sessions, recent activity)

## Open Questions

- **Should projects own local agents too?** A project could define which VoltAgent agents are available, not just ACP modes. This would make projects the universal scoping mechanism.

- **Multi-directory projects?** Some projects span multiple repos (monorepo + docs repo). Should a project support multiple directories, each with its own ACP connection cwd?

- **Shared project configs?** Could projects be exported/imported for team sharing? A `.work-agent/projects/stallion/project.json` is already portable.

- **ACP session per project?** Currently one ACP session per connection. With projects, should each project get its own session? This would enable true parallel work (project A's kiro-dev doesn't share context with project B's kiro-dev). The tradeoff is resource usage — each session is a separate kiro-cli process.

- **How does this relate to workspaces?** Workspaces are UI layout. Projects are work context. A project references a workspace but adds agent scoping. Eventually, workspaces might become a property of projects rather than standalone entities.
