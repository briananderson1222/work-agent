import { BedrockClient, ListFoundationModelsCommand } from "@aws-sdk/client-bedrock";
import { PricingClient, GetProductsCommand } from "@aws-sdk/client-pricing";

export interface BedrockModel {
  modelId: string;
  modelArn: string;
  modelName: string;
  providerName: string;
  inputModalities: string[];
  outputModalities: string[];
  responseStreamingSupported: boolean;
  customizationsSupported: string[];
  inferenceTypesSupported: string[];
}

export interface ModelPricing {
  modelId: string;
  provider?: string;
  inputTokenPrice?: number;  // per 1K tokens
  outputTokenPrice?: number; // per 1K tokens
  region: string;
  feature: string; // "On-demand Inference", "Batch Inference", etc.
}

export class BedrockModelCatalog {
  private bedrockClient: BedrockClient;
  private pricingClient: PricingClient;
  private modelsCache: BedrockModel[] | null = null;
  private pricingCache: Map<string, ModelPricing[]> = new Map();

  constructor(region: string = "us-east-1") {
    this.bedrockClient = new BedrockClient({ region });
    this.pricingClient = new PricingClient({ region: "us-east-1" }); // Pricing API only in us-east-1
  }

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

  async getModelPricing(region: string = "us-east-1"): Promise<ModelPricing[]> {
    const cacheKey = region;
    if (this.pricingCache.has(cacheKey)) {
      return this.pricingCache.get(cacheKey)!;
    }

    const pricing: ModelPricing[] = [];
    let nextToken: string | undefined;

    do {
      const command = new GetProductsCommand({
        ServiceCode: "AmazonBedrock",
        Filters: [
          { Type: "TERM_MATCH", Field: "regionCode", Value: region },
          { Type: "TERM_MATCH", Field: "productFamily", Value: "Amazon Bedrock" },
        ],
        MaxResults: 100,
        NextToken: nextToken,
      });

      const response = await this.pricingClient.send(command);
      
      for (const priceItem of response.PriceList || []) {
        const product = JSON.parse(priceItem);
        const attrs = product.product?.attributes;
        const terms = product.terms?.OnDemand;

        if (!attrs || !terms) continue;

        const model = attrs.model;
        const provider = attrs.provider;
        const inferenceType = attrs.inferenceType;
        const feature = attrs.feature;

        if (!model) continue;

        // Extract price from terms
        const termKey = Object.keys(terms)[0];
        const priceDimensions = terms[termKey]?.priceDimensions;
        if (!priceDimensions) continue;

        const dimensionKey = Object.keys(priceDimensions)[0];
        const pricePerUnit = priceDimensions[dimensionKey]?.pricePerUnit?.USD;
        const price = pricePerUnit ? parseFloat(pricePerUnit) : undefined;

        // Map inference type to input/output
        const existing = pricing.find(
          (p) => p.modelId === model && p.feature === feature
        );

        if (existing) {
          if (inferenceType?.includes("Output")) {
            existing.outputTokenPrice = price;
          } else if (inferenceType?.includes("Input")) {
            existing.inputTokenPrice = price;
          }
        } else {
          pricing.push({
            modelId: model,
            provider,
            inputTokenPrice: inferenceType?.includes("Input") ? price : undefined,
            outputTokenPrice: inferenceType?.includes("Output") ? price : undefined,
            region,
            feature: feature || "On-demand Inference",
          });
        }
      }

      nextToken = response.NextToken;
    } while (nextToken);

    this.pricingCache.set(cacheKey, pricing);
    return pricing;
  }

  async validateModelId(modelId: string): Promise<boolean> {
    const models = await this.listModels();
    return models.some((m) => m.modelId === modelId);
  }

  async getModelInfo(modelId: string): Promise<BedrockModel | undefined> {
    const models = await this.listModels();
    return models.find((m) => m.modelId === modelId);
  }

  clearCache() {
    this.modelsCache = null;
    this.pricingCache.clear();
  }
}
