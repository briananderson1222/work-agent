/**
 * Phase 4 portability helpers.
 *
 * Ownership boundary:
 * - canonical Stallion config remains the source of truth
 * - portability models are derived projections only
 */

import type {
  AgentsMdPortabilityDocument,
  AppConfig,
  ExportableAppConfig,
  GuidanceAgentExport,
  GuidanceWorkspaceExport,
  NormalizedMcpConfig,
  PortabilityImportLedgerEntry,
  PortabilityLoss,
  ToolDef,
} from '@stallion-ai/contracts';

const APP_CONFIG_GUIDANCE_KEYS = [
  'systemPrompt',
  'templateVariables',
  'approvalGuardian',
] as const satisfies ReadonlyArray<keyof ExportableAppConfig>;

const STALLION_RENDERED_START = '<!-- STALLION:RENDERED:START -->';
const STALLION_RENDERED_END = '<!-- STALLION:RENDERED:END -->';
const STALLION_EXPORT_START = '<!-- STALLION:EXPORT:START -->';
const STALLION_EXPORT_END = '<!-- STALLION:EXPORT:END -->';
const STALLION_JSON_FENCE = '```json';
const STALLION_JSON_END = '```';

export interface BuildAgentsMdDocumentInput {
  appConfig: AppConfig;
  agents: GuidanceAgentExport[];
  integrations: ToolDef[];
  generatedAt?: string;
}

export interface ParseAgentsMdResult {
  document: AgentsMdPortabilityDocument;
  unmatchedProse: string | null;
  warnings: PortabilityLoss[];
}

export interface ImportApplicationPlan {
  appConfig: ExportableAppConfig;
  agents: GuidanceAgentExport[];
  integrations: ToolDef[];
  ledgerEntry: PortabilityImportLedgerEntry;
}

export interface ClaudeDesktopConfig {
  mcpServers: Record<
    string,
    {
      command?: string;
      args?: string[];
      env?: Record<string, string>;
      url?: string;
    }
  >;
}

export interface ParseClaudeDesktopConfigResult {
  integrations: ToolDef[];
  losses: PortabilityLoss[];
}

export function buildGuidanceWorkspace(
  appConfig: AppConfig,
): GuidanceWorkspaceExport {
  const workspace: GuidanceWorkspaceExport = {};
  for (const key of APP_CONFIG_GUIDANCE_KEYS) {
    if (key === 'systemPrompt' && appConfig.systemPrompt !== undefined) {
      workspace.systemPrompt = structuredClone(appConfig.systemPrompt);
    }
    if (
      key === 'templateVariables' &&
      appConfig.templateVariables !== undefined
    ) {
      workspace.templateVariables = structuredClone(
        appConfig.templateVariables,
      );
    }
    if (
      key === 'approvalGuardian' &&
      appConfig.approvalGuardian !== undefined
    ) {
      workspace.approvalGuardian = structuredClone(appConfig.approvalGuardian);
    }
  }
  return workspace;
}

export function collectGuidanceLosses(appConfig: AppConfig): PortabilityLoss[] {
  return Object.entries(appConfig)
    .filter(([key, value]) => {
      if (value === undefined) return false;
      return !APP_CONFIG_GUIDANCE_KEYS.includes(
        key as (typeof APP_CONFIG_GUIDANCE_KEYS)[number],
      );
    })
    .map(([key]) => ({
      code: 'omitted-field' as const,
      scope: 'app-config' as const,
      path: key,
      message: `AGENTS.md export omits app config field '${key}' because it is outside the Phase 4a guidance projection.`,
      severity: 'warning' as const,
    }));
}

export function normalizeMcpToolDef(def: ToolDef): {
  normalized: NormalizedMcpConfig | null;
  losses: PortabilityLoss[];
} {
  if (def.kind !== 'mcp') {
    return {
      normalized: null,
      losses: [
        {
          code: 'unsupported-kind',
          scope: 'integration',
          path: def.id,
          message: `Integration '${def.id}' is not MCP-based and cannot be exported in the AGENTS.md portability foundation.`,
          severity: 'warning',
        },
      ],
    };
  }

  const losses: PortabilityLoss[] = [];
  const transport =
    def.transport === 'process'
      ? 'stdio'
      : (def.transport ?? (def.command ? 'stdio' : undefined));

  if (!transport || !['stdio', 'sse', 'streamable-http'].includes(transport)) {
    return {
      normalized: null,
      losses: [
        {
          code: 'unsupported-transport',
          scope: 'integration',
          path: `${def.id}.transport`,
          message: `Integration '${def.id}' uses unsupported transport '${def.transport ?? 'unknown'}' for portability export.`,
          severity: 'warning',
        },
      ],
    };
  }

  if (def.permissions || def.builtinPolicy || def.healthCheck) {
    losses.push({
      code: 'unsupported-config',
      scope: 'integration',
      path: def.id,
      message: `Integration '${def.id}' includes runtime-only settings that are omitted from the portable MCP projection.`,
      severity: 'warning',
    });
  }

  const normalizedTransport = transport as NormalizedMcpConfig['transport'];

  return {
    normalized: {
      id: def.id,
      displayName: def.displayName,
      description: def.description,
      transport: normalizedTransport,
      command: def.command,
      args: def.args ? [...def.args] : undefined,
      endpoint: def.endpoint,
      env: def.env ? { ...def.env } : undefined,
      exposedTools: def.exposedTools ? [...def.exposedTools] : undefined,
      timeouts: def.timeouts ? { ...def.timeouts } : undefined,
    },
    losses,
  };
}

export function denormalizeMcpConfig(normalized: NormalizedMcpConfig): ToolDef {
  return {
    id: normalized.id,
    kind: 'mcp',
    displayName: normalized.displayName,
    description: normalized.description,
    transport: normalized.transport,
    command: normalized.command,
    args: normalized.args ? [...normalized.args] : undefined,
    endpoint: normalized.endpoint,
    env: normalized.env ? { ...normalized.env } : undefined,
    exposedTools: normalized.exposedTools
      ? [...normalized.exposedTools]
      : undefined,
    timeouts: normalized.timeouts ? { ...normalized.timeouts } : undefined,
  };
}

export function buildAgentsMdDocument(
  input: BuildAgentsMdDocumentInput,
): AgentsMdPortabilityDocument {
  const losses = collectGuidanceLosses(input.appConfig);
  const integrations: NormalizedMcpConfig[] = [];

  for (const def of input.integrations) {
    const result = normalizeMcpToolDef(def);
    losses.push(...result.losses);
    if (result.normalized) integrations.push(result.normalized);
  }

  return {
    kind: 'stallion-agents-md',
    version: 1,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    guidance: {
      workspace: buildGuidanceWorkspace(input.appConfig),
      agents: input.agents.map((agent) => ({
        slug: agent.slug,
        spec: structuredClone(agent.spec),
      })),
      integrations,
    },
    losses,
  };
}

export function serializeAgentsMd(
  document: AgentsMdPortabilityDocument,
): string {
  const payload = JSON.stringify(document, null, 2);
  const lines = [
    STALLION_RENDERED_START,
    '',
    '# AGENTS.md',
    '',
    'Generated by Stallion portability export.',
    '',
    '',
    '## Workspace Guidance',
    '',
    renderWorkspaceGuidance(document.guidance.workspace),
    '',
    '## Managed Agents',
    '',
    renderAgentGuidance(document.guidance.agents),
    '',
    '## MCP Tool Expectations',
    '',
    renderIntegrations(document.guidance.integrations),
    '',
    '## Loss Report',
    '',
    renderLosses(document.losses),
    '',
    STALLION_RENDERED_END,
    '',
    STALLION_EXPORT_START,
    STALLION_JSON_FENCE,
    payload,
    STALLION_JSON_END,
    STALLION_EXPORT_END,
    '',
  ];

  return lines.join('\n');
}

export function parseAgentsMd(text: string): ParseAgentsMdResult {
  const exportPattern = new RegExp(
    `${escapeRegex(STALLION_EXPORT_START)}\\s*${escapeRegex(STALLION_JSON_FENCE)}\\s*([\\s\\S]*?)\\s*${escapeRegex(STALLION_JSON_END)}\\s*${escapeRegex(STALLION_EXPORT_END)}`,
    'm',
  );
  const match = text.match(exportPattern);

  if (!match) {
    throw new Error(
      'No Stallion export block found in AGENTS.md. Phase 4a import currently supports Stallion-exported AGENTS.md files only.',
    );
  }

  const document = JSON.parse(match[1]) as AgentsMdPortabilityDocument;
  const withoutExportBlock = text.replace(match[0], '');
  const renderedPattern = new RegExp(
    `${escapeRegex(STALLION_RENDERED_START)}[\\s\\S]*?${escapeRegex(STALLION_RENDERED_END)}`,
    'm',
  );
  const unmatchedProse = withoutExportBlock.replace(renderedPattern, '').trim();
  const warnings = [...document.losses];

  if (unmatchedProse) {
    warnings.push({
      code: 'ambiguous-prose',
      scope: 'document',
      path: 'AGENTS.md',
      message:
        'AGENTS.md contains prose outside the structured Stallion export block. It will be preserved as imported notes instead of being treated as canonical config.',
      severity: 'warning',
    });
  }

  return {
    document,
    unmatchedProse: unmatchedProse || null,
    warnings,
  };
}

export function buildAgentsMdImportPlan(input: {
  sourcePath: string;
  parsed: ParseAgentsMdResult;
  importedAt?: string;
  notesPath?: string;
}): ImportApplicationPlan {
  const importedAt = input.importedAt ?? new Date().toISOString();

  return {
    appConfig: structuredClone(input.parsed.document.guidance.workspace),
    agents: input.parsed.document.guidance.agents.map((agent) => ({
      slug: agent.slug,
      spec: structuredClone(agent.spec),
    })),
    integrations:
      input.parsed.document.guidance.integrations.map(denormalizeMcpConfig),
    ledgerEntry: {
      id: createLedgerId(importedAt),
      sourceFormat: 'agents-md',
      importedAt,
      sourcePath: input.sourcePath,
      degradedFields: input.parsed.warnings,
      notesPath: input.notesPath,
      applied: {
        appConfigUpdated:
          Object.keys(input.parsed.document.guidance.workspace).length > 0,
        agentSlugs: input.parsed.document.guidance.agents.map(
          (agent) => agent.slug,
        ),
        integrationIds: input.parsed.document.guidance.integrations.map(
          (integration) => integration.id,
        ),
      },
    },
  };
}

export function buildClaudeDesktopConfig(input: { integrations: ToolDef[] }): {
  config: ClaudeDesktopConfig;
  losses: PortabilityLoss[];
} {
  const losses: PortabilityLoss[] = [];
  const mcpServers: ClaudeDesktopConfig['mcpServers'] = {};

  for (const integration of input.integrations) {
    const result = normalizeMcpToolDef(integration);
    losses.push(...result.losses);
    if (!result.normalized) {
      continue;
    }

    if (result.normalized.transport === 'stdio') {
      mcpServers[result.normalized.id] = {
        command: result.normalized.command,
        args: result.normalized.args,
        env: result.normalized.env,
      };
      continue;
    }

    if (
      result.normalized.transport === 'streamable-http' ||
      result.normalized.transport === 'sse'
    ) {
      mcpServers[result.normalized.id] = {
        url: result.normalized.endpoint,
      };
    }
  }

  return {
    config: { mcpServers },
    losses,
  };
}

export function serializeClaudeDesktopConfig(
  config: ClaudeDesktopConfig,
): string {
  return JSON.stringify(config, null, 2);
}

export function parseClaudeDesktopConfig(
  text: string,
): ParseClaudeDesktopConfigResult {
  const parsed = JSON.parse(text) as ClaudeDesktopConfig;
  const integrations: ToolDef[] = [];
  const losses: PortabilityLoss[] = [];

  for (const [id, value] of Object.entries(parsed.mcpServers || {})) {
    if (value.command) {
      integrations.push({
        id,
        kind: 'mcp',
        transport: 'stdio',
        command: value.command,
        args: value.args,
        env: value.env,
      });
      continue;
    }

    integrations.push({
      id,
      kind: 'mcp',
      transport: 'streamable-http',
      endpoint: value.url,
    });

    losses.push({
      code: 'degraded-field',
      scope: 'integration',
      path: `${id}.transport`,
      message: `Claude Desktop import cannot distinguish whether URL-based MCP server '${id}' originally used SSE or streamable-http; Stallion restores it as streamable-http.`,
      severity: 'warning',
    });
  }

  return { integrations, losses };
}

function renderWorkspaceGuidance(workspace: GuidanceWorkspaceExport): string {
  if (Object.keys(workspace).length === 0) {
    return '_No workspace guidance fields are currently set._';
  }

  return [
    workspace.systemPrompt
      ? `- **System prompt:** ${inlineCode(workspace.systemPrompt)}`
      : null,
    workspace.templateVariables
      ? `- **Template variables:** ${workspace.templateVariables.length}`
      : null,
    workspace.approvalGuardian
      ? `- **Approval guardian:** ${inlineCode(JSON.stringify(workspace.approvalGuardian))}`
      : null,
  ]
    .filter(Boolean)
    .join('\n');
}

function renderAgentGuidance(agents: GuidanceAgentExport[]): string {
  if (agents.length === 0) {
    return '_No managed agents are currently configured._';
  }

  return agents
    .map(
      (agent) =>
        `### ${agent.slug}\n- **Name:** ${agent.spec.name}\n- **Prompt:** ${inlineCode(agent.spec.prompt)}\n- **MCP servers:** ${agent.spec.tools?.mcpServers?.join(', ') || 'none'}`,
    )
    .join('\n\n');
}

function renderIntegrations(integrations: NormalizedMcpConfig[]): string {
  if (integrations.length === 0) {
    return '_No MCP integrations are currently configured._';
  }

  return integrations
    .map(
      (integration) =>
        `- \`${integration.id}\` — ${integration.transport}${integration.command ? ` (${integration.command})` : integration.endpoint ? ` (${integration.endpoint})` : ''}`,
    )
    .join('\n');
}

function renderLosses(losses: PortabilityLoss[]): string {
  if (losses.length === 0) {
    return '- No known lossiness for the currently exported fields.';
  }

  return losses
    .map((loss) => `- [${loss.severity}] ${loss.path}: ${loss.message}`)
    .join('\n');
}

function inlineCode(value: string): string {
  return `\`${value.replaceAll('`', '\\`')}\``;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function createLedgerId(importedAt: string): string {
  return `agents-md-${importedAt.replaceAll(/[:.]/g, '-')}`;
}
