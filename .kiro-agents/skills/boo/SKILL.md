---
name: "boo"
description: "Reference for the boo scheduler daemon — capabilities, deep links, job management. Foundation for schedule-prompt and sa-triage."
---

## Availability Check
Before using boo commands, verify the CLI is installed:
```bash
command -v boo >/dev/null 2>&1 && echo 'boo available' || echo 'boo not installed'
```
If boo is not installed, inform the user and skip boo-dependent operations.

## Deep Links
If ~/Applications/BooURL.app exists, these deep links are available (include in HTML artifacts when relevant):
- `boo://resume/<job>?prompt=<url-encoded-text>` — follow up on a topic
- `boo://run/<job>` — trigger a job
- `boo://open/<job>` — open latest artifact

## List Jobs
To get current scheduled jobs: `boo list --format json`

# Boo CLI Reference

`boo` is a cross-platform scheduler daemon that runs kiro-cli prompts on cron schedules, manages artifacts, and supports deep links for interactive follow-up.

## Discovery

Always run `boo <subcommand> --help` to discover exact flags — defer to the CLI as source of truth.

## Commands

| Command | Purpose |
|---------|---------|
| `boo add` | Add a scheduled job (cron, prompt, agent, working dir) |
| `boo edit` | Modify an existing job's settings |
| `boo remove` | Remove a job by ID or name |
| `boo list` | List all jobs with next fire times |
| `boo enable` / `disable` | Toggle a job without deleting it |
| `boo run` | Run a job immediately, output to terminal |
| `boo resume` | Resume an interactive kiro-cli session from a previous run |
| `boo next` | Preview next N occurrences of a cron expression |
| `boo logs` | Show recent run logs for a job |
| `boo stats` | Show run statistics |
| `boo status` | Show daemon status |
| `boo daemon` | Start the scheduler daemon |
| `boo install` / `uninstall` | Manage auto-start service |

## Deep Links

Boo supports `boo://` URI scheme for linking from HTML artifacts back to interactive sessions:

| Link | Purpose |
|------|---------|
| `boo://resume/<job>?prompt=<url-encoded-text>` | Follow up on a topic from a previous run |
| `boo://run/<job>` | Trigger a job immediately |
| `boo://open/<job>` | Open the latest artifact for a job |

Use these in HTML artifacts (dashboards, reports) to let the user click through to interactive follow-up.

## Job Concepts

- **Scheduled jobs** run on cron expressions via the daemon
- **One-shot jobs** use `boo add --at now --delete-after-run` for immediate execution
- **Artifacts** are HTML files a job produces (e.g., `daily-*.html`, `drafts.html`)
- **Working directory** (`--working-dir`) sets where the job runs and stores artifacts
- **Trust** (`--trust-all-tools`) allows the agent to use tools without prompting (for unattended runs)

## Conventions

- Job names MUST use the `stallion-` prefix: `stallion-good-morning`, `stallion-wrap-up-day`, `stallion-email-triage`
- This prefix identifies jobs belonging to this agent system and enables automated resumption discovery
- After the prefix, use kebab-case: `stallion-<descriptive-name>`
- Artifacts live in `~/.boo/workspace/<job-name>/`
- Logs are per-job and viewable with `boo logs <job> [--count N] [--output]`
