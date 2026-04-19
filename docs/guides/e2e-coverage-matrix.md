# E2E Coverage Matrix

Snapshot of the primary app surface and its current Playwright coverage.

## Core Nav

| Surface | Current specs | Coverage level | Main gaps |
|---|---|---|---|
| Projects | `project-architecture`, `project-agent-scoping`, coding-layout specs | partial | No durable project CRUD lane covering create, edit, delete, and restore flows |
| Agents | `agents`, `default-agent-workflow`, `builtin-runtime-workflow` | partial | Create is covered, but edit/delete and managed-vs-connected CRUD paths still need explicit regression lanes |
| Playbooks | `playbooks`, `prompts` | partial | Good create/delete coverage, but edit, duplicate, import, and guarded navigation are not covered as a unified lane |
| Registry | `registry`, `registry-install`, `system-registry`, `skills` | partial | Browse/install/detail behavior is covered, but uninstall/update assertions are still not uniform across every catalog tab |
| Connections | `connections-crud`, `connect-modal`, `connect-reconnect-banner`, parts of `settings`, runtime/provider chat specs | full | CRUD lane exists for provider, runtime, and tool-server flows; remaining work is maintenance, not missing ownership |
| Plugins | `plugin-update`, `plugin-system`, `plugin-preview` | partial | Missing full install/remove/update lifecycle across mixed plugin types |
| Schedule | `schedule` | partial | Mostly smoke/conditional job actions; lacks hermetic CRUD coverage for add/edit/delete job flows |
| Monitoring | `monitoring` | smoke | Dedicated smoke only; no filter/search/time-range/assertion lane yet |

## Assessment

- The app is not under-tested overall, but it is under-specified at the **page workflow** level.
- We have many targeted specs for orchestration, onboarding, registry, and provider flows.
- We do **not** yet have a stable CRUD matrix for the full primary nav.
- Regressions like the recent create/save issue slip through because coverage is feature-sliced instead of surface-owned.

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
