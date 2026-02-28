/**
 * Utilities for working with AI SDK UIMessagePart types
 *
 * These type guards make it easy to handle different part types
 * as we add support for reasoning, sources, files, etc.
 */

export type MessagePart = {
  type: string;
  [key: string]: any;
};

export type TextPart = {
  type: 'text';
  text: string;
  state?: 'streaming' | 'done';
};

export type ReasoningPart = {
  type: 'reasoning';
  text: string;
  state?: 'streaming' | 'done';
};

export type SourceUrlPart = {
  type: 'source-url';
  sourceId: string;
  url: string;
  title?: string;
};

export type SourceDocumentPart = {
  type: 'source-document';
  sourceId: string;
  title?: string;
  content?: string;
};

export type FilePart = {
  type: 'file';
  data: string; // base64 or URL
  mimeType: string;
};

// Type guards
export const isTextPart = (part: MessagePart): part is TextPart =>
  part.type === 'text';

export const isReasoningPart = (part: MessagePart): part is ReasoningPart =>
  part.type === 'reasoning';

export const isSourceUrlPart = (part: MessagePart): part is SourceUrlPart =>
  part.type === 'source-url';

export const isSourceDocumentPart = (
  part: MessagePart,
): part is SourceDocumentPart => part.type === 'source-document';

export const isFilePart = (part: MessagePart): part is FilePart =>
  part.type === 'file';

export const isToolPart = (part: MessagePart): part is { type: string } =>
  part.type.startsWith('tool-');

// State helpers
export const isStreaming = (part: TextPart | ReasoningPart): boolean =>
  part.state === 'streaming';

export const isDone = (part: TextPart | ReasoningPart): boolean =>
  part.state === 'done' || !part.state; // default to done if not specified
