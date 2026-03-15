# Settings & Preferences

## Priority: 🟢 Lower (but lots of good ideas)

## What KiRoom Built

### Preference Architecture

KiRoom stores all preferences in a single SQLite key-value table (`preferences`). The `usePreferences` hook manages everything client-side with server sync.

**Allowed keys** (from `routes/preferences.ts`):
```
agents, models, labels, defaultAgent, defaultModel, homeRoom,
theme, accentColor, userAvatarColor, agentAvatarColor, fullOutputColor,
uiFont, codeFont, outputFontSize, outputLineHeight,
collabDocFontSize, collabDocLineHeight, linkBehavior,
roomSettings, threadSettings, roomFilters, roomThreadMap,
autoConfigureAgents, trustedTools, markdownPreference,
unsortedCollapsed, sendOnCtrlEnter, threadMemory,
darkMode, themeMode, promptTemplates,
insightsLikedCount, insightsDislikedCount, usageMetrics
```

### Per-Room/Thread Sticky Settings

This is the most interesting pattern. Each room and thread remembers its own compose settings:

- `roomSettings` — `Record<roomId, ComposeSettings>` (agent, model, trustedTools, markdown)
- `threadSettings` — `Record<threadKey, ComposeSettings>`
- When you switch rooms, the compose box restores that room's last-used settings
- When you reply in a thread, it uses that thread's settings
- Per-message overrides are possible without changing the sticky defaults

### Trusted Tools Management

Granular control over which tools agents can use without confirmation:

- **Hardcoded tools**: `aws`, `code`, `glob`, `grep`, `introspect`, `knowledge`, `read`, `shell`, `subagent`, `thinking`, `todo`, `write` — always available
- **Custom tools**: User adds their own (formats: `tool-name`, `@mcp-server/tool-name`, `@mcp-server/*`)
- **`--trust-all-tools`**: Exclusive option with ⚠️ warning
- **Per-message badges**: Messages show which tools were trusted (amber badge)
- **Copy Name**: When a tool requires approval, click to copy the tool name. MCP tools show as `@server/tool`
- **Trust Tool**: One-click button to add the tool to trusted tools and select it for next reply

### Auto-Configure Agents

When enabled, KiRoom automatically updates agent JSON files with the required MCP configuration when you send a message:
- Adds `mcpServers.kiroom` pointing to the KiRoom MCP server
- Adds the 17 KiRoom MCP tools to `allowedTools`
- Self-repairing: if you move KiRoom, the MCP path auto-updates
- Self-cleaning: stale `@kiroom/*` tools auto-removed when tool list changes
- Project-level priority: only configures project-level agents when a match exists there

### Agent Validation

Before sending messages, KiRoom validates agent config:
1. Checks if agent name exists in `~/.kiro/agents` or `<workingDir>/.kiro/agents`
2. "Agent Config Missing" dialog if no match found
3. "Duplicate Mismatching Agent Configs" dialog if multiple configs with same name differ
4. Missing configuration protection: compose box overlay, keyboard blocking, send button hidden

### Theme & Customization

- **Theme**: Dark, Light, Auto (follows system)
- **Accent color**: Customizable
- **Avatar colors**: User and agent avatar colors
- **UI Font**: Custom font for messages and UI
- **Code Font**: Custom monospace font for code blocks
- **Output Font Size**: Customizable for output sections
- **Output Line Height**: Customizable
- **Collab Doc Font Size/Line Height**: Separate customization for doc preview

All font preferences are applied via CSS custom properties (`setCssProperty` helper).

### Other Settings

- **Send on Ctrl+Enter** — toggle between Enter-to-send and Ctrl+Enter-to-send
- **Thread Memory** — remember which thread was open when leaving a room
- **Link Behavior** — per-link-type "open in new tab" toggles
- **Markdown Preference** — global default for markdown-formatted responses
- **Home Room** — pin a room to the top of the sidebar
- **Usage Metrics** — opt-out toggle for adoption metrics

### Prompt Templates

Reusable prompts with `{{variable}}` placeholders:
- Create, edit, delete templates in Settings or from compose box
- Insert templates with variable prompting dialog
- Live preview of variables while editing
- Templates stored in preferences as JSON array

### Data Export/Import

- **Export** — downloads all rooms, threads, messages, files, settings as `.tgz`
- **Import** — replaces current data with exported archive (auto-backup before replace)
- **Reset** — `rm -rf ~/shared/kiroom`

## What Stallion Has Today

Stallion has settings spread across multiple systems:
- `SettingsView.tsx` — general settings page
- `ProjectSettingsView.tsx` — per-project settings
- `ProviderSettingsView.tsx` — LLM provider configuration
- `ChatSettingsPanel.tsx` — chat-specific settings (font size, reasoning, tool details)
- `useFeatureSettings.ts` — feature flags
- `useDockModePreference.ts` — dock mode preference

Settings are stored in the file-based storage adapter. There's no per-conversation sticky settings, no trusted tools management UI, no agent validation, no auto-configure.

## Recommendation

### What to Adopt

1. **Per-Conversation Sticky Settings** (Medium value)

   Remember agent, model, and settings per conversation. When switching conversations, restore the last-used settings. This eliminates the "forgot to switch back to the right model" problem.

2. **Trusted Tools UI** (High value for ACP)

   If adopting KiRoom's ACP patterns, the trusted tools management is essential:
   - Dropdown to select which tools to auto-approve
   - "Trust Tool" one-click from approval dialogs
   - Per-message badges showing what was trusted
   - `--trust-all-tools` with warning

3. **Prompt Templates** (Medium value)

   Reusable prompts with variables. Stallion may already have something via the prompt service — if so, add the `{{variable}}` prompting UI.

4. **Data Export/Import** (Low effort, high safety value)

   Export all data as an archive. Import to restore. Essential for backup and migration.

### What to Skip

- **Auto-Configure Agents** — Stallion has its own agent management. This is KiRoom-specific.
- **Agent Validation** — Stallion's agent system works differently. Validation logic wouldn't transfer.
- **Home Room** — Stallion already has project navigation with last-viewed restore.
- **Floors/Drawers settings** — Not adopting those organizational primitives.

### Stallion Mapping

| KiRoom Feature | Stallion Location | Notes |
|---------------|------------------|-------|
| Per-room settings | `ConversationsContext` | Add settings per conversation |
| Trusted tools UI | New component in ChatDock | Dropdown + badges |
| Prompt templates | `prompt-service.ts` + UI | May already exist partially |
| Theme/fonts | `SettingsView.tsx` | Stallion already has some of this |
| Data export/import | New route + UI | Archive/restore endpoint |
| CSS custom properties | `index.css` | Stallion already uses CSS vars |

### Effort Estimate

- **Per-conversation settings**: Small — 1-2 days. Extend conversation metadata, restore on switch.
- **Trusted tools UI**: Medium — 2-3 days. Dropdown component, badge rendering, approval integration.
- **Prompt templates with variables**: Small — 1-2 days. Variable extraction, prompting dialog.
- **Data export/import**: Small — 1-2 days. Archive endpoint, import with backup.
