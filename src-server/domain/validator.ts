/**
 * JSON schema validator for configuration files
 */

import Ajv, { type ValidateFunction, type ErrorObject } from 'ajv';
import type { AgentSpec, ToolDef, AppConfig, WorkspaceConfig } from './types.js';
import { BedrockModelCatalog } from '../providers/bedrock-models.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

export class ValidationError extends Error {
  constructor(
    message: string,
    public readonly errors: ErrorObject[]
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class SchemaValidator {
  private ajv: Ajv;
  private validators: Map<string, ValidateFunction>;

  constructor() {
    this.ajv = new Ajv({ allErrors: true, verbose: true });
    this.validators = new Map();

    // Load schemas from files (relative to working directory)
    const appSchema = JSON.parse(readFileSync(join(process.cwd(), 'schemas/app.schema.json'), 'utf-8'));
    const agentSchema = JSON.parse(readFileSync(join(process.cwd(), 'schemas/agent.schema.json'), 'utf-8'));
    const toolSchema = JSON.parse(readFileSync(join(process.cwd(), 'schemas/tool.schema.json'), 'utf-8'));

    // Register schemas
    this.ajv.addSchema(appSchema, 'app');
    this.ajv.addSchema(agentSchema, 'agent');
    this.ajv.addSchema(toolSchema, 'tool');

    // Compile validators
    this.validators.set('app', this.ajv.getSchema('app')!);
    this.validators.set('agent', this.ajv.getSchema('agent')!);
    this.validators.set('tool', this.ajv.getSchema('tool')!);
  }

  /**
   * Validate app configuration
   */
  validateAppConfig(data: unknown): asserts data is AppConfig {
    this.validate('app', data);
  }

  /**
   * Validate agent specification
   */
  validateAgentSpec(data: unknown): asserts data is AgentSpec {
    this.validate('agent', data);
  }

  /**
   * Validate tool definition
   */
  validateToolDef(data: unknown): asserts data is ToolDef {
    this.validate('tool', data);
  }

  /**
   * Validate workspace configuration
   */
  validateWorkspaceConfig(data: unknown): asserts data is WorkspaceConfig {
    // Basic structure validation
    if (!data || typeof data !== 'object') {
      throw new ValidationError('Workspace config must be an object', []);
    }

    const config = data as any;

    if (!config.name || typeof config.name !== 'string') {
      throw new ValidationError('Workspace must have a name', []);
    }

    if (!config.slug || typeof config.slug !== 'string') {
      throw new ValidationError('Workspace must have a slug', []);
    }

    if (!Array.isArray(config.tabs) || config.tabs.length === 0) {
      throw new ValidationError('Workspace must have at least one tab', []);
    }

    // Validate tabs
    for (const tab of config.tabs) {
      if (!tab.id || !tab.label || !tab.component) {
        throw new ValidationError('Each tab must have id, label, and component', []);
      }
    }
  }

  /**
   * Generic validation helper
   */
  private validate(schemaName: string, data: unknown): void {
    const validator = this.validators.get(schemaName);
    if (!validator) {
      throw new Error(`Schema '${schemaName}' not found`);
    }

    const valid = validator(data);
    if (!valid) {
      const errors = validator.errors || [];
      const message = this.formatErrors(schemaName, errors);
      throw new ValidationError(message, errors);
    }
  }

  /**
   * Format validation errors for display
   */
  private formatErrors(schemaName: string, errors: ErrorObject[]): string {
    const lines = [`Invalid ${schemaName} configuration:`];

    for (const error of errors) {
      const path = error.instancePath || '/';
      const message = error.message || 'validation failed';

      if (error.keyword === 'required') {
        const missing = (error.params as { missingProperty: string }).missingProperty;
        lines.push(`  ${path}: missing required property '${missing}'`);
      } else if (error.keyword === 'type') {
        const expected = (error.params as { type: string }).type;
        lines.push(`  ${path}: ${message} (expected ${expected})`);
      } else if (error.keyword === 'enum') {
        const allowed = (error.params as { allowedValues: string[] }).allowedValues;
        lines.push(`  ${path}: must be one of: ${allowed.join(', ')}`);
      } else {
        lines.push(`  ${path}: ${message}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Try to validate and return result instead of throwing
   */
  tryValidateAppConfig(data: unknown): { valid: true; data: AppConfig } | { valid: false; error: string } {
    try {
      this.validateAppConfig(data);
      return { valid: true, data: data as AppConfig };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof ValidationError ? error.message : String(error)
      };
    }
  }

  tryValidateAgentSpec(data: unknown): { valid: true; data: AgentSpec } | { valid: false; error: string } {
    try {
      this.validateAgentSpec(data);
      return { valid: true, data: data as AgentSpec };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof ValidationError ? error.message : String(error)
      };
    }
  }

  tryValidateToolDef(data: unknown): { valid: true; data: ToolDef } | { valid: false; error: string } {
    try {
      this.validateToolDef(data);
      return { valid: true, data: data as ToolDef };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof ValidationError ? error.message : String(error)
      };
    }
  }
}

// Singleton instance (updated for commands schema)
export const validator: SchemaValidator = new SchemaValidator();

/**
 * Validate a Bedrock model ID against the actual available models
 */
export async function validateBedrockModelId(
  modelId: string,
  region: string = 'us-east-1'
): Promise<{ valid: boolean; error?: string }> {
  try {
    const catalog = new BedrockModelCatalog(region);
    const isValid = await catalog.validateModelId(modelId);
    
    if (!isValid) {
      return {
        valid: false,
        error: `Model ID "${modelId}" is not available in region ${region}`,
      };
    }
    
    return { valid: true };
  } catch (error: any) {
    return {
      valid: false,
      error: `Failed to validate model: ${error.message}`,
    };
  }
}
