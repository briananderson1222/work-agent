# Inference Profiles Fix - Complete

## Problem

Bedrock returned error:
```
Invocation of model ID anthropic.claude-haiku-4-5-20251001-v1:0 with on-demand throughput isn't supported. 
Retry your request with the ID or ARN of an inference profile that contains this model.
```

Some newer Bedrock models (like Claude Haiku 4.5) ONLY support inference profiles and cannot be invoked with base model IDs.

## Solution

Added automatic model ID resolution that:
1. Detects when a model requires an inference profile
2. Automatically maps base model ID → inference profile ID (e.g., `anthropic.claude-haiku-4-5-20251001-v1:0` → `us.anthropic.claude-haiku-4-5-20251001-v1:0`)
3. Resolves before passing to Bedrock Converse API

## Changes Made

### 1. Backend Model Catalog (`src-server/providers/bedrock-models.ts`)

**Added:**
- `ListInferenceProfilesCommand` import
- `InferenceProfile` interface
- `profilesCache` field
- `listInferenceProfiles()` method
- `resolveModelId()` method - automatically maps base IDs to inference profiles when needed
- Updated `validateModelId()` to check both APIs
- Updated `clearCache()` to clear profiles

**Key Logic:**
```typescript
async resolveModelId(modelId: string): Promise<string> {
  // If already an inference profile ID, return as-is
  if (modelId.match(/^(us|eu|ap|sa|ca|af|me)\./)) {
    return modelId;
  }

  // Check if this model requires inference profile
  const model = await this.getModelInfo(modelId);
  if (model?.inferenceTypesSupported?.length === 1 && 
      model.inferenceTypesSupported[0] === 'INFERENCE_PROFILE') {
    // Find corresponding inference profile (default to us. prefix)
    const profiles = await this.listInferenceProfiles();
    const profile = profiles.find(p => p.inferenceProfileId === `us.${modelId}`);
    if (profile) {
      return profile.inferenceProfileId;
    }
  }

  return modelId;
}
```

### 2. Backend Runtime (`src-server/runtime/voltagent-runtime.ts`)

**Updated:**
- `/bedrock/models` endpoint to return combined foundation models + inference profiles
- `createBedrockModel()` made async and calls `resolveModelId()`
- All model override paths now resolve model IDs before creating provider:
  - Agent invocation endpoint
  - Workflow execution
  - Model override in chat
  - Agent initialization

**Example:**
```typescript
const resolvedModel = await this.modelCatalog.resolveModelId(model);
options.model = createBedrockProvider({ 
  appConfig: this.appConfig, 
  agentSpec: { model: resolvedModel } as any 
});
```

### 3. Frontend Models Context (`src-ui/src/contexts/ModelsContext.tsx`)

**Updated:**
- Added `isInferenceProfile` and `profileType` to Model interface
- Removed client-side prefix guessing logic
- Uses model IDs as-is from backend
- Improved duplicate name handling: shows region prefix for inference profiles

## How It Works

1. **Model List**: Backend fetches both foundation models and inference profiles
2. **Validation**: Accepts both base model IDs and inference profile IDs
3. **Resolution**: When creating a Bedrock provider:
   - If model ID has region prefix (`us.`, `eu.`, etc.) → use as-is
   - If model only supports `INFERENCE_PROFILE` → automatically map to `us.{modelId}`
   - Otherwise → use base model ID
4. **Invocation**: Resolved ID passed to Bedrock Converse API

## Benefits

- ✅ **Automatic**: Users can select base model ID, system auto-resolves to inference profile
- ✅ **Backward Compatible**: Existing model IDs continue to work
- ✅ **Future-Proof**: Supports new models that require inference profiles
- ✅ **Better Availability**: Cross-region routing when using inference profiles
- ✅ **No Cost Impact**: Inference profiles have same pricing as base models

## Testing

```bash
# Restart server
npm run dev:server

# Test with base model ID (auto-resolves to us. prefix)
curl -X POST http://localhost:3141/agents/work-agent/text \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "Test"}],
    "userId": "test-user",
    "modelOverride": "anthropic.claude-haiku-4-5-20251001-v1:0"
  }'

# Test with inference profile ID (uses as-is)
curl -X POST http://localhost:3141/agents/work-agent/text \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "Test"}],
    "userId": "test-user",
    "modelOverride": "us.anthropic.claude-haiku-4-5-20251001-v1:0"
  }'
```

Both should work identically now.

## Files Modified

1. `src-server/providers/bedrock-models.ts` - Added inference profile support
2. `src-server/runtime/voltagent-runtime.ts` - Added model ID resolution
3. `src-ui/src/contexts/ModelsContext.tsx` - Simplified to use backend data

## Migration Notes

- No configuration changes needed
- Existing agent configs work as-is
- System automatically handles model resolution
- Users can continue using base model IDs or switch to inference profile IDs
