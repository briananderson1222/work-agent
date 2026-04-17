---
name: "soul-onboard"
description: "Populate soul protocol files from cold-start. Three modes: quick (5 min), full (1-2 hours), refresh (15 min)."
---

# soul-onboard

Structured onboarding that populates soul protocol files from cold-start. Three modes for different levels of investment.

## Trigger

Use when: first session with a new user, user says "set me up", "get to know me", "onboard", "let's do the full interview", or when soul protocol files (`user.md`, `identity.md`) are empty/minimal.

## Modes

### Quick (~5 minutes, 3-5 questions)

For users who want to see value immediately. Populates the minimum viable profile and lets the system learn organically from interaction.

**Questions:**
1. "What's your name, role, and timezone?"
2. "What are you working on right now?" (surfaces active projects/priorities)
3. "Anything I should know about how you like to work?" (communication style, pet peeves, preferences)

**Output:**
- `user.md` — name, role, team, timezone, current focus
- `preferences.md` — any stated preferences (even one or two)

**After quick mode:** The agent learns through interaction. When it observes patterns (writing style, decision-making, repeated preferences), it proposes additions to the soul files per normal capture policy.

### Full (~1-2 hours, structured interview)

For users who want deep personalization upfront. Covers seven sections with pause/resume support.

**Interview sections:**

#### Section 1: Identity & Role (5 min)
- Name, role, level, team, timezone
- Who do you report to? Key stakeholders?
- What domains do you work across? (maps to knowledge domains)

→ Writes: `user.md` basics

#### Section 2: Goals & Priorities (10-15 min)
- What are your primary goals this year? (professional and personal)
- What does success look like in 6 months? 12 months?
- What would you work on if you had 20% more time?
- How do you currently track progress?

→ Writes: `user.md` goals section, `memory.md` career knowledge (baseline goals)

#### Section 3: Mental Model & Decision-Making (10-15 min)
- Tell me about a decision you're proud of. What drove it?
- Tell me about one that didn't go well. What would you do differently?
- What are your strengths that others rely on?
- What are your blind spots?
- What energizes you? What drains you?

→ Writes: `user.md` work context, `identity.md` personality traits (proposed, user confirms)

#### Section 4: Writing Style (15-20 min)
- Ask for 2-3 writing samples (docs, proposals, long-form)
- Analyze: voice, structure, sentence patterns, vocabulary level, formality
- "What do you think makes your writing effective?"
- "What writing habits do you want to reinforce or change?"

→ Writes: `user.md` writing style section, `preferences.md` writing conventions

#### Section 5: Communication Style (10-15 min)
- Ask for 2-3 email samples (update, request, difficult conversation)
- Analyze: tone, structure, sign-off patterns, formality gradient
- "How do you think about email differently than documents?"
- How do you use Slack vs email? (channel behavior, DM style)

→ Writes: `user.md` communication style section, `preferences.md` communication conventions

#### Section 6: Org Context (10 min)
- Org structure: manager, skip-levels, key partners
- What communities or groups do you contribute to?
- Who are your key collaborators?
- What tools/systems do you use daily?

→ Writes: `user.md` work context, creates initial people files if applicable

#### Section 7: Preferences & Conventions (10 min)
- How much structure do you want vs flexibility?
- Any strong opinions on formatting, naming, organization?
- Tool-specific preferences (if applicable — Obsidian, git, etc.)
- Review the knowledge domain structure — anything to add or change?

→ Writes: `preferences.md` confirmed conventions

**Between sections:** Check in — "We can go deeper or move on. Your call." Don't force exhaustive coverage.

### Refresh (~15 minutes, targeted update)

For re-running specific sections when things change. User picks which sections to revisit.

**Trigger:** "My role changed", "update my goals", "let's refresh my profile", or quarterly check-in.

**Workflow:**
1. Show current state of relevant soul files
2. Ask what's changed
3. Update in-place — don't regenerate from scratch
4. Note the refresh in `memory.md`: `- [YYYY-MM-DD] [high] Soul profile refreshed: <what changed>`

## Persistence (Pause/Resume)

The full interview may span multiple sessions. State is preserved in `${SOUL_PATH}/.onboard/`:

```
${SOUL_PATH}/.onboard/
├── interview-state.md    ← Which sections complete, which pending
├── section-1-draft.md    ← Raw answers per section
├── section-2-draft.md
└── ...
```

The interview state lives in SOUL_PATH (not agent knowledge) because it's about the user, not the runtime. If the agent is swapped mid-interview, the state persists.

- After each section, save raw answers to the section draft file
- Update `interview-state.md` with completion status
- On resume: read state, summarize where we left off, continue
- On completion: write final soul files, delete `.onboard/` directory

## Identity Permission Model

The soul protocol requires explicit user consent to modify `identity.md` and `soul.md`. Running `soul-onboard` constitutes that consent — the user is explicitly asking the agent to learn about them and write it down.

During the interview:
- The agent writes to `user.md`, `preferences.md`, and `memory.md` freely (these are dynamic files per the protocol)
- The agent writes to `identity.md` without per-write permission prompts — consent was granted at invocation
- The agent still shows what it's writing (transparency), but doesn't ask "can I update your identity?" for each change
- The agent does NOT modify `soul.md` — that requires deliberate reflection, not interview answers

Outside the interview, normal protocol rules apply: identity changes require explicit request.

## Output Mapping

| Interview data | Target file | Section |
|----------------|-------------|---------|
| Name, role, team, timezone | `user.md` | Basics |
| Goals, success criteria | `user.md` | Goals |
| Mental model, strengths, blind spots | `user.md` | Work Context |
| Writing voice, structure, patterns | `user.md` | Writing Style |
| Email/Slack tone, conventions | `user.md` | Communication Style |
| Org structure, stakeholders | `user.md` | Work Context |
| Personality traits, values | `identity.md` | Proposed (user confirms) |
| Confirmed conventions | `preferences.md` | Append |
| Baseline context worth keeping | `memory.md` | Career Knowledge |

## Rules

- Never write to `identity.md` without user confirmation. Propose changes, explain reasoning, let them decide.
- Don't over-extract. If the user gives a short answer, take it at face value. Not everything needs to be a personality insight.
- Writing/communication analysis should be specific and actionable: "You tend to lead with context before the ask, use active voice, and keep paragraphs to 2-3 sentences" — not "You have a professional writing style."
- Quick mode should feel fast. Don't turn 3 questions into 10 follow-ups.
- Full mode should feel like a conversation, not a form. Probe where interesting, skip where the user is disengaged.
- Refresh mode should show what exists before asking what changed. Don't make the user remember what they told you.

## Domain Extensions

The core interview is domain-agnostic. Domain-specific question modules can extend it:

**SA module** (if user role is Solutions Architect):
- Which customers/territories do you own?
- What's your promo timeline?
- Slack channel discovery (automated via MCP if available)
- CRM/tool preferences

**Dev module** (if user role is developer):
- What languages/frameworks do you work with?
- Testing philosophy?
- Code review preferences?

Extensions add questions to relevant sections and write to domain-specific files (e.g., SA module writes to `knowledge/sales/` config). They don't change the core flow.
