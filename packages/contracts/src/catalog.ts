export interface PlaybookSourceContext {
  kind: 'agent' | 'plugin' | 'user' | 'asset';
  agentSlug?: string;
  conversationId?: string;
  asset?: GuidanceAssetReference;
  action?: GuidanceAssetConversionAction;
  convertedAt?: string;
}

export type GuidanceAssetReferenceKind =
  | 'playbook'
  | 'skill'
  | 'provider-capability';
export type GuidanceAssetSourceOwner =
  | 'user'
  | 'registry'
  | 'plugin'
  | 'provider';
export type GuidanceAssetConversionAction =
  | 'playbook-to-skill'
  | 'skill-to-playbook'
  | 'provider-capability-to-playbook'
  | 'provider-capability-to-skill';

export interface GuidanceAssetReference {
  kind: GuidanceAssetReferenceKind;
  id: string;
  name: string;
  owner: GuidanceAssetSourceOwner;
  providerId?: string;
  connectionId?: string;
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
  storageMode?: 'json-inline' | 'markdown-file';
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
  provenance?: PlaybookProvenance;
}

export interface InstallResult {
  success: boolean;
  message: string;
}

export type ProviderCapabilityStatus =
  | 'ready'
  | 'warning'
  | 'error'
  | 'disabled'
  | 'unknown';
export type ProviderCapabilityAuthStatus =
  | 'authenticated'
  | 'unauthenticated'
  | 'unknown';
export type ProviderCapabilityFreshness =
  | 'live'
  | 'cached'
  | 'stale'
  | 'unknown';

export interface ProviderCapabilityModel {
  id: string;
  name: string;
  provider?: string;
  capabilities?: Record<string, unknown>;
}

export interface ProviderNativeSkill {
  id: string;
  name: string;
  description?: string;
  path?: string;
  scope?: string;
  enabled: boolean;
  provenance: GuidanceAssetReference;
}

export interface ProviderNativeSlashCommand {
  id: string;
  name: string;
  description?: string;
  inputHint?: string;
  provenance: GuidanceAssetReference;
}

export interface ProviderCapabilityInventory {
  providerId: string;
  connectionId?: string;
  displayName: string;
  status: ProviderCapabilityStatus;
  authStatus: ProviderCapabilityAuthStatus;
  version?: string | null;
  checkedAt?: string;
  freshness: ProviderCapabilityFreshness;
  source: GuidanceAssetSourceOwner;
  message?: string;
  models: ProviderCapabilityModel[];
  skills: ProviderNativeSkill[];
  slashCommands: ProviderNativeSlashCommand[];
}
