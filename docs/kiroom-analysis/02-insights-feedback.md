# Insights & Feedback Loop

## Priority: 🔴 High

This is KiRoom's most differentiated feature and the one I'd adopt first. It's relatively independent of the threading model and delivers immediate value.

## What KiRoom Built

### The Feedback Loop

KiRoom has a closed-loop system where user feedback actively improves agent behavior:

```
User rates message (👍/👎)
    ↓
Mini-analysis: "Why did the user rate this way?" (per-message, kiro-cli)
    ↓
Full-analysis: "What patterns emerge?" (aggregate, kiro-cli)
    ↓
Top behaviors extracted: "Reinforce" and "Avoid" lists
    ↓
Injected into agent prompts automatically
    ↓
Agent behavior improves → User rates again → cycle continues
```

### Message Ratings

- **Thumbs up/down** on any agent message
- **Info rating** for force-stopped sessions ("explain why you stopped")
- **Optional reason** (100 char limit) — "too verbose", "wrong approach", etc.
- **Ratings visible in context** — agents see ratings when processing follow-up messages
- **Ratings survive thread/room deletion** — preserved in a `preserved_ratings` table

### Two-Tier Automated Analysis

**Mini-analysis** (per-message):
- Runs on startup, then every 10 minutes
- For each unanalyzed rating, spawns kiro-cli to produce a 1-2 sentence summary of WHY the user rated that way
- Considers the user's reason if provided
- Focuses on actionable behaviors (tone, accuracy, completeness, format)

**Full-analysis** (aggregate):
- Runs after mini-analysis completes
- Aggregates all mini-analyses into top N liked/disliked behaviors
- Configurable count (5-50, default 25)
- Produces lists like:
  - Reinforce: "Concise code-first answers", "Explaining reasoning step-by-step"
  - Avoid: "Over-explaining obvious concepts", "Adding unsolicited disclaimers"

### Prompt Injection

The aggregated behaviors are automatically included in agent prompts. This means every agent session benefits from accumulated feedback without the user doing anything.

### Template Proposals

Separate from ratings, KiRoom analyzes user messages to propose reusable prompt templates:

- Runs every 30 minutes
- Looks for multi-step workflows, thorough requests, and clarification patterns
- Generates templates with `{{variable}}` placeholders
- Detects when a proposal improves on an existing user template
- Incremental analysis (watermark-based, only processes new threads)

### Insights UI

Two-tab view accessible from the top bar:

**Tab 1: Agent Feedback Analysis**
- Left panel: Tabbed list of ratings (Liked, Disliked, Info, Missing Reason, Pending Analysis)
- Right panel: Aggregated behavior lists with configurable counts
- Edit/delete ratings, jump to original thread, clear analysis to re-queue

**Tab 2: Prompt Template Proposals**
- New proposals tab, Matching proposals tab (improves existing template)
- Create dialog to review/edit before saving
- Replace dialog for matched templates (side-by-side old vs new)
- "Reprocess All Threads" to reset and re-analyze

## What Stallion Has Today

Stallion's insights are basic monitoring metrics:

```typescript
// src-server/routes/insights.ts
// Reads ndjson event files, aggregates:
// - toolUsage: { calls, errors } per tool
// - hourlyActivity: events per hour
// - agentUsage: { chats, tokens } per agent
// - modelUsage: count per model
// - totalChats, totalToolCalls, totalErrors
```

The UI (`InsightsDashboard.tsx`) shows bar charts and stats cards. It's usage analytics, not a feedback loop. There's no:
- Message rating system
- Automated analysis of what works/doesn't
- Prompt injection of learned behaviors
- Template proposal generation

## Recommendation

### Phase 1: Message Ratings (Small effort)

Add thumbs up/down to agent messages in the ChatDock:

1. **Data model**: Add `rating`, `userProvidedReason`, `ratingAnalysis` fields to conversation messages
2. **UI**: Rating buttons on agent message bubbles (already have `MessageBubble.tsx`)
3. **Storage**: Persist ratings — if staying with JSON files, add a ratings section; if migrating to SQLite, add columns
4. **Context injection**: Include ratings in conversation context so agents see feedback

This alone is valuable — agents seeing "user disliked this" changes behavior.

### Phase 2: Automated Analysis (Medium effort)

Port KiRoom's two-tier analysis:

1. **Mini-analysis**: Background job that spawns kiro-cli (or uses Stallion's own LLM router) to analyze each rated message
2. **Full-analysis**: Aggregate mini-analyses into behavior lists
3. **Prompt injection**: Include "Behaviors to Reinforce" and "Behaviors to Avoid" in agent system prompts

Key difference from KiRoom: Stallion has its own LLM router (`llm-router.ts`) and provider system. You don't need to spawn kiro-cli — you can run analysis through Stallion's own providers. This is actually better because:
- No external process dependency
- Uses the user's configured providers
- Can run analysis with cheaper/faster models

### Phase 3: Template Proposals (Medium effort)

Port the template proposal system:

1. **Analysis job**: Periodically analyze user messages for reusable patterns
2. **Proposal storage**: Store proposals with variables, source threads, matched templates
3. **UI**: Proposals tab in insights, create/replace dialogs
4. **Integration**: Connect to Stallion's existing prompt template system (if one exists) or create one

### Stallion Mapping

| KiRoom Component | Stallion Equivalent | Notes |
|-----------------|-------------------|-------|
| `feedback-analysis.ts` | New `FeedbackAnalysisService` | Use Stallion's LLM router instead of kiro-cli |
| `kiro-analysis.ts` | Not needed | Stallion can call its own providers directly |
| `template-proposal-analysis.ts` | New `TemplateProposalService` | Same approach, different execution |
| `InsightsView.tsx` | Enhance `InsightsDashboard.tsx` | Add feedback tab alongside existing metrics |
| `preferences.ts` (feedback_summary) | Extend settings storage | Store analysis results |
| Rating on messages | Extend `MessageBubble.tsx` | Add rating buttons |
| Prompt injection | Extend `stallion-runtime.ts` | Inject behaviors into system prompt |

### Implementation Sketch

```typescript
// New: src-server/services/feedback-service.ts
export class FeedbackService {
  constructor(private llmRouter: LLMRouter) {}

  // Rate a message
  async rateMessage(conversationId: string, messageIndex: number, rating: 'up' | 'down', reason?: string): Promise<void>

  // Run mini-analysis on unanalyzed ratings (background job)
  async analyzePendingRatings(): Promise<void>

  // Aggregate into behavior lists (background job)
  async aggregateFeedback(): Promise<{ reinforce: string[]; avoid: string[] }>

  // Get behaviors for prompt injection
  getBehaviorGuidelines(): string
}
```

### Effort Estimate

- **Phase 1 (Ratings)**: Small — 1-2 days. Data model extension, UI buttons, storage.
- **Phase 2 (Analysis)**: Medium — 3-5 days. Background jobs, LLM integration, prompt injection.
- **Phase 3 (Templates)**: Medium — 3-5 days. Analysis job, proposal UI, template management.
