# Tool Display Debug Test

## Steps to Test

1. Start the dev server:
   ```bash
   npm run dev:server
   npm run dev:ui
   ```

2. Open browser console (F12)

3. Send a message that triggers a tool call (e.g., "What files are in the current directory?")

4. Watch for these console logs:

### Expected Log Sequence

1. **Backend emits tool event:**
   ```
   [SSE Event] tool-input-available { ... }
   [TOOL EVENT RECEIVED] { type: 'tool-input-available', toolName: '...', ... }
   ```

2. **useStreamingMessage processes it:**
   ```
   [useStreamingMessage] tool-input-available: { toolCall: {...}, newContentParts: [...] }
   ```

3. **useDerivedSessions adds to session:**
   ```
   [useDerivedSessions] Adding streamingMessage: { hasContentParts: true, contentPartsLength: 2, ... }
   ```

4. **ChatDock renders it:**
   ```
   [ChatDock] Rendering contentPart: { part: { type: 'tool', tool: {...} }, ... }
   ```

## What to Check

- [ ] Are `tool-input-available` events being received?
- [ ] Is `handleStreamEvent` being called with the tool event?
- [ ] Is `streamingMessage.contentParts` being updated?
- [ ] Is the streamingMessage being added to the session messages?
- [ ] Is ChatDock rendering the contentParts?

## Common Issues

1. **Events not received**: Check backend is emitting `tool-input-available`
2. **contentParts not updated**: Check `useStreamingMessage` logic
3. **streamingMessage not in session**: Check `useDerivedSessions` logic
4. **Not rendering**: Check ChatDock message rendering logic
