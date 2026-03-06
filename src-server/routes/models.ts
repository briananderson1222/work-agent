import {
  BedrockClient,
  ListFoundationModelsCommand,
} from '@aws-sdk/client-bedrock';
import { GetProductsCommand, PricingClient } from '@aws-sdk/client-pricing';
import { createLogger } from '../utils/logger.js';
import { Hono } from 'hono';

const logger = createLogger({ name: 'models' });

const app = new Hono();

// Cache for model data (refresh every hour)
let modelCache: any = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

app.get('/capabilities', async (c) => {
  try {
    // Return cached data if fresh
    if (modelCache && Date.now() - cacheTimestamp < CACHE_TTL) {
      return c.json({ data: modelCache });
    }

    const region = process.env.AWS_REGION || 'us-east-1';
    const bedrockClient = new BedrockClient({ region });

    // Fetch model capabilities
    const modelsResponse = await bedrockClient.send(
      new ListFoundationModelsCommand({}),
    );
    const models = modelsResponse.modelSummaries || [];

    // Build capabilities map (include LEGACY models as they still work)
    const capabilities = models
      .filter(
        (m) =>
          m.modelLifecycle?.status === 'ACTIVE' ||
          m.modelLifecycle?.status === 'LEGACY',
      )
      .map((model) => ({
        modelId: model.modelId,
        modelName: model.modelName,
        provider: model.providerName,
        inputModalities: model.inputModalities || [],
        outputModalities: model.outputModalities || [],
        supportsStreaming: model.responseStreamingSupported,
        supportsImages: ((model.inputModalities as string[]) || []).includes(
          'IMAGE',
        ),
        supportsVideo: ((model.inputModalities as string[]) || []).includes(
          'VIDEO',
        ),
        supportsAudio:
          ((model.inputModalities as string[]) || []).includes('AUDIO') ||
          ((model.inputModalities as string[]) || []).includes('SPEECH'),
        lifecycleStatus: model.modelLifecycle?.status,
      }));

    modelCache = capabilities;
    cacheTimestamp = Date.now();

    return c.json({ data: capabilities });
  } catch (error: any) {
    logger.error('Error fetching model capabilities', { error });

    // Return 401 for credential errors
    if (
      error.name === 'CredentialsProviderError' ||
      error.message?.includes('credentials')
    ) {
      return c.json(
        { error: 'AWS credentials not configured', details: error.message },
        401,
      );
    }

    return c.json({ error: error.message }, 500);
  }
});

app.get('/pricing/:modelId', async (c) => {
  try {
    const modelId = c.req.param('modelId');
    const region =
      c.req.query('region') || process.env.AWS_REGION || 'us-east-1';

    // Extract model name from modelId (e.g., "anthropic.claude-3-7-sonnet-20250219-v1:0" -> "Claude 3.7 Sonnet")
    const pricingClient = new PricingClient({ region: 'us-east-1' }); // Pricing API only in us-east-1

    const response = await pricingClient.send(
      new GetProductsCommand({
        ServiceCode: 'AmazonBedrock',
        MaxResults: 100,
        Filters: [{ Field: 'regionCode', Value: region, Type: 'TERM_MATCH' }],
      }),
    );

    const priceList = response.PriceList || [];
    const modelPricing: any = {
      modelId,
      region,
      inputTokenPrice: null,
      outputTokenPrice: null,
      currency: 'USD',
    };

    // Parse pricing data
    for (const priceItem of priceList) {
      const data = JSON.parse(priceItem);
      const attrs = data.product?.attributes || {};

      // Match by model name or ID
      if (
        attrs.model &&
        modelId
          .toLowerCase()
          .includes(attrs.model.toLowerCase().replace(/\s+/g, '-'))
      ) {
        const terms = data.terms?.OnDemand || {};
        const termKey = Object.keys(terms)[0];
        if (termKey) {
          const dimensions = terms[termKey].priceDimensions || {};
          const dimKey = Object.keys(dimensions)[0];
          if (dimKey) {
            const price = parseFloat(
              dimensions[dimKey].pricePerUnit?.USD || '0',
            );

            if (attrs.inferenceType?.includes('input')) {
              modelPricing.inputTokenPrice = price;
            } else if (attrs.inferenceType?.includes('output')) {
              modelPricing.outputTokenPrice = price;
            }
          }
        }
      }
    }

    return c.json({ data: modelPricing });
  } catch (error: any) {
    logger.error('Error fetching model pricing', { error });
    return c.json({ error: error.message }, 500);
  }
});

export default app;
