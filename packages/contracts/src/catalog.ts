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
}

export interface InstallResult {
  success: boolean;
  message: string;
}
