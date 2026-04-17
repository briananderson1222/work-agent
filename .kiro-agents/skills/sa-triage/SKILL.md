---
name: "sa-triage"
description: "Scheduled daemon: scan customer emails, propose responses in HTML report with boo:// resume links. READ ONLY."
---

# Email Triage Scanner

Scan recent customer emails, propose responses in an HTML dashboard, and provide resume links for manual follow-up.

## Delegation

| Subagent | Purpose |
|----------|---------|
| tool-email (if available) | Search and read email threads (READ ONLY — no drafts/sends) |
| tool-crm (if available) | Cross-reference sender domains against account list |
| tool-workplace-chat (if available) | Scan team Slack messages from Kirsten, Allie, Sara |

Search the `-Sales` knowledge base for active initiatives matching email topics or accounts.

## Critical Rule: READ ONLY

**Do NOT call `email_draft`, `email_reply`, `email_forward`, `email_send`, or `email_update`.** This skill only reads emails via the tool-email (if available) subagent. All proposed responses are written into the HTML report — the user will refine and send manually via boo://resume links.

## Team Members to Monitor

- Brian Anderson (me — Solutions Architect)
- Kirsten Motley (Account Manager, territory 1)
- Alexandra "Allie" Trent (Account Manager, territory 2)
- Sara Jubak (Manager, sarrgs@amazon.com) — always surface her emails as top-level candidates

## Workflow

1. **Load existing state** — Read `state.json` from the working directory if it exists. This tracks all drafts surfaced today, their status, and when they were first seen.
2. **[P] Search recent emails** — Delegate to tool-email (if available): use the `email_search` tool (NOT `email_inbox`) with `startDate` set to today's date (YYYY-MM-DD), `folder: "inbox"`, and a broad query like `*` or the team member's name. Run parallel searches for each team member. **Deduplicate** results across searches by `message_id` or `conversationId` before processing — the same email may appear in multiple team member searches. Then filter out any emails already tracked in `state.json` (by `message_id` or `conversationId`) so only unprocessed emails proceed to classification. Track a `scan_summary` object with counts: `{ total_found, already_tracked, noise_discarded, candidates }` — this is displayed in the dashboard even when no candidates are found.
3. **Classify and identify candidates** — See "Email Type Classification" and "Candidate Identification" sections below. Every candidate gets a `type` field (`email` or `calendar_invite`) assigned during this step.
4. **Merge with existing state** — For each qualifying thread:
   - If it's new (not in state.json by message ID or thread ID), add it with status `pending`, `first_seen` timestamp, and `scan_count: 1`
   - If it already exists and is `pending`, increment `scan_count` and run the **Response Verification** workflow (see below). Only flip to `responded` with high confidence.
   - Preserve any `dismissed` status from previous scans
5. **[P] Read new threads** — Delegate to tool-email (if available): read the **full thread** (all messages, not just the latest) for any newly added emails. Capture the **complete body** of every message in the thread, all recipients (To, CC), sender, and **received date** (`received_date`) for each message. The `original_body` field in state.json must contain the full untruncated email content — this is displayed in the dashboard's "Original Email" collapsible and is required for accurate draft composition and response verification. Also capture `last_amazon_reply` — the timestamp and sender alias of the most recent @amazon.com reply in the thread (null if none).
5b. **[P] Account & initiative enrichment** — For each new candidate, run in parallel:
   - **Account lookup**: Cross-reference the sender's domain against your account list via tool-crm (if available) (`salesforce_account_search` or equivalent). If a match is found, store `account_salesforce` with `{ name, id, salesforce_url }`. This links the email to the Salesforce account in the dashboard.
   - **Initiative search**: Search the sales knowledge base (territory notes, account hubs) for active initiatives matching the email's `key_topics` or account. If a match is found, store `initiative` with `{ name, summary, source_path }` — a short description and a citation path to the note/hub where the initiative is documented. For calendar invites involving customer accounts, do the same lookup.
6. **[P] Draft responses** — For each new `pending` item:
   - **Emails**: Compose a draft that addresses the specific questions or asks in the thread. If the topic requires technical depth, use available research tools (aws-research, web search, knowledge base) to inform the draft with accurate, specific information. See "Draft Quality Rules" below.
   - **Calendar invites**: No draft needed. Surface in the "Meeting Invites" section of the dashboard instead.
7. **Scan badge calculation** — For each `pending` item, compute the badge from `scan_count` and time since `first_seen`
8. **Reset daily** — If the oldest entry in state.json is from a previous calendar day, archive the old state to `archive/{date}.json` and start fresh
9. **Summarize other emails** — From the search results in step 2, collect all emails that were NOT draft candidates. Group them into a compact summary for the "Other Emails" section of the dashboard. Prioritize emails from Sara Jubak (sarrgs@amazon.com) — always surface those at the top of the other-emails list regardless of category.
9b. **[P] Scan team Slack messages** — If the Slack skill/subagent is available, search for recent DMs and mentions from Kirsten Motley, Allie Trent, and Sara Jubak sent today. For each message worth noting (skip automated notifications, emoji-only reactions, simple acks like "ok" or "👍"):
   - Capture: sender, channel/DM, timestamp, message text, and any thread context
   - Classify as actionable (asks a question or requests something) vs informational (FYI, status update, sharing a link)
   - Include in the "Team Messages" section of the dashboard
10. **Write state.json** — Save the updated state using atomic write (see "Atomic Write Strategy" below)
11. **Generate HTML dashboard** — Write `triage.html` using atomic write (see "Atomic Write Strategy" below)

## Email Type Classification

Every email surfaced by the scanner MUST be classified as one of:

### `email` — Actual email conversation
An email where someone wrote a message expecting a human response. Indicators:
- Has a substantive body (not just meeting logistics or Zoom links)
- Contains questions, requests, information sharing, or discussion
- The sender composed original content

### `calendar_invite` — Meeting invitation or scheduling
A message that is primarily about scheduling a meeting. Indicators:
- Body is predominantly Zoom/Teams/Chime meeting details (meeting ID, passcode, dial-in)
- Subject follows meeting invite patterns ("Invitation:", calendar event titles)
- Purpose is to schedule, reschedule, or cancel a meeting
- No substantive questions or discussion beyond logistics

### Classification rules
- When in doubt, classify as `email` (safer to draft a response than to miss one)
- A reply to a calendar invite that adds substantive discussion is an `email`
- A meeting reschedule with just "Moving this to Thursday" is a `calendar_invite`
- High importance / VIP flags do NOT change the classification — a calendar invite is still a calendar invite even if marked important

### How each type is handled
| Type | Draft? | Dashboard section | Action links |
|------|--------|-------------------|--------------|
| `email` | Yes — address specific questions, research if needed | ⏳ Pending | Refine & Send, Research First, Queue, Dismiss |
| `calendar_invite` | No | 📅 Meeting Invites | Accept & Note, Dismiss |

## Candidate Identification

An email qualifies as a draft candidate if ANY of these are true:
- It's from an external sender (non-@amazon.com) and involves a customer account (cross-reference sender domain against known customer accounts via tool-crm (if available) if needed)
- It involves Allie Trent, Kirsten Motley, or Sara Jubak (from or CC'd)
- The sender matches a known customer account contact

### Discard as noise
- Automated newsletters, LinkedIn notifications, mass distribution lists, job alerts
- Travel notifications (airline seat changes, hotel confirmations)
- System notifications (Quip digests, Obsidian, phonetool)
- Automated calendar notifications (as distinct from actual meeting invites sent by a person)

### Vendor vs customer distinction
- Emails from vendors (event companies, marketing agencies, etc.) that are CC'd to a team member may be surfaced but should be lower priority than direct customer emails
- If the sender domain doesn't match any known customer account AND the email isn't from/CC'd to a team member, it's likely noise — discard it

## Response Verification

**This is the process for determining if a pending thread has been responded to. High confidence only.**

### When to run
- On every scan, for every existing `pending` or `awaiting_customer` item in state.json (type `email` only)
- Do NOT run for `dismissed` items
- For `awaiting_customer` items: re-read the thread to check if the customer has replied since the last scan. If they have, transition back to `pending` (new customer questions need attention) and extract the new questions.
- For `calendar_invite` items, skip verification — they stay pending until dismissed or the meeting passes

### Process
1. **Read the full thread** — Delegate to tool-email (if available): read ALL messages in the conversation thread, not just the latest. You need the complete back-and-forth including full message bodies.
2. **Identify customer questions/asks** — From the thread, extract every question, request, or action item from non-@amazon.com senders. List them explicitly in the `questions` array.
3. **Check for answers** — For each customer question/ask, determine if an @amazon.com employee (not just Brian — could be Kirsten, Allie, or anyone @amazon.com) has answered it in a subsequent message in the thread.
4. **Assess completeness:**
   - **All questions answered AND thread appears concluded** (customer thanked, no open asks, or conversation naturally ended) → status: `responded`, with `response_reason` explaining what was asked and who answered
   - **All questions answered BUT awaiting customer reply** (Amazon replied to everything, but the thread is still active — customer may respond with follow-ups, confirmation, or new questions) → status: `awaiting_customer`, with `response_reason` explaining what was answered and by whom. This keeps the thread visible without triggering urgency.
   - **Some questions answered, some open** → status stays `pending`, with `response_reason` noting what's still open. Update the draft to focus only on the unanswered items.
   - **No questions answered** → status stays `pending`
5. **Flag follow-up opportunities** — If all questions are technically answered but the answers are thin or could benefit from SA depth, note this in `response_reason`: "All questions addressed by [person], but [topic] may warrant a deeper follow-up from Brian."

### What does NOT count as a response
- Calendar accepts/declines (automated by Outlook)
- Forwarded meeting invites appearing in Sent Items
- Other people's messages appearing in your Sent Items folder
- Read receipts
- Any sent item where the body is identical to the original inbound message (it's a forward or calendar artifact, not a reply)

### `response_reason` format
The `response_reason` field must be human-readable and specific:
```
"Customer asked about: (1) MIG welding timeframe, (2) case study materials, (3) logistics control tower demo length. Kirsten addressed #3 (1hr SC3 overview). #1 and #2 still open — may need follow-up from Brian."
```

### Confidence threshold
- Only mark `responded` when you have HIGH confidence that all customer questions are addressed
- If you can't read the full thread (API error, truncated), leave as `pending`
- If the thread is ambiguous (unclear if a question was fully answered), leave as `pending`

## Draft Quality Rules

### For `email` type items
- **Read the full thread** before drafting — understand the complete context, not just the latest message
- **Check who sent the latest messages** — If the most recent message(s) in the thread are from an @amazon.com employee, a draft is likely unnecessary because we already responded. In this case, run Response Verification immediately: if all customer questions are addressed, mark as `responded` and skip drafting. Only draft if the Amazon employee's reply left customer questions unanswered. When drafting IS still needed, the `last_amazon_reply` badge on the card signals lower priority to the user.
- **Identify every question and ask** from the customer/external sender
- **Address each one specifically** in the draft — don't write generic acknowledgments like "Thanks for reaching out" or "Got it, I'll be there"
- **Research when needed** — If the email asks about an AWS service, architecture pattern, pricing, or technical topic, use available tools (knowledge base search, aws-research, web search) to inform the draft with accurate, specific information. This research step can run in parallel with other draft composition.
- **Match the thread's tone** — formal customer email gets a professional response; casual internal thread gets a casual response
- **Flag what you can't answer** — If a question requires information you don't have (internal pricing, customer-specific data), note it in the draft as `[NEEDS INPUT: ...]` so the user knows what to fill in
- **Include the research** — If you researched a topic to inform the draft, include the key findings inline so the user can verify accuracy before sending

### For `calendar_invite` type items
- No draft response needed
- Surface in the Meeting Invites section with: who sent it, what it's about, when the invite was last updated, when the meeting is scheduled for, and who's invited
- For customer meetings, include the `account_salesforce` link and `initiative` context if found during enrichment
- Include an "Accept & Note" action link that lets the user add context when accepting

## State File Format

`state.json` — array of tracked email threads:

```json
[
  {
    "thread_id": "AAMk...",
    "message_id": "AAMk...",
    "sender": "Jane Smith <jane@customer.com>",
    "to": ["anderbs@amazon.com", "kmots@amazon.com"],
    "cc": ["trental@amazon.com"],
    "subject": "Question about EKS migration path",
    "team_member": "Anders",
    "type": "email",
    "received_date": "2026-02-21T14:30:00Z",
    "first_seen": "2026-02-21T14:30:00Z",
    "last_scanned": "2026-02-21T16:00:00Z",
    "scan_count": 3,
    "last_amazon_reply": { "sender": "kmots@amazon.com", "date": "2026-02-21T15:10:00Z" },
    "status": "pending",
    "response_reason": null,
    "questions": [
      {"ask": "Best migration path from ECS to EKS?", "answered_by": null},
      {"ask": "Timeline estimate for migration?", "answered_by": null}
    ],
    "draft": "Here's what I'd recommend for the ECS to EKS migration...",
    "summary": "Customer asking about migration path from ECS to EKS",
    "original_body": "The complete untruncated email body goes here including all thread messages...",
    "key_topics": ["EKS", "ECS migration", "container orchestration"],
    "account_salesforce": { "name": "Acme Corp", "id": "001XXXXXXXXXXXX", "salesforce_url": "https://aws-crm.my.salesforce.com/001XXXXXXXXXXXX" },
    "initiative": { "name": "EKS Migration Phase 2", "summary": "Migrating 12 ECS services to EKS by Q3, starting with non-prod", "source_path": "notes/direct-03/acme-corp/account-planning/eks-migration.md" },
    "invite_date": null,
    "queue_note": null
  }
]
```

### Status values
- `pending` — no response sent yet, or response incomplete. Draft available for `email` type.
- `awaiting_customer` — Amazon employee has responded to all (or most) customer questions, and the thread is now waiting on the customer to reply. Not urgent — tracked separately so it doesn't trigger "Needs Attention" badges. The `response_reason` field explains what was answered and by whom.
- `responded` — all customer questions/asks verified as answered by an @amazon.com employee AND the thread appears concluded (no further action expected). `response_reason` explains what was asked and who answered.
- `dismissed` — user explicitly dismissed via the dashboard

### Type values
- `email` — actual email conversation needing a response
- `calendar_invite` — meeting invitation or scheduling message

### Field notes
- `received_date` — The timestamp when the email/invite was received (from the email headers). Displayed prominently on every card so the user can see at a glance how old the email is.
- `last_amazon_reply` — Object with `sender` (alias) and `date` (ISO timestamp) of the most recent @amazon.com reply in the thread. Null if no Amazon employee has replied. When present, the card shows this as a de-prioritization signal ("Kirsten replied 2h ago").
- `account_salesforce` — Salesforce account match from the user's account list. Object with `name`, `id`, and `salesforce_url`. Null if the sender domain doesn't match any known account. Displayed as a linked account badge on the card. The URL is constructed as `https://aws-crm.my.salesforce.com/{id}` — the base URL defaults to `https://aws-crm.my.salesforce.com` and can be overridden during `configure with crm-base-url=https://your-org.my.salesforce.com`.
- `initiative` — Active customer initiative matching the email's topics or account. Object with `name` (short label), `summary` (1-2 sentence description), and `source_path` (relative path to the knowledge base note). Null if no match found. Displayed as a context block on the card with a citation link.
- `invite_date` — For `calendar_invite` type only: the date/time the meeting is scheduled for (the target event time, not when the invite was sent). Null for `email` type. Displayed prominently on invite cards.
- `original_body` — MUST contain the complete, untruncated email body (or full thread for multi-message conversations). This is displayed in the dashboard's "Original Email" collapsible section and is essential for evaluating draft quality.
- `questions` — Array of customer questions/asks extracted from the thread. Each entry has `ask` (the question) and `answered_by` (null if unanswered, or the name/alias of the @amazon.com employee who answered it).
- `response_reason` — null for pending items with no partial answers. For responded items, a human-readable explanation of what was asked and who answered. For pending items with partial answers, notes what's still open.
- `queue_note` — Reserved for future use. Currently null for all items. The review queue is managed client-side in the HTML dashboard via JavaScript.

## Atomic Write Strategy

This skill runs headless via boo scheduler. If the agent crashes mid-write, a partial `triage.html` or `state.json` corrupts the dashboard. To prevent this, all file writes use an atomic pattern:

1. **Write to a temp file first** — Write the complete content to a timestamped staging file:
   - `state.json` → `.state-{YYYYMMDD-HHmmss}.json`
   - `triage.html` → `.triage-{YYYYMMDD-HHmmss}.html`
   The dot-prefix keeps staging files hidden from casual directory listings.

2. **Verify the write** — Confirm the staging file exists and is non-empty. For `state.json`, verify it's valid JSON. For `triage.html`, verify it contains the closing `</html>` tag.

3. **Archive the current file** — If the current `state.json` / `triage.html` exists, rename it to `archive/state-{YYYYMMDD-HHmmss}.json` / `archive/triage-{YYYYMMDD-HHmmss}.html`. Create the `archive/` directory if needed.

4. **Promote the staging file** — Rename the staging file to the canonical name (`state.json` / `triage.html`).

If the agent crashes between steps 1 and 4, the previous good file is still intact at the canonical path. The staging file is just an orphan that gets cleaned up on the next successful run.

**Cleanup**: At the start of each scan, delete any orphaned staging files (`.state-*.json`, `.triage-*.html`) from previous failed runs. Keep the `archive/` directory — it's also used by the daily reset (step 8).

## HTML Dashboard Format

Generate a self-contained `triage.html`. The dashboard is cumulative — it shows everything from today, grouped by status and type.

**MANDATORY**: Read the HTML template from `templates/triage.html` in this skill's directory. The template contains the full CSS, HTML structure with section comments, and queue JavaScript. Emit it verbatim, populating the placeholder values with actual data.

### Scan Badges

Based on `scan_count` and time since `first_seen`:
- `scan_count` = 1: `<span class="age-badge age-new">1st scan · just now</span>` — draft class: default
- `scan_count` = 2–3: `<span class="age-badge age-aging">Scan #{scan_count} · first seen {relative_time_since_first_seen}</span>` — draft class: `aging`
- `scan_count` >= 4: `<span class="age-badge age-urgent">Scan #{scan_count} · first seen {relative_time_since_first_seen}</span>` — draft class: `urgent`

The badge shows both the scan cycle count and how long ago the item was first surfaced (e.g. "Scan #3 · first seen 1h ago"). This tells the user at a glance whether something is new or has been sitting across multiple runs.

### Action Links per Draft

**Pending email items** get four links:

1. **"Refine & Send"** (btn-primary):
```
boo://resume/triage?prompt=Reply%20to%20{sender}%20about%20"{subject}".%20Draft%20ready%20for%20review.%20Addressee:%20{team_member}.
```

2. **"Research First"** (btn-secondary):
```
boo://resume/triage?prompt=Research%20{key_topics}%20before%20replying%20to%20{sender}%20about%20"{subject}".%20Then%20refine%20draft%20for%20{team_member}.
```

3. **"📋 Queue"** (btn-secondary, JavaScript) — client-side queue button, NOT a boo:// link:
```html
<button class="btn btn-secondary" onclick="addToQueue(this)">📋 Queue</button>
```
Clicking opens an inline text input for the user's note. On submit, the card is visually marked as queued and added to the sticky queue panel. See "Review Queue (Client-Side JavaScript)" section for full implementation.

4. **"Dismiss"** (btn-dismiss):
```
boo://resume/triage?prompt=Dismiss%20the%20draft%20for%20{sender}%20about%20"{subject}".%20Mark%20as%20dismissed%20in%20state.json.
```

**Calendar invite items** get two links:

1. **"Accept & Note"** (btn-secondary):
```
boo://resume/triage?prompt=Accept%20meeting%20invite%20from%20{sender}%20about%20"{subject}".%20Add%20context%20notes.
```

2. **"Dismiss"** (btn-dismiss):
```
boo://resume/triage?prompt=Dismiss%20the%20invite%20from%20{sender}%20about%20"{subject}".%20Mark%20as%20dismissed%20in%20state.json.
```

**Responded items** show: `<span class="responded-label">✓ Responded</span>` followed by the `response_reason` in a `.response-reason` div explaining what was asked and who answered.

**Dismissed items** show: `<span class="dismissed-label">Dismissed</span>`

## Auth Failure Handling

If email delegation fails because the tool-email (if available) subagent reports no tools available, or if the MCP server fails to load, this is likely an expired auth session (mwinit). When this happens:

1. Set a flag `auth_error: true` in the scan context
2. Still write `state.json` (preserve existing state, don't clear it)
3. Generate `triage.html` with an error banner at the top (before any sections):

```html
<div class="error-banner">
  <h3>⚠️ Auth Expired — Email Scan Failed</h3>
  <p>The email service couldn't connect this scan. This usually means your Midway session expired.</p>
  <div class="actions">
    <a href="boo://resume/triage?prompt=My%20auth%20was%20expired.%20I%20just%20ran%20mwinit.%20Please%20re-run%20the%20full%20triage%20scan%20now." class="btn btn-primary">🔄 Retry Scan</a>
    <a href="boo://resume/triage?prompt=Show%20me%20the%20logs%20from%20the%20last%20triage%20run.%20Run%20boo%20logs%20triage%20--count%201%20--output" class="btn btn-secondary">📋 View Logs</a>
    <span style="margin-left:0.5rem; color:#999; font-size:0.8rem;">Run <code>mwinit -s</code> first, then click Retry</span>
  </div>
</div>
```

4. Keep any existing pending/responded/dismissed items from `state.json` visible below the banner — don't hide them just because this scan failed.

## Dismiss Handling

When resumed with a dismiss prompt, update `state.json` to set the matching entry's status to `dismissed`, then regenerate `triage.html`.

## Surface Handling

When resumed with a surface prompt (from the "Other Emails" section), search for the referenced email, read the full thread, classify it, and add it to `state.json` as a new `pending` entry. Then regenerate `triage.html`.

## Review Queue (Client-Side JavaScript)

The review queue is managed entirely in the browser via JavaScript embedded in `triage.html`. No round-trip to boo is needed to add or remove items — the queue lives in-memory until the user clicks "Resume Queue", which fires a single `boo://resume` link with the full manifest.

### How It Works

Each pending email card gets a "📋 Queue" button (instead of a boo:// link). Clicking it:
1. Expands an inline text input below the button: `<input placeholder="What to follow up on...">`
2. User types their note and hits Enter (or clicks a ✓ confirm button)
3. The card visually transitions to "queued" state (purple left border, note displayed)
4. The item is added to an in-memory `queue[]` array
5. A sticky queue panel appears at the bottom of the page showing all queued items

### Required Data Attributes

Each pending email `.draft` card MUST include data attributes so JavaScript can reference the email metadata:

```html
<div class="draft" data-thread-id="{thread_id}" data-sender="{sender}" data-subject="{subject}" data-team-member="{team_member}" data-summary="{summary}">
```

### Queue Panel

A sticky panel at the bottom of the viewport, hidden when queue is empty:

```html
<div id="queue-panel" style="display:none;">
  <div class="queue-panel-header">
    <span>📋 Review Queue (<span id="queue-panel-count">0</span>)</span>
    <a id="resume-queue-btn" class="btn btn-primary">▶️ Resume Queue</a>
  </div>
  <div id="queue-panel-items"></div>
</div>
```

### JavaScript

The queue script is already included in the HTML template above (inside `<script>` tags before `</body>`). The agent MUST emit the script verbatim when generating `triage.html`. The script manages the `queue[]` array, handles add/remove/unqueue operations, updates the sticky panel, and builds the `boo://resume` URL with the full manifest on "Resume Queue" click.

### CSS for Queue UI

The queue-related CSS is already included in the `<style>` block of the HTML template above (`.queue-input-row`, `.queue-input`, `#queue-panel`, `.queue-item`, etc.). No additional styles needed.

### Action Link Change

The "Queue" button on pending email cards is NO LONGER a `<a href="boo://...">` link. Instead, emit it as:

```html
<button class="btn btn-secondary" onclick="addToQueue(this)">📋 Queue</button>
```

The other action links (Refine & Send, Research First, Dismiss) remain as `<a href="boo://...">` links unchanged.

## Resume Queue Handling

When resumed with a "Resume Queue" prompt (from the queue panel's boo:// link), the prompt contains the full manifest of queued items with notes. Batch-process them:

1. **Parse the manifest** — The prompt contains a numbered list of items with sender, subject, and user notes. Parse each entry.
2. **Load state.json** — Read the current state to get full context (original_body, draft, questions) for each referenced thread.
3. **Present the queue summary** — Show the user a numbered list confirming what will be processed:
   ```
   📋 Review Queue — {count} items

   1. {sender} — "{subject}"
      📝 Note: {note}

   2. {sender} — "{subject}"
      📝 Note: {note}

   Processing all items now. I'll use your notes to guide each draft.
   ```
4. **[P] Re-draft each item** — For each item, compose a refined draft that incorporates the user's note as guidance. The note tells you what the user wants to emphasize, follow up on, or address differently from the auto-generated draft. Research as needed. Run drafts in parallel where possible.
5. **Present drafts for review** — Show each refined draft in the conversation (following the sa-email "Compose In-Chat First" pattern). For each:
   - Show the original email context
   - Show the user's note
   - Present the refined draft
   - Ask for approval or edits
6. **Execute approved drafts** — For each draft the user approves, use the orchestrator's write tools (`email_reply`, `email_draft`, `email_send`) to create/send the response. This is the one place where the READ ONLY rule is relaxed — the user has explicitly opted into sending by clicking "Resume Queue" and approving each draft.
7. **Update state.json** — Mark each processed item as `responded` with `response_reason` noting it was sent via queue review.
8. **Regenerate `triage.html`** — Reflect the updated statuses.

### Resume Queue is Interactive

Unlike the scheduled scan (which is unattended), Resume Queue is a user-initiated interactive session. The agent SHOULD:
- Present each draft and wait for user feedback before sending
- Allow the user to skip individual items ("skip this one for now")
- Allow the user to edit notes mid-queue ("actually, for this one I want to mention X instead")
- Skipped items stay `queued` with their original notes

## Daily Archive

At the start of each scan, if `state.json` contains entries from a previous calendar day:
1. Copy `state.json` to `archive/{YYYY-MM-DD}.json`
2. Start with a fresh empty state

This keeps the dashboard focused on today while preserving history.

## Notes

- This skill runs unattended via boo scheduler. Do not ask questions or wait for input.
- Track the number of tool calls you make during the scan. Include the count and wall-clock duration in the HTML footer.
- Always write both `state.json` and `triage.html`, even if no new emails found.
- Search scope is today (startDate = today's date). Emails already in state.json are skipped. This means the first run of the day processes everything, and subsequent runs only pick up new arrivals.
- If an email clearly needs escalation (production outage, security incident), use the `urgent` class regardless of age.
- The HTML must be fully self-contained (inline CSS, no external resources) so it renders correctly when opened from a notification click. MANDATORY: Use dark mode colors exactly as specified in the CSS template above (background `#1a1a2e`, text `#e0e0e0`, cards `#16213e`). Do NOT use light mode colors like white backgrounds or dark text on light backgrounds.
- MANDATORY: Always include the "Other Emails" section (`<div class="other-emails">`) showing non-customer emails from the search results. Emails from Sara Jubak (sarrgs@amazon.com) must appear first with `class="sender priority"`. Cap at 15 items. If there are no other emails, omit the section.
- The HTML footer MUST include a "View Boo Logs" link using `boo://resume/triage` that prompts the agent to run `boo logs triage --count 1 --output`. This lets the user verify the scheduled run completed correctly and debug any issues.
- When resumed with an auth refresh prompt, re-run the full triage scan workflow from step 1. The user will have already run `mwinit -s` before clicking the retry button.
- The "Other Emails" section should be compact — one line per email, no drafts. Emails from Sara Jubak (sarrgs@amazon.com) are always shown first with the `priority` CSS class on the sender name. Cap at 15 items max.
- Each "Other Email" entry includes a small "Surface" link so the user can promote it to a draft candidate from the dashboard.
