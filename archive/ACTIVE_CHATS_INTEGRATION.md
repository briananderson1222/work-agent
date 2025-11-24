# ActiveChatsContext Integration Plan

## Current State
- `sessions` array in App.tsx holds ALL chat state (messages, status, input, attachments, etc.)
- Duplicates data that should come from ConversationsContext
- ~218 lines of state management code in App.tsx

## Target State
- **ConversationsContext**: Persistent data (messages, metadata, status) - synced with backend
- **ActiveChatsContext**: Ephemeral UI state (input, attachments, queuedMessages) - local only
- **Derived sessions**: Combine context data + UI state on-the-fly

## Implementation Steps

### 1. Update ChatSession Type
**File:** `src-ui/src/types.ts`

Remove fields that come from contexts:
```typescript
export interface ChatSession {
  // Keep these (derived from contexts):
  id: string;                    // = conversationId
  conversationId: string;        // from ConversationsContext
  agentSlug: string;             // from ConversationsContext
  agentName: string;             // from AgentsContext
  title: string;                 // from ConversationsContext
  messages: ChatMessage[];       // from ConversationsContext.useMessages()
  status: ChatSessionStatus;     // from ConversationsContext.useConversationStatus()
  
  // Keep these (from ActiveChatsContext):
  input: string;
  attachments: FileAttachment[];
  queuedMessages: string[];
  inputHistory: string[];
  hasUnread: boolean;
  error?: string | null;
  
  // Keep these (metadata):
  source: ChatSessionSource;
  sourceId?: string;
  createdAt: number;
  updatedAt: number;
  model?: string;
}
```

### 2. Create useDerivedSessions Hook
**File:** `src-ui/src/hooks/useDerivedSessions.ts`

```typescript
export function useDerivedSessions(agentSlug: string, apiBase: string): ChatSession[] {
  const conversations = useConversations(apiBase, agentSlug);
  const agents = useAgents(apiBase);
  
  return conversations.map(conv => {
    const messages = useMessages(apiBase, conv.agentSlug, conv.id);
    const { status } = useConversationStatus(conv.agentSlug, conv.id);
    const chatState = useActiveChatState(conv.id);
    const agent = agents.find(a => a.slug === conv.agentSlug);
    
    return {
      id: conv.id,
      conversationId: conv.id,
      agentSlug: conv.agentSlug,
      agentName: agent?.name || conv.agentSlug,
      title: conv.title || `${agent?.name} Chat`,
      messages,
      status: status === 'streaming' ? 'sending' : 'idle',
      input: chatState?.input || '',
      attachments: chatState?.attachments || [],
      queuedMessages: chatState?.queuedMessages || [],
      inputHistory: chatState?.inputHistory || [],
      hasUnread: chatState?.hasUnread || false,
      error: chatState?.error,
      source: 'manual', // TODO: track this
      createdAt: new Date(conv.createdAt).getTime(),
      updatedAt: new Date(conv.updatedAt).getTime(),
    };
  });
}
```

### 3. Replace sessions State in App.tsx

**Before:**
```typescript
const [sessions, setSessions] = useState<ChatSession[]>([]);
```

**After:**
```typescript
const sessions = useDerivedSessions(selectedAgent || '', API_BASE);
const { initChat, updateChat, clearInput } = useActiveChatActions();
const { setStatus } = useConversationStatus(activeSession?.agentSlug || '', activeSession?.conversationId || '');
```

### 4. Update Session Mutations

**Before:**
```typescript
updateSession(sessionId, (session) => ({
  ...session,
  input: 'new value'
}));
```

**After:**
```typescript
updateChat(conversationId, { input: 'new value' });
```

### 5. Remove These Functions from App.tsx
- `updateSession()` - Replace with `updateChat()`
- `createChatSession()` - Replace with `initChat()` + conversation creation
- All `setSessions()` calls - Data comes from contexts

### 6. Update Message Sending Flow

**Before:**
```typescript
updateSession(sessionId, s => ({
  ...s,
  status: 'sending',
  messages: [...s.messages, userMessage]
}));
```

**After:**
```typescript
setStatus(agentSlug, conversationId, 'streaming');
// Messages auto-update via ConversationsContext after backend saves them
```

### 7. Update Input Handling

**Before:**
```typescript
updateSession(sessionId, s => ({ ...s, input: value }));
```

**After:**
```typescript
updateChat(conversationId, { input: value });
```

### 8. Files to Modify

1. **src-ui/src/App.tsx** (~500 lines affected)
   - Replace `sessions` state with `useDerivedSessions()`
   - Replace `updateSession()` with `updateChat()`
   - Replace `setSessions()` with context methods
   - Remove session creation/mutation logic

2. **src-ui/src/hooks/useDerivedSessions.ts** (new file)
   - Create the hook to derive sessions from contexts

3. **src-ui/src/types.ts**
   - Update ChatSession type documentation

## Testing Checklist

- [ ] Create new chat session
- [ ] Send messages
- [ ] Switch between sessions
- [ ] Input persists when switching tabs
- [ ] Attachments work
- [ ] Queued messages work
- [ ] Status indicators update correctly
- [ ] Unread badges work
- [ ] Session tabs render correctly
- [ ] Delete conversation
- [ ] Load existing conversations on mount

## Benefits

1. **Single source of truth** - No duplicate state
2. **Automatic sync** - Changes propagate automatically
3. **Less code** - Remove ~200 lines of state management
4. **Better separation** - Persistent vs ephemeral state
5. **Easier debugging** - Clear data flow

## Risks

1. **Breaking changes** - Large refactor
2. **Performance** - Multiple context subscriptions (mitigated by useSyncExternalStore)
3. **Complexity** - More contexts to understand

## Rollback Plan

If issues arise:
1. Keep ActiveChatsContext but don't use it
2. Revert App.tsx changes
3. Keep sessions array as-is
4. Remove useDerivedSessions hook
