# Chat Session Management Refactoring - Summary

## Changes Made

### 1. Moved ephemeralMessages to ActiveChatsContext
**File**: `src-ui/src/contexts/ActiveChatsContext.tsx`

- Added `ephemeralMessages` array to `ChatUIState` type
- Added `addEphemeralMessage()` method to store user messages before backend confirms
- Added `clearEphemeralMessages()` method to remove ephemeral messages after backend persistence
- Exposed new methods in context API

**Purpose**: Centralize all UI state in contexts, removing local component state

### 2. Fixed Message Ordering in useEnrichedSession
**File**: `src-ui/src/hooks/useDerivedSessions.ts`

Updated message merging logic to ensure correct order:
1. **Ephemeral messages** (user message before backend confirms)
2. **Backend messages** (persisted conversation history)
3. **Streaming message** (assistant response in progress)

**Purpose**: Ensure user message appears before assistant response, prevent duplicates

### 3. Updated App.tsx to Use Context-Based Ephemeral Messages
**File**: `src-ui/src/App.tsx`

- Removed `ephemeralMessages` local state variable
- Updated `sendMessage()` to use `addEphemeralMessage()` from context
- Updated stream completion to call `refreshMessages()` BEFORE `clearEphemeralMessages()`
- Updated slash command handlers to use context methods
- Removed duplicate ephemeral message rendering code

**Purpose**: Use single source of truth for all message state

## How It Works Now

### Message Flow

1. **User types message and hits send**
   - User message added to `ephemeralMessages` via `addEphemeralMessage()`
   - Message shows immediately in UI (from context)
   - Input cleared

2. **Streaming begins**
   - Assistant response chunks arrive via SSE
   - `streamingMessage` updated in real-time via `updateChat()`
   - Both ephemeral (user) and streaming (assistant) messages visible

3. **Stream completes**
   - `refreshMessages()` called to load full conversation from backend
   - Backend now includes both user and assistant messages
   - `clearEphemeralMessages()` called to remove ephemeral user message
   - `clearStreamingMessage()` called to remove streaming assistant message
   - UI now shows only backend messages (no duplicates)

### Message Display Order

Messages are merged in `useEnrichedSession`:
```typescript
const allMessages = [
  ...ephemeralMessages,  // User message (temporary)
  ...backendMessages,    // Persisted history
  streamingMessage       // Assistant response (temporary)
];
```

This ensures:
- User message appears immediately (ephemeral)
- User message appears BEFORE assistant response
- After backend confirms, ephemeral is cleared (no duplicate)
- Streaming message shows in real-time
- After stream completes, streaming is cleared and backend message shows

## Testing Checklist

### Basic Message Flow
- [ ] Send a message - user message appears immediately
- [ ] User message appears BEFORE assistant starts responding
- [ ] Assistant response streams in real-time
- [ ] After stream completes, no duplicate messages
- [ ] Messages persist after page refresh

### Edge Cases
- [ ] Send message while another is streaming (queued messages)
- [ ] Cancel message mid-stream (abort)
- [ ] Network error during stream
- [ ] Switch conversations while streaming
- [ ] Close dock while streaming (unread badge)

### Slash Commands
- [ ] `/clear` - Shows ephemeral system message
- [ ] `/prompts` - Shows ephemeral assistant response
- [ ] `/mcp` - Shows ephemeral assistant response
- [ ] `/tools` - Shows ephemeral assistant response
- [ ] `/model` - Shows ephemeral assistant response

### Multi-Session
- [ ] Multiple conversations open in tabs
- [ ] Each conversation has isolated ephemeral messages
- [ ] Switching tabs shows correct messages
- [ ] Unread badges work correctly

## Files Modified

1. `src-ui/src/contexts/ActiveChatsContext.tsx` - Added ephemeral message support
2. `src-ui/src/hooks/useDerivedSessions.ts` - Fixed message ordering
3. `src-ui/src/App.tsx` - Removed local state, use context methods

## Potential Issues to Watch

1. **Timing**: `refreshMessages()` is async - ensure it completes before clearing ephemeral
2. **Race conditions**: Multiple messages sent rapidly might have ordering issues
3. **Memory**: Ephemeral messages should be cleared after backend confirms
4. **Duplicates**: If backend is slow, ephemeral might show alongside backend message briefly

## Next Steps

1. Test the message flow thoroughly
2. Add error handling for failed backend persistence
3. Consider adding message IDs to prevent duplicates more reliably
4. Add loading states for message persistence
