import { useStreamingContent } from '../hooks/useStreamingContent';

type Props = {
  sessionId: string;
  className?: string;
};

/**
 * Renders streaming text with direct DOM updates (bypasses React batching).
 * Returns hasContent to parent for conditional rendering.
 */
export function StreamingText({ sessionId, className }: Props) {
  const { textRef, hasContent } = useStreamingContent(sessionId);
  
  return <span ref={textRef} className={`streaming-text ${className || ''}`} data-has-content={hasContent} />;
}

// Re-export hook for components that need more control
export { useStreamingContent };
