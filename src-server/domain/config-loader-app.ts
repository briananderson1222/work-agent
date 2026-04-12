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
      region: 'us-east-1',
      defaultModel: 'us.anthropic.claude-sonnet-4-6',
      invokeModel: 'us.amazon.nova-2-lite-v1:0',
      structureModel: 'us.amazon.nova-micro-v1:0',
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

  if (!data.invokeModel) data.invokeModel = 'us.amazon.nova-2-lite-v1:0';
  if (!data.structureModel) data.structureModel = 'us.amazon.nova-micro-v1:0';
  if (!data.systemPrompt) {
    data.systemPrompt = DEFAULT_SYSTEM_PROMPT;
    if (!data.templateVariables?.some((v) => v.key === 'AGENT_NAME')) {
      data.templateVariables = [
        ...(data.templateVariables || []),
        ...DEFAULT_TEMPLATE_VARIABLES,
      ];
    }
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
