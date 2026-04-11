import type {
  LayoutConfig,
  LayoutMetadata,
  LayoutTemplate,
} from '@stallion-ai/contracts/layout';
import type { ProjectConfig, ProjectMetadata } from '@stallion-ai/contracts/project';
import type { ProviderConnectionConfig } from '@stallion-ai/contracts/tool';

export interface ConversationRecord {
  id: string;
  projectId: string;
  title: string;
  agentSlug: string;
  layoutId?: string;
  providerId?: string;
  model?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentRecord {
  id: string;
  projectId: string;
  filename: string;
  mimeType: string;
  size: number;
  source: 'upload' | 'directory-scan' | 'url';
  sourceUri?: string;
  chunkCount: number;
  status: 'pending' | 'processing' | 'embedded' | 'error';
  error?: string;
  embeddedAt?: string;
  createdAt: string;
}

export interface LayoutAgentReference {
  projectSlug: string;
  layoutSlug: string;
}

export interface IStorageAdapter {
  // Projects
  listProjects(): ProjectMetadata[];
  getProject(slug: string): ProjectConfig;
  saveProject(config: ProjectConfig): void;
  deleteProject(slug: string): void;

  // Layouts
  listLayouts(projectSlug: string): LayoutMetadata[];
  getLayout(projectSlug: string, layoutSlug: string): LayoutConfig;
  saveLayout(projectSlug: string, config: LayoutConfig): void;
  deleteLayout(projectSlug: string, layoutSlug: string): void;
  findLayoutsUsingAgent(agentSlug: string): LayoutAgentReference[];

  // Provider connections
  listProviderConnections(): ProviderConnectionConfig[];
  getProviderConnection(id: string): ProviderConnectionConfig;
  saveProviderConnection(config: ProviderConnectionConfig): void;
  deleteProviderConnection(id: string): void;

  // Conversations
  listConversations(
    projectSlug: string,
    opts?: { limit?: number; offset?: number },
  ): ConversationRecord[];
  getConversation(id: string): ConversationRecord | null;
  saveConversation(record: ConversationRecord): void;
  deleteConversation(id: string): void;

  // Documents
  listDocuments(projectSlug: string): DocumentRecord[];
  getDocument(id: string): DocumentRecord | null;
  saveDocument(record: DocumentRecord): void;
  deleteDocument(id: string): void;

  // Layout Templates
  listTemplates(): LayoutTemplate[];
  getTemplate(id: string): LayoutTemplate | null;
  saveTemplate(template: LayoutTemplate): void;
  deleteTemplate(id: string): void;
}
