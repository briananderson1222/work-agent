# Implementation Plan: Tauri Native Features (Tray, Autostart, Scheduler)

## Architecture Decision

**Scheduler lives in the existing Node.js backend** (not a separate sidecar).
**System tray + autostart live in the Tauri Rust layer.**
**The app runs headless-capable** -- closing the window minimizes to tray; backend + scheduler continue running.

Non-Tauri packaging (future): Docker Compose for frontend + backend + scheduler. Tray/autostart are Tauri-only.

---

## Phase 1: System Tray (Rust/Tauri Layer)

### 1.1 Dependencies

Add to `src-desktop/Cargo.toml`:
```toml
[dependencies]
tauri-plugin-shell = "2"
tauri-plugin-autostart = "2"  # Phase 2, but add now
serde = { version = "1", features = ["derive"] }
serde_json = "1"
reqwest = { version = "0.12", features = ["json"] }  # For polling backend status
tokio = { version = "1", features = ["time"] }
```

Add tray capability to `tauri.conf.json`:
```json
{
  "app": {
    "tray": {
      "iconAsTemplate": true
    },
    "windows": [
      {
        "title": "Project Stallion",
        "width": 1200,
        "height": 800,
        "resizable": true,
        "fullscreen": false,
        "visible": true,
        "closable": true
      }
    ]
  },
  "plugins": {
    "autostart": {}
  }
}
```

### 1.2 Tray Icon Assets

Create multiple tray icon states in `src-desktop/icons/`:
- `tray-idle.png` -- Default state (agents idle)
- `tray-active.png` -- One or more agents are processing
- `tray-error.png` -- Agent health check failures
- `tray-badge.png` -- Completed job notification pending

Size: 22x22px (macOS), 16x16 and 32x32 (Windows/Linux). Tauri handles DPI scaling.

### 1.3 Tray Menu Structure

```
[Dynamic Icon]
├── Show / Hide Window          (toggle)
├── ─────────────────
├── Agents
│   ├── agent-1-name     ● Healthy / ◌ Idle / ✖ Error
│   ├── agent-2-name     ● Running job...
│   └── agent-3-name     ◌ Idle
├── ─────────────────
├── Recent Activity
│   ├── "Daily report completed" (2m ago)
│   ├── "Salesforce sync done" (1h ago)
│   └── View All...
├── ─────────────────
├── Scheduled Jobs
│   ├── Next: "Morning briefing" in 2h 15m
│   └── Manage Jobs...
├── ─────────────────
├── Settings
└── Quit
```

### 1.4 Implementation: `src-desktop/src/main.rs`

Major changes:
- Create `TrayManager` that builds and updates the system tray menu
- Spawn a background tokio task that polls `http://localhost:3141/api/monitoring/stats` every 10 seconds
- Update tray icon and agent sub-menu items based on response
- Poll `http://localhost:3141/api/scheduler/upcoming` (new endpoint, Phase 3) for next scheduled job info
- Handle menu item clicks:
  - `show_hide`: Toggle main window visibility
  - `agent_<slug>`: Open window focused on that agent's chat
  - `recent_view_all`: Open window to monitoring view
  - `manage_jobs`: Open window to scheduler view
  - `settings`: Open window to settings view
  - `quit`: Send SIGTERM to Node.js child, then `std::process::exit(0)`

### 1.5 Window Close = Minimize to Tray

Override the window close event in Tauri:
```rust
// In setup, listen for close-requested on the main window
let window = app.get_webview_window("main").unwrap();
window.on_window_event(move |event| {
    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
        api.prevent_close();  // Don't actually close
        window.hide().unwrap();  // Just hide
    }
});
```

This ensures the app keeps running in the background. "Quit" from tray menu is the real exit.

### 1.6 Tauri IPC Commands (New)

```rust
#[tauri::command]
fn get_tray_state(app: AppHandle) -> TrayState { ... }

#[tauri::command]
fn set_autostart(app: AppHandle, enabled: bool) -> Result<(), String> { ... }

#[tauri::command]
fn is_autostart_enabled(app: AppHandle) -> Result<bool, String> { ... }
```

---

## Phase 2: Autostart on Login

### 2.1 Tauri Plugin Setup

In `main.rs`:
```rust
use tauri_plugin_autostart::MacosLauncher;

tauri::Builder::default()
    .plugin(tauri_plugin_autostart::init(
        MacosLauncher::LaunchAgent,
        Some(vec!["--minimized"])  // Start minimized to tray
    ))
```

### 2.2 Frontend: JavaScript API

```typescript
import { enable, disable, isEnabled } from '@tauri-apps/plugin-autostart';
```

Add to `package.json`:
```json
"@tauri-apps/plugin-autostart": "^2.0.0"
```

### 2.3 Settings UI Integration

In the existing `SettingsView`, add a toggle:
- "Launch on startup" -- calls `enable()` / `disable()`
- "Start minimized" -- stored in `.work-agent/config/app.json`
- Show current status via `isEnabled()`

### 2.4 Minimized Start Behavior

When the app launches with `--minimized` flag:
1. Tauri starts, sets up system tray
2. Spawns Node.js backend (same as today)
3. Does NOT show the main window
4. Tray icon appears, backend/scheduler runs in background
5. User clicks tray icon to show window when needed

In `main.rs` setup:
```rust
let args: Vec<String> = std::env::args().collect();
let start_minimized = args.contains(&"--minimized".to_string());

if !start_minimized {
    // Show window (default behavior)
} else {
    // Window exists but hidden; tray icon is visible
    window.hide().unwrap();
}
```

---

## Phase 3: Scheduler Module (Node.js Backend)

This is the largest phase. The scheduler lives in `src-server/` and uses the existing agent runtime.

### 3.1 Scheduler Library Choice

**Recommended: `node-cron`** for simplicity + a custom job persistence layer.

Bree is heavier (uses worker threads) and adds complexity for multi-agent systems. node-cron is lightweight, well-maintained, and we need custom persistence anyway since jobs are defined by users.

Alternative: `croner` -- modern, lightweight, ESM-native, no dependencies. Better fit than node-cron for ESM projects.

### 3.2 New Files

```
src-server/
├── scheduler/
│   ├── index.ts              # SchedulerService class
│   ├── job-store.ts          # Persistence layer (.work-agent/scheduler/)
│   ├── job-runner.ts         # Execution engine (agent calls, tool calls, workflows)
│   ├── job-types.ts          # TypeScript types for jobs
│   └── workflow-engine.ts    # Multi-step workflow execution
├── routes/
│   └── scheduler.ts          # New API routes
```

### 3.3 Job Persistence

Store jobs in `.work-agent/scheduler/jobs.json`:
```json
{
  "jobs": [
    {
      "id": "uuid-1",
      "name": "Morning Briefing",
      "enabled": true,
      "schedule": {
        "type": "cron",
        "expression": "0 9 * * 1-5"
      },
      "action": {
        "type": "agent-conversation",
        "agentSlug": "research-agent",
        "message": "Give me a summary of overnight changes in my Salesforce pipeline",
        "conversationId": null
      },
      "createdAt": "2026-02-14T...",
      "lastRunAt": "2026-02-14T09:00:00Z",
      "lastRunStatus": "success",
      "nextRunAt": "2026-02-17T09:00:00Z"
    },
    {
      "id": "uuid-2",
      "name": "Salesforce Sync",
      "enabled": true,
      "schedule": {
        "type": "interval",
        "intervalMs": 3600000
      },
      "action": {
        "type": "tool-invocation",
        "toolName": "salesforce-query",
        "toolServer": "sat-salesforce",
        "parameters": { "query": "SELECT Id, Name FROM Opportunity WHERE CloseDate = TODAY" }
      }
    },
    {
      "id": "uuid-3",
      "name": "Weekly Report Workflow",
      "enabled": true,
      "schedule": {
        "type": "cron",
        "expression": "0 17 * * 5"
      },
      "action": {
        "type": "workflow",
        "steps": [
          {
            "id": "step-1",
            "type": "tool-invocation",
            "toolName": "salesforce-query",
            "toolServer": "sat-salesforce",
            "parameters": { "query": "..." },
            "outputVariable": "salesforce_data"
          },
          {
            "id": "step-2",
            "type": "agent-conversation",
            "agentSlug": "research-agent",
            "message": "Analyze this Salesforce data and create a weekly summary: {{salesforce_data}}",
            "outputVariable": "report"
          },
          {
            "id": "step-3",
            "type": "agent-conversation",
            "agentSlug": "outlook-agent",
            "message": "Send the following report via email to team@company.com: {{report}}"
          }
        ]
      }
    }
  ]
}
```

Execution history in `.work-agent/scheduler/history-YYYY-MM-DD.ndjson`:
```json
{"jobId":"uuid-1","startedAt":"...","completedAt":"...","status":"success","result":"...","durationMs":4500}
```

### 3.4 SchedulerService Class

```typescript
class SchedulerService {
  private jobs: Map<string, ScheduledJob>;
  private activeCrons: Map<string, CronJob>;  // croner instances
  private jobStore: JobStore;
  private runtime: WorkAgentRuntime;

  constructor(runtime: WorkAgentRuntime, workAgentDir: string) { ... }

  async initialize(): Promise<void> {
    // Load jobs from disk
    // Register all enabled cron/interval jobs
    // Emit 'scheduler:initialized' event
  }

  async addJob(job: JobDefinition): Promise<ScheduledJob> { ... }
  async updateJob(id: string, updates: Partial<JobDefinition>): Promise<ScheduledJob> { ... }
  async removeJob(id: string): Promise<void> { ... }
  async enableJob(id: string): Promise<void> { ... }
  async disableJob(id: string): Promise<void> { ... }
  async runJobNow(id: string): Promise<JobExecution> { ... }  // Manual trigger

  getJobs(): ScheduledJob[] { ... }
  getJob(id: string): ScheduledJob | null { ... }
  getUpcoming(limit?: number): UpcomingJob[] { ... }  // For tray menu
  getHistory(jobId?: string, date?: string): JobExecution[] { ... }

  async shutdown(): Promise<void> {
    // Stop all cron jobs
    // Wait for running executions to complete
  }
}
```

### 3.5 JobRunner - Execution Engine

```typescript
class JobRunner {
  constructor(private runtime: WorkAgentRuntime) {}

  async executeAction(action: JobAction, context: ExecutionContext): Promise<JobResult> {
    switch (action.type) {
      case 'agent-conversation':
        return this.executeAgentConversation(action);
      case 'tool-invocation':
        return this.executeToolInvocation(action);
      case 'workflow':
        return this.executeWorkflow(action);
    }
  }

  private async executeAgentConversation(action: AgentConversationAction): Promise<JobResult> {
    // Use runtime.getAgent(action.agentSlug)
    // Create or resume conversation
    // Send message, collect full response
    // Return result
  }

  private async executeToolInvocation(action: ToolInvocationAction): Promise<JobResult> {
    // Find tool server via runtime
    // Execute tool with parameters
    // Return result
  }

  private async executeWorkflow(action: WorkflowAction): Promise<JobResult> {
    // Execute steps sequentially
    // Pass outputVariable values between steps via template substitution
    // If any step fails, mark workflow as failed (or continue based on config)
    // Return combined results
  }
}
```

### 3.6 API Routes: `src-server/routes/scheduler.ts`

```
GET    /api/scheduler/jobs              # List all scheduled jobs
GET    /api/scheduler/jobs/:id          # Get single job
POST   /api/scheduler/jobs              # Create new job
PUT    /api/scheduler/jobs/:id          # Update job
DELETE /api/scheduler/jobs/:id          # Delete job
POST   /api/scheduler/jobs/:id/enable   # Enable job
POST   /api/scheduler/jobs/:id/disable  # Disable job
POST   /api/scheduler/jobs/:id/run      # Run job immediately
GET    /api/scheduler/upcoming          # Next N upcoming job runs (for tray)
GET    /api/scheduler/history           # Execution history (filterable)
GET    /api/scheduler/history/:jobId    # History for specific job
```

### 3.7 Integration with Existing Runtime

In `WorkAgentRuntime`:
```typescript
// Add to initialize():
this.scheduler = new SchedulerService(this, this.workAgentDir);
await this.scheduler.initialize();

// Add to shutdown():
await this.scheduler.shutdown();

// Register scheduler routes in Hono app
app.route('/api/scheduler', schedulerRoutes);
```

### 3.8 Scheduler Events (SSE)

Emit scheduler events to the existing monitoring SSE stream:
- `scheduler:job:started` -- Job began execution
- `scheduler:job:completed` -- Job finished successfully
- `scheduler:job:failed` -- Job failed with error
- `scheduler:job:skipped` -- Job skipped (previous run still in progress)

These flow through the existing `/api/monitoring/events` SSE endpoint, so the frontend and Tauri tray can both consume them.

---

## Phase 4: Frontend Scheduler UI

### 4.1 New View: `SchedulerView`

Location: `src-ui/src/views/SchedulerView.tsx`

Layout:
```
┌─────────────────────────────────────────────────────┐
│ Scheduled Jobs                        [+ New Job]   │
├─────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────┐ │
│ │ ● Morning Briefing          Every weekday 9am   │ │
│ │   Agent: research-agent     Next: Mon 9:00 AM   │ │
│ │   Last: Success (2m ago)    [Run Now] [Edit] [⋮]│ │
│ ├─────────────────────────────────────────────────┤ │
│ │ ● Salesforce Sync           Every 1 hour        │ │
│ │   Tool: salesforce-query    Next: in 23 min     │ │
│ │   Last: Success (37m ago)   [Run Now] [Edit] [⋮]│ │
│ ├─────────────────────────────────────────────────┤ │
│ │ ◌ Weekly Report Workflow    Fridays 5pm         │ │
│ │   3-step workflow           Next: Fri 5:00 PM   │ │
│ │   Last: Failed (see log)    [Run Now] [Edit] [⋮]│ │
│ └─────────────────────────────────────────────────┘ │
│                                                     │
│ Execution History                                   │
│ ┌─────────────────────────────────────────────────┐ │
│ │ 09:00  Morning Briefing    ✓ Success   4.5s     │ │
│ │ 08:00  Salesforce Sync     ✓ Success   1.2s     │ │
│ │ 07:00  Salesforce Sync     ✓ Success   0.9s     │ │
│ │ ...                                              │ │
│ └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

### 4.2 Job Creation Dialog

A multi-step dialog:
1. **Name & Schedule** -- Job name, cron expression builder (visual) or interval picker
2. **Action Type** -- Choose: Agent Conversation, Tool Invocation, or Workflow
3. **Action Config** -- Depends on type:
   - Agent: Select agent dropdown + message textarea
   - Tool: Select tool dropdown + parameter form (auto-generated from tool schema)
   - Workflow: Step builder (add/remove/reorder steps, each step is agent or tool)
4. **Review & Save**

### 4.3 Cron Expression Builder

Rather than requiring users to type raw cron expressions, provide a visual builder:
- Presets: "Every hour", "Every day at 9am", "Every weekday at 9am", "Every Monday", etc.
- Custom: Day-of-week checkboxes, hour/minute dropdowns
- Advanced: Raw cron input with human-readable preview ("Runs at 9:00 AM on Monday through Friday")

### 4.4 New React Hooks

```typescript
// In @stallion-ai/sdk or src-ui/src/hooks/

useScheduledJobs()          // List all jobs, auto-refresh
useScheduledJob(id)         // Single job details
useSchedulerHistory(opts)   // Execution history with pagination
useSchedulerUpcoming()      // Upcoming runs (for dashboard widgets)
useCreateJob()              // Mutation: create job
useUpdateJob()              // Mutation: update job
useDeleteJob()              // Mutation: delete job
useRunJobNow()              // Mutation: trigger immediate run
```

### 4.5 Navigation Integration

Add "Scheduler" to the existing navigation in the sidebar/header, alongside existing views (Monitoring, Settings, etc.).

### 4.6 Settings View Additions

In existing SettingsView, add:
- **Desktop section** (only shown when running in Tauri):
  - "Launch on startup" toggle
  - "Start minimized" toggle
  - "Show in system tray" toggle
  - "Close to tray instead of quitting" toggle

Use `@tauri-apps/api` detection (`window.__TAURI__`) to conditionally show these settings.

---

## Phase 5: Tray ↔ Backend Integration

### 5.1 Tray Status Polling (Rust)

The Tauri tray manager polls two backend endpoints every 10 seconds:

1. `GET /api/monitoring/stats` -- Agent health statuses (existing)
2. `GET /api/scheduler/upcoming?limit=3` -- Next scheduled runs (new)

Based on responses, it:
- Updates agent sub-menu items with health status icons
- Updates "Next: ..." text in Scheduled Jobs sub-menu
- Changes tray icon if any agent is actively processing

### 5.2 Tray Notification Events

Subscribe to the existing SSE stream (`/api/monitoring/events`) from Rust:
- On `scheduler:job:completed` -- Flash tray icon, update "Recent Activity" menu
- On `scheduler:job:failed` -- Show error icon, optionally send OS notification
- On agent health change -- Update agent status in tray sub-menu

For OS-native notifications, add `tauri-plugin-notification`:
```toml
tauri-plugin-notification = "2"
```

### 5.3 Tray Click Actions

| Menu Item | Action |
|-----------|--------|
| Show/Hide Window | Toggle `window.show()` / `window.hide()` |
| Agent name | `window.show()` + navigate to agent chat via URL query param |
| View All (recent) | `window.show()` + navigate to monitoring view |
| Manage Jobs | `window.show()` + navigate to scheduler view |
| Settings | `window.show()` + navigate to settings view |
| Quit | Graceful shutdown: signal backend, wait, exit |

Navigation from tray to specific views: Tauri emits an event to the frontend via `app.emit("navigate", payload)`, the frontend listens and routes accordingly.

---

## Implementation Order

| Order | Phase | Scope | Estimated Complexity |
|-------|-------|-------|---------------------|
| 1 | **3.2-3.5** | Scheduler core (types, store, runner, service) | Medium |
| 2 | **3.6-3.7** | Scheduler API routes + runtime integration | Medium |
| 3 | **1.1-1.5** | System tray (basic: icon, show/hide, quit) | Low-Medium |
| 4 | **2.1-2.4** | Autostart plugin + minimized start | Low |
| 5 | **4.1-4.3** | Frontend scheduler UI (list + create dialog) | Medium-High |
| 6 | **4.4-4.6** | React hooks, navigation, settings | Medium |
| 7 | **1.3, 5.1-5.3** | Rich tray (dynamic menus, polling, notifications) | Medium |
| 8 | **3.8** | Scheduler SSE events + tray integration | Low |

Start with the scheduler backend (Phases 3.2-3.7) because it's the foundation everything else depends on. The tray and frontend consume it.

---

## New Dependencies Summary

### Node.js (package.json)
```json
{
  "dependencies": {
    "croner": "^9.0.0"     // Lightweight ESM-native cron scheduler
  }
}
```

`croner` is chosen over `node-cron` because:
- Pure ESM (matches project's `"type": "module"`)
- Zero dependencies
- Supports cron expressions + intervals
- TypeScript native
- Smaller bundle size for esbuild

### Rust (Cargo.toml)
```toml
[dependencies]
tauri-plugin-autostart = "2"
tauri-plugin-notification = "2"
reqwest = { version = "0.12", features = ["json"] }
tokio = { version = "1", features = ["time"] }
```

### Frontend (package.json)
```json
{
  "dependencies": {
    "@tauri-apps/plugin-autostart": "^2.0.0",
    "@tauri-apps/plugin-notification": "^2.0.0"
  }
}
```

---

## Key Design Decisions

1. **Scheduler in existing backend, not a sidecar** -- The backend already has the full agent runtime. A separate process would need to duplicate it or add IPC complexity.

2. **croner over Bree** -- Bree uses worker threads and adds significant complexity. croner is lightweight and ESM-native, fitting the existing stack.

3. **Job persistence in JSON files** -- Matches the existing pattern (agents, tools, config all use JSON files in `.work-agent/`). No need for a database for job definitions. History uses NDJSON (same as monitoring events).

4. **Workflow steps are sequential** -- Parallel step execution adds significant complexity (dependency graphs, error handling). Sequential with variable passing covers 95% of use cases.

5. **Tray polls HTTP, doesn't use IPC** -- The backend already exposes everything via HTTP. Having the tray use HTTP means the same data is available regardless of whether it's Tauri or a future Docker-based setup.

6. **Close = hide, Quit = exit** -- Standard desktop app pattern. Users won't accidentally kill their scheduled jobs by closing the window.
