import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ChatMessage } from '../../../types';
import { FilePartPreview } from '../../FilePartPreview';
import { markdownCodeComponents } from '../../HighlightedCodeBlock';
import { ReasoningSection } from '../../ReasoningSection';
import { ToolCallDisplay } from '../ToolCallDisplay';

type MessageContentPart = NonNullable<ChatMessage['contentParts']>[number];

interface MessageContentProps {
  contentParts?: MessageContentPart[];
  textContent: string;
  chatFontSize: number;
  showReasoning: boolean;
  showToolDetails: boolean;
  isStreamingMessage: boolean;
  onToolApproval?: (
    part: MessageContentPart,
    action: 'once' | 'trust' | 'deny',
  ) => void;
}

export function MessageContent({
  contentParts,
  textContent,
  chatFontSize,
  showReasoning,
  showToolDetails,
  isStreamingMessage,
  onToolApproval,
}: MessageContentProps) {
  if (contentParts && contentParts.length > 0) {
    return (
      <>
        {contentParts.map((part, index) => {
          if (part.type === 'reasoning' && part.content) {
            return (
              <ReasoningSection
                key={index}
                content={part.content}
                fontSize={chatFontSize}
                show={showReasoning}
              />
            );
          }
          if (part.type === 'text' && part.content) {
            return (
              <ReactMarkdown key={index} remarkPlugins={[remarkGfm]}>
                {part.content}
              </ReactMarkdown>
            );
          }
          if (part.type === 'file') {
            return (
              <FilePartPreview
                key={index}
                part={part}
                allParts={contentParts}
              />
            );
          }
          if (part.type === 'tool' || part.type?.startsWith('tool-')) {
            return (
              <ToolCallDisplay
                key={index}
                toolCall={part as any}
                showDetails={showToolDetails}
                onApprove={
                  isStreamingMessage && part.tool?.needsApproval
                    ? (action) => onToolApproval?.(part, action)
                    : undefined
                }
              />
            );
          }
          return null;
        })}
      </>
    );
  }

  if (!textContent) return null;

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={markdownCodeComponents}
    >
      {textContent}
    </ReactMarkdown>
  );
}
