---
name: instinct-review
description: Review and approve instinct evolution proposals. Invoke when the user
  asks to review instincts, see proposals, or when pending proposals are detected
  during session initialization.
---

# Instinct Review

Surface pending instinct proposals and guide the user through approval or dismissal.

## When to Activate
- User says "review instincts", "show proposals", "what have I learned"
- Pending proposals detected during session initialization (Step 6)
- User asks about learned patterns or instinct status

## Workflow

1. **Search proposals** — Read files from `$SOUL_PATH/knowledge/instincts/proposals/` with `status: pending`

2. **Present each proposal** — Show:
   - What it proposes (type, target file, suggested entry)
   - Evidence (source instincts, confidence, observation count)
   - Action required (approve or dismiss)

3. **On approval** — Apply the change to the target file:
   ```
   [SOUL-UPDATE]
   target: <target file>
   operation: ADD
   content: |
     <suggested entry from proposal>
   rationale: Evolved from instinct <id> (confidence <X>, <N> observations)
   [/SOUL-UPDATE]
   ```
   Then mark proposal `status: applied`.

4. **On dismissal** — Mark proposal `status: dismissed`. Reduce source instinct confidence by 0.1.

5. **On expiry** — Proposals past their `expires` date are marked `status: expired` silently.

## Proposal Format

```yaml
---
id: proposal-YYYY-MM-DD-<instinct-id>
type: lesson | preference | decision | skill
target: lessons.md | preferences.md | decisions.md
source_instincts:
  - <instinct-id> (<confidence>, <scope>:<project>)
status: pending | applied | dismissed | expired
created: YYYY-MM-DD
expires: YYYY-MM-DD
---
```

## Rules

- NEVER auto-apply proposals — always require explicit user approval
- Present proposals concisely — one or two sentences per proposal
- Group related proposals when presenting
- Expired proposals are cleaned up silently
