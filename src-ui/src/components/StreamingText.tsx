import { useStreamingContent } from '../hooks/useStreamingContent';

type Props = {
  sessionId: string;
  className?: string;
};

/**
 * Renders streaming text with throttled markdown rendering.
 */
export function StreamingText({ sessionId, className }: Props) {
  const { streamingText, hasContent } = useStreamingContent(sessionId);

  return (
    <span
      className={`streaming-text ${className || ''}`}
      data-has-content={hasContent}
    >
      {streamingText}
    </span>
  );
}

// Re-export hook for components that need more control
export { useStreamingContent };
