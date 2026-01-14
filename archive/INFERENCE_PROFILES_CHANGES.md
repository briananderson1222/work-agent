# Quick Reference: Inference Profiles Implementation

## Summary

Add support for Bedrock inference profiles (model IDs with `us.`, `eu.` prefixes) by fetching from both `ListFoundationModels` and `ListInferenceProfiles` APIs.

## Files to Modify

### 1. `src-server/providers/bedrock-models.ts`

**Add import:**
```typescript
import { 
  BedrockClient, 
  ListFoundationModelsCommand,
  ListInferenceProfilesCommand  // ADD THIS
} from "@aws-sdk/client-bedrock";
```

**Add interface:**
```typescript
export interface InferenceProfile {
  inferenceProfileId: string;
  inferenceProfileArn: string;
  inferenceProfileName: string;
  type: string;
  status: string;
  models: Array<{ modelArn: string }>;
}
```

**Add to class:**
```typescript
export class BedrockModelCatalog {
  private profilesCache: InferenceProfile[] | null = null; // ADD THIS
  
  // ADD THIS METHOD
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

  // UPDATE THIS METHOD
  async validateModelId(modelId: string): Promise<boolean> {
    const [models, profiles] = await Promise.all([
      this.listModels(),
      this.listInferenceProfiles()
    ]);
    
    return models.some((m) => m.modelId === modelId) || 
           profiles.some((p) => p.inferenceProfileId === modelId);
  }

  // UPDATE THIS METHOD
  clearCache() {
    this.modelsCache = null;
    this.profilesCache = null; // ADD THIS LINE
    this.pricingCache.clear();
  }
}
```

### 2. `src-server/runtime/voltagent-runtime.ts`

**Find and replace the `/bedrock/models` endpoint:**

```typescript
app.get('/bedrock/models', async (c) => {
  try {
    if (!this.modelCatalog) {
      return c.json({ success: false, error: 'Model catalog not initialized' }, 500);
    }
    
    const [models, profiles] = await Promise.all([
      this.modelCatalog.listModels(),
      this.modelCatalog.listInferenceProfiles()
    ]);
    
    const combinedModels = [
      ...models,
      ...profiles.map(p => ({
        modelId: p.inferenceProfileId,
        modelArn: p.inferenceProfileArn,
        modelName: p.inferenceProfileName,
        providerName: 'AWS',
        inputModalities: [],
        outputModalities: ['TEXT'],
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

### 3. `src-ui/src/contexts/ModelsContext.tsx`

**Update the `fetch` method in `ModelsStore` class:**

Replace the entire `fetch` method with:

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
              const prefix = m.id.split('.')[0];
              m.name = `${m.name} (${prefix.toUpperCase()})`;
            } else {
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

**Update the interface:**
```typescript
interface Model {
  id: string;
  name: string;
  originalId: string;
  isInferenceProfile?: boolean;  // ADD THIS
  profileType?: string;           // ADD THIS
}
```

## No Changes Needed

- `src-server/providers/bedrock.ts` - Already passes model ID correctly to Converse API
- Agent configuration files - Existing model IDs continue to work
- Database/storage - No schema changes needed

## Testing

```bash
# 1. Start the server
npm run dev:server

# 2. Test the endpoint
curl http://localhost:3141/bedrock/models | jq '.data[] | select(.isInferenceProfile == true)'

# 3. Test validation with inference profile
curl http://localhost:3141/bedrock/models/us.anthropic.claude-haiku-4-5-20251001-v1:0/validate

# 4. Test chat with inference profile
curl -X POST http://localhost:3141/agents/work-agent/text \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "Hello"}],
    "userId": "test-user",
    "modelOverride": "us.anthropic.claude-haiku-4-5-20251001-v1:0"
  }'
```

## Expected Behavior

- Model selector shows both base models and inference profiles
- Inference profiles display with region prefix: "Claude Haiku 4.5 (US)"
- Both model types work in chat
- Validation accepts both formats
- No breaking changes to existing configurations
