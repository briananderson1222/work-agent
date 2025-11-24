# Tool Display Fix

## Issue
Tool calls were not displaying during streaming in the ChatDock component.

## Root Cause
In `src-ui/src/hooks/useStreamingMessage.ts`, the code was calling `updateChat()` with a callback function pattern:

```typescript
updateChat(sessionId, (prev) => ({
  ...prev,
  toolCalls: [...(prev.toolCalls || []), toolCall],
  streamingMessage: { ... }
}));
```

However, the `ActiveChatsContext.updateChat()` method only accepts `Partial<ChatUIState>`, not a function. This caused the tool calls to silently fail to update the streaming message.

## Fix
Changed the `updateChat` call to pass a plain object instead of a callback:

```typescript
updateChat(sessionId, {
  streamingMessage: {
    role: 'assistant',
    content: newContentParts.map(p => p.type === 'text' ? p.content : '').join(''),
    contentParts: newContentParts,
  }
});
```

## Files Modified
- `src-ui/src/hooks/useStreamingMessage.ts` - Fixed updateChat call

## Testing
1. Start dev server: `npm run dev:server && npm run dev:ui`
2. Send a message that triggers a tool call (e.g., "What files are in the current directory?")
3. Tool calls should now display in real-time as they're being executed

## Flow
1. Backend emits `tool-input-available` event via SSE
2. `App.tsx` receives event and calls `handleStreamEvent()`
3. `useStreamingMessage` processes event and updates `streamingMessage.contentParts`
4. `ActiveChatsContext` notifies subscribers
5. `useDerivedSessions` adds `streamingMessage` to session messages
6. `ChatDock` renders `contentParts` including `ToolCallDisplay` components
