# App.tsx Cleanup After ChatDock Migration

## State to Remove (Now in ChatDock or Contexts)

### Chat Session State
- `ephemeralMessages` - ChatDock manages this
- `streamingMessages` - ChatDock manages this  
- `sessions` derived state - ChatDock uses useDerivedSessions
- `baseSessions` - ChatDock handles
- `enrichedActiveSession` - ChatDock handles

### Toast System
- `toastMessage` - Now in ToastContext
- `toastSessionId` - Now in ToastContext
- `toastTimeoutRef` - Now in ToastContext
- `showToast()` function - Now useToast() hook

### Chat Modals
- `showNewChatModal` - ChatDock manages
- `showSessionPicker` - ChatDock manages
- `newChatSearch` - ChatDock manages
- `newChatSelectedIndex` - ChatDock manages

### Streaming Logic
- `handleStreamEvent` - ChatDock uses useStreamingMessage hook
- `clearStreamingMessage` - ChatDock uses useStreamingMessage hook

## State to Keep (App-level concerns)

### Navigation
- `currentView` - App routing
- `selectedAgent` - URL state for agent selection
- `selectedWorkspace` - URL state for workspace
- `activeTabId` - Workspace tab state

### Global UI
- `globalError` - App-level errors
- `managementNotice` - Management view notices
- `showPinDialog` - Auth flow (used by ChatDock via callback)

### Auth
- `activeAbortController` - Request cancellation
- `pinDialogResolver` - Auth promise handling

## Cleanup Steps

1. Remove all session-related state and derived values
2. Remove toast state (use ToastContext instead)
3. Remove chat modal state
4. Remove streaming event handlers
5. Update ChatDock to be fully self-contained
6. Keep only routing and global app state

## Estimated Impact
- ~200-300 lines can be removed
- Cleaner separation of concerns
- ChatDock truly independent component
