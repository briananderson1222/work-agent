import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AppConfig } from '@stallion-ai/contracts/config';
import { assertSafeContextText } from '../services/context-safety.js';
import { validator } from './validator.js';

export const DEFAULT_SYSTEM_PROMPT = [
  'You are {{AGENT_NAME}}, a helpful AI assistant.',
  '',
  'Be concise and direct. When you lack information, say so rather than guessing.',
  '',
  '## Environment',
  'Date: {{date}}',
  'Time: {{time}}',
].join('\n');

const DEFAULT_TEMPLATE_VARIABLES = [
  { key: 'AGENT_NAME', type: 'static' as const, value: 'Stallion' },
];

export const DEFAULT_REGION = 'us-east-1';
export const DEFAULT_MODEL = '';
const LEGACY_DEFAULT_MODELS = new Set([
  'us.anthropic.claude-sonnet-4-6',
  'us.anthropic.claude-sonnet-4-20250514-v1:0',
]);
export const DEFAULT_INVOKE_MODEL = 'us.amazon.nova-2-lite-v1:0';
export const DEFAULT_STRUCTURE_MODEL = 'us.amazon.nova-micro-v1:0';

function getAppConfigPath(projectHomeDir: string): string {
  return join(projectHomeDir, 'config', 'app.json');
}

export function assertSafeAppConfig(config: AppConfig): void {
  if (
    typeof config.systemPrompt === 'string' &&
    config.systemPrompt.length > 0
  ) {
    assertSafeContextText(config.systemPrompt, {
      source: 'app system prompt',
    });
  }
}

export async function saveAppConfigFile(
  projectHomeDir: string,
  config: AppConfig,
): Promise<void> {
  validator.validateAppConfig(config);
  assertSafeAppConfig(config);

  const path = getAppConfigPath(projectHomeDir);
  await mkdir(join(projectHomeDir, 'config'), { recursive: true });
  await writeFile(path, JSON.stringify(config, null, 2), 'utf-8');
}

export async function loadAppConfigFile(
  projectHomeDir: string,
): Promise<AppConfig> {
  const path = getAppConfigPath(projectHomeDir);

  if (!existsSync(path)) {
    const defaultConfig: AppConfig = {
      region: DEFAULT_REGION,
      defaultModel: DEFAULT_MODEL,
      invokeModel: DEFAULT_INVOKE_MODEL,
      structureModel: DEFAULT_STRUCTURE_MODEL,
      systemPrompt: DEFAULT_SYSTEM_PROMPT,
      templateVariables: [...DEFAULT_TEMPLATE_VARIABLES],
    };

    await saveAppConfigFile(projectHomeDir, defaultConfig);
    return defaultConfig;
  }

  const content = await readFile(path, 'utf-8');
  const data = JSON.parse(content) as AppConfig & {
    templateVariables?: Array<{ key: string }>;
  };
  let shouldPersist = false;

  if (
    LEGACY_DEFAULT_MODELS.has(data.defaultModel || '') &&
    !data.defaultLLMProvider
  ) {
    data.defaultModel = DEFAULT_MODEL;
    shouldPersist = true;
  }
  if (!data.invokeModel) {
    data.invokeModel = DEFAULT_INVOKE_MODEL;
    shouldPersist = true;
  }
  if (!data.structureModel) {
    data.structureModel = DEFAULT_STRUCTURE_MODEL;
    shouldPersist = true;
  }
  if (!data.systemPrompt) {
    data.systemPrompt = DEFAULT_SYSTEM_PROMPT;
    if (!data.templateVariables?.some((v) => v.key === 'AGENT_NAME')) {
      data.templateVariables = [
        ...(data.templateVariables || []),
        ...DEFAULT_TEMPLATE_VARIABLES,
      ];
    }
    shouldPersist = true;
  }

  if (shouldPersist) {
    await saveAppConfigFile(projectHomeDir, data);
  }

  validator.validateAppConfig(data);
  assertSafeAppConfig(data);
  return data;
}

export async function updateAppConfigFile(
  projectHomeDir: string,
  updates: Partial<AppConfig>,
): Promise<AppConfig> {
  const existing = await loadAppConfigFile(projectHomeDir);
  const updated = { ...existing, ...updates };
  await saveAppConfigFile(projectHomeDir, updated);
  return updated;
}
