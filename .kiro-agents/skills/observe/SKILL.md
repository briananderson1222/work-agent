---
name: observe
description: Capture notable session patterns for the continuous learning system.
  Invoke when corrections, error resolutions, or repeated workflows are detected.
---

# Observe

## When to Activate
- User corrects agent behavior ("no, use X instead")
- An error is resolved after debugging
- A workflow pattern repeats 3+ times in a session
- User explicitly says "learn this" or "remember this pattern"

## Action
Write an observation entry to the knowledge base:

```json
{
  "timestamp": "ISO-8601",
  "event": "correction|error_resolution|workflow|explicit",
  "tool": "tool_name",
  "context": "what happened",
  "resolution": "what worked",
  "project_id": "<git-remote-hash>",
  "project_name": "<repo-basename>",
  "session_id": "<session-id>"
}
```

Use the knowledge tool to append to the observations collection.
Do NOT capture: routine tool calls, file reads, simple queries.
Only capture high-signal events that indicate a learnable pattern.
