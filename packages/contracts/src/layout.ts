export interface LayoutConfig {
  id: string;
  projectSlug: string;
  type: string;
  name: string;
  slug: string;
  icon?: string;
  description?: string;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface LayoutMetadata {
  id: string;
  slug: string;
  projectSlug: string;
  type: string;
  name: string;
  icon?: string;
  description?: string;
  plugin?: string;
  tabCount?: number;
}

export interface LayoutAction {
  type: 'prompt' | 'inline-prompt' | 'external' | 'internal';
  label: string;
  icon?: string;
  agent?: string;
  data: string;
}

export interface LayoutTab {
  id: string;
  label: string;
  component: string;
  icon?: string;
  description?: string;
  actions?: LayoutAction[];
  prompts?: LayoutAction[];
}

export interface LayoutPrompt {
  id: string;
  label: string;
  prompt: string;
  agent?: string;
}

export interface LayoutTemplate {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  type: string;
  config: Record<string, unknown>;
  createdAt: string;
}

export interface LayoutDefinition {
  name: string;
  slug: string;
  icon?: string;
  description?: string;
  plugin?: string;
  requiredProviders?: string[];
  availableAgents?: string[];
  defaultAgent?: string;
  tabs: LayoutTab[];
  actions?: LayoutAction[];
}

export interface LayoutDefinitionMetadata {
  slug: string;
  name: string;
  icon?: string;
  description?: string;
  plugin?: string;
  tabCount: number;
}
