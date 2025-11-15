# App.tsx Cleanup Progress

## Completed ✅

### Removed State
- `ephemeralMessages` - Now in ChatDock
- `streamingMessages` - Now in ChatDock
- `sessions`, `baseSessions`, `enrichedActiveSession` - ChatDock uses useDerivedSessions
- `activeSessionId` - ChatDock manages internally
- `toastMessage`, `toastSessionId`, `toastTimeoutRef` - Now in ToastContext
- `showNewChatModal`, `showSessionPicker`, `newChatSearch`, `newChatSelectedIndex` - ChatDock manages
- `showStatsPanel` - ChatDock manages
- `pendingPromptSend`, `messageQueue` - ChatDock manages
- `messagesEndRef`, `messagesContainerRef` - ChatDock manages

### Removed Imports
- `ReactMarkdown`, `remarkGfm` - Only needed in ChatDock
- `SDKAdapter`, `PermissionManager`, `EventRouter` - Unused
- `SessionPickerModal`, `SessionManagementMenu` - ChatDock imports these
- `ConversationStats`, `FileAttachmentInput`, `SessionTab` - ChatDock imports these
- `useConversationStatus`, `useConversationActions` - ChatDock uses these
- `useActiveChatActions` - ChatDock uses these
- `useDerivedSessions`, `useEnrichedSession` - ChatDock uses these
- `useStreamingMessage` - ChatDock uses this
- `apiRequest` - Unused
- `getModelCapabilities` - Unused
- Types: `ChatMessage`, `ChatSession`, `WorkflowMetadata`, `FileAttachment`, `AgentQuickPrompt`

### Removed Components
- `ToolCallDisplay` - Duplicated in ChatDock

### Removed Functions
- `showToast()` - Use `useToast()` hook instead

## Still TODO ⚠️

### Functions Referencing Deleted State
These functions reference `sessions`, `activeSessionId`, or other deleted state:

1. **`removeSession()`** - References `sessions`, `activeSessionId`, `activeAbortController`
2. **`focusSession()`** - References `activeSessionId`, `updateChat`, other UI state
3. **`createChatSession()`** - May reference deleted state
4. **`openChatForAgent()`** - May reference deleted state
5. **`openConversation()`** - May reference deleted state
6. **`sendMessage()`** - Large function, likely references deleted state

### Effects Referencing Deleted State
- Model selector effect (line ~365) - References `sessions`, `activeSessionId`
- Auto-focus effect (line ~526) - References `sessions`, `activeSessionId`
- Auto-scroll effect (line ~561) - References `sessions`, `activeSessionId`

### Other References
- `activeSession` derived value (line ~410) - References `sessions`, `activeSessionId`
- `unreadCount` (line ~413) - References `sessions`
- URL sync effect - References `activeSessionId`
- Keyboard shortcuts - Reference `activeSessionId`

## Next Steps

1. **Option A: Remove callbacks entirely**
   - ChatDock is self-contained, may not need these callbacks
   - Check if ChatDock actually uses them

2. **Option B: Simplify callbacks**
   - Keep only what ChatDock truly needs
   - Remove references to deleted state
   - Use contexts instead of props

3. **Option C: Move logic to ChatDock**
   - Auth handling stays in App
   - Everything else moves to ChatDock

## Recommendation

Go with **Option A + C**: Remove most callbacks, keep only `onRequestAuth` for the PIN dialog flow. ChatDock should be fully self-contained for all chat operations.

## Estimated Remaining Cleanup
- ~500-700 more lines can be removed
- Several large functions (`sendMessage`, `createChatSession`, etc.)
- Multiple useEffect hooks
- Keyboard shortcut handlers
