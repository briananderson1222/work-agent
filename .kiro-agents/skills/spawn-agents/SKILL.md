---
name: "spawn-agents"
description: "Run multiple kiro-cli agents in parallel terminal windows, each with its own working directory and subagent capability."
---

# Spawn Agents in Terminal Windows

Launch multiple kiro-cli agent sessions in separate terminal windows so they run truly in parallel — each with its own context, tools, and ability to spawn subagents.

## Why Not Just Subagents?

Subagents run inside the current process and share the context window. They can't:
- Run long tasks without blocking the orchestrator
- Spawn their own subagents (only one level deep)
- Use interactive tools or prompt the user independently
- Survive if the parent session ends

Spawning in separate terminals gives each agent full autonomy.

## Workflow

### Step 1: PLAN
Understand what the user wants parallelized. Identify:
- How many agents to spawn
- Which agent spec each should use (or default to the current agent)
- The prompt/task for each
- The working directory for each (default: current directory)
- Whether results need to be collected back

### Step 2: SPAWN
For each agent, run a shell command to open a new terminal window with `kiro-cli chat`:

```bash
spawn_agent "<agent>" "<prompt>" "<working_dir>"
```

The function (defined below) handles terminal detection and cross-platform launching.

### Step 3: REPORT
Tell the user:
- How many agents were launched
- Which terminal windows to look for
- How to check on progress (e.g., switch to that terminal)
- If applicable, how results will be collected

## Shell Function

Use this shell function to spawn each agent. Execute it via the `shell` tool:

```bash
spawn_agent() {
  local agent="$1"
  local prompt="$2"
  local workdir="${3:-.}"
  local title="${4:-kiro-$agent}"

  # Build the kiro-cli command
  local cmd="cd '${workdir}' && kiro-cli chat --agent '${agent}' --no-interactive --trust-all-tools -- '${prompt}'"

  case "$(uname)" in
    Darwin)
      # Detect terminal app (preference order)
      local term=""
      for app in iTerm Ghostty Alacritty kitty WezTerm; do
        if [ -d "/Applications/${app}.app" ]; then
          term="$app"
          break
        fi
      done
      term="${term:-Terminal}"

      # iTerm and Terminal.app use AppleScript directly to avoid session restoration loops
      if [ "$term" = "iTerm" ]; then
        local escaped
        escaped=$(printf '%s' "$cmd" | sed 's/\\/\\\\/g; s/"/\\"/g')
        osascript -e "tell application \"iTerm\"
          activate
          create window with default profile command \"${escaped}\"
        end tell"
      elif [ "$term" = "Terminal" ]; then
        local escaped
        escaped=$(printf '%s' "$cmd" | sed 's/\\/\\\\/g; s/"/\\"/g')
        osascript -e "tell application \"Terminal\"
          activate
          do script \"${escaped}\"
        end tell"
      else
        # Other terminals: .command file with self-delete
        local tmp="/tmp/spawn-kiro-${title}-$$.command"
        printf '#!/bin/sh\nrm -f "$0"\nexec %s\n' "$cmd" > "$tmp"
        chmod +x "$tmp"
        open -a "$term" "$tmp"
      fi
      ;;
    Linux)
      for t in x-terminal-emulator gnome-terminal xterm; do
        if command -v "$t" >/dev/null 2>&1; then
          case "$t" in
            gnome-terminal) "$t" -- sh -c "$cmd" & ;;
            *) "$t" -e sh -c "$cmd" & ;;
          esac
          break
        fi
      done
      ;;
    MINGW*|MSYS*|CYGWIN*)
      cmd /C start "$title" cmd /K "$cmd"
      ;;
  esac
}
```

### Spawning Multiple Agents

To spawn multiple agents in one shell call:

```bash
# Define the function first, then call it multiple times
spawn_agent "dev" "Explore the codebase structure" "~/workspace/calendar"
spawn_agent "dev" "Review the PR at https://github.com/org/repo/pull/42" "~/projects/repo"
spawn_agent "aws" "Audit IAM policies for the prod account" "~/infra"
```

Each call is non-blocking — all terminals open near-simultaneously.

## Collecting Results

If the user needs results aggregated:

1. **File-based**: Have each agent write output to a known path (e.g., `<workdir>/result.md`), then read them back after a delay or when the user says "collect results"
2. **Session resume**: Each spawned session can be resumed later with `kiro-cli chat --agent <agent> --resume` in its working directory
3. **Fire and forget**: For independent tasks that don't need coordination, just let them run

## Examples

**"Research three topics in parallel"**:
```
spawn_agent "aws" "Research EKS Fargate pricing for 50 pods" "/tmp/research-eks"
spawn_agent "aws" "Research Aurora Serverless v2 cost model" "/tmp/research-aurora"
spawn_agent "aws" "Compare CloudFront vs Global Accelerator for our use case" "/tmp/research-cdn"
```

**"Prep for a customer meeting while I draft the agenda"**:
```
spawn_agent "dev" "Run the test suite and report failures" "~/.boo/workspace/acme-prep"
spawn_agent "aws" "Research their current architecture questions from the last call" "~/.boo/workspace/acme-research"
```

**"Code review and test in parallel"**:
```
spawn_agent "dev" "Review src/auth.rs for security issues, write findings to review.md" "./auth-review"
spawn_agent "dev" "Write integration tests for the auth module" "./auth-tests"
```

## Notes

- Each spawned agent is a full kiro-cli session — it can use all its tools, spawn its own subagents, and run interactively if `--no-interactive` is omitted
- Working directories are created automatically if they don't exist (add `mkdir -p` before `cd` if needed)
- On macOS, iTerm and Terminal.app use AppleScript to avoid session restoration loops; other terminals use self-deleting `.command` files
- Spawned sessions are independent — if the orchestrator session ends, the spawned agents keep running
- For `--no-interactive` sessions, the terminal window closes when the agent finishes. Omit the flag for sessions that should stay open for follow-up
