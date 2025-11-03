# Change Proposal: Separate Workspaces from Agents

## Quick Links

- **[Proposal](./proposal.md)** - Why this change is needed and what it impacts
- **[Design](./design.md)** - Architecture decisions, schemas, and trade-offs
- **[Tasks](./tasks.md)** - Implementation plan with 6 phases and 30+ tasks
- **[Example](./example-sa-workspace.json)** - SA workspace with Calendar/Email + Salesforce tabs

## TL;DR

Split agent definitions (AI config) from workspace definitions (UI config) to enable:
- Multi-tab workspaces (e.g., SA: Calendar/Email + Salesforce)
- Global (workspace) and local (tab) prompts
- Multiple workspaces sharing the same agent
- Cleaner separation of concerns

## Before & After

### Before
```
agent.json
├─ AI config (prompt, model, tools)
└─ UI config (component, quickPrompts)
```

### After
```
agent.json (AI only)
└─ prompt, model, tools

workspace.json (UI only)
├─ agent: "sa-agent"
├─ tabs[] (with components & local prompts)
└─ globalPrompts
```

## Key Changes

1. **NEW**: `workspace-config` spec with 6 requirements
2. **REMOVED**: UI metadata from `agent-config` spec
3. **UPDATED**: `desktop-ui` spec to be workspace-centric
4. **ADDED**: Workspace CRUD API and management UI

## Implementation Phases

1. **Backend Foundation** - Workspace loader, API endpoints
2. **Frontend Foundation** - Workspace selector, tab navigation
3. **Workspace Management UI** - Editor, settings integration
4. **Component Updates** - Props, chat integration
5. **Migration & Docs** - Migration script, documentation
6. **Testing & Polish** - Integration tests, error handling

## Example: SA Workspace

```json
{
  "name": "Solutions Architect",
  "agent": "sa-agent",
  "tabs": [
    {
      "id": "calendar-email",
      "label": "Calendar & Email",
      "component": "sa-calendar-dashboard",
      "prompts": [...]
    },
    {
      "id": "salesforce",
      "label": "Salesforce",
      "component": "sa-salesforce-dashboard",
      "prompts": [...]
    }
  ],
  "globalPrompts": [...]
}
```

## Review Checklist

- [ ] Read `proposal.md` for rationale
- [ ] Read `design.md` for architecture
- [ ] Read `tasks.md` for implementation plan
- [ ] Review `example-sa-workspace.json`
- [ ] Check spec deltas in `specs/` directory
- [ ] Approve before implementation

## Questions?

See `design.md` section "Open Questions" for items needing clarification.
