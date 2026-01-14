# Bedrock Inference Profiles Implementation Guide

## Problem Summary

The backend currently rejects model IDs with `us.` prefix (cross-region inference profiles) because validation only checks against `ListFoundationModels` API, which returns base model IDs only. Inference profile IDs come from a separate API (`ListInferenceProfiles`).

## Current Architecture

### Backend
- **Model Catalog**: `src-server/providers/bedrock-models.ts` - `BedrockModelCatalog` class
- **Validation**: Only calls `ListFoundationModelsCommand`
- **API Endpoint**: `/bedrock/models` returns foundation models only
- **Usage**: Model ID passed directly to `createAmazonBedrock().languageModel(modelId)`

### Frontend
- **Model Store**: `src-ui/src/contexts/ModelsContext.tsx` - `ModelsStore` class
- **Current Logic**: Adds `us.` prefix to models with `INFERENCE_PROFILE` type
- **Storage**: Stores both `id` (with prefix) and `originalId` (without prefix)

## Required Changes

### 1. Backend: Update BedrockModelCatalog

**File**: `src-server/providers/bedrock-models.ts`

Add inference profile support to the catalog:

```typescript
import { 
  BedrockClient, 
  ListFoundationModelsCommand,
  ListInferenceProfilesCommand 
} from "@aws-sdk/client-bedrock";

export interface InferenceProfile {
  inferenceProfileId: string;
  inferenceProfileArn: string;
  inferenceProfileName: string;
  type: string; // "SYSTEM_DEFINED" | "APPLICATION"
  status: string;
  models: Array<{ modelArn: string }>;
}

export class BedrockModelCatalog {
  private bedrockClient: BedrockClient;
  private pricingClient: PricingClient;
  private modelsCache: BedrockModel[] | null = null;
  private profilesCache: InferenceProfile[] | null = null;
  private pricingCache: Map<string, ModelPricing[]> = new Map();

  // ... existing constructor ...

  async listModels(): Promise<BedrockModel[]> {
    if (this.modelsCache) return this.modelsCache;

    const command = new ListFoundationModelsCommand({});
    const response = await this.bedrockClient.send(command);

    this.modelsCache = (response.modelSummaries || []).map((model) => ({
      modelId: model.modelId!,
      modelArn: model.modelArn!,
      modelName: model.modelName!,
      providerName: model.providerName!,
      inputModalities: model.inputModalities || [],
      outputModalities: model.outputModalities || [],
      responseStreamingSupported: model.responseStreamingSupported || false,
      customizationsSupported: model.customizationsSupported || [],
      inferenceTypesSupported: model.inferenceTypesSupported || [],
    }));

    return this.modelsCache;
  }

  async listInferenceProfiles(): Promise<InferenceProfile[]> {
    if (this.profilesCache) return this.profilesCache;

    const command = new ListInferenceProfilesCommand({});
    const response = await this.bedrockClient.send(command);

    this.profilesCache = (response.inferenceProfileSummaries || []).map((profile) => ({
      inferenceProfileId: profile.inferenceProfileId!,
      inferenceProfileArn: profile.inferenceProfileArn!,
      inferenceProfileName: profile.inferenceProfileName!,
      type: profile.type!,
      status: profile.status!,
      models: profile.models || [],
    }));

    return this.profilesCache;
  }

  async validateModelId(modelId: string): Promise<boolean> {
    // Check both foundation models and inference profiles
    const [models, profiles] = await Promise.all([
      this.listModels(),
      this.listInferenceProfiles()
    ]);
    
    const isFoundationModel = models.some((m) => m.modelId === modelId);
    const isInferenceProfile = profiles.some((p) => p.inferenceProfileId === modelId);
    
    return isFoundationModel || isInferenceProfile;
  }

  async getModelInfo(modelId: string): Promise<BedrockModel | undefined> {
    const models = await this.listModels();
    return models.find((m) => m.modelId === modelId);
  }

  async getInferenceProfileInfo(profileId: string): Promise<InferenceProfile | undefined> {
    const profiles = await this.listInferenceProfiles();
    return profiles.find((p) => p.inferenceProfileId === profileId);
  }

  clearCache() {
    this.modelsCache = null;
    this.profilesCache = null;
    this.pricingCache.clear();
  }
}
```

### 2. Backend: Update API Endpoint

**File**: `src-server/runtime/voltagent-runtime.ts`

Update the `/bedrock/models` endpoint to return combined list:

```typescript
app.get('/bedrock/models', async (c) => {
  try {
    if (!this.modelCatalog) {
      return c.json({ success: false, error: 'Model catalog not initialized' }, 500);
    }
    
    // Fetch both foundation models and inference profiles
    const [models, profiles] = await Promise.all([
      this.modelCatalog.listModels(),
      this.modelCatalog.listInferenceProfiles()
    ]);
    
    // Combine into unified response
    const combinedModels = [
      ...models,
      ...profiles.map(p => ({
        modelId: p.inferenceProfileId,
        modelArn: p.inferenceProfileArn,
        modelName: p.inferenceProfileName,
        providerName: 'AWS', // Inference profiles are AWS-managed
        inputModalities: [],
        outputModalities: ['TEXT'], // Assume text for profiles
        responseStreamingSupported: true,
        customizationsSupported: [],
        inferenceTypesSupported: ['INFERENCE_PROFILE'],
        isInferenceProfile: true,
        profileType: p.type,
        status: p.status
      }))
    ];
    
    return c.json({ success: true, data: combinedModels });
  } catch (error: any) {
    console.error('Error listing models:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});
```

### 3. Frontend: Simplify Model Processing

**File**: `src-ui/src/contexts/ModelsContext.tsx`

Remove the prefix-adding logic since backend now returns inference profiles directly:

```typescript
async fetch(apiBase: string) {
  const existing = this.fetching.get(apiBase);
  if (existing) return existing;

  const promise = (async () => {
    try {
      const response = await fetch(`${apiBase}/bedrock/models`);
      const data = await response.json();
      
      if (data.success) {
        const processedModels = data.data
          .filter((m: any) => m.outputModalities.includes('TEXT'))
          .map((m: any) => ({
            id: m.modelId, // Use as-is (includes us. prefix for profiles)
            name: m.modelName || m.modelId,
            originalId: m.modelId,
            isInferenceProfile: m.isInferenceProfile || false,
            profileType: m.profileType
          }));
        
        // Add suffix to duplicate names
        const nameCounts = new Map<string, number>();
        processedModels.forEach((m: any) => {
          nameCounts.set(m.name, (nameCounts.get(m.name) || 0) + 1);
        });
        
        processedModels.forEach((m: any) => {
          if (nameCounts.get(m.name)! > 1) {
            if (m.isInferenceProfile) {
              // Add region prefix for inference profiles
              const prefix = m.id.split('.')[0];
              m.name = `${m.name} (${prefix.toUpperCase()})`;
            } else {
              // Add version suffix for foundation models
              const parts = m.originalId.split(':');
              const suffix = parts[parts.length - 1];
              if (suffix && suffix !== '0' && isNaN(Number(suffix))) {
                m.name = `${m.name} (${suffix})`;
              }
            }
          }
        });
        
        this.models = processedModels;
        this.notify();
      }
    } catch (error) {
      console.error('Failed to load models:', error);
    } finally {
      this.fetching.delete(apiBase);
    }
  })();

  this.fetching.set(apiBase, promise);
  return promise;
}
```

### 4. Backend: No Changes Needed to Provider

**File**: `src-server/providers/bedrock.ts`

The Bedrock provider already passes the model ID directly to the Converse API, which accepts both formats:

```typescript
return provider.languageModel(model); // Works with both formats
```

No changes needed here - the Vercel AI SDK and Bedrock Converse API handle both base model IDs and inference profile IDs.

## Benefits of This Approach

1. **Better Availability**: Cross-region inference profiles automatically route to available regions
2. **No Additional Cost**: Inference profiles have the same pricing as base models
3. **Backward Compatible**: Existing base model IDs continue to work
4. **Future-Proof**: Supports both system-defined and application-defined inference profiles
5. **Cleaner Code**: Frontend no longer needs to guess which models need prefixes

## Testing Checklist

- [ ] Backend returns both foundation models and inference profiles from `/bedrock/models`
- [ ] Validation accepts both `anthropic.claude-haiku-4-5-20251001-v1:0` and `us.anthropic.claude-haiku-4-5-20251001-v1:0`
- [ ] Frontend displays both types of models in selector
- [ ] Chat requests work with inference profile IDs
- [ ] Model validation endpoint accepts both formats
- [ ] Cache invalidation works for both model types

## Migration Notes

- Existing agent configurations with base model IDs will continue to work
- Users can switch to inference profiles by selecting them in the UI
- No database migrations needed (file-based storage)
- Consider adding a UI indicator to show which models are cross-region profiles

## Performance Considerations

- Cache both `ListFoundationModels` and `ListInferenceProfiles` responses
- Consider 1-hour TTL for model list cache (models don't change frequently)
- Parallel fetch both APIs to minimize latency
- Consider pagination for `ListInferenceProfiles` if many custom profiles exist
