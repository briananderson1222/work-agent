# Documentation Plan

## Principles

- **Two audiences**: plugin developers (build on top) and core contributors (build the foundation)
- **Plugin developers are the primary audience** — the core exists to enable plugins
- **Breadth and depth** — every surface area documented, with enough detail to build against
- **Framework-agnostic** — avoid VoltAgent/Strands specifics; document the Stallion abstractions
- **Examples over theory** — every concept gets a working code snippet

## Structure

```
docs/
  getting-started.md          ← New: install, first run, first plugin
  architecture.md             ← New: system overview, component map, data flow

  guides/
    agents.md                 ✓ Exists — needs update for framework-agnostic framing
    workspace-agents.md       ✓ Exists — accurate
    plugins.md                ✓ Exists — needs SDK/hooks expansion
    commands.md               ✓ Exists — accurate
    monitoring.md             ← New: telemetry setup, metrics, Grafana, Jaeger
    acp.md                    ← New: Agent Communication Protocol, connecting external runtimes
    theming.md                ← New: branding, CSS variables, custom themes

  reference/
    api.md                    ✓ Exists — missing ~10 route files of endpoints
    api-summary.md            ✓ Exists — needs sync with api.md
    endpoints.md              ✓ Exists — needs accuracy pass
    sdk.md                    ← New: @stallion-ai/sdk hooks, components, types
    connect.md                ← New: @stallion-ai/connect connection management
    shared.md                 ← New: @stallion-ai/shared utilities, types
    cli.md                    ← New: stallion CLI commands and flags
    config.md                 ← New: app.json, agent.json, workspace.json schemas

  patterns/
    backend.md                ✓ Exists — needs strands-adapter removal, service docs
    frontend.md               ✓ Exists — needs packages/connect, packages/shared

  contributing.md             ← New: dev setup, PR process, code style, testing
```

## Work Items

### Phase 1: Foundation (new docs that don't exist)

| Doc | Description | Effort | Priority |
|-----|-------------|--------|----------|
| `getting-started.md` | Install → run → build first plugin in 10 minutes | Medium | P0 |
| `architecture.md` | System diagram, component boundaries, data flow, plugin lifecycle | Medium | P0 |
| `guides/acp.md` | ACP protocol, session management, agent modes, slash commands, connecting kiro-cli | Large | P0 |
| `reference/sdk.md` | Every hook, component, and type from @stallion-ai/sdk | Large | P0 |
| `reference/cli.md` | All CLI commands, flags, examples | Small | P1 |
| `reference/config.md` | app.json, agent.json, workspace.json, plugin.json schemas with all fields | Medium | P1 |
| `guides/monitoring.md` | OTel setup, metrics reference, Grafana dashboard, Jaeger traces, cost tracking | Medium | P1 |
| `reference/connect.md` | @stallion-ai/connect — ConnectionStore, hooks, QR pairing, multi-device | Medium | P1 |
| `reference/shared.md` | @stallion-ai/shared — plugin utilities, MCP helpers, types | Small | P2 |
| `guides/theming.md` | CSS variables, branding API, custom themes, dark/light mode | Small | P2 |
| `contributing.md` | Dev environment, testing, PR guidelines, architecture decisions | Medium | P2 |

### Phase 2: Fill gaps in existing docs

| Doc | What's Missing | Effort |
|-----|---------------|--------|
| `reference/api.md` | ~10 route files undocumented: plugins, system, scheduler, auth, insights, fs, branding, registry, models, tools | Large |
| `reference/api-summary.md` | Sync with api.md after it's updated | Small |
| `reference/endpoints.md` | Fix contradictions, add missing route coverage | Medium |
| `guides/plugins.md` | SDK integration section, hook examples, workspace component lifecycle, provider interfaces | Medium |
| `guides/agents.md` | Framework-agnostic framing, remove VoltAgent-specific patterns | Small |
| `patterns/backend.md` | Document acp-bridge, approval-registry, event-bus, plugin-permissions, scheduler services | Medium |
| `patterns/frontend.md` | Document packages/connect and packages/shared usage patterns | Small |

### Phase 3: Polish

- Cross-link everything (every doc should link to related docs)
- Add a docs/README.md index page with categorized links
- Ensure every code example compiles and runs
- Add diagrams for architecture.md and acp.md (Mermaid)
- Review for internal references one final time

## Execution Order

1. **architecture.md** — everything else references this
2. **getting-started.md** — the front door
3. **reference/sdk.md** — plugin devs need this most
4. **guides/acp.md** — core differentiator, completely undocumented
5. **reference/api.md** (gap fill) — document all 18 route files
6. **reference/config.md** — schemas for all JSON configs
7. **guides/plugins.md** (gap fill) — expand with SDK integration
8. **reference/cli.md** — quick win
9. **guides/monitoring.md** — we just built this, document it fresh
10. **reference/connect.md** — multi-device story
11. Everything else

## Open Questions

- Should `guides/acp.md` cover the protocol spec, or just "how to connect"?
- Do we want a separate `guides/mcp.md` for MCP tool configuration, or keep it in agents.md?
- Should plugin examples live in `docs/` or stay in `examples/`?
