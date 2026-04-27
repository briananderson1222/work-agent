# Stallion Documentation

This directory contains the durable documentation for Stallion: product strategy, architecture, guides, references, design notes, and planning artifacts.

## Start Here

| Audience | Read |
| --- | --- |
| New users | [../README.md](../README.md), then [guides/agents.md](guides/agents.md) or [guides/acp.md](guides/acp.md) |
| Plugin authors | [guides/plugins.md](guides/plugins.md), [guides/build-your-first-plugin.md](guides/build-your-first-plugin.md), [reference/sdk.md](reference/sdk.md) |
| Contributors | [guides/development.md](guides/development.md), [guides/testing.md](guides/testing.md), [guides/code-quality.md](guides/code-quality.md) |
| Strategy readers | [strategy/constitution.md](strategy/constitution.md), [strategy/differentiators.md](strategy/differentiators.md), [strategy/roadmap.md](strategy/roadmap.md) |
| API users | [reference/api.md](reference/api.md), [reference/cli.md](reference/cli.md), [reference/contracts.md](reference/contracts.md) |

## Sections

- **[Guides](guides/)** - task-oriented user, plugin, and contributor docs
- **[Reference](reference/)** - API, CLI, config, SDK, and contract details
- **[Strategy](strategy/)** - identity, roadmap, competitive analysis, and execution process
- **[Design](design/)** - focused design documents for active architecture areas
- **[Plans](plans/)** - implementation plans and staged initiatives
- **[Patterns](patterns/)** - frontend and backend implementation conventions
- **[Pages source](pages/)** - public GitHub Pages source assets

## Public Site

Run:

```bash
npm run docs:pages:build
```

The generator creates `dist-pages/` with a marketing homepage plus browsable HTML versions of the Markdown docs. GitHub Actions publishes that artifact to the `gh-pages` branch.

When adding or moving docs, keep links relative and run the Pages build once to catch broken assumptions in the generated index.
