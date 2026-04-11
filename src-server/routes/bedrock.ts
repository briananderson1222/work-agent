/**
 * Bedrock Routes - model catalog, pricing, and validation
 */

import type { AppConfig } from '@stallion-ai/contracts/config';
import { Hono } from 'hono';
import type { BedrockModelCatalog } from '../providers/bedrock-models.js';
import { bedrockOps } from '../telemetry/metrics.js';
import type { Logger } from '../utils/logger.js';
import { errorMessage, param } from './schemas.js';

export function createBedrockRoutes(
  getModelCatalog: () => BedrockModelCatalog | undefined,
  appConfig: AppConfig,
  logger: Logger,
) {
  const app = new Hono();

  // List all available Bedrock models
  app.get('/models', async (c) => {
    try {
      const modelCatalog = getModelCatalog();
      if (!modelCatalog) {
        return c.json(
          { success: false, error: 'Model catalog not initialized' },
          500,
        );
      }
      bedrockOps.add(1, { op: 'list_models' });
      const [models, profiles] = await Promise.all([
        modelCatalog.listModels(),
        modelCatalog.listInferenceProfiles(),
      ]);

      // Filter models to only include those with ON_DEMAND support
      const onDemandModels = models.filter((m) =>
        m.inferenceTypesSupported?.includes('ON_DEMAND'),
      );

      // Create set of base model IDs that have inference profiles
      const profileBaseIds = new Set(
        profiles.map((p) =>
          p.inferenceProfileId.replace(/^(us|eu|ap|sa|ca|af|me)\./, ''),
        ),
      );

      // Filter out base models that have inference profile equivalents
      const filteredModels = onDemandModels.filter(
        (m) => !profileBaseIds.has(m.modelId),
      );

      const combinedModels = [
        ...filteredModels,
        ...profiles.map((p) => ({
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
          status: p.status,
        })),
      ];

      return c.json({ success: true, data: combinedModels });
    } catch (error: unknown) {
      logger.error('Failed to list Bedrock models', { error });
      return c.json({ success: false, error: errorMessage(error) }, 500);
    }
  });

  // Get pricing for Bedrock models
  app.get('/pricing', async (c) => {
    try {
      const modelCatalog = getModelCatalog();
      if (!modelCatalog) {
        return c.json(
          { success: false, error: 'Model catalog not initialized' },
          500,
        );
      }
      const region = c.req.query('region') || appConfig.region;
      bedrockOps.add(1, { op: 'get_pricing' });
      const pricing = await modelCatalog.getModelPricing(region);
      return c.json({ success: true, data: pricing });
    } catch (error: unknown) {
      logger.error('Failed to get Bedrock pricing', { error });
      return c.json({ success: false, error: errorMessage(error) }, 500);
    }
  });

  // Validate a model ID
  app.get('/models/:modelId/validate', async (c) => {
    try {
      const modelCatalog = getModelCatalog();
      if (!modelCatalog) {
        return c.json(
          { success: false, error: 'Model catalog not initialized' },
          500,
        );
      }
      const modelId = param(c, 'modelId');
      bedrockOps.add(1, { op: 'validate_model' });
      const isValid = await modelCatalog.validateModelId(modelId);
      return c.json({ success: true, data: { modelId, isValid } });
    } catch (error: unknown) {
      logger.error('Failed to validate model ID', { error });
      return c.json({ success: false, error: errorMessage(error) }, 500);
    }
  });

  // Get model details
  app.get('/models/:modelId', async (c) => {
    try {
      const modelCatalog = getModelCatalog();
      if (!modelCatalog) {
        return c.json(
          { success: false, error: 'Model catalog not initialized' },
          500,
        );
      }
      const modelId = param(c, 'modelId');
      bedrockOps.add(1, { op: 'get_model' });
      const models = await modelCatalog.listModels();
      const model = models.find((m) => m.modelId === modelId);

      if (!model) {
        return c.json({ success: false, error: 'Model not found' }, 404);
      }

      return c.json({ success: true, data: model });
    } catch (error: unknown) {
      logger.error('Failed to get model details', { error });
      return c.json({ success: false, error: errorMessage(error) }, 500);
    }
  });

  return app;
}
