# Plan: Feedback Loop — End-to-End Hardening

## Goal
Prove the full feedback loop works: rate → analyze → behaviors extracted → injected into next prompt → agent behavior improves. Fix every gap between what exists and what KiRoom ships.

## Current State (what works)
- `FeedbackService` in `src-server/services/feedback-service.ts` — JsonFileStore-backed, two-tier analysis
- `MessageRating` component in `src-ui/src/components/MessageBubble.tsx` — SVG thumbs, persists via cache
- `InsightsDashboard` in `src-ui/src/components/InsightsDashboard.tsx` — Usage + Feedback tabs
- Routes at `/api/feedback` — rate, ratings, guidelines, analyze, clear-analysis
- Guidelines injected into both alternate provider path (system prompt) and VoltAgent/Strands path (prepended to user input) via `ragContext` in `stallion-runtime.ts` lines 2018-2022 and 2355-2370

## Critical Bugs

### Bug 1: Analyze callback fails silently
**File:** `src-server/runtime/stallion-runtime.ts` line 592-595
```typescript
this.feedbackService.setAnalyzeCallback(async (prompt: string) => {
  const agent = this.activeAgents.get('default');
  if (!agent) throw new Error('No default agent for feedback analysis');
  const result = await agent.generateText(prompt);
  return result.text;
});
```
**Problem:** `this.activeAgents.get('default')` returns undefined unless an agent is literally named "default". Most setups have agents named by their slug (e.g., "assistant", "coder"). The throw is caught by `runAnalysisPipeline`'s soft-fail catch, so analysis silently never runs.

**Fix:** Fall back to first available agent. Also: use a cheaper/faster model if available (analysis doesn't need the best model — KiRoom used kiro-cli's default which is often Haiku).
```typescript
this.feedbackService.setAnalyzeCallback(async (prompt: string) => {
  const agent = this.activeAgents.get('default')
    || this.activeAgents.values().next().value;
  if (!agent) throw new Error('No agents available for feedback analysis');
  const result = await agent.generateText(prompt);
  return result.text;
});
```

### Bug 2: No reason input on rating buttons
**File:** `src-ui/src/components/MessageBubble.tsx` — `MessageRating` component
**Problem:** Server accepts `reason?: string` (100 char limit) but UI has no input. KiRoom shows a text input after clicking thumbs down. Reasons dramatically improve mini-analysis quality — without them, the LLM is guessing from a 200-char message preview alone.

**Fix:** After clicking either thumb, expand an inline input below the buttons:
- Placeholder: `"Why? (optional)"` 
- 100 char max
- Submit on Enter or 2s debounce on blur
- Collapse after submit, show the reason as a small label
- Only expand for thumbs_down by default (thumbs_up auto-submits without reason, but clicking a small "add note" link expands it)
- The reason is sent in the existing POST body's `reason` field

**CSS:** Add `.message__rating-reason` styles in `chat.css` — small input, matches existing design tokens, positioned below the rating buttons.

### Bug 3: Ratings not loaded for correct conversation
**File:** `src-ui/src/components/MessageBubble.tsx` — `loadRatingsCache`
**Problem:** The cache loads ALL ratings globally. When the user has multiple conversations, ratings from conversation A show on conversation B if they happen to share a messageIndex. The cache key is `${conversationId}:${messageIndex}` which should be unique, but the `conversationId` passed to `MessageRating` is `activeSession.id` — need to verify this is actually the conversation ID and not a session ID.

**Fix:** Verify that `activeSession.id` matches what the server stores as `conversationId`. If it's a session ID (UUID), the ratings will never match because the server stores the conversation ID format (`agent:slug:user:alias:timestamp:random`). Trace the full path from `ChatDockBody.tsx` → `MessageBubble` → `MessageRating` to confirm the ID format matches.

## New Features

### Feature 1: Diagnostic test endpoint
**File:** `src-server/routes/feedback.ts`

Add `POST /api/feedback/test` that exercises the full pipeline synchronously:
1. Check if `analyzeFn` is set (returns `agentAvailable: boolean`)
2. Create a synthetic rating with a known message preview
3. Run `runMiniAnalysis()` — verify it produces an analysis string
4. Run `runFullAnalysis()` — verify it produces reinforce/avoid lists
5. Check `getBehaviorGuidelines()` — verify non-empty string
6. Clean up the synthetic rating
7. Return full diagnostics:
```json
{
  "agentAvailable": true,
  "syntheticRatingCreated": true,
  "miniAnalysisResult": "User liked the concise, code-first response...",
  "fullAnalysisResult": { "reinforce": ["..."], "avoid": ["..."] },
  "guidelinesGenerated": true,
  "guidelinesPreview": "<feedback_profile>...",
  "totalRatings": 5,
  "analyzedRatings": 3,
  "pipelineDurationMs": 4200
}
```

This is critical for verification — we can hit this endpoint from Playwright to prove the loop works without needing a real LLM conversation.

### Feature 2: Ratings visible in conversation context (KiRoom parity)
**File:** `src-server/runtime/stallion-runtime.ts` — chat handler, around line 2355

KiRoom includes ratings in the conversation context so agents see "user disliked message #5" when processing follow-ups. This creates an immediate feedback signal even before the background analysis runs.

**Implementation:** When building the `ragContext`, also check for ratings on the current conversation:
```typescript
const conversationRatings = this.feedbackService.getRatings()
  .filter(r => r.conversationId === conversationId && r.rating === 'thumbs_down');
if (conversationRatings.length > 0) {
  const ratingContext = conversationRatings.map(r => 
    `- Message #${r.messageIndex} was rated negatively${r.reason ? `: "${r.reason}"` : ''}`
  ).join('\n');
  ragContext = ragContext 
    ? `${ragContext}\n\n<conversation_feedback>\nThe user has flagged these responses in this conversation:\n${ratingContext}\nAdjust your approach accordingly.\n</conversation_feedback>`
    : `<conversation_feedback>\n${ratingContext}\n</conversation_feedback>`;
}
```

This is a Stallion improvement over KiRoom — KiRoom injects all ratings; we only inject negative ones for the current conversation, which is more targeted and uses fewer tokens.

### Feature 3: InsightsDashboard improvements
**File:** `src-ui/src/components/InsightsDashboard.tsx`

Current gaps vs KiRoom:
1. **No delete individual ratings** — Add a small ✕ button on each rating card that calls `DELETE /api/feedback/rate`
2. **No "Missing Reason" filter** — Add a filter pill for ratings that have no reason (these are the ones that would benefit most from the user adding context)
3. **Configurable behavior count** — Add a small dropdown (10/25/50) that passes to the analyze endpoint. Server already has `MAX_REINFORCE = 25` and `MAX_AVOID = 25` as constants — make them configurable via the analyze request body.

### Feature 4: Analysis status indicator
**File:** `src-ui/src/components/InsightsDashboard.tsx`

Show when the last analysis ran and when the next one will run:
- "Last analyzed: 3 min ago · Next: in 7 min"
- Pulsing dot when analysis is actively running
- This requires a new endpoint: `GET /api/feedback/status` returning `{ lastAnalyzedAt, nextAnalysisAt, isAnalyzing, analyzeCallbackAvailable }`

**File:** `src-server/routes/feedback.ts` + `src-server/services/feedback-service.ts`
- Track `lastAnalyzedAt` timestamp in the service
- Expose `isAnalyzing` flag (set true during pipeline, false after)
- Calculate `nextAnalysisAt` from `lastAnalyzedAt + ANALYSIS_INTERVAL_MS`

## Parallel Execution Plan

### Stream A (Server — independent)
1. Fix analyze callback fallback in `stallion-runtime.ts`
2. Add `/api/feedback/test` diagnostic endpoint in `feedback.ts`
3. Add `/api/feedback/status` endpoint in `feedback.ts` + service changes
4. Add conversation-scoped rating injection in `stallion-runtime.ts`
5. Make behavior count configurable in `feedback-service.ts`

### Stream B (UI — independent, parallel with A)
1. Add reason input to `MessageRating` in `MessageBubble.tsx`
2. Add reason input CSS in `chat.css`
3. Add delete button + "Missing Reason" filter to `InsightsDashboard.tsx`
4. Add analysis status indicator to `InsightsDashboard.tsx`
5. Verify conversationId format matches between UI and server

## Verification (Playwright)
1. Navigate to app, open a chat with an agent
2. Send a message, get a response
3. Rate the response thumbs down with reason "too verbose"
4. Hit `/api/feedback/test` — verify full pipeline returns success
5. Navigate to Insights → Feedback tab — verify rating appears with reason
6. Click "Analyze" — verify behaviors populate
7. Hit `/api/feedback/guidelines` — verify non-empty guidelines
8. Send another message — verify the response is influenced (check that ragContext includes guidelines by inspecting server logs or the response quality)
9. Rate another message thumbs up — verify it appears in dashboard
10. Delete a rating from dashboard — verify it's removed
