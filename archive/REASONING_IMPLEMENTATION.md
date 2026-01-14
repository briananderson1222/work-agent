# Reasoning Block Implementation

## Overview

This implementation adds proper support for Amazon Nova Pro's `<thinking>` reasoning blocks, converting them to AI SDK's native `ReasoningUIPart` format for clean storage and display.

## Changes Made

### Backend

**1. Reasoning Parser Utility** (`src-server/utils/reasoning-parser.ts`)
- Extracts `<thinking>...</thinking>` blocks from message text
- Converts to proper AI SDK `ReasoningUIPart` format: `{ type: 'reasoning', text: '...' }`
- Handles multiple reasoning blocks in a single message
- Preserves text before/after/between reasoning blocks
- Handles edge cases (unclosed tags, empty blocks)

**2. Memory Adapter** (`src-server/adapters/file/voltagent-memory-adapter.ts`)
- Imports `parseReasoningFromMessage` utility
- Parses reasoning before saving messages to NDJSON
- Messages now stored with clean separation:
  ```json
  {
    "role": "assistant",
    "parts": [
      { "type": "reasoning", "text": "reasoning content" },
      { "type": "text", "text": "response content" }
    ]
  }
  ```

### Frontend

**3. Streaming Handler** (`src-ui/src/hooks/useStreamingMessage.ts`)
- Added handlers for `reasoning-start`, `reasoning-delta`, `reasoning-end` events
- Accumulates reasoning content in real-time during streaming
- Creates reasoning parts in `contentParts` array
- Maintains backward compatibility with legacy `reasoning` event

**4. Message Loader** (`src-ui/src/contexts/ConversationsContext.tsx`)
- Added `reasoning` type handling when loading messages from memory
- Converts stored reasoning parts to display format
- Ensures consistent rendering for both streaming and rehydrated messages

**5. Message Display** (`src-ui/src/components/ChatDock.tsx`)
- Already had reasoning display component (collapsible block with 💭 icon)
- No changes needed - works with both streaming and rehydrated messages

## Memory Format

**Before:**
```json
{
  "role": "assistant",
  "parts": [
    {
      "type": "text",
      "text": "<thinking>User wants calendar. I'll use satOutlook_calendarView.</thinking>\n\nHere's your calendar for today:"
    }
  ]
}
```

**After:**
```json
{
  "role": "assistant",
  "parts": [
    {
      "type": "reasoning",
      "text": "User wants calendar. I'll use satOutlook_calendarView."
    },
    {
      "type": "text",
      "text": "Here's your calendar for today:"
    }
  ]
}
```

## Benefits

1. **Clean Memory**: Reasoning stored separately from response text
2. **AI SDK Native**: Uses standard `ReasoningUIPart` format
3. **Clean Context**: Model doesn't see reasoning when messages are sent back
4. **Preserved History**: Reasoning available for review/debugging
5. **DRY**: Single parser utility for all reasoning extraction
6. **Portable**: Adapter pattern works for any storage backend (Postgres, Supabase, etc.)
7. **Future-Proof**: Easy to add other model formats (OpenAI o1, Claude, etc.)

## Testing Checklist

- [ ] **Streaming**: Start new conversation with Nova Pro, verify reasoning appears in collapsible block
- [ ] **Memory**: Check NDJSON file has separate reasoning and text parts
- [ ] **Rehydration**: Reload conversation, verify reasoning displays correctly
- [ ] **Multiple Blocks**: Test message with multiple `<thinking>` blocks
- [ ] **Mixed Content**: Test text before/after reasoning blocks
- [ ] **Edge Cases**: Test unclosed tags, empty reasoning blocks

## Future Enhancements

1. Add support for other model reasoning formats:
   - OpenAI o1 reasoning tokens
   - Claude thinking blocks
   - Other providers

2. Add reasoning analytics:
   - Track reasoning length vs response quality
   - Identify patterns in reasoning approach

3. Add reasoning controls:
   - Toggle reasoning visibility per agent
   - Export reasoning for analysis
