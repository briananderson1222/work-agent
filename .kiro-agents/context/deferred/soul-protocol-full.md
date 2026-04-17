# Soul Protocol — Full Specification

This file contains detailed specifications deferred from the bootstrap. Load when writing to knowledge files or capturing context.

---

## Two-Tier Memory + Operational State

Memory and operational state are separate concerns with different lifecycles. See `FILING_GUIDE.md` for the full organizational framework.

### Tier 1 — Pointers (Index Entries)

Lightweight entries written automatically after artifact creation in external systems.

**Format:**
```
- [YYYY-MM-DD] [topic/account] One-line summary — source:<system> id:<identifier> tool:<access method>
```

**Example:**
```
- [2026-02-20] [Acme Corp] Architecture review, 3 attendees — source:salesforce id:task-00T123 tool:salesforce_search "acme architecture"
- [2026-02-20] [Acme Corp] Filed SIFT highlight, Q1 migration win — source:sift id:insight-456 tool:sift_insights_fetch
```

At minimum: **date, summary, source system, identifier, and how to access it.** If someone (or an agent) can't get back to the original from the pointer alone, it's incomplete.

**When to write:** After any action that creates an artifact in a destination system (saved document, sent email, logged activity, created ticket, etc.). Write silently — no "want me to save this?" prompt.

**Why this isn't duplication:** The source system has the full record. The pointer makes it findable by date, topic, or account without querying every system.

**Pruning:** Never. Pointers are the permanent ledger. Flag for user review annually if a file exceeds ~200 entries.

### Tier 2 — Curated Knowledge (Permanent)

High-signal insights that matter long-term. Stored in `lessons.md`, `preferences.md`, `decisions.md`, and the Curated Knowledge section of `memory.md`.

**What qualifies:**
- Key wins and technical leadership moments
- Relationship dynamics not captured in source systems
- Cross-system synthesis (connecting dots across tools)
- User corrections and institutional knowledge
- Lessons learned, confirmed preferences, architectural decisions
- Strategic context that shaped direction

**When to write:** Only when genuinely novel context emerges OR the user explicitly asks. For novel context, propose the entry and explain why it's worth keeping.

**Pruning:** Never auto-pruned. User-managed. The agent may suggest consolidation but never deletes without asking.

### Operational State (Separate from Memory)

Session tracking, handoffs, and active task management. These are NOT memory — they have completely different lifecycle rules.

**Files:** `sessions.md`, `continuity.md`, `followups.md`

**When to write:** During active work — session tracking, handoffs, transient facts.

**Pruning:** Automatic and silent.
- Sessions marked "done" >3 days → remove
- Sessions >7 days no activity → mark done and remove
- Handoff notes >7 days → remove
- Completed followups → remove

### Capture Layers

Capture everything — but in the right layer:

| Layer | What | Surfaced in search? | Lifecycle |
|-------|------|---------------------|-----------|
| **Raw** | Unprocessed transcripts, full notes | No — query on demand | Keep indefinitely |
| **Processed** | Structured meeting notes, summaries | Yes | Normal lifecycle per staleness policy |
| **Curated** | Lessons, decisions, confirmed preferences | Yes | Permanent, never auto-pruned |
| **Pointers** | Index entries to any layer or external system | Yes | Permanent ledger |

External systems are the source of truth. Store a pointer, not the content.

### memory.md (extended format)

```markdown
# Memory

## Pointers
<!-- Tier 1: Lightweight pointers. Auto-written. Never pruned. -->
<!-- Format: - [YYYY-MM-DD] [topic] Summary — source:<system> id:<id> tool:<access> -->

## Curated Knowledge
<!-- Tier 2: Long-lived insights. Requires justification. Never auto-pruned. -->

## Archive
<!-- Compacted and historical entries. Loaded on demand. -->
```

**Entry format:**
```
- [YYYY-MM-DD] [importance] Content as a clear, atomic statement.
```

Pointers and Curated Knowledge are **never compacted or auto-pruned**. The agent may suggest consolidation when files grow long, but never deletes without asking.

### Staleness Policy

Content doesn't stay fresh forever. Review triggers by file type:

| File type | Review trigger | Action |
|-----------|---------------|--------|
| Hub pages | Entity has had no activity in 6+ months | Flag for review |
| People files | Person changed roles/companies | Update metadata |
| Workstream folders | No new files in 3+ months | Consider archiving |
| Journal entries | Older than 30 days | Prune unless flagged |
| Operational state | Sessions >7 days, handoffs >7 days | Auto-remove |
| Learning files | Entry contradicted by newer entry | Update or remove |
| Pointers (Tier 1) | Never | Permanent ledger |

---

## Knowledge Domains

Knowledge can be organized into separate domains for different areas of work. Each domain is a subdirectory under `knowledge/` with its own files and structure.

```
knowledge/
├── memory.md               ← Default/general knowledge
├── lessons.md
├── preferences.md
├── decisions.md
├── continuity.md
├── sessions.md
├── followups.md
├── bookmarks.md
├── journal/                ← Daily session logs
│   └── YYYY-MM-DD.md
├── sales/                  ← Domain: sales
│   ├── activities/
│   ├── contacts.md
│   ├── insights/
│   └── plans.md
├── career/                 ← Domain: career
│   ├── highlights.md
│   └── growth.md
└── skills/                 ← Domain: skills
    └── certifications.md
```

### Domain rules

- The root `knowledge/` files (memory, learning, continuity, followups, bookmarks) are the **general domain** — they follow the two-tier model and extension specs defined above.
- Subdirectories are **named domains** with their own structure. The spec does not prescribe their internal format — domains are free-form to match the needs of the area.
- Each domain can have its own files, subdirectories, and conventions.
- The knowledge provider searches across all domains by default. Domain-scoped queries can be directed to a specific subdirectory.
- Domains are declared in `soul.config.yml` under `knowledge.domains` so the sync tool knows where to find and place them.
- The two-tier memory model + operational state (index, working, career) applies to the general domain. Named domains manage their own lifecycle.

### Sync with domains

The sync tool mirrors agent knowledge directories to soul domains bidirectionally. All sync uses `rsync --update` (newer file wins). No format translation.

```yaml
# In soul.config.yml
knowledge:
  domains:
    general:
      source: ~/.agent/knowledge/memories
      dest: ./knowledge
    sales:
      source: ~/.agent/knowledge/sales
      dest: ./knowledge/sales
```

Forward sync (`soul-sync`): copies newer files from agent → soul repo.
Reverse sync (`soul-sync --reverse`): copies newer files from soul repo → agent.

---

## Capture Policy

Capture is continuous, not end-of-session. Session boundaries are unreliable — the user may close the terminal, the context window may truncate, the agent may crash. Write as things happen, not after.

### Capture timing

**Immediate (write now, during the conversation):**
- User says "remember this", "save this", "TODO", "don't forget" → write to the target file immediately
- User corrects a fact or preference → update the relevant file immediately
- An artifact is created in an external system (email sent, ticket filed, document saved) → write a pointer immediately
- User confirms an architectural decision → write to `decisions.md` immediately

**Continuous (append to today's journal as notable things occur):**
- A non-trivial problem was debugged and solved → journal entry with problem + fix
- A design trade-off was discussed (even if not yet decided) → journal entry with context
- New stakeholder or relationship context surfaced → journal entry
- A workflow or tool behaved unexpectedly → journal entry
- Context that would be lost if the session ended now → journal entry

**Background (scheduled job catches what slipped through):**
- Process telemetry or conversation logs for missed capture signals
- Detect patterns across multiple journal entries → curate into lessons/preferences/decisions
- Flag stale sessions, overdue followups, decayed memory
- Prune operational state per lifecycle rules

### Signal classes

When evaluating whether something is worth capturing, classify it:

| Signal | Target file | Confidence needed | Example |
|---|---|---|---|
| User explicitly asks to save | Whatever they specify | None — just do it | "Remember that Acme prefers REST over GraphQL" |
| User corrects agent behavior | `preferences.md` | High — they said it | "No, use tabs not spaces" |
| Artifact created in external system | Pointer in `memory.md` | None — auto-write | Email sent, CR filed, ticket created |
| Something failed and was debugged | `lessons.md` | High — it happened | "build system wipes workspace with no targets" |
| Architectural choice confirmed | `decisions.md` | High — user confirmed | "We're going with DynamoDB over Aurora" |
| Preference inferred from single observation | Nothing yet | Wait for repetition | User used bullet points once |
| Preference confirmed by repetition or statement | `preferences.md` | Medium — pattern seen | User always asks for concise responses |
| Notable event worth future reference | `journal/YYYY-MM-DD.md` | Low — just capture it | "Discussed migration timeline with CTO" |
| Deferred decision or open question | `journal/YYYY-MM-DD.md` | Low — raw capture | "Still deciding between Lambda and ECS" |
| Action item the user didn't explicitly ask to track | Nothing | Don't infer TODOs | Agent noticed a deadline was mentioned |

### Rules

- **Index freely, capture carefully.** Pointers (Tier 1) flow automatically. Curated knowledge (Tier 2) requires the signal to be high-confidence.
- **Don't copy records — index them.** Store a pointer with source, id, and access method — not the full record.
- **Justify before offering.** When proposing to save curated knowledge, state why it has future value. If you can't articulate a reason, don't offer.
- **Hub linking is mandatory.** Every note filed under an entity MUST be linked from that entity's hub. An unlinked note is invisible.
- **Explicit intent for followups.** Only track action items when the user explicitly asks.
- **Journal is cheap, learning files are expensive.** When in doubt, write to the journal. Curate into learning files only when a pattern is confirmed.
- **Never depend on session end.** If something matters, write it now. There may not be a "later."
- **Workstream graduation.** When a topic accumulates 3+ files, graduate it to its own subfolder.

---

## Extension Specifications

### lessons.md

**Purpose:** What went wrong and why — failures, workarounds, non-obvious solutions, unexpected behavior.

**When to add:** Something failed and you figured out why. A workaround was found. A tool behaved unexpectedly. A best practice was discovered.

**When NOT to add:** Routine debugging. One-off errors. Things in project docs.

### preferences.md

**Purpose:** Confirmed user preferences and working conventions.

**When to add:** User explicitly corrects your approach. User states a preference. A convention is confirmed.

**When NOT to add:** Inferred patterns from a single observation. Wait for confirmation or repetition.

### decisions.md

**Purpose:** Architectural choices with rationale.

**When to add:** A design choice is made and confirmed. A technology is chosen with stated rationale. Trade-offs are discussed and a direction is picked.

**When NOT to add:** Tentative explorations. Spikes not yet decided on.

### Entry format (all three)

```
- **YYYY-MM-DD**: Description of the lesson/preference/decision
```

Date-stamp every entry. One insight per line. Don't duplicate — update existing entries if context changed. Periodically prune stale entries and consolidate related ones.

### continuity.md

**Purpose:** Session management — tracking what's in flight, handoffs between sessions, and wind-down.

**Session registry format:**
```markdown
## session-name
- **Directory:** /path/to/working/dir
- **Branch:** git-branch-name
- **Last active:** YYYY-MM-DD
- **Status:** active | paused | stale | done
- **Todos:**
  - Item one
  - Item two
- **Notes:** Key context for resuming
```

**Status values:**
- **active** — currently being worked on
- **paused** — intentionally set aside
- **stale** — no activity >7 days
- **done** — completed

**Handoff format:**
```markdown
## Handoff: YYYY-MM-DD

**Summary:** What was worked on today.

**Project-name** (status)
- Where things stand
- What's next

**Tomorrow:**
- Priority items
```

**Cleanup (automatic, silent):**
- Sessions "done" >3 days → remove
- Sessions stale >7 days → mark done, remove
- Handoffs >7 days → remove

**EOD wind-down (~4 PM local):**
When approaching end of day, casually offer to save context. If accepted, update session entries and write a handoff summary. Don't force it.

### followups.md

**Purpose:** Action items tracked only on explicit user intent.

**Entry format:**
```
- **YYYY-MM-DD** [tag]: Description of the followup
```

**Tags:** `[project]`, `[link]`, `[training]`, `[customer]`, `[internal]`, `[blocked]`

**When to add:** User says "remind me", "TODO", "follow up on", "don't let me forget", "save this link".

**When NOT to add:** Inferred action items. Deferred decisions. Links from natural conversation.

**Pruning:** Remove completed items. Remove items absorbed into active sessions.

### bookmarks.md

**Purpose:** Persistent reference links that survive across sessions.

**Entry format:**
```
- **YYYY-MM-DD** [tag]: Title — URL — One-line description
```

**Tags:** `[docs]`, `[tool]`, `[wiki]`, `[repo]`, `[training]`, `[template]`, `[reference]`, `[external]`

**When to add:** User explicitly says "save this link", "bookmark this", "remember this URL". A link comes up repeatedly across sessions.

**When NOT to add:** Every link in conversation. Links discovered during research. Links findable through source systems.

**On session start:** Don't read out bookmarks. Search only when the user asks for a link.

### journal/ (daily logs)

**Purpose:** Raw capture of notable events, conversations, and context from each session. The unfiltered record that gets curated into lessons, preferences, and decisions over time.

**File format:** One file per day: `journal/YYYY-MM-DD.md`

```markdown
# YYYY-MM-DD

## Session: topic-name
- What was worked on
- Key context, decisions made, problems encountered
- Links to artifacts created

## Session: another-topic
- ...
```

**When to write:** During the session, as notable things occur. Do not wait for session end — there may not be one. Append to today's file whenever context would be lost if the session ended now.

**Relationship to learning files:** Journal entries are raw material. When a pattern emerges across multiple journal entries — a recurring lesson, a confirmed preference, a solidified decision — curate it into the appropriate learning file. The journal captures; the learning files distill.

**Pruning:** Journal entries are raw capture. Entries older than 30 days can be pruned unless flagged as notable. The curated insights in learning files are what persist long-term.

**Context metadata:** When using a search provider that supports collection context (e.g., qmd), add descriptive context to help search understand what's in the journal vs. other domains.

---

## Knowledge Domain Context

Each knowledge domain can have a `context` description in `soul.config.yml`. This metadata serves two purposes:

1. **For humans:** Documents what each domain contains at a glance.
2. **For search providers:** Improves retrieval relevance. Providers like qmd use context to understand which collection is most likely to contain relevant results.

```yaml
domains:
  general:
    dest: ./knowledge
    context: "Personal knowledge: lessons, preferences, decisions, sessions"
  sales:
    dest: ./knowledge/sales
    context: "Sales: activities, contacts, insights, team feedback"
  journal:
    dest: ./knowledge/journal
    context: "Daily session logs: raw capture of notable events"
```

When setting up a search provider, map domain contexts to the provider's metadata system:
- **qmd:** `qmd context add qmd://<collection> "<context>"`
- **kiro-cli:** Context is implicit in the knowledge base name/description
- **file:** Context is documentation only (no search metadata)

---

## Vault-Aware Writing

The `vault` section in `soul.config.yml` declares what markdown features are available. The orchestrator adapts its writing style based on declared features. If no vault is configured, default to `plain` (standard markdown).

### Plain mode (default)

- Standard markdown: headings, lists, links, code blocks
- Reference other files by name in prose: "see decisions.md"
- No frontmatter unless the file template includes it
- Entry format: `- **YYYY-MM-DD**: Description`

### When `wikilinks` is enabled

Connect related entries across files:
- Link to files: `[[decisions]]`, `[[lessons]]`
- Link to specific entries: `[[decisions#bidirectional-sync]]`
- Link from journal to learning: `[[lessons#bash-compat|bash 3.2 lesson]]`

Use wikilinks when an entry references context in another file. Don't over-link — link when the connection adds navigability.

### When `frontmatter` is enabled

Add YAML frontmatter to entries that benefit from structured metadata:
```yaml
---
date: 2026-02-22
tags: [architecture, decision]
type: decision
---
```

Use frontmatter on journal entries and curated knowledge. Skip it on pointers and operational state (too transient to warrant metadata).

### When `tags` is enabled

Use inline `#tags` for categorization:
- `#project/portable-soul` — project scope
- `#account/acme` — account scope
- `#type/lesson`, `#type/decision` — entry type

Tags complement frontmatter tags. Use inline tags for quick categorization in lists; use frontmatter tags for structured queries.

### When `daily-notes` is enabled

Journal entries use the vault's daily notes format. The daily notes plugin auto-creates `knowledge/journal/YYYY-MM-DD.md`. Write session entries as sections within the daily note.

### Feature detection

Read the vault configuration from `soul.config.yml` at session start. If `vault.provider` is `plain` or absent, use standard markdown only. If features are declared, use them. Never use vault-specific syntax that isn't declared — it won't render correctly in other tools.

---

## File Updates

All modifications use the canonical envelope:

```
[SOUL-UPDATE]
target: <filename>
operation: ADD | UPDATE | DELETE
content: |
  <exact new or modified lines>
rationale: <why this change is being made>
[/SOUL-UPDATE]
```

Execute directly in agent mode. One envelope per file per update. `rationale` is required.

---

## Instinct System (Extension)

The instinct system is an optional extension that adds automated pattern detection and confidence-scored learning to the soul protocol. It bridges the gap between raw session activity and curated learning files.

### Architecture

```
Session Activity
    │
    │ Observation hooks capture tool use patterns
    ▼
Observations (JSONL, project-scoped, auto-expires 30 days)
    │
    │ Analysis job detects patterns (3+ occurrences)
    ▼
Instincts (markdown + YAML frontmatter, confidence 0.3-0.9)
    │
    │ Evolution pipeline proposes updates (confidence ≥ threshold)
    ▼
Learning Files (lessons.md, preferences.md, decisions.md)
```

### Instinct Format

Each instinct is a markdown file with YAML frontmatter:

```yaml
---
id: kebab-case-identifier
trigger: "when <specific condition>"
confidence: 0.7
domain: code-style | testing | git | debugging | workflow | security | general
source: session-observation | user-explicit | promoted | imported
scope: project | global
project_id: "<12-char-hash>"      # if scope: project
project_name: "<repo-basename>"   # if scope: project
created: YYYY-MM-DD
last_observed: YYYY-MM-DD
observation_count: N
---

# Title

## Action
What to do (one clear sentence).

## Evidence
- Observed N times in session <id>
- Pattern: <description>
- Last observed: <date>
```

### Confidence Model

| Score | Meaning | Behavior |
|-------|---------|----------|
| 0.3 | Tentative | Suggested but not enforced |
| 0.5 | Moderate | Applied when relevant |
| 0.7 | Strong | Auto-approved for application |
| 0.9 | Near-certain | Core behavior |

Adjustments:
- +0.05 per confirming observation
- -0.1 per contradicting observation
- -0.02 per week without observation (decay)
- Prune below 0.2

### Project Scoping

Instincts are project-scoped by default. Project identity is derived from:
1. Environment variable (highest priority)
2. Git remote URL hash (portable across machines)
3. Git repo root path (fallback, machine-specific)
4. Global (no project context)

Promotion criteria (project → global):
- Same instinct ID in 2+ projects
- Average confidence ≥ 0.8
- Domain is global-friendly (security, general, workflow)

### Evolution Pipeline

Instincts evolve into learning file entries when they reach confidence thresholds:

| Target | Confidence | Observations | Pattern Type |
|--------|-----------|--------------|--------------|
| lessons.md | ≥ 0.85 | 10+ | Error resolution, workaround |
| preferences.md | ≥ 0.8 | 8+ | User correction, style preference |
| decisions.md | ≥ 0.9 | 15+ | Architectural pattern |
| New skill | ≥ 0.8 (cluster avg) | 3+ related instincts | Workflow automation |

Evolution requires user approval. Proposals are surfaced during session initialization and expire after 7 days if not acted on.

### Observation Format

```jsonl
{"timestamp":"ISO-8601","event":"tool_complete|correction|error_resolution|workflow","tool":"tool_name","input":"truncated","output":"truncated","session":"id","project_id":"hash","project_name":"name"}
```

Observations are:
- Project-scoped via git remote detection
- Secret-scrubbed before storage
- Auto-purged after 30 days
- Archived at 10MB file size
- Never synced to remote

### Storage

```
knowledge/instincts/
├── README.md
├── projects.json
├── global/
│   └── <instinct-id>.md
├── projects/
│   └── <project-hash>/
│       ├── project.json
│       ├── observations.jsonl
│       └── instincts/
│           └── <instinct-id>.md
└── proposals/
    └── <proposal-id>.md
```

### Relationship to Existing Extensions

- **lessons.md** — Instincts with `domain: debugging` or error-resolution patterns evolve into lessons
- **preferences.md** — Instincts from user corrections evolve into preferences
- **decisions.md** — Instincts with `domain: architecture` evolve into decisions
- **journal/** — Observations are a structured complement to journal entries (journal is narrative, observations are structured)
- **continuity.md** — Instinct proposals are surfaced during session start alongside session status

### Privacy

- Observations stay local — never synced, never exported without explicit action
- Only instincts (patterns) can be exported — not raw observations
- No actual code or conversation content in instincts
- Secret scrubbing on all observation inputs/outputs
- User controls what gets promoted and evolved
