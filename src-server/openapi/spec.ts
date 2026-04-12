import { zodToJsonSchema } from 'zod-to-json-schema';
import {
  agentCreateSchema,
  agentUpdateSchema,
  appConfigUpdateSchema,
  integrationSchema,
  pluginInstallSchema,
  pluginOverridesSchema,
  pluginPreviewSchema,
  promptCreateSchema,
  promptOutcomeSchema,
  promptUpdateSchema,
  registryInstallSchema,
} from '../routes/schemas.js';

type HttpMethod = 'delete' | 'get' | 'post' | 'put';

type Operation = {
  operationId: string;
  requestBodySchema?: unknown;
  summary: string;
  tags: string[];
};

const JSON_CONTENT_TYPE = 'application/json';
const integrationUpdateSchema = integrationSchema.partial();

const FIRST_PASS_PATHS: Record<
  string,
  Partial<Record<HttpMethod, Operation>>
> = {
  '/config/app': {
    get: {
      operationId: 'getAppConfig',
      summary: 'Get application configuration',
      tags: ['config'],
    },
    put: {
      operationId: 'updateAppConfig',
      requestBodySchema: appConfigUpdateSchema,
      summary: 'Update application configuration',
      tags: ['config'],
    },
  },
  '/agents': {
    get: {
      operationId: 'listAgents',
      summary: 'List enriched agents',
      tags: ['agents'],
    },
    post: {
      operationId: 'createAgent',
      requestBodySchema: agentCreateSchema,
      summary: 'Create an agent',
      tags: ['agents'],
    },
  },
  '/agents/{slug}': {
    put: {
      operationId: 'updateAgent',
      requestBodySchema: agentUpdateSchema,
      summary: 'Update an agent',
      tags: ['agents'],
    },
    delete: {
      operationId: 'deleteAgent',
      summary: 'Delete an agent',
      tags: ['agents'],
    },
  },
  '/integrations': {
    get: {
      operationId: 'listIntegrations',
      summary: 'List integrations',
      tags: ['integrations'],
    },
    post: {
      operationId: 'createIntegration',
      requestBodySchema: integrationSchema,
      summary: 'Create or update an integration',
      tags: ['integrations'],
    },
  },
  '/integrations/{id}': {
    get: {
      operationId: 'getIntegration',
      summary: 'Get an integration',
      tags: ['integrations'],
    },
    put: {
      operationId: 'updateIntegration',
      requestBodySchema: integrationUpdateSchema,
      summary: 'Update an integration',
      tags: ['integrations'],
    },
    delete: {
      operationId: 'deleteIntegration',
      summary: 'Delete an integration',
      tags: ['integrations'],
    },
  },
  '/integrations/{id}/reconnect': {
    post: {
      operationId: 'reconnectIntegration',
      summary: 'Reconnect an integration',
      tags: ['integrations'],
    },
  },
  '/api/playbooks': {
    get: {
      operationId: 'listPlaybooks',
      summary: 'List playbooks',
      tags: ['playbooks'],
    },
    post: {
      operationId: 'createPlaybook',
      requestBodySchema: promptCreateSchema,
      summary: 'Create a playbook',
      tags: ['playbooks'],
    },
  },
  '/api/playbooks/{id}': {
    get: {
      operationId: 'getPlaybook',
      summary: 'Get a playbook',
      tags: ['playbooks'],
    },
    put: {
      operationId: 'updatePlaybook',
      requestBodySchema: promptUpdateSchema,
      summary: 'Update a playbook',
      tags: ['playbooks'],
    },
    delete: {
      operationId: 'deletePlaybook',
      summary: 'Delete a playbook',
      tags: ['playbooks'],
    },
  },
  '/api/playbooks/{id}/run': {
    post: {
      operationId: 'trackPlaybookRun',
      summary: 'Track a playbook run',
      tags: ['playbooks'],
    },
  },
  '/api/playbooks/{id}/outcome': {
    post: {
      operationId: 'recordPlaybookOutcome',
      requestBodySchema: promptOutcomeSchema,
      summary: 'Record playbook outcome quality',
      tags: ['playbooks'],
    },
  },
  '/api/registry/plugins': {
    get: {
      operationId: 'listRegistryPlugins',
      summary: 'List available registry plugins',
      tags: ['registry'],
    },
  },
  '/api/registry/plugins/installed': {
    get: {
      operationId: 'listInstalledRegistryPlugins',
      summary: 'List installed registry plugins',
      tags: ['registry'],
    },
  },
  '/api/registry/plugins/install': {
    post: {
      operationId: 'installRegistryPlugin',
      requestBodySchema: registryInstallSchema,
      summary: 'Install a plugin from the registry',
      tags: ['registry'],
    },
  },
  '/api/registry/plugins/{id}': {
    delete: {
      operationId: 'uninstallRegistryPlugin',
      summary: 'Uninstall a registry plugin',
      tags: ['registry'],
    },
  },
  '/api/plugins': {
    get: {
      operationId: 'listPlugins',
      summary: 'List installed plugins',
      tags: ['plugins'],
    },
  },
  '/api/plugins/preview': {
    post: {
      operationId: 'previewPluginInstall',
      requestBodySchema: pluginPreviewSchema,
      summary: 'Preview a plugin before install',
      tags: ['plugins'],
    },
  },
  '/api/plugins/install': {
    post: {
      operationId: 'installPlugin',
      requestBodySchema: pluginInstallSchema,
      summary: 'Install a plugin from a source',
      tags: ['plugins'],
    },
  },
  '/api/plugins/check-updates': {
    get: {
      operationId: 'checkPluginUpdates',
      summary: 'Check installed plugins for updates',
      tags: ['plugins'],
    },
  },
  '/api/plugins/{name}/update': {
    post: {
      operationId: 'updatePlugin',
      summary: 'Update an installed plugin',
      tags: ['plugins'],
    },
  },
  '/api/plugins/{name}': {
    delete: {
      operationId: 'deletePlugin',
      summary: 'Delete an installed plugin',
      tags: ['plugins'],
    },
  },
  '/api/plugins/reload': {
    post: {
      operationId: 'reloadPlugins',
      summary: 'Reload installed plugin providers',
      tags: ['plugins'],
    },
  },
  '/api/plugins/{name}/providers': {
    get: {
      operationId: 'getPluginProviders',
      summary: 'Get provider state for a plugin',
      tags: ['plugins'],
    },
  },
  '/api/plugins/{name}/overrides': {
    get: {
      operationId: 'getPluginOverrides',
      summary: 'Get plugin override state',
      tags: ['plugins'],
    },
    put: {
      operationId: 'updatePluginOverrides',
      requestBodySchema: pluginOverridesSchema,
      summary: 'Update plugin override state',
      tags: ['plugins'],
    },
  },
};

export function buildOpenApiSpec() {
  const schemas = collectSchemas();

  return {
    openapi: '3.1.0',
    info: {
      title: 'Stallion API',
      version: '0.1.0',
      description:
        'Generated OpenAPI for the first-pass Stallion portability route set.',
    },
    paths: Object.fromEntries(
      Object.entries(FIRST_PASS_PATHS).map(([path, operations]) => [
        path,
        Object.fromEntries(
          Object.entries(operations).map(([method, operation]) => [
            method,
            buildOperation(operation),
          ]),
        ),
      ]),
    ),
    components: {
      schemas,
    },
  };
}

function buildOperation(operation: Operation) {
  return {
    operationId: operation.operationId,
    summary: operation.summary,
    tags: operation.tags,
    ...(operation.requestBodySchema
      ? {
          requestBody: {
            required: true,
            content: {
              [JSON_CONTENT_TYPE]: {
                schema: schemaRef(operation.requestBodySchema),
              },
            },
          },
        }
      : {}),
    responses: {
      200: {
        description: 'Success',
      },
      400: {
        description: 'Validation or request error',
      },
      500: {
        description: 'Server error',
      },
    },
  };
}

function collectSchemas() {
  const entries = {
    AppConfigUpdate: appConfigUpdateSchema,
    AgentCreate: agentCreateSchema,
    AgentUpdate: agentUpdateSchema,
    Integration: integrationSchema,
    IntegrationUpdate: integrationUpdateSchema,
    PluginInstall: pluginInstallSchema,
    PluginOverrides: pluginOverridesSchema,
    PluginPreview: pluginPreviewSchema,
    PlaybookCreate: promptCreateSchema,
    PlaybookOutcome: promptOutcomeSchema,
    PlaybookUpdate: promptUpdateSchema,
    RegistryInstall: registryInstallSchema,
  } as const;

  return Object.fromEntries(
    Object.entries(entries).map(([name, schema]) => [
      name,
      zodToJsonSchema(schema, name),
    ]),
  );
}

function schemaRef(schema: unknown) {
  const lookup = new Map<unknown, string>([
    [appConfigUpdateSchema, 'AppConfigUpdate'],
    [agentCreateSchema, 'AgentCreate'],
    [agentUpdateSchema, 'AgentUpdate'],
    [integrationSchema, 'Integration'],
    [integrationUpdateSchema, 'IntegrationUpdate'],
    [pluginInstallSchema, 'PluginInstall'],
    [pluginOverridesSchema, 'PluginOverrides'],
    [pluginPreviewSchema, 'PluginPreview'],
    [promptCreateSchema, 'PlaybookCreate'],
    [promptOutcomeSchema, 'PlaybookOutcome'],
    [promptUpdateSchema, 'PlaybookUpdate'],
    [registryInstallSchema, 'RegistryInstall'],
  ]);

  const name = lookup.get(schema);
  if (!name) {
    throw new Error('Unknown schema reference requested for OpenAPI build');
  }

  return { $ref: `#/components/schemas/${name}` };
}
