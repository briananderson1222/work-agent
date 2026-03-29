import type { ContentPart, ToolInfo } from './types';

/** Single source of truth for constructing tool ContentParts. Used by both streaming and reload paths. */
export function buildToolContentPart(tool: ToolInfo): ContentPart {
  return { type: 'tool', tool };
}
