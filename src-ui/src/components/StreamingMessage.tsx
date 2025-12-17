import { useStreamingContent } from '../hooks/useStreamingContent';
import { LoadingDots } from './LoadingDots';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type ContentPart = { type: 'text' | 'tool' | 'reasoning'; content?: string; tool?: any };

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
  renderReasoning 
}: Props) {
  const { textRef, hasContent, contentParts } = useStreamingContent(sessionId);
  
  return (
    <div className="streaming-message">
      <div className="streaming-message-icon" style={agentIconStyle}>
        {agentIcon}
      </div>
      <div className="message assistant" style={{ fontSize: `${fontSize}px` }}>
        {/* Render completed content parts in order */}
        {contentParts.map((part, i) => {
          if (part.type === 'reasoning' && part.content && showReasoning && renderReasoning) {
            return renderReasoning(part.content, i);
          }
          if (part.type === 'text' && part.content) {
            return <ReactMarkdown key={i} remarkPlugins={[remarkGfm]}>{part.content}</ReactMarkdown>;
          }
          if ((part.type === 'tool' || (part as any).type?.startsWith('tool-')) && renderToolCall) {
            return renderToolCall(part, i);
          }
          return null;
        })}
        
        {/* Current streaming text (smooth updates via DOM ref) */}
        <span ref={textRef} className="streaming-text" />
        
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
