---
name: "sa-contacts"
description: "Look up, create, or update contact cards — customers, partners, colleagues. Manages metadata, interaction history, and connection graph."
---

# Contact Management

Manage individual contact cards as files in `/Users/anderbs/.kiro-agents/soul/knowledge/sales/people/`.

Each person gets one file: `<first-last>.md` (lowercase, hyphenated). This replaces the old single-file `contacts.md` approach.

## File Format

```markdown
---
type: person
role: "<Category> - <Title>"
company: "<Company Name>"
tags: ["person", "<company-tag>", "<optional-extra-tags>"]
territories: ['<territory-id>']
last_updated: YYYY-MM-DD
---

# [[<first-last>|First Last]]

**Title:** <Job Title>
**Company:** [[<territory>/<account>/_hub-<account>|Company Name]]
**Email:** name@company.com
**Phone:** 555-555-5555
**Tenure:** X years
**Background:** Brief background if known

**Notes:**
- Key context, relationship notes, preferences not in CRM

## Interactions
- [[<territory>/<account>/meetings/YYYY-MM-DD-description|YYYY-MM-DD Meeting Name]]
```

### Role Categories

Prefix the `role` frontmatter field with a category:
- `Customer - <Title>` — customer contacts
- `AWS - <Title>` — internal AWS team members
- `Partner - <Title>` — partner contacts (CDW, Rovisys, etc.)

### Tags

Always include `person`. Add company/team tags for filtering:
- Customers: `["person", "customer", "<company-tag>"]` (e.g. `"brose"`, `"ufp"`, `"nidec"`)
- AWS team: `["person", "aws-team"]` + optional specialty tags (e.g. `"specialist"`, `"proserve"`)
- Partners: `["person", "partner", "<partner-name>"]`

### Territories

Array of territory IDs the person is associated with: `['direct-03']`, `['gf-c-08']`, or both.
AWS team members who span territories can use `[]` or list all relevant ones.

### Last Updated

The `last_updated` frontmatter field tracks when the card was last modified. Set to today's date (`YYYY-MM-DD`) whenever any field is added or changed. This enables auditing stale contacts.

### Company Wikilinks

Link to the account hub when available:
- `[[direct-03/brose-north-america/_hub-brose-north-america|Brose North America]]`
- `[[gf-c-08/ufp-industries/_hub-ufp-industries|UFP Industries]]`

For AWS team members, just use `AWS` (no wikilink needed).

### AWS Team Members

For internal AWS people, include alias and phonetool link instead of company wikilink:

```markdown
**Alias:** <alias>
**Phonetool:** [<alias>](https://phonetool.amazon.com/users/<alias>)
**Location:** City, ST
```


## Workflows

### 1. Add Contact

1. Create `{{SOUL_PATH}}/knowledge/sales/people/<first-last>.md`
2. Populate frontmatter and body from available context (meeting notes, CRM, email, calendar, user input)
3. Only include fields you have data for — omit unknown fields rather than guessing

### 2. Update Contact

1. Search the `-Sales` knowledge base for the person's existing card
2. Fall back to reading `{{SOUL_PATH}}/knowledge/sales/people/<first-last>.md`
3. Update changed fields, append new interactions

### 3. Lookup Contact

Triggered by: "who is [name]", "people at [company]", "how do I know [name]"

1. Search the `-Sales` knowledge base for the person
2. Display their card with interactions and notes
3. Offer to search CRM or email for additional context if needed

### 4. List People at Company

Triggered by: "who do I know at [company]", "people at [company]", "contacts at [company]"

1. Search the `-Sales` knowledge base filtering by company or tags
2. Display sorted by relevance or last interaction
3. Show role and territory for each person

### 5. Bulk Create from Meeting

When processing meeting attendees (from sa-activity or note capture):

1. For each attendee, check if `people/<first-last>.md` exists
2. Create cards for new people with available metadata
3. Add interaction wikilinks to existing cards only for notable meetings
4. Don't update existing cards for routine recurring meetings with unchanged attendees

## Deduplication

- Filename is the primary key: `<first-last>.md`
- Before creating, search the `-Sales` KB or glob `people/` directory
- If name is ambiguous (e.g. two "Mike"s), use last name or ask user
- Never create duplicates — always merge into existing card

## Integration with Other Skills

- **sa-activity**: After logging meetings, offer cards for new attendees only
- **sa-capture**: Check for new people when capturing notes; reference `people/` files not `contacts.md`
- **sa-intel**: Pull from people files to show known contacts at an account
- **sa-outreach**: Check people files for prior interaction context with recipient

## Rules

- One file per person — never create duplicates
- Omit unknown fields rather than using placeholders
- Interactions section is optional — only add for notable meetings, not every touchpoint
- Keep notes concise — relationship nuance, not meeting transcripts
- When in doubt about identity, ask the user

## Post-Write Processing

After creating or updating a people card, invoke the universal post-write processor:

```
@sa-post-write note_path=<path-to-the-people-file>
```

This handles frontmatter validation, wikilink resolution, cross-link discovery, reachability verification, and index rebuild.
