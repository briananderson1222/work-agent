# Active Sessions

<!-- 
  Registry of all known sessions/workstreams. Updated by the agent on every
  session start and when context is saved. Provides a birds-eye view of
  everything in flight.
  
  Each entry tracks:
  - What it is (project/task name)
  - Where it lives (working directory)
  - Last activity date
  - Status (active / paused / stale / done)
  - Outstanding todos
  - How to resume (conversation ref, branch, etc.)
  
  The agent should:
  - Register new sessions here when starting work in a new context
  - Update "last active" when resuming an existing session
  - Mark sessions "done" when work completes
  - Flag sessions as "stale" if >7 days with no activity
  - Offer cleanup of stale/done sessions periodically
-->
