export interface Plugin {
  name: string;
  displayName: string;
  version: string;
  description?: string;
  hasBundle: boolean;
  hasSettings?: boolean;
  layout?: { slug: string };
  agents?: Array<{ slug: string }>;
  providers?: Array<{ type: string }>;
  providerDetails?: Array<{
    type: string;
    module: string;
    layout: string | null;
    enabled: boolean;
  }>;
  git?: { hash: string; branch: string; remote?: string };
  permissions?: {
    declared: string[];
    granted: string[];
    missing: Array<{
      permission: string;
      tier: 'passive' | 'active' | 'trusted';
    }>;
  };
}

export interface PreviewComponent {
  type: string;
  id: string;
  detail?: string;
  conflict?: { type: string; id: string; existingSource?: string };
}

export interface GitInfo {
  hash: string;
  branch: string;
  remote?: string;
}

export interface PreviewData {
  valid: boolean;
  error?: string;
  manifest?: Plugin;
  components: PreviewComponent[];
  conflicts: Array<{ type: string; id: string; existingSource?: string }>;
  dependencies?: Array<{
    id: string;
    source?: string;
    status: string;
    components?: Array<{ type: string; id: string }>;
    git?: GitInfo;
  }>;
  git?: GitInfo;
}

export interface PluginUpdateSummary {
  name: string;
  currentVersion: string;
  latestVersion: string;
  source: string;
}

export interface PluginMessage {
  type: 'success' | 'error';
  text: string;
}
