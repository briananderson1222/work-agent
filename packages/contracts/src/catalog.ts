export interface PlaybookSourceContext {
  kind: 'agent' | 'plugin' | 'user';
  agentSlug?: string;
  conversationId?: string;
}

export interface PlaybookProvenance {
  createdFrom?: PlaybookSourceContext;
  updatedFrom?: PlaybookSourceContext;
}

export interface PlaybookStats {
  runs: number;
  successes: number;
  failures: number;
  qualityScore: number | null;
  lastRunAt?: string;
  lastOutcomeAt?: string;
}

export type PlaybookOutcome = 'success' | 'failure';

export interface Playbook {
  id: string;
  name: string;
  content: string;
  description?: string;
  category?: string;
  tags?: string[];
  agent?: string;
  global?: boolean;
  source?: string;
  requires?: string[];
  icon?: string;
  provenance?: PlaybookProvenance;
  stats?: PlaybookStats;
  createdAt: string;
  updatedAt: string;
}

export type Prompt = Playbook;

export type GuidanceAssetKind = 'playbook' | 'skill';
export type GuidanceAssetStorageMode =
  | 'json-inline'
  | 'markdown-file'
  | 'skill-package';
export type GuidanceAssetRuntimeMode =
  | 'slash-command'
  | 'prompt-record'
  | 'skill-catalog';

export interface GuidanceAssetPackaging {
  installable: boolean;
  installed?: boolean;
  installedVersion?: string;
  version?: string;
  path?: string;
  source?: string;
  resources?: Array<{ name: string; path: string }>;
  scripts?: Array<{ name: string; path: string }>;
}

export interface GuidanceAsset {
  id: string;
  kind: GuidanceAssetKind;
  name: string;
  body: string;
  description?: string;
  tags?: string[];
  category?: string;
  scope?: {
    agent?: string;
    global?: boolean;
  };
  source?: string;
  storageMode: GuidanceAssetStorageMode;
  runtimeMode: GuidanceAssetRuntimeMode;
  packaging?: GuidanceAssetPackaging;
  provenance?: PlaybookProvenance;
  stats?: PlaybookStats;
  createdAt?: string;
  updatedAt?: string;
}

export interface RegistryItem {
  id: string;
  displayName?: string;
  description?: string;
  version?: string;
  source?: string;
  status?: string;
  tags?: string[];
  installed: boolean;
}

export interface Skill extends RegistryItem {
  name: string;
  source?: string;
  path?: string;
  installedVersion?: string;
  updateAvailable?: boolean;
  body?: string;
  resources?: Array<{ name: string; path: string }>;
  scripts?: Array<{ name: string; path: string }>;
}

export interface InstallResult {
  success: boolean;
  message: string;
}
