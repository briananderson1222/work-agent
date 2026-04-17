---
name: "sa-meeting-notes"
description: "Post-meeting capture — structures raw notes into territory format with frontmatter, attendees, summary, action items. Handles hub linking and people cards."
---

# Meeting Notes Capture

Capture meeting notes immediately after a meeting while context is fresh. Structures raw input into the territory notes format, connects it to the knowledge graph, and optionally hands off to CRM logging.

## Delegation

| Subagent | Purpose |
|----------|---------|
| tool-crm (if available) | Account lookup, opportunity context |
| tool-notes | Search for existing notes to avoid duplicates |

Search the `-Sales` knowledge base for account context, hub pages, and people cards.

## Step 1: Identify the Meeting

From the user's input (raw notes, pasted text, or verbal description), extract:

- **Account** — which customer/entity is this about?
- **Date** — when did the meeting happen? (default: today)
- **Attendees** — who was there? (names, emails, roles if mentioned)
- **Subject** — what was the meeting about?

If any of these are ambiguous, ask. Don't guess accounts — match against the `-Sales` knowledge base or delegate to tool-crm (if available).

## Step 2: Locate the Account Structure

1. Search the `-Sales` knowledge base for the account's hub page (`_hub-<account>.md`)
2. Read the hub to get:
   - Territory ID and account tag (for frontmatter)
   - Declared initiatives and their keywords (for `initiative:` classification)
   - Existing workstream folders (to determine where the note goes)
   - Known people (to match attendees against existing cards)

If no hub exists, ask the user if this is a new account that needs setup (see sa-organize for new account workflow).

## Step 3: Classify the Note

Determine where the note should be filed:

1. **Check initiative keywords** — does the meeting topic match a declared initiative in the hub?
   - If yes → file under the initiative's workstream folder (e.g., `ai-week/`, `mig-welding/`)
   - If no → file under `meetings/`
2. **Check workstream graduation** — if filing under `meetings/` and the topic already has 3+ files there with a common theme, suggest graduating to a subfolder

**File path:** `{{SOUL_PATH}}/knowledge/sales/notes/<territory>/<account>/<location>/YYYY-MM-DD-short-description.md`

## Step 4: Structure the Note

Transform raw input into the standard format:

```markdown
---
account: "<account-tag>"
type: "meeting"
territory: "<territory-id>"
date: YYYY-MM-DD
status: "review"
tags: ["<account-tag>", "<territory-tag>", "meeting", "<additional-tags>"]
initiative: "<initiative-name>"  # only if classified to one
---

# <Meeting Title>

**Date:** YYYY-MM-DD HH:MM AM/PM TZ
**Location:** Virtual / <Physical Location>

## Attendees

| Name | Role | Notes |
|------|------|-------|
| [[person-file\|Display Name]] | Title, Company | Context |

## Context

Brief paragraph: why this meeting happened, what was the goal.

## Key Discussion Points

### <Topic 1>
- Structured summary of discussion
- Key facts, decisions, positions stated

### <Topic 2>
- ...

## Action Items

- [ ] **Owner** — Description of action item
- [ ] **Owner** — Description of action item

## Related
- [[path/to/related-note|Related Note Title]]

---

> [!note]- Raw Notes
> <user's original unstructured input, preserved verbatim>
> <screenshot embeds if any>
```

### Structuring Guidelines

- **Attendees:** Use wikilinks to people files. Match names against known people in the `-Sales` KB before creating new links.
- **Discussion points:** Group by topic, not by speaker. Attribute key statements to speakers inline. Extract the signal — don't just reformat the raw notes with headers.
- **Action items:** Only include items explicitly stated or clearly committed to. Don't infer TODOs from discussion.
- **Raw notes callout:** Always include at the bottom in a collapsible `> [!note]- Raw Notes` callout. Preserve the user's original text verbatim — typos, shorthand, and all.

## Step 5: Handle Assets

If the user provides screenshots or images:

1. Create `_assets/` directory under the note's parent folder if it doesn't exist
2. Copy images to `_assets/` with descriptive names: `YYYY-MM-DD-description.png`
3. Embed in the note body where contextually relevant: `![[_assets/YYYY-MM-DD-description.png]]`
4. Also embed in the raw notes callout where the `<screenshot>` placeholder appeared

## Step 6: Write the Note

1. Write the structured note to the determined file path
2. Confirm the note was written successfully

## Step 7: Link from Hub

1. Read the account's hub page
2. Add a wikilink to the new note in the appropriate section (matching initiative/workstream, or under Meetings)
3. Maintain chronological order (newest first or newest last — match existing convention in the hub)

## Step 8: People Cards

For each attendee mentioned in the meeting:

1. Check if a people file exists in `{{SOUL_PATH}}/knowledge/sales/people/<first-last>.md`
2. **New person** → create a card using sa-contacts conventions (frontmatter with type, role, company, tags, territories). Populate from available context — don't guess fields you don't have data for. 
3. **Existing person** → add this meeting to their `## Interactions` section
4. Skip interaction updates for internal AWS team members (Brian, Kirsten, etc.) unless the meeting is notably significant for their card

## Step 9: Offer CRM Handoff

After the note is saved and linked:

> "Note captured and linked. Want to log the CRM activity now, or save that for your next activity review?"

- **If now** → invoke sa-activity in quick-log mode with pre-populated context (account, date, attendees, summary from the note)
- **If later** → done. The note will be discoverable by sa-activity Step 4.2 when the user does bulk activity review

Do NOT auto-log CRM activities. The user controls when CRM logging happens.

## Step 10: Capture Evaluation

After note creation, evaluate whether any curated knowledge (sa-capture Mode 2) is warranted:

- **User corrections** during the capture process → auto-capture
- **Cross-system synthesis** that emerged → propose with justification
- **Relationship nuance** not in CRM → propose with justification
- **Routine meeting summary** → skip (the note itself is the record)

## Step 11: Post-Write Processing

**Mandatory final step.** After the note file is written and hub-linked, invoke the universal post-write processor:

```
@sa-post-write note_path=<path-to-the-note-just-written>
```

This handles frontmatter validation, people extraction and linking, wikilink resolution, cross-link discovery, reachability verification, and index rebuild. Do not skip this step.

## Rules

- Always preserve raw notes verbatim in the collapsible callout
- Always link from the hub — an unlinked note is invisible
- Always use wikilinks for people references in the attendees table
- Match initiative classification from the hub's declared initiatives
- Use `status: "review"` in frontmatter — the user can promote to `"final"` later
- Date-prefix filenames: `YYYY-MM-DD-short-description.md`
- Kebab-case for filenames and folder names
- Don't infer action items — only capture what was explicitly stated or committed to
- Don't auto-run sa-organize — mention it if the user wants to rebuild the graph index
