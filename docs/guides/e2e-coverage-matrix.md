# E2E Coverage Matrix

Snapshot of the primary app surface and its current Playwright coverage. The
default product gate is `npm run test:e2e:product`; it runs the promoted
cross-surface suite through `scripts/run-e2e-suite.mjs` against a temporary
`./stallion` instance.

## Core Nav

| Surface | Current specs | Coverage level | Main gaps |
|---|---|---|---|
| Projects | `project-lifecycle`, `project-forms`, `project-architecture`, `project-agent-scoping`, coding-layout specs | partial | Create and key project affordances are promoted; richer edit/delete UI assertions and unsaved-change coverage remain the main gaps |
| Agents | `agents`, `default-agent-workflow`, `builtin-runtime-workflow` | partial | Create and chat/runtime flows are promoted; edit/delete and deeper managed-vs-connected CRUD paths still need explicit regression lanes |
| Playbooks | `playbooks`, `prompts` | partial | Good create/delete coverage, but edit, duplicate, import, and guarded navigation are not covered as a unified lane |
| Registry | `registry`, `registry-install`, `system-registry`, `skills` | partial | Browse/install/remove/detail behavior is promoted, but update assertions are still not uniform across every catalog tab |
| Connections | `connections-crud`, `connect-modal`, `connect-reconnect-banner`, parts of `settings`, runtime/provider chat specs | full | CRUD lane exists for provider, runtime, and tool-server flows; remaining work is maintenance, not missing ownership |
| Plugins | `plugin-update`, `plugin-system`, `plugin-preview` | partial | Preview, install/remove API, bundle serving, and update flows are promoted; mixed plugin-type UI lifecycle still needs breadth |
| Schedule | `schedule-runs` | partial | Run history and output deep links are promoted; add/edit/delete schedule CRUD remains the main gap |
| Monitoring | `monitoring` | smoke | Dedicated shell smoke is promoted; no filter/search/time-range/assertion lane yet |

## Assessment

- The app now has a promoted product Playwright gate covering primary nav,
  connections, registry, plugins, schedule run history, and orchestration/chat
  flows.
- The remaining gap is not "no e2e"; it is full CRUD depth for every primary
  surface.
- Regressions can still slip through when a page has API-only assertions or
  smoke-level coverage instead of a surface-owned workflow lane.

## Priority Lanes

1. Projects
   - Add a durable create/edit/delete project lane with agent/layout assignment and unsaved-change behavior.
2. Agents
   - Expand from create smoke to full CRUD: edit, delete, type switching, and connected runtime settings persistence.
3. Monitoring
   - Add filter/search/time-range coverage so the page is validated beyond shell render.
4. Schedule
   - Replace environment-dependent checks with hermetic add/edit/run/delete schedule coverage.

## Coverage Standard

For each primary product surface, prefer one named Playwright lane with a clearly declared tier target:

1. `smoke`
   - page render
   - one key affordance
2. `partial`
   - one meaningful mutation or workflow
   - one user-visible success assertion
3. `full`
   - create
   - edit
   - delete or reset/remove
   - unsaved-change guard where applicable
   - one user-visible success assertion
   - one failure-path assertion

The matrix should declare which tier each surface is targeting in the current phase instead of assuming `full` everywhere.
