# @stallion-ai/contracts

Canonical cross-package contract ownership for Stallion.

Use `@stallion-ai/contracts/*` when you need stable API/domain shapes shared across `src-server`, `packages/sdk`, `packages/cli`, plugins, or tests. New code should import these modules directly instead of reaching through `@stallion-ai/shared`.

## Ownership rules

- Put stable cross-package types here.
- Keep module boundaries domain-oriented: `agent`, `auth`, `catalog`, `config`, `knowledge`, `layout`, `notification`, `orchestration`, `plugin`, `project`, `provider`, `runtime`, `runtime-events`, `scheduler`, `tool`.
- Do not put runtime helpers, parsers, build helpers, or Node-only utilities here.
- Use `@stallion-ai/shared` root only for compatibility re-exports. Runtime helpers belong on explicit subpaths such as `@stallion-ai/shared/parsers`, `@stallion-ai/shared/build`, and `@stallion-ai/shared/git`.
- Server-only provider interfaces do not belong here. Keep those in `src-server/providers/provider-interfaces.ts` or `src-server/providers/model-provider-types.ts`.

## Modules

| Module | Owns |
|---|---|
| `@stallion-ai/contracts/acp` | ACP connection config and ACP connection status values |
| `@stallion-ai/contracts/agent` | Agent specs, metadata, tools, slash commands |
| `@stallion-ai/contracts/auth` | Auth status, renew results, user identity/detail models |
| `@stallion-ai/contracts/catalog` | Registry items, install results, prompts, playbooks, skills |
| `@stallion-ai/contracts/config` | App config and template variables |
| `@stallion-ai/contracts/knowledge` | Knowledge namespaces, tree/search/document metadata |
| `@stallion-ai/contracts/layout` | Layout definitions, tabs, prompts, templates |
| `@stallion-ai/contracts/notification` | Notification payloads and actions |
| `@stallion-ai/contracts/orchestration` | Connected-agent/orchestration request and response shapes |
| `@stallion-ai/contracts/plugin` | Plugin manifests, previews, overrides, conflicts |
| `@stallion-ai/contracts/project` | Project config and metadata |
| `@stallion-ai/contracts/provider` | Provider kinds and provider-facing contract enums/types |
| `@stallion-ai/contracts/runtime` | Session metadata, workflow metadata, runtime responses |
| `@stallion-ai/contracts/runtime-events` | Runtime event stream payloads |
| `@stallion-ai/contracts/scheduler` | Scheduler jobs, stats, capabilities, notifications |
| `@stallion-ai/contracts/tool` | Tool definitions, permissions, connection configs |

## Import examples

```ts
import type { AgentSpec } from '@stallion-ai/contracts/agent';
import type { PluginManifest } from '@stallion-ai/contracts/plugin';
import type { SessionMetadata } from '@stallion-ai/contracts/runtime';
import type { ToolDef } from '@stallion-ai/contracts/tool';
```

## Compatibility

`@stallion-ai/shared` still re-exports many of these types so older code can compile during convergence. That is a compatibility layer, not the canonical ownership model. New code should import the owning `@stallion-ai/contracts/*` module directly.

Server-only provider interfaces now live directly in `src-server/providers/provider-interfaces.ts`, `src-server/providers/provider-contracts.ts`, and `src-server/providers/model-provider-types.ts`. The old `src-server/providers/types.ts` barrel was removed during convergence.
