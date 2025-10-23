/**
 * JSON schema validator for configuration files
 */

import Ajv, { type ValidateFunction, type ErrorObject } from 'ajv';
import type { AgentSpec, ToolDef, AppConfig } from './types.js';

// Import schemas (in real implementation, these would be loaded from files)
import appSchema from '../../schemas/app.schema.json' assert { type: 'json' };
import agentSchema from '../../schemas/agent.schema.json' assert { type: 'json' };
import toolSchema from '../../schemas/tool.schema.json' assert { type: 'json' };

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

// Singleton instance
export const validator = new SchemaValidator();
