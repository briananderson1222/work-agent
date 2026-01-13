# Streaming Message Handler Refactoring

## Overview

Refactored `useStreamingMessage.ts` from a 300+ line monolithic function with nested if/else statements into a clean, modular handler-based architecture.

## Architecture

### Before
- Single 300+ line function
- Nested if/else statements
- Repeated state update patterns
- Hard to test individual event handlers
- Difficult to add new event types

### After
```
src-ui/src/hooks/
├── useStreamingMessage.ts (50 lines - orchestrator)
└── streaming/
    ├── types.ts                  - TypeScript interfaces
    ├── stateHelpers.ts           - State manipulation utilities
    ├── BaseHandler.ts            - Abstract base class
    ├── StepHandler.ts            - start-step/finish-step
    ├── ReasoningHandler.ts       - reasoning-start/delta/end
    ├── TextDeltaHandler.ts       - text-delta
    ├── ToolApprovalHandler.ts    - tool-approval-request
    └── ToolLifecycleHandler.ts   - tool-input/output-available
```

## Handler Pattern

Each handler extends `StreamEventHandler` and implements:

```typescript
class MyHandler extends StreamEventHandler {
  canHandle(event: StreamEvent): boolean {
    return event.type === 'my-event-type';
  }
  
  handle(event: StreamEvent, state: StreamState): HandlerResult {
    // Clean, focused logic for one event type
    // Use helper methods from base class
    // Return updated state
  }
}
```

## Main Hook (After)

```typescript
export function useStreamingMessage(apiBase: string, onNavigateToChat?: (sessionId: string) => void) {
  const handleStreamEvent = useCallback((sessionId: string, data: any, state: StreamState) => {
    const context: HandlerContext = { sessionId, updateChat, apiBase, ... };
    
    const handlers = [
      new StepHandler(context),
      new ReasoningHandler(context),
      new ToolApprovalHandler(context),
      new TextDeltaHandler(context),
      new ToolLifecycleHandler(context),
    ];
    
    const handler = handlers.find(h => h.canHandle(data));
    return handler ? handler.handle(data, state) : createNoOpResult(state);
  }, [/* deps */]);
  
  return { handleStreamEvent, clearStreamingMessage };
}
```

## Benefits

1. **Separation of Concerns**: Each handler manages one event type
2. **Testability**: Easy to unit test individual handlers in isolation
3. **Extensibility**: Add new handlers without touching existing code
4. **Readability**: Main hook is now 50 lines vs 300+
5. **Type Safety**: Strong typing for events, state, and results
6. **Reusability**: Handlers can be used in other contexts
7. **Maintainability**: Changes to one event type don't affect others

## Handler Responsibilities

### StepHandler
- `start-step`: Set `isProcessingStep: true`
- `finish-step`: Set `isProcessingStep: false`

### ReasoningHandler
- `reasoning-start`: Initialize reasoning content part
- `reasoning-delta`: Accumulate reasoning text
- `reasoning-end`: Finalize reasoning block
- `reasoning`: Legacy format support

### TextDeltaHandler
- `text-delta`: Accumulate text content

### ToolApprovalHandler
- `tool-approval-request`: Handle auto-approval or show toast

### ToolLifecycleHandler
- `tool-input-available`: Add tool part to content
- `tool-output-available`: Update tool part with result
- `tool-result`: Update tool part with result (alias)

## State Helpers

Utility functions for common operations:

- `createNoOpResult(state)` - No changes
- `createResult(state, updates)` - Create result with updates
- `updateContentPart(parts, type, updater)` - Update specific part
- `prependContentPart(parts, newPart)` - Add to beginning
- `appendContentPart(parts, newPart)` - Add to end
- `hasContentPartOfType(parts, type)` - Check existence

## Adding New Event Types

To add a new event type:

1. Create new handler class extending `StreamEventHandler`
2. Implement `canHandle()` and `handle()` methods
3. Add to handler array in `useStreamingMessage.ts`
4. No changes needed to existing handlers

Example:

```typescript
// src-ui/src/hooks/streaming/MyNewHandler.ts
export class MyNewHandler extends StreamEventHandler {
  canHandle(event: StreamEvent): boolean {
    return event.type === 'my-new-event';
  }
  
  handle(event: StreamEvent, state: StreamState): HandlerResult {
    // Implementation
    return createResult(state, { /* updates */ });
  }
}

// In useStreamingMessage.ts
const handlers = [
  // ... existing handlers
  new MyNewHandler(context),
];
```

## Testing Strategy

Each handler can be tested independently:

```typescript
describe('ReasoningHandler', () => {
  it('should handle reasoning-start event', () => {
    const handler = new ReasoningHandler(mockContext);
    const result = handler.handle(
      { type: 'reasoning-start' },
      mockState
    );
    expect(result.contentParts).toContainEqual({
      type: 'reasoning',
      content: ''
    });
  });
});
```

## Migration Notes

- No breaking changes to external API
- `StreamState` type replaces inline state object
- All existing functionality preserved
- Backward compatible with existing code

## Future Enhancements

1. Add handler priority system for overlapping event types
2. Add middleware support for cross-cutting concerns
3. Add handler composition for complex event sequences
4. Add performance monitoring per handler
5. Add handler-level error boundaries
