# Work Agent Backlog

## Recent Changes

### Request Cancellation Implementation (2025-11-14)

**Problem:** When users cancel streaming requests, the backend continued processing and saved incomplete responses to memory, wasting tokens and polluting conversation context.

**Solution:** Properly pass abort signal to VoltAgent via `operationContext.abortSignal`:

1. Create `AbortController` tied to client connection (`c.req.raw.signal`)
2. Pass `abortController.signal` via `operationContext.abortSignal` (NOT `operationContext.abortController`)
3. VoltAgent listens to this signal and aborts LLM generation
4. Stream stops immediately with "Client disconnected" error
5. Incomplete responses are not saved to memory

**Key Findings:**
- VoltAgent creates its own `AbortController` internally (line 15539 in core/dist/index.js)
- It only listens to `options.abortSignal` or inherits parent's `abortController`
- Adding `abortController` directly to `operationContext` doesn't work
- Must pass via `abortSignal` property for VoltAgent to detect it
- Tools already queued may still execute (timing limitation)

**Files Modified:**
- `src-server/runtime/voltagent-runtime.ts` - Added abort signal setup and propagation
- `src-ui/src/contexts/ActiveChatsContext.tsx` - Removed frontend cancellation message injection

**Result:** Clean cancellation with no wasted tokens or context pollution.

### System Event Messages (2025-11-14)

**Problem:** VoltAgent's memory system expects strict user/assistant alternation. System messages inserted between user/assistant messages can break the conversation flow.

**Solution:** Use user messages with special `[SYSTEM_EVENT]` prefix for system notifications:
- Backend injects as user message: `[SYSTEM_EVENT] User cancelled the previous request.`
- Frontend strips prefix from user input to prevent spoofing
- Special UI rendering: centered, muted, italic styling
- Agent sees it as user context but UI treats it specially

**Implementation:**
- Backend: Modified `add-system-message` action to inject user message with prefix
- Frontend: Added input validation to strip `[SYSTEM_EVENT]` prefix
- Frontend: Added special rendering for system event messages
- Use case: Cancellation tracking, context injection, system notifications

**Files Modified:**
- `src-server/runtime/voltagent-runtime.ts` - Changed role from 'system' to 'user' with prefix
- `src-ui/src/components/ChatDock.tsx` - Input validation and special rendering

## Future Improvements

### Context Management Endpoint Optimization

**Current Implementation:**
- Endpoint: `POST /api/agents/:slug/conversations/:conversationId/context`
- Actions: `add-system-message`, `clear-history`

**Future Actions to Consider:**
- Stack-based operations (efficient with NDJSON):
  - `remove-last-message` - O(1) truncate last line
  - `remove-last-n-messages` - O(k) truncate k lines
  - `remove-messages-after-timestamp` - O(k) scan and truncate
- ID-based operations (less efficient, O(n) file scan):
  - `remove-message` - with messageId
  - `edit-message` - with messageId and content

**Consideration:** NDJSON storage makes stack operations much more efficient than random access by ID. Prioritize stack-based operations for better performance.

### AI SDK UI Message Format Investigation

**Context:** Currently using custom `/api/agents/:slug/chat` endpoint with manual SSE stream parsing. VoltAgent has built-in `/agents/:id/chat` endpoint that returns AI SDK UI message format.

**Tasks:**
- [ ] Investigate VoltAgent's built-in `/agents/:id/chat` endpoint (AI SDK UI message format)
- [ ] Compare custom `/api/agents/:slug/chat` implementation with VoltAgent's built-in
- [ ] Evaluate if switching to AI SDK format would simplify frontend stream handling
- [ ] Check if AI SDK's `useChat` hook could replace custom stream parsing logic

**Potential Benefits:**
- Simplified frontend stream handling
- Automatic message assembly
- Built-in tool invocation handling
- Standard format compatible with Vercel AI SDK ecosystem

**Current Implementation:**
- Custom endpoint: `/api/agents/:slug/chat`
- Manual SSE parsing in `ConversationsContext.tsx`
- Custom message format based on VoltAgent's raw `fullStream` events

**References:**
- VoltAgent docs: `api/endpoints/agents.md` - Chat Stream section
- AI SDK: https://sdk.vercel.ai/docs/ai-sdk-ui/chatbot


## Message Part Types & State Management

### Current Implementation
- We only use `TextUIPart` with basic `{ type: 'text', text: string }`
- No `state` property tracking (`streaming` | `done`)
- Tool calls stored as custom format, not using `ToolUIPart`

### Available Part Types (AI SDK)
1. **TextUIPart** - `{ type: 'text', text: string, state?: 'streaming' | 'done' }`
   - Use case: Mark actively streaming text vs completed text
   - UI benefit: Show shimmer/pulse on streaming parts
   
2. **ReasoningUIPart** - `{ type: 'reasoning', text: string, state?: 'streaming' | 'done' }`
   - Use case: Chain-of-thought/thinking tokens (Claude supports this)
   - UI benefit: Collapsible reasoning sections, different styling
   
3. **ToolUIPart** - Tool calls with structured format
   - Use case: Standardized tool call representation
   - UI benefit: Better tool call rendering, approval flows
   
4. **SourceUrlUIPart** - `{ type: 'source-url', sourceId: string, url: string, title?: string }`
   - Use case: RAG citations, document references
   - UI benefit: Clickable citations, source tracking
   
5. **SourceDocumentUIPart** - Document sources with metadata
   - Use case: Knowledge base references
   - UI benefit: Show document previews, relevance scores
   
6. **FileUIPart** - Generated files/images
   - Use case: Image generation, file downloads
   - UI benefit: Inline previews, download buttons
   
7. **DataUIPart** - Structured data with schemas
   - Use case: Typed data exchange between agent and UI
   - UI benefit: Custom renderers for specific data types
   
8. **StepStartUIPart** - Workflow step markers
   - Use case: Multi-step reasoning visualization
   - UI benefit: Progress indicators, step-by-step breakdown

### Implementation Tasks
- [ ] Add `state: 'streaming' | 'done'` to text parts during streaming
- [ ] Support `ReasoningUIPart` for models that emit thinking tokens
- [ ] Migrate tool calls to use `ToolUIPart` format
- [ ] Add UI components for each part type
- [ ] Create part type registry for custom renderers
- [ ] Add `state: 'cancelled'` support (non-standard but useful)

### Quick Wins
1. **Streaming state** - Add `state` property to text parts for visual feedback
2. **Reasoning support** - Detect and render reasoning tokens separately
3. **Source citations** - Use `SourceUrlUIPart` for RAG responses

### References
- AI SDK UIMessagePart types: `node_modules/ai/dist/index.d.ts`
- VoltAgent message handling: `src-server/adapters/file/voltagent-memory-adapter.ts`
- UI message rendering: `src-ui/src/components/ChatDock.tsx`
