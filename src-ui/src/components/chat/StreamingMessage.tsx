import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useStreamingContent } from '../../hooks/useStreamingContent';
import { deriveToolProgressSummary } from '../../utils/chat-progress';
import { markdownCodeComponents } from '../HighlightedCodeBlock';
import { LoadingDots } from '../LoadingDots';
import { ToolProgressIndicator } from './ToolProgressIndicator';
import { UIBlockRenderer } from './UIBlockRenderer';

type ContentPart = {
  type: 'text' | 'tool' | 'reasoning' | 'ui-block';
  content?: string;
  tool?: any;
  uiBlock?: any;
};

type Props = {
  sessionId: string;
  agentIcon: React.ReactNode;
  agentIconStyle: React.CSSProperties;
  fontSize: number;
  showReasoning?: boolean;
  renderToolCall?: (part: ContentPart, index: number) => React.ReactNode;
  renderReasoning?: (content: string, index: number) => React.ReactNode;
};

/**
 * Renders a streaming assistant message with loading indicator.
 */
export function StreamingMessage({
  sessionId,
  agentIcon,
  agentIconStyle,
  fontSize,
  showReasoning = true,
  renderToolCall,
  renderReasoning,
}: Props) {
  const { streamingText, hasContent, contentParts } =
    useStreamingContent(sessionId);
  const progressSummary = deriveToolProgressSummary(contentParts);

  return (
    <div className="streaming-message">
      <div className="streaming-message-icon" style={agentIconStyle}>
        {agentIcon}
      </div>
      <div className="message assistant" style={{ fontSize: `${fontSize}px` }}>
        {/* Render completed content parts in order */}
        {contentParts.map((part, i) => {
          if (
            part.type === 'reasoning' &&
            part.content &&
            showReasoning &&
            renderReasoning
          ) {
            return renderReasoning(part.content, i);
          }
          if (part.type === 'text' && part.content) {
            return (
              <ReactMarkdown key={i} remarkPlugins={[remarkGfm]}>
                {part.content}
              </ReactMarkdown>
            );
          }
          if (part.type === 'ui-block' && part.uiBlock) {
            return <UIBlockRenderer key={i} block={part.uiBlock} />;
          }
          if (
            (part.type === 'tool' ||
              (part as ContentPart & { type: string }).type?.startsWith(
                'tool-',
              )) &&
            renderToolCall
          ) {
            return renderToolCall(part, i);
          }
          return null;
        })}

        {/* Current streaming text — rendered as markdown with throttled updates */}
        {streamingText && (
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={markdownCodeComponents}
          >
            {streamingText}
          </ReactMarkdown>
        )}

        {progressSummary && <ToolProgressIndicator summary={progressSummary} />}

        {/* Loading indicator */}
        {hasContent ? (
          <div className="streaming-loading">
            <LoadingDots />
          </div>
        ) : (
          <LoadingDots />
        )}
      </div>
    </div>
  );
}
