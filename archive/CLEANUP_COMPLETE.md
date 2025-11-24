# App.tsx Cleanup - NavigationContext Integration

## ✅ Completed

### New Contexts Created
1. **NavigationContext** - Centralized routing and URL state management
   - Tracks: `selectedAgent`, `selectedWorkspace`, `activeConversation`, `isDockOpen`, `isDockMaximized`
   - Methods: `setAgent()`, `setWorkspace()`, `setConversation()`, `setDockState()`
   - Auto-syncs with browser URL and history

2. **ToastContext** - Global toast notifications
   - Replaces App.tsx toast state
   - Available everywhere via `useToast()` hook

3. **ModelsContext** - Renamed from AppDataContext
   - Clearer purpose (Bedrock models only)
   - Follows same pattern as other contexts

### ConfigContext Enhanced
- Added `useApiBase()` hook
- Returns API base URL from env/config
- No need to pass as prop

### ChatDock Refactored
**Removed Props:**
- `agents` - Uses `useAgents(apiBase)`
- `apiBase` - Uses `useApiBase()`
- `availableModels` - Uses `useModels(apiBase)`
- `selectedAgent` - Uses `useNavigation().selectedAgent`
- `defaultFontSize` - Uses `useConfig()`
- `onOpenChatForAgent` - Handles internally
- `onOpenConversation` - Handles internally
- `onSendMessage` - Handles internally
- `onRemoveSession` - Handles internally
- `onFocusSession` - Handles internally
- `onUpdateSessionTitle` - Handles internally

**Kept Props:**
- `onRequestAuth` - Auth flow still in App.tsx (PIN dialog)

**Now fully self-contained:**
```typescript
<ChatDock onRequestAuth={handleAuthError} />
```

### App.tsx State Removed
- `selectedAgent` - Now in NavigationContext
- `selectedWorkspace` - Now in NavigationContext
- `isDockCollapsed`, `isDockMaximized` - Now in NavigationContext
- `dockHeight`, `previousDockHeight`, etc. - ChatDock manages
- `chatFontSize` - ChatDock manages
- `ephemeralMessages`, `streamingMessages` - Removed earlier
- `sessions`, `baseSessions`, `enrichedActiveSession` - Removed earlier
- `activeSessionId` - Now `activeConversation` in NavigationContext
- `toastMessage`, `toastTimeoutRef` - Now in ToastContext
- `showNewChatModal`, `showSessionPicker` - ChatDock manages

### App.tsx Imports Removed
- Session/chat related hooks and components
- Toast-related utilities
- Streaming handlers
- Unused types

## ⚠️ Still TODO

### Large Functions Referencing Deleted State
These ~1000 lines reference state that no longer exists:

1. **`removeSession()`** (~20 lines) - References `sessions`, `activeSessionId`
2. **`focusSession()`** (~15 lines) - References `activeSessionId`, deleted UI state
3. **`createChatSession()`** (~50 lines) - References deleted session state
4. **`sendMessage()`** (~200 lines) - Large streaming handler, references many deleted vars
5. **`openChatForAgent()`** (~10 lines) - References deleted state
6. **`openConversation()`** (~20 lines) - References deleted state

### Effects Referencing Deleted State
- Model selector effect - References `sessions`, `activeSessionId`
- Auto-focus effect - References `sessions`, `activeSessionId`
- Auto-scroll effect - References `sessions`, `activeSessionId`
- URL sync effect - References deleted state
- Keyboard shortcuts - Reference deleted state

### Derived Values
- `activeSession` - References `sessions`, `activeSessionId`
- `unreadCount` - References `sessions`
- `slashCommands` - May reference deleted state

## 📊 Impact

### Before
- App.tsx: ~2000 lines
- ChatDock: Received 13+ props
- Prop drilling through multiple levels
- Duplicated state management

### After (Current)
- ChatDock: 1 prop (`onRequestAuth`)
- No prop drilling for routing/config
- Centralized state in contexts
- Components access data directly

### After (Complete Cleanup)
- App.tsx: Estimated ~800-1000 lines (50% reduction)
- Pure routing and view management
- No chat logic
- Clean separation of concerns

## 🎯 Next Steps

1. **Remove unused functions** - Delete functions referencing deleted state
2. **Remove unused effects** - Delete effects referencing deleted state
3. **Remove unused refs** - Delete refs no longer needed
4. **Test navigation** - Ensure routing still works
5. **Test ChatDock** - Ensure chat functionality works

## 🚀 Benefits Achieved

1. **No prop drilling** - Components get data from contexts
2. **URL persistence** - All state syncs with browser URL
3. **Cleaner code** - Separation of concerns
4. **Easier testing** - Mock contexts instead of props
5. **Better DX** - IntelliSense for all state
6. **Maintainability** - Changes in one place
