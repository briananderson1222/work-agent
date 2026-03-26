# KiRoom → Stallion Feature Analysis

A thorough analysis of KiRoom's architecture and features, with concrete recommendations for enhancing Stallion's user experience.

## Documents

| Document | Description | Status |
|----------|-------------|--------|
| [Executive Summary](./00-executive-summary.md) | High-level overview, priority matrix, and recommended adoption order | Updated |
| [Threading & Conversations](./01-threading-model.md) | Threads, forking, family trees, message groups — the core interaction model | ❌ Not started |
| [Insights & Feedback](./02-insights-feedback.md) | Rating system, automated analysis, template proposals — the "learning loop" | ✅ Done |
| [ACP Integration](./03-acp-integration.md) | Session management, tool approvals, sub-agents, context compaction | 🟡 Partial |
| [Search & Navigation](./04-search-navigation.md) | Cross-room search, URL filters, deep links, unread tracking | ❌ Not started |
| [Files & Notes](./05-files-notes.md) | Room files, thread files, doc collaboration, notes system | 🟡 Partial |
| [Queue & Dispatch](./06-queue-dispatch.md) | Server-side message queuing, countdown, retry, crash recovery | 🟡 Partial |
| [Settings & Preferences](./07-settings-preferences.md) | Per-room/thread settings, themes, trusted tools, agent config | ❌ Not started |
| [Audit Addendum](./08-audit-addendum.md) | Second-pass findings: quote & respond, MCP prompt discovery, backup/recovery, draft persistence, and more | ❌ Mostly not started |

## How to Read This

Each document follows the same structure:
1. **What KiRoom Built** — Feature description and architecture
2. **What Stallion Has Today** — Current state comparison
3. **Recommendation** — Concrete adoption strategy with effort estimates
4. **Stallion Mapping** — How KiRoom concepts map to Stallion's existing architecture

## Priority Legend

- 🔴 **High** — Significant UX gap, high user impact, should adopt
- 🟡 **Medium** — Nice-to-have, meaningful improvement, adopt when capacity allows
- 🟢 **Low** — Polish/refinement, adopt opportunistically
