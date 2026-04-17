---
name: "sa-capture"
description: "Write to the sales knowledge base — pointers (auto after artifact creation) or curated knowledge (requires justification)."
---

# Capture to Sales Knowledge Base

Write captured context directly to `/Users/anderbs/.kiro-agents/soul/knowledge/sales/`.

## Two Capture Modes

### Mode 1: Pointers (automatic, no prompting)

Pointers are lightweight entries written after a skill creates an artifact
in a destination system (CRM activity, SIFT insight, email sent, etc.). They
make source systems findable and aggregatable without brute-force searching.

**Format:** Date, account/topic, one-line summary, source system, identifier, and access method.

```
- [YYYY-MM-DD] [topic/account] Summary — source:<system> id:<identifier> tool:<access method>
```

**Rules:**
- Write silently — no "want me to save this?" prompt
- Never copy the full record — just the pointer
- At minimum: date, summary, source system, identifier, and how to access it
- If an agent can't get back to the original from the pointer alone, it's incomplete

**Examples:**
```markdown
- [2026-02-20] [Acme Corp] Architecture review, 3 attendees — source:salesforce id:task-00T123 tool:salesforce_search "acme architecture 2026-02-20"
- [2026-02-20] [Acme Corp] Filed SIFT highlight, Q1 migration win $200K ARR — source:sift id:insight-456 tool:sift_insights_fetch
- [2026-02-20] [Acme Corp] Sent follow-up email re: migration timeline — source:email id:thread-abc123 tool:email_search "acme migration"
```

### Mode 2: Curated Knowledge (requires justification)

Curated knowledge is high-signal context that matters for the user's professional
narrative, long-term account strategy, or institutional knowledge. It requires
justification before saving.

**Justification (Required):** Before offering to save, the agent MUST articulate:

1. **What future query would surface this?** — Name a realistic search. If you can't, don't save.
2. **What's the delta?** — What does this entry contain that doesn't exist in any single source system? If the answer is "nothing," write an pointer instead.
3. **What's the shelf life?** — If irrelevant in 2 weeks, it belongs in followups or operational state. If it could matter for a promo doc, account review, or multi-year relationship, it's curated knowledge.
4. **Is this a fact or an inference?** — Only capture what the user stated, confirmed, or corrected. Never save inferred action items, perceived priorities, or guessed next steps.

If the entry fails any of these tests, skip the capture silently.

**Confidence Assessment:**

- **HIGH** (auto-capture): User explicitly requested capture, OR this is a correction/preference the user stated directly
- **MEDIUM** (proactively propose with justification): Novel cross-system synthesis, relationship dynamics not in CRM, strategic insight connecting multiple sources, career-worthy moments (key wins, technical leadership, executive engagement). The agent SHOULD surface these with a clear reason why they're worth keeping — don't wait for the user to ask. The user can always decline.
- **LOW** (skip unless user asks): Single-source data, routine context, information reproducible from source systems

For HIGH confidence, append directly. For MEDIUM, show the proposed entry AND explain why it's worth keeping. For LOW, don't offer.

## Where to Write

Append entries to the matching file in the sales knowledge base:

| Category | File | Use for |
|----------|------|---------|
| `activities` | `activities.md` | Pointers for customer interactions, meetings, internal activities |
| `pfrs` | `pfrs.md` | Pointers for PFRs/CIs filed, plus curated knowledge about product gaps |
| `insights` | `insights.md` | Pointers for SIFT insights created |
| `highlights` | `highlights.md` | Pointers for quarterly highlights submitted, plus curated knowledge (ARR, outcomes, testimonials) |
| `plans` | `plans.md` | Pointers for TAPs created, plus curated knowledge (strategic priorities, competitive landscape) |
| `contacts` | `contacts.md` | People — connection graph, relationship notes, role context |
| `outreach` | `outreach.md` | Pointers for outreach sent, plus curated knowledge (relationship context) |

## Entry Formats

### Pointer Format (Tier 1)

One line per entry. Scannable. Includes source system, identifier, and access method.

```markdown
- [YYYY-MM-DD] [Account] Summary — source:<system> id:<identifier> tool:<access method>
```

### Curated Knowledge Format (Tier 2)

Richer entries for genuinely novel context. Still scannable, but includes the delta.

```markdown
## [Account/Topic Name] — YYYY-MM-DD

**Summary:** What happened, key outcomes
**Delta:** What this entry captures that doesn't exist in any source system
**Sources:** [CRM link], [note URL], [opportunity link]
```

## When to Use

### Pointers (always, after artifact creation)

Write an pointer whenever a skill creates an artifact in a destination system:
- CRM activity logged → pointer in `activities.md`
- SIFT insight created → pointer in `insights.md`
- Highlight submitted → pointer in `highlights.md`
- TAP saved → pointer in `plans.md`
- PFR/CI filed → pointer in `pfrs.md`
- Outreach email sent → pointer in `outreach.md`

These are automatic. No prompting needed.

### Curated Knowledge (selectively, with justification)

Only invoke curated knowledge capture when the workflow produced genuinely novel context:

- **User corrections** — the user corrected an assumption, account name, classification, or approach
- **Cross-system synthesis** — you connected dots across CRM + email + notes that don't exist in any single source
- **Relationship nuance** — meeting dynamics, unspoken concerns, stakeholder preferences not in CRM
- **Strategic context** — decisions, rationale, or competitive intelligence synthesized from multiple sources
- **Career-worthy moments** — key wins, technical leadership, executive engagement, outcomes that matter for promo docs or highlights
- **Explicit user request** — user says "save this", "remember this", "capture this"

Do NOT capture as curated knowledge:
- Raw activity logs (index them instead)
- Email content (index the outreach instead)
- SIFT insights (index them instead)
- Routine meeting summaries without novel context
- Inferred action items the user didn't explicitly state

## People Detection

When capturing any entry that mentions people (attendees, contacts, stakeholders):

1. **Check if sa-contacts skill is available**
2. Only offer contact card updates if:
   - A person is new (not already in contacts.md)
   - A known person's role or company has changed
   - It's been >30 days since a known contact was last updated
3. Do NOT offer for every mention of known, unchanged contacts

## Rules

- Always date-stamp entries
- Always include source system, identifier, and access method in pointers
- Append to existing files, don't overwrite
- One entry per account/topic per interaction
- Hub linking is mandatory for territory notes — link from the entity hub before running sa-organize
- **Always run `@sa-post-write note_path=<path>` after writing any file** — this handles frontmatter validation, people extraction, wikilink resolution, cross-link discovery, reachability verification, and index rebuild

## Decision Checklist

When unsure where to file something, follow this order:
1. What domain does it belong to? → That's your top-level directory
2. Is it about a specific entity? → File under that entity, link from hub
3. Is it a pointer to something in another system? → Tier 1 pointer
4. Is it operational state (session, handoff, followup)? → Operational state files
5. Is it a confirmed lesson, preference, or decision? → Learning files (Tier 2)
6. Is it raw capture you might curate later? → Journal
7. Does this topic have 3+ files already? → Graduate to its own subfolder

## Territory Notes

For detailed meeting notes and customer interaction captures, use the **sa-meeting-notes** skill. It handles the full workflow: structuring raw notes, frontmatter, hub linking, people cards, asset embedding, and raw notes in collapsible callout.

sa-capture remains the utility for pointers (Mode 1) and curated knowledge (Mode 2). sa-meeting-notes calls sa-capture for pointer/curated writes after note creation.
