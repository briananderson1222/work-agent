# Removed App.tsx Functions

These functions were removed during NavigationContext integration as ChatDock now handles all chat operations internally.

## Removed Functions

### Session Management
- `removeSession(sessionId)` - ChatDock handles via ActiveChatsContext
- `focusSession(sessionId)` - ChatDock handles internally
- `createChatSession(agent, options)` - ChatDock handles internally

### Message Handling
- `sendMessage(sessionId, content)` - ChatDock handles internally with streaming

### Navigation
- `openChatForAgent(agent)` - Use `useNavigation().setAgent(slug)` instead
- `openConversation(conversationId, agentSlug)` - ChatDock handles internally

## Migration

All chat operations are now handled by ChatDock using contexts:
- **ActiveChatsContext** - UI state for open chats
- **ConversationsContext** - Backend conversation data
- **NavigationContext** - Routing and URL state

Components should use these contexts directly instead of callbacks.
