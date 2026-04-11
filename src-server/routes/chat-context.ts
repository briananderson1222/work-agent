import { feedbackOps } from '../telemetry/metrics.js';
import type { ChatMessage } from './chat-request-preparation.js';

interface RatingLike {
  conversationId?: string;
  rating?: string;
  messageIndex?: number;
  reason?: string;
}

export function injectConversationFeedbackContext(
  ratings: RatingLike[],
  conversationId: string | undefined,
  ragContext: string | null,
): string | null {
  if (!conversationId) {
    return ragContext;
  }

  const negativeRatings = ratings.filter(
    (rating) =>
      rating.conversationId === conversationId &&
      rating.rating === 'thumbs_down',
  );
  if (negativeRatings.length === 0) {
    return ragContext;
  }

  const ratingLines = negativeRatings
    .map(
      (rating) =>
        `- Message #${rating.messageIndex} was rated negatively${rating.reason ? `: "${rating.reason}"` : ''}`,
    )
    .join('\n');
  const block = `<conversation_feedback>\nThe user has flagged these responses in this conversation:\n${ratingLines}\nAdjust your approach accordingly.\n</conversation_feedback>`;
  feedbackOps.add(negativeRatings.length, {
    operation: 'inject-conversation',
  });
  return ragContext ? `${ragContext}\n\n${block}` : block;
}

export function applyCombinedContextToInput(
  input: string | ChatMessage[],
  injectContext: string | null,
  ragContext: string | null,
): string | ChatMessage[] {
  const combinedContext =
    [injectContext, ragContext].filter(Boolean).join('\n\n') || null;
  if (!combinedContext) {
    return input;
  }

  if (typeof input === 'string') {
    return `${combinedContext}\n\n${input}`;
  }

  const clone = JSON.parse(JSON.stringify(input)) as ChatMessage[];
  const userMsg = clone.find((message) => message.role === 'user');
  if (userMsg?.parts) {
    const textPart = userMsg.parts.find(
      (part: { type: string; text?: string }) => part.type === 'text',
    );
    if (textPart) {
      textPart.text = `${combinedContext}\n\n${textPart.text}`;
    }
  }
  return clone;
}
