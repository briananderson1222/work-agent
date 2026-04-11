import type { RuntimeConnectionSettings } from './tool.js';

export interface AppConfig {
  region: string;
  defaultModel: string;
  invokeModel: string;
  structureModel: string;
  runtime?: 'voltagent' | 'strands';
  defaultMaxTurns?: number;
  defaultMaxOutputTokens?: number;
  systemPrompt?: string;
  templateVariables?: TemplateVariable[];
  defaultChatFontSize?: number;
  logLevel?: 'trace' | 'debug' | 'info' | 'warn' | 'error';
  registryUrl?: string;
  gitRemote?: string;
  defaultLLMProvider?: string;
  defaultEmbeddingProvider?: string;
  defaultEmbeddingModel?: string;
  defaultVectorDbProvider?: string;
  runtimeConnections?: Record<string, RuntimeConnectionSettings>;
  terminalShell?: string;
  disableDefaultSkillRegistries?: boolean;
}

export interface TemplateVariable {
  key: string;
  type: 'static' | 'date' | 'time' | 'datetime' | 'custom';
  value?: string;
  format?: string;
}
