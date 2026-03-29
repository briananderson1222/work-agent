# Design: Entity Hierarchy & Navigation Restructure

**Status:** Draft  
**Date:** 2026-03-27  
**Author:** Brian Anderson + Stallion

---

## Problem

Stallion's core entities (agents, skills, integrations, layouts, plugins) lack a consistent lifecycle model and the UI treats them as peers when they have a clear parent-child hierarchy.

### Current issues

1. **Skills bypass managed patterns.** No service class, no ConfigLoader persistence, no CRUD routes. A module-level `Map` with raw filesystem operations vs. the `AgentService`/`ConfigLoader` pattern everything else uses.

2. **No entity hierarchy.** The sidebar and Agents Hub present agents, skills, prompts, and layouts as equal top-level concepts. Skills and integrations are capabilities *of agents*. Layouts are views *of projects*. The UI doesn't reflect this.

3. **No per-project agent scoping.** Agents are global-only. Projects contain layouts but have no concept of "which agents are available here." Every agent appears everywhere.

4. **Inconsistent install lifecycle.** Agent install goes through `IAgentRegistryProvider` with proper provider pattern. Skill install is raw `fs` copy + directory re-scan. No unified registry experience.

5. **No validation on assignment.** `AgentSpec.skills[]` accepts arbitrary strings with no validation that the skill names resolve to installed skills. Same for integration references.

---

## Proposed Hierarchy

```
Registry (browse + discover)
  └─ Global Install (on the machine, available to configure)
       ├─ Skills        ─┐
       ├─ Integrations   ├─ assigned TO agents
       └─ Agents ────────┘
            └─ assigned TO projects
                 └─ Projects (contain layouts)
```

### Key principles

- **Skills and integrations are agent capabilities.** They define what an agent can do and what tools it has. They are configured per-agent, not per-project.
- **Agents are members of projects.** A project selects which agents are available within it. When you're in a project, you only see its assigned agents.
- **Layouts are views of projects.** They're managed within the project context, not as standalone entities.
- **Global install ≠ active.** Installing from the registry makes something available to configure. It doesn't automatically appear in every agent or project.
- **Registry is the admin surface.** One place to browse, install, and manage what's available on the machine.

---

## UI Changes

### Sidebar (before → after)

**Before:**
```
Projects (with layouts)
  └─ New Project
──────────────
Agents          ← AgentsHub (agents + skills + prompts)
Prompts
Connections
Plugins
Schedule
Monitoring
```

**After:**
```
Projects (with layouts nested)
  └─ New Project
──────────────
Agents          ← Agent list + CRUD
Playbooks       ← Renamed from "Prompts"
Registry        ← Unified browse/install for agents, skills, integrations, plugins
Connections     ← Infrastructure: provider connections, ACP
Schedule
Monitoring
```

**Removed from sidebar:**
- Skills (managed in agent editor)
- Plugins (install via Registry, configure via Connections or dedicated settings)
- Layouts as standalone (managed in project editor)

### Agents page

**Before:** AgentsHub — flat dashboard with agents, skills, and prompts as peer sections.

**After:** Agent list view. Shows installed agents (local + ACP) with create/edit/delete. No skills or playbooks sections — those are managed in their own contexts.

### Agent editor

The agent editor becomes the primary surface for configuring agent capabilities.

```
Tabs:
  Basic       ─ name, description, icon, system prompt, model
  Skills      ─ toggle installed skills on/off for this agent
                 "Install from Registry" action for skills not yet installed
  Tools       ─ MCP servers, built-in tools, auto-approve (exists today)
  Commands    ─ slash commands (exists today)
```

The Skills tab shows all globally installed skills with toggles. Assigning a skill validates it exists. An inline "Install from Registry" flow lets you install + assign without leaving the editor.

### Project editor

**Before:** Name, icon, description. Layouts managed separately.

**After:**
```
Project settings:
  Basic       ─ name, icon, description
  Agents      ─ which agents are available in this project (multi-select)
  Layouts     ─ add/remove/reorder layouts for this project
```

If a project doesn't specify agents, all agents are available (backward compatible). Specifying agents is an opt-in filter.

### Project creation flow

New project wizard:
1. Name, icon, description
2. Select agents available in this project
3. Add initial layouts

### Registry page

Unified browse/install surface with tabs or filters:

```
Registry:
  Agents        ─ browse + install agent packages
  Skills        ─ browse + install skills
  Integrations  ─ browse + install MCP servers
  Plugins       ─ browse + install plugins
```

Each tab shows available (from registry providers) and installed items. Install/uninstall/update actions. This replaces the current scattered install UIs across AgentsHub, SkillsView, IntegrationsView, and PluginManagementView.

### Playbooks

Renamed from "Prompts." Standalone page stays — playbooks are reusable across agents and have their own identity. The page gets the new name and any terminology updates throughout the UI.

---

## Backend Changes

### 1. Skill service normalization

Promote skills to the same managed pattern as agents:

- **`SkillService` class** with constructor injection, replacing module-level functions and global `Map`
- **ConfigLoader methods:** `saveSkill()`, `listSkills()`, `loadSkill()`, `deleteSkill()`
- **Managed config:** `skills/<name>/skill.json` alongside `SKILL.md` (tracks install metadata, version, source)
- **Validation:** `AgentSpec.skills[]` entries validated against installed skills at save time
- **CRUD routes:** `GET/POST/PUT/DELETE /api/skills/:id` following agent route patterns

### 2. Project agent assignment

Extend `ProjectConfig` with an optional agents field:

```typescript
interface ProjectConfig {
  id: string;
  name: string;
  slug: string;
  agents?: string[];  // NEW — agent slugs available in this project
  createdAt: string;
  updatedAt: string;
}
```

- `agents: undefined` or absent → all agents available (backward compatible)
- `agents: ["default", "code-reviewer"]` → only those agents appear in project context
- Agent selector, chat, and layout agent pickers filter by project assignment

### 3. Unified registry routes

Consolidate or standardize registry routes:

```
GET    /api/registry/:type              ← list available (type = agents|skills|integrations|plugins)
GET    /api/registry/:type/installed    ← list installed
POST   /api/registry/:type/install      ← install from registry
DELETE /api/registry/:type/:id          ← uninstall
POST   /api/registry/:type/:id/update   ← update
```

All types use the same `IRegistryProvider` interface pattern (they mostly already do).

### 4. Prompt → Playbook rename

- Rename `Prompt` type to `Playbook` in shared types
- Update API routes: `/api/prompts` → `/api/playbooks`
- Update SDK hooks: `usePromptsQuery` → `usePlaybooksQuery`
- Update UI components and navigation
- Keep backward compat aliases if plugins depend on old names

---

## Migration

### Phase 1: Skill service normalization
- Create `SkillService` class
- Add ConfigLoader skill methods
- Add `skill.json` metadata files alongside existing `SKILL.md` files
- Add validation on `AgentSpec.skills[]` save
- Existing skills auto-discovered and registered on first startup

### Phase 2: UI restructure
- Rename Prompts → Playbooks throughout
- Simplify AgentsHub → Agent list (remove skills/prompts sections)
- Remove standalone Skills page (fold into agent editor + registry)
- Remove standalone Layouts page (fold into project editor)
- Create unified Registry page
- Update sidebar nav items

### Phase 3: Project agent assignment
- Add `agents` field to `ProjectConfig`
- Add agent picker to project editor and creation flow
- Filter agent selector/chat by project assignment
- Default: all agents available (no breaking change)

### Phase 4: Cleanup
- Remove orphaned routes and views
- Consolidate registry route patterns
- Update documentation

---

## Open Questions

1. **Plugins page** — fold entirely into Registry, or keep a separate "Plugin Settings" page for configuration/overrides? Plugins have settings that agents/skills don't.

2. **Connections page scope** — currently covers MCP servers, provider connections, ACP, and knowledge. With MCP assignment moving fully into agent editor, does Connections become just "Provider Connections + ACP"? Or rename to "Infrastructure"?

3. **Playbook-agent association** — should playbooks be assignable to specific agents (like skills), or remain globally available to all agents? Currently they're global.

4. **Registry provider unification** — the four registry provider interfaces (`IAgentRegistryProvider`, `ISkillRegistryProvider`, `IIntegrationRegistryProvider`, `IPluginRegistryProvider`) are nearly identical. Unify into a generic `IRegistryProvider<T>` or keep separate for type safety?

5. **ACP agents and project scoping** — ACP (connected) agents come from external runtimes. Should they be assignable to projects the same way, or always global?
