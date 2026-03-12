/**
 * Feedback Routes — message rating and insights REST API.
 */

import { Hono } from 'hono';
import type { FeedbackService } from '../services/feedback-service.js';

export function createFeedbackRoutes(feedbackService: FeedbackService) {
  const app = new Hono();

  // Rate a message
  app.post('/rate', async (c) => {
    const body = await c.req.json();
    const { agentSlug, conversationId, messageIndex, messagePreview, rating, reason } = body;
    if (!conversationId || messageIndex == null || !rating) {
      return c.json({ success: false, error: 'conversationId, messageIndex, and rating are required' }, 400);
    }
    const entry = feedbackService.rateMessage({
      agentSlug: agentSlug || 'unknown',
      conversationId,
      messageIndex,
      messagePreview: messagePreview || '',
      rating,
      reason,
    });
    return c.json({ success: true, data: entry });
  });

  // Remove a rating
  app.delete('/rate', async (c) => {
    const { conversationId, messageIndex } = await c.req.json();
    const ok = feedbackService.removeRating(conversationId, messageIndex);
    return c.json({ success: true, removed: ok });
  });

  // List all ratings
  app.get('/ratings', (c) => {
    return c.json({ success: true, data: feedbackService.getRatings() });
  });

  // Get behavior guidelines (what gets injected into prompts)
  app.get('/guidelines', (c) => {
    return c.json({
      success: true,
      data: {
        guidelines: feedbackService.getBehaviorGuidelines(),
        summary: feedbackService.getSummary(),
      },
    });
  });

  // Manually trigger analysis
  app.post('/analyze', async (c) => {
    const summary = await feedbackService.runAnalysisPipeline();
    return c.json({ success: true, data: summary });
  });

  // Clear all analysis (re-queue everything)
  app.post('/clear-analysis', (c) => {
    feedbackService.clearAnalysis();
    return c.json({ success: true });
  });

  return app;
}
