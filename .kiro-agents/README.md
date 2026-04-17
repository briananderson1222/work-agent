# ~/.kiro-agents

Standalone agent runtime — no build process, no package manager. Point kiro-cli at `~/.kiro-agents/agents/` and go.

## Structure

```
~/.kiro-agents/
├── agents/          # Agent JSON configs (31 agents)
├── skills/          # Skill definitions with SKILL.md (56 skills)
├── context/         # Shared context: markdown docs, templates, deferred specs
├── scripts/         # Hook scripts: telemetry, soul-env, discover-agents, etc
├── powers/          # MCP server configs per capability (9 powers)
├── prompts/         # Saved prompt templates (sa.daily, pbuild, etc)
├── agent-sops/      # Standard operating procedures
├── evals/           # Eval framework (promptfoo cases, static checks, results)
├── soul/            # Identity, knowledge bases, memories
│   ├── core/        # identity.md, soul.md, user.md
│   └── knowledge/   # memories, sales, aws, career, instincts, journal
└── README.md
```

## Agents

| Agent | Role |
|---|---|
| stallion | Meta-orchestrator — routes to domain agents |
| dev | Development orchestrator with full coding workflow |
| aws | AWS service guidance and architecture |
| sales-sa | Sales/SA workflows — CRM, email, meetings, intel |
| tool-dev | Autonomous coding worker |
| tool-planner | Read-only codebase analysis and execution planning |
| tool-verifier | Implementation verification (build/test/lint) |
| tool-code-reviewer | Code quality review |
| tool-security-reviewer | Security analysis (OWASP, secrets, auth) |
| tool-playwright | Browser automation and visual testing |
| tool-crm | Salesforce CRM access |
| tool-email | Email search and read |
| tool-calendar | Calendar access |
| tool-notes | Notes search (Obsidian, meeting summaries) |
| tool-workplace-chat | Slack search and read |
| tool-sift | Sales field insights and trends |
| tool-aws-information | AWS docs, pricing, Well-Architected |
| tool-aws-operations | AWS account actions and resource management |
| tool-qmd | Semantic search across knowledge bases |
| tool-agent-delegate | Background job execution via boo |
| tool-agent-handoff | Interactive session handoff via boo |
| tool-dependencies-updater | Dependency audit and updates |
| eval-builder | Runs evals, diagnoses failures, fixes prompts/skills, re-verifies |
| tool-explore-* | Codebase exploration (structure, deps, config, entry, patterns, tests) |
| tool-linkedin | LinkedIn prospecting |
| tool-transcripts | YouTube transcript analysis |
| outlook | Outlook email/calendar via MCP |

## Powers (MCP Servers)

| Power | Server | Transport |
|---|---|---|
| playwright | `npx @playwright/mcp@latest` | stdio |
| qmd | `qmd mcp` | stdio |
| salesforce | `salesforce-mcp` | stdio |
| outlook | `outlook-mcp` | stdio |
| aws-billing | `uvx awslabs.billing-cost-management-mcp-server` | stdio |
| aws-knowledge | `uvx mcp-proxy` → knowledge-mcp.global.api.aws | streamable-http |
| aws-iac | `uvx awslabs.aws-iac-mcp-server` + cdk + terraform + ccapi | stdio |
| aws-agentcore | `uvx awslabs.amazon-bedrock-agentcore-mcp-server` | stdio |
| dependency-checker | `npx package-registry-mcp` + `uvx package-version-check-mcp` | stdio |

## Usage

```bash
# Use a specific agent
kiro-cli chat --agent ~/.kiro-agents/agents/stallion.json

# Or set as default agent path
# (depends on your kiro-cli config)
```

## Re-migration

The migration script lives at `~/migrate-to-kiro-agents.sh`. Re-run it anytime to refresh from the source packages. It wipes `~/.kiro-agents/` and rebuilds from scratch — source packages are never modified.
