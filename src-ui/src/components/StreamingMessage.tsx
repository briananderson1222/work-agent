import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useStreamingContent } from '../hooks/useStreamingContent';
import { markdownCodeComponents } from './HighlightedCodeBlock';
import { LoadingDots } from './LoadingDots';

type ContentPart = {
  type: 'text' | 'tool' | 'reasoning';
  content?: string;
  tool?: any;
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
