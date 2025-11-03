# Model Switching Error Handling

## Problem

When switching models using the `/model` command, if the next request failed (e.g., due to an invalid model ID or Bedrock API error), there was no clear visual indicator to the user that something went wrong. The error would occur silently or with minimal feedback.

## Solution

Implemented comprehensive error handling and visual feedback for model switching:

### Backend Changes (`src-server/runtime/voltagent-runtime.ts`)

1. **Model Validation**: Added validation before creating a new Bedrock provider
   - Validates model ID using the BedrockModelCatalog
   - Returns a clear 400 error if the model ID is invalid
   - Continues if validation fails due to API issues (graceful degradation)

2. **Better Error Messages**: Improved error messages for model switching failures
   - Specific error message format: "Failed to switch to model {modelId}: {error}"
   - Logs model override attempts for debugging

3. **Error Handling**: Added try-catch around agent creation with model override
   - Prevents server crashes from invalid model configurations
   - Returns 500 error with descriptive message if agent creation fails

### Frontend Changes (`src-ui/src/App.tsx`)

1. **HTTP Error Handling**: Added special handling for model-related errors
   - Detects model errors in HTTP responses
   - Shows formatted error message with emoji: "❌ **Model Error**: {message}"
   - Suggests using `/model` command to select a different model

2. **SSE Error Handling**: Added error event handling in streaming responses
   - Detects `type: 'error'` events from the server
   - Identifies model-related errors by checking error message content
   - Shows clear error message in chat with actionable guidance

3. **Success Feedback**: Added toast notifications for successful model switches
   - Shows "✓ Model switched to {modelName}" toast
   - Only shows when model actually changes (not when selecting already-active model)
   - Works for both keyboard (Enter/Tab) and mouse selection

## User Experience

### Before
- Model switch fails silently
- No indication that an error occurred
- User might think the model switched successfully
- Next request fails with cryptic error

### After
- Clear validation before switching
- Immediate error message if model is invalid
- Visual error indicator in chat: "❌ **Model Error**: ..."
- Success toast when model switches successfully: "✓ Model switched to ..."
- Actionable guidance: "Please select a different model using `/model` command"

## Testing

To test the error handling:

1. **Invalid Model ID**: Try switching to a non-existent model
   ```
   /model invalid-model-id
   ```
   Expected: Error message appears immediately

2. **Valid Model Switch**: Switch to a valid model
   ```
   /model anthropic.claude-3-haiku-20240307-v1:0
   ```
   Expected: Success toast appears, system message in chat

3. **Already Active Model**: Select the currently active model
   ```
   /model <current-model>
   ```
   Expected: No toast, no duplicate system message

## Error Message Format

### Model Validation Error (400)
```
Invalid model ID: {modelId}. Please select a valid model from the list.
```

### Model Creation Error (500)
```
Failed to switch to model {modelId}: {error message}
```

### UI Error Display
```
❌ **Model Error**: {error message}

Please select a different model using `/model` command.
```

## Implementation Details

### Model Validation Flow
1. User selects model via `/model` command
2. UI sends request to `/agents/:slug/chat` with `model` option
3. Server validates model ID using BedrockModelCatalog
4. If invalid, returns 400 error immediately
5. If valid, creates cached agent with new model
6. Streams response back to UI

### Error Propagation
- HTTP errors (400, 500) → Caught in `sendMessage` → Displayed as system message
- SSE errors → Parsed from stream → Displayed as system message
- Both paths show clear error formatting with emoji and guidance

## Future Improvements

1. **Client-side Validation**: Validate model ID in UI before sending request
2. **Model Compatibility Check**: Warn if model doesn't support required features
3. **Retry Logic**: Automatically retry with default model if custom model fails
4. **Model History**: Track recently used models for quick switching
5. **Model Preloading**: Pre-validate and cache model providers on startup
