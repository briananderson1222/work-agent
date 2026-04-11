export type KnowledgeNamespaceBehavior = 'rag' | 'inject';

export interface KnowledgeNamespaceConfig {
  id: string;
  label: string;
  behavior: KnowledgeNamespaceBehavior;
  description?: string;
  builtIn?: boolean;
  storageDir?: string;
  writeFiles?: boolean;
  syncOnScan?: boolean;
  enhance?: {
    agent: string;
    auto?: boolean;
  };
}

export interface KnowledgeDocumentMeta {
  id: string;
  filename: string;
  namespace: string;
  path: string;
  source: 'upload' | 'directory-scan' | 'sync';
  chunkCount: number;
  createdAt: string;
  updatedAt?: string;
  metadata?: Record<string, any>;
  eventId?: string;
  eventSubject?: string;
  enhancedFrom?: string;
  enhancedTo?: string;
  status?: 'raw' | 'enhanced';
}

export interface KnowledgeTreeNode {
  name: string;
  path: string;
  type: 'directory' | 'file';
  children?: KnowledgeTreeNode[];
  doc?: KnowledgeDocumentMeta;
  fileCount?: number;
}

export interface KnowledgeSearchFilter {
  query?: string;
  metadata?: Record<string, string | string[]>;
  tags?: string[];
  after?: string;
  before?: string;
  pathPrefix?: string;
  status?: string;
}

export const BUILTIN_KNOWLEDGE_NAMESPACES: KnowledgeNamespaceConfig[] = [
  { id: 'rules', label: 'Rules & Steering', behavior: 'inject', builtIn: true },
];
