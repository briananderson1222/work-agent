---
name: "sa-boo"
description: "Manage the boo scheduler — create, edit, list, run, and monitor scheduled agent jobs. Use when the user asks to schedule tasks, automate recurring work, check job status, or set up boo for the first time."
tags:
  - boo
  - scheduler
  - automation
  - jobs
  - cron
examples:
  - "Schedule a daily standup summary at 9am"
  - "Show me my scheduled jobs"
  - "Run the good-morning job now"
  - "Set up boo on this machine"
  - "Create a job that checks my email every 30 minutes"
  - "Edit the wrap-up-day job to run at 4pm instead"
  - "Show me the logs for the triage job"
---

# Boo Scheduler Management

You are the boo master. Boo is a cross-platform scheduler daemon for kiro-cli prompts — it runs agent jobs on a schedule or on-demand.

## Setup Check

Before any boo operation, verify boo is available:
```bash
command -v boo && boo daemon status
```

If boo is not installed, guide the user through setup:
```bash
# Install via cargo (requires Rust toolchain)
cargo install --git ssh://git.amazon.com:2222/pkg/BooScheduler boo

# Install as auto-start service (launchd on macOS)
boo install

# Start the daemon
boo daemon start
```

## Core Operations

### List Jobs
```bash
boo list                    # table format
boo list --format json      # machine-readable
```

### Create a Job
```bash
# Recurring (cron)
boo add --name "daily-standup" \
  --cron "0 9 * * 1-5" \
  --agent dev \
  --prompt 'Give me a morning briefing' \
  --dir ~/.boo/workspace/daily-standup \
  --trust-tools 'read,write,knowledge,web_search,web_fetch,thinking,subagent' \
  --timeout 300

# One-shot
boo add --name "quick-task" \
  --at "tomorrow 2pm" \
  --agent dev \
  --prompt 'Run the test suite' \
  --trust-tools 'read,write,shell,glob,grep,code'

# Interval
boo add --name "email-check" \
  --every 30m \
  --agent dev \
  --prompt 'Check for urgent emails' \
  --trust-tools 'read,write,knowledge,web_search,web_fetch,thinking,subagent'
```

Key flags:
- `--agent <name>` — which kiro-cli agent runs the job
- `--trust-tools <list>` — trust only specific tools (preferred — always scope trust explicitly)
- `--trust-all-tools` — auto-approve all tool calls (avoid — use --trust-tools instead)
- `--delete-after-run` — auto-cleanup (avoid — keeps traceability via logs/stats/resume)
- `--timeout <secs>` — kill job after N seconds (default: none)
- `--open-artifact <file>` — file to open on notification click
- `--description <text>` — human-readable description of what this job does
- `--description <text>` — human-readable description

### Run a Job Now
```bash
boo run <name-or-id>                    # background, shows status
boo run <name-or-id> --follow           # stream output (for programmatic use)
boo run <name-or-id> --interactive      # launch interactive session
```

### Edit a Job
```bash
boo edit <name> --cron "0 16 * * 1-5"   # change schedule
boo edit <name> --prompt 'new prompt'    # change prompt
boo edit <name> --agent aws              # change agent
```

### Monitor
```bash
boo status                  # daemon status + next fire times
boo logs <name>             # recent run logs
boo logs <name> -c 20       # last 20 runs
boo stats                   # run statistics for all jobs
boo stats <name>            # stats for specific job
```

### Resume a Previous Session
```bash
boo resume <name>                       # resume latest session interactively
boo resume <name> "follow up question"  # resume with a prompt
boo resume <name> --previous            # pick from session history
```

### Manage Jobs
```bash
boo enable <name>           # enable a disabled job
boo disable <name>          # pause without removing
boo remove <name>           # delete permanently
```

## Conventions

- Job names MUST use the `stallion-` prefix: `stallion-good-morning`, `stallion-wrap-up-day`
- This prefix identifies jobs belonging to this agent system and enables automated resumption discovery
- After the prefix, use kebab-case: `stallion-<descriptive-name>`
- Working directories: `~/.boo/workspace/<job-name>/`
- Artifacts: use `--open-artifact daily-*.html` for jobs that produce HTML reports
- Job names: lowercase, hyphenated with `stallion-` prefix (e.g., `stallion-good-morning`, `stallion-wrap-up-day`)
- Cron timezone: UTC by default, use `--timezone America/Denver` for local
- For delegation jobs (stallion → domain agent), always use `--trust-tools` with an explicit tool list

## Deep Links (for HTML artifacts)

When generating HTML artifacts that reference boo jobs, include deep links:
```
boo://resume/<job>?prompt=<url-encoded-text>  — follow up on a topic
boo://run/<job>                                — trigger a job
boo://open/<job>                               — open latest artifact
```
