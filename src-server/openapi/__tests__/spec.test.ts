import { describe, expect, test } from 'vitest';
import { buildOpenApiSpec } from '../spec.js';

describe('buildOpenApiSpec', () => {
  test('includes the first-pass portability route set', () => {
    const spec = buildOpenApiSpec();

    expect(spec.openapi).toBe('3.1.0');
    expect(spec.paths['/config/app']).toBeDefined();
    expect(spec.paths['/agents']).toBeDefined();
    expect(spec.paths['/integrations']).toBeDefined();
    expect(spec.paths['/api/playbooks']).toBeDefined();
    expect(spec.paths['/api/registry/plugins']).toBeDefined();
    expect(spec.paths['/api/plugins']).toBeDefined();
  });

  test('includes request schemas for mutating operations', () => {
    const spec = buildOpenApiSpec();

    expect(
      spec.paths['/config/app'].put.requestBody.content['application/json']
        .schema.$ref,
    ).toBe('#/components/schemas/AppConfigUpdate');
    expect(
      spec.paths['/integrations/{id}'].put.requestBody.content[
        'application/json'
      ].schema.$ref,
    ).toBe('#/components/schemas/IntegrationUpdate');
    expect(
      spec.paths['/api/playbooks/{id}/outcome'].post.requestBody.content[
        'application/json'
      ].schema.$ref,
    ).toBe('#/components/schemas/PlaybookOutcome');
    expect(
      spec.paths['/api/plugins/install'].post.requestBody.content[
        'application/json'
      ].schema.$ref,
    ).toBe('#/components/schemas/PluginInstall');
    expect(spec.components.schemas.IntegrationUpdate).toBeDefined();
  });
});
