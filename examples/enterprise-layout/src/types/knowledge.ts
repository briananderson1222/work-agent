/**
 * Local shim for @stallion-ai/shared knowledge types.
 * Import from here rather than directly from the shared package to keep
 * the plugin boundary clean.
 */

export type {
  KnowledgeDocumentMeta,
  KnowledgeSearchFilter,
  KnowledgeTreeNode,
} from '@stallion-ai/shared';

export interface NoteFrontmatter {
  title?: string;
  tags?: string[];
  territory?: string;
  accountId?: string;
  type?: string;
  status?: string;
}
