import type { KnowledgeNamespaceConfig } from './knowledge.js';

export interface PluginProviderEntry {
  type: string;
  module: string;
  layout?: string;
}

export interface PluginDependency {
  id: string;
  source?: string;
}

export interface PluginSettingField {
  key: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'select';
  description?: string;
  default?: string | number | boolean;
  options?: Array<{ label: string; value: string }>;
  secret?: boolean;
  required?: boolean;
}

export interface PluginManifest {
  name: string;
  version: string;
  sdkVersion?: string;
  displayName?: string;
  description?: string;
  entrypoint?: string;
  serverModule?: string;
  build?: string;
  capabilities?: string[];
  permissions?: string[];
  links?: unknown;
  agents?: Array<{ slug: string; source: string }>;
  layout?: { slug: string; source: string };
  layouts?: Array<{ slug: string; source: string }>;
  providers?: PluginProviderEntry[];
  integrations?: { required?: string[] };
  tools?: { required?: string[] };
  dependencies?: PluginDependency[];
  knowledge?: { namespaces: KnowledgeNamespaceConfig[] };
  prompts?: { source: string };
  skills?: string[];
  settings?: PluginSettingField[];
}

export interface PluginOverrideConfig {
  disabled?: string[];
  settings?: Record<string, string | number | boolean>;
}

export type PluginOverrides = Record<string, PluginOverrideConfig>;

export interface ConflictInfo {
  type: 'agent' | 'workspace' | 'provider' | 'tool';
  id: string;
  existingSource?: string;
}

export interface PluginComponent {
  type: 'agent' | 'workspace' | 'provider' | 'tool';
  id: string;
  detail?: string;
  conflict?: ConflictInfo;
}

export interface PluginPreview {
  valid: boolean;
  error?: string;
  manifest?: PluginManifest;
  components: PluginComponent[];
  conflicts: ConflictInfo[];
}
