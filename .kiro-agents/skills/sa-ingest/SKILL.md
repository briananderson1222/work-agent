---
name: sa-ingest
description: "Classify and route incoming content to specialized handlers (sa-meeting-notes, sa-capture, transcript-research) or generic fallback. Handles synthesis filing."
---

# Ingest Router

Spec authority: `KNOWLEDGE_SYSTEM.md §2` — Ingest Routing (classification, routing, fallback). Synthesis schema: `KNOWLEDGE_SYSTEM.md §1`. Inbox rules: `FILING_GUIDE.md §10`. Filing decision checklist: `FILING_GUIDE.md §18`.

## Inputs

| Parameter | Required | Description |
|-----------|----------|-------------|
| `content` | Yes | The content to ingest — pasted text, URL, file path, or description |
| `type_hint` | No | Caller-supplied type override (meeting notes, research, document, transcript, url, paste) |
| `domain_hint` | No | Caller-supplied domain override (sales, research, career, general) |
| `entity_hint` | No | Caller-supplied entity name override |

## Workflow

### Step 1 — Classify

Determine three things from the content and any hints provided:

**Input type** — one of:
| Type | Signals |
|------|---------|
| `meeting-notes` | Attendees list, action items, date + account context, "meeting" / "call" / "sync" in title |
| `transcript` | Speaker-labeled turns (`Speaker:` or `[Name]:` patterns), raw dialogue, timestamps |
| `research-article` | Abstract, citations, byline, publication name, academic or thought-leadership structure |
| `document` | Formal structure (sections, headings), no meeting signals, not a research article |
| `url` | Content is a URL or begins with `http://` / `https://` |
| `raw-paste` | Unstructured text that doesn't match any above pattern |

**Domain** — `sales`, `research`, `career`, or `general`. Use content signals (account names, customer context → sales; papers/articles → research; performance/growth → career; everything else → general).

**Entity** — the specific account, project, or topic within the domain, if determinable.

If `type_hint`, `domain_hint`, or `entity_hint` are provided, use them as authoritative overrides.

### Step 2 — Route

Check the input type against the specialized handler table:

| Input type | Condition | Handler |
|------------|-----------|---------|
| `meeting-notes` | Always | `@sa-meeting-notes` — pass raw content |
| `transcript` | Domain is `sales` or entity is a known account | `@sa-meeting-notes` — pass raw content |
| `transcript` | Domain is `research` | `@transcript-research` — pass raw content |
| `research-article` | Always | `@sa-capture` Mode 2 — curated knowledge capture |
| `url` | Always | Fetch content, re-classify, re-route |
| `document` | No specialized handler | Proceed to Step 3 (generic fallback) |
| `raw-paste` | No specialized handler | Proceed to Step 3 (generic fallback) |

If a specialized handler is invoked, **stop here** — the handler owns the rest of the workflow.

### Step 3 — Generic Fallback

For `document` and `raw-paste` types (and any type with no matching handler):

1. **Summarize** the content into a concise narrative (key points, context, any action items explicitly stated).
2. **Confirm domain and entity** using `FILING_GUIDE.md §18` decision checklist. If still ambiguous after analysis, proceed to Step 4 (inbox).
3. **Determine file path:** `$SOUL_PATH/knowledge/<domain>/<entity>/YYYY-MM-DD-<slug>.md`
4. **Write the note** with frontmatter:

```yaml
---
type: note
date: YYYY-MM-DD
domain: <domain>
entity: <entity>
tags: ["<domain>", "<entity-slug>", "ingest"]
source: ingest
---
```

Body: the summary from step 1, followed by a collapsible raw callout:

```markdown
> [!note]- Raw Content
> <original content verbatim>
```

5. Call `@sa-post-write note_path=<absolute-path>`.

### Step 4 — Inbox Fallback

If domain or entity cannot be confidently determined after Step 3 analysis:

1. Write the content to `$SOUL_PATH/knowledge/_inbox/YYYY-MM-DD-<slug>.md` — no frontmatter required.
2. Prepend an explanation block:

```markdown
> [!warning] Unfiled — needs review
> **Why it's here:** <what was ambiguous — domain unclear, entity unknown, etc.>
> **Possible domain:** <best guess if any>
> **Possible entity:** <best guess if any>
```

3. Do NOT call sa-post-write — inbox content is unprocessed by design (FILING_GUIDE.md §10).
4. Tell the user: "Filed to inbox — couldn't confidently determine [domain/entity]. Review `_inbox/YYYY-MM-DD-<slug>.md` and re-run with `domain_hint` and `entity_hint` when ready."

### Step 5 — Synthesis Filing (conditional)

After any workflow path completes, evaluate whether the content is a synthesis:

A synthesis qualifies when **all three** are true:
- It was generated in response to a specific query (not raw input)
- It draws from 3 or more distinct source notes or documents
- It produces a coherent narrative, not just a list of pointers

If it qualifies, offer to file it as a synthesis artifact per `KNOWLEDGE_SYSTEM.md §1`:

```yaml
---
type: synthesis
date: YYYY-MM-DD
last_updated: YYYY-MM-DD
trigger: "<the query or prompt that generated this>"
status: point-in-time
sources:
  - <relative-path-or-identifier-1>
  - <relative-path-or-identifier-2>
  - <relative-path-or-identifier-3>
tags: ["synthesis", "<domain>", "<entity-slug>"]
---
```

File path: `$SOUL_PATH/knowledge/<domain>/<entity>/syntheses/YYYY-MM-DD-<slug>.md`

Call `@sa-post-write note_path=<synthesis-path>` after writing.

Do NOT auto-file syntheses — always offer and confirm with the user first.

## Rules

- **Never guess domain or entity** — a misfiled note is worse than an unfiled one (KNOWLEDGE_SYSTEM.md §2 Fallback).
- **Inbox over misfiling** — when in doubt, use Step 4.
- **Specialized handlers own their workflow** — once delegated, do not duplicate their steps.
- **Synthesis requires 3+ sources** — don't offer synthesis filing for single-source summaries.
- **Synthesis status is always `point-in-time`** — never omit this field.
- **Always call sa-post-write** in the generic fallback path — never skip it.
- **Raw content is always preserved** — include verbatim in a collapsible callout.
