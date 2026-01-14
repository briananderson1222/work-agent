# ChatDock Component Migration Status

## Overview
Extracting the chat dock from App.tsx into a standalone ChatDock component to enable persistence across all app views.

## Current Status: Phase 1 Complete ✅

### Completed
- ✅ Created ChatDock component file (`src-ui/src/components/ChatDock.tsx`)
- ✅ Basic dock UI state management (collapsed, maximized, height)
- ✅ localStorage persistence for user preferences
- ✅ Rendered at app level in both management and workspace views
- ✅ Persists across navigation (workspace, agents, tools, workflows, settings)
- ✅ Props interface defined for external data
- ✅ Documentation added to AGENTS.md
- ✅ Old chat dock hidden with `display:none`

### Architecture
```
App.tsx
├── Management Views (agents, tools, workflows, settings)
│   └── ChatDock (new, visible)
└── Workspace View
    ├── ChatDock (new, visible)
    └── Old Chat Dock (hidden, to be removed)
```

## Phase 2: Full Migration (In Progress)

### Remaining Tasks

#### 1. State Migration
Move from App.tsx to ChatDock:
- `sessions` - Chat session array
- `activeSessionId` - Currently active session
- `ephemeralMessages` - Temporary messages during streaming
- `showStatsPanel` - Stats panel visibility
- `isUserScrolledUp` - Scroll position tracking
- `showScrollButtons` - Tab scroll button visibility
- `showNewChatModal` - New chat modal state
- `showSessionPicker` - Session picker modal state
- `newChatSearch` - New chat search query
- `newChatSelectedIndex` - Selected agent index
- `chatFontSize` - Font size preference
- `defaultFontSize` - Default font size constant

#### 2. Handler Migration
Move from App.tsx to ChatDock:
- `focusSession()` - Switch active session
- `removeSession()` - Close a session
- `updateSession()` - Update session data
- `openChatForAgent()` - Create new chat
- `handleSendMessage()` - Send message to agent
- `handleToolApproval()` - Approve/deny tool execution
- All dock UI handlers (collapse, maximize, resize, drag)

#### 3. JSX Migration
Copy chat dock JSX from App.tsx (lines 2132-3309, ~1178 lines):
- Resize handle
- Header with activity indicator
- Tabs section with session management
- Font controls
- Message display area
- Input area with file attachments
- Tool call displays
- Modals (new chat, session picker)

#### 4. Context Integration
- Integrate with `ConversationsContext` for persistence
- Integrate with `StatsContext` for token tracking
- Use `useStreamingMessage` hook for real-time updates
- Use `useDerivedSessions` for session enrichment

#### 5. Cleanup
- Remove old chat dock implementation from App.tsx (~1200 lines)
- Remove chat-related state from App.tsx
- Remove chat-related handlers from App.tsx
- Update CSS to use component-scoped styles

## Migration Strategy

### Option A: Big Bang (Not Recommended)
Copy all 1178 lines at once - high risk of breaking changes

### Option B: Gradual Migration (Recommended) ✅
1. Keep old implementation functional
2. Build new ChatDock incrementally
3. Pass state from App.tsx to ChatDock via props
4. Gradually move state ownership to ChatDock
5. Remove old implementation when new one is feature-complete

### Option C: Hybrid Approach (Current)
1. ChatDock renders with basic UI
2. Old chat dock hidden but functional
3. Can toggle between implementations for testing
4. Migrate features one at a time

## Testing Checklist

### Basic Functionality
- [ ] Collapse/expand works in all views
- [ ] Maximize/restore works in all views
- [ ] Drag-to-resize works in all views
- [ ] Height persists across page refreshes
- [ ] Collapsed state persists across page refreshes

### Session Management
- [ ] Create new chat session
- [ ] Switch between sessions
- [ ] Close sessions
- [ ] Sessions persist across view changes
- [ ] Session tabs scroll correctly
- [ ] Keyboard shortcuts work (⌘1-9, ⌘T, ⌘O, ⌘X, ⌘D)

### Messaging
- [ ] Send messages to agent
- [ ] Receive streaming responses
- [ ] Display tool calls
- [ ] Approve/deny tool execution
- [ ] File attachments work
- [ ] Message history loads correctly
- [ ] Scroll behavior works (auto-scroll, manual scroll)

### UI/UX
- [ ] Font size controls work
- [ ] Stats panel toggles correctly
- [ ] Toast notifications appear
- [ ] Activity indicator shows active sessions
- [ ] Unread badges display correctly
- [ ] Theme colors apply correctly

### Cross-View Persistence
- [ ] Chat dock visible in workspace view
- [ ] Chat dock visible in agents view
- [ ] Chat dock visible in tools view
- [ ] Chat dock visible in workflows view
- [ ] Chat dock visible in settings view
- [ ] State preserved when switching views
- [ ] Active session maintained across views

## Next Steps

1. **Immediate**: Copy full chat dock JSX into ChatDock component
2. **Short-term**: Wire up existing state from App.tsx via props
3. **Medium-term**: Move state ownership to ChatDock
4. **Long-term**: Remove old implementation and cleanup

## Files Modified
- `src-ui/src/components/ChatDock.tsx` - New component
- `src-ui/src/App.tsx` - Render ChatDock, hide old implementation
- `src-ui/src/components/Header.tsx` - Updated navigation
- `src-ui/src/index.css` - Header styles
- `src-ui/src/views/SettingsView.tsx` - ThemeToggle moved here
- `AGENTS.md` - Architecture documentation

## Estimated Effort
- Phase 1 (Complete): 2-3 hours ✅
- Phase 2 (In Progress): 4-6 hours
- Phase 3 (Testing): 2-3 hours
- Total: 8-12 hours

## Risks & Mitigation
- **Risk**: Breaking existing chat functionality
  - **Mitigation**: Keep old implementation as fallback
- **Risk**: State synchronization issues
  - **Mitigation**: Use props to pass state initially
- **Risk**: Performance degradation
  - **Mitigation**: Profile and optimize after migration
- **Risk**: Lost functionality during migration
  - **Mitigation**: Comprehensive testing checklist
