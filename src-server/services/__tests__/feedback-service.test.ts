import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('../telemetry/metrics.js', () => ({
  feedbackOps: { add: vi.fn() },
}));

const { FeedbackService } = await import('../feedback-service.js');

describe('FeedbackService', () => {
  let dir: string;
  let svc: InstanceType<typeof FeedbackService>;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'feedback-test-'));
    svc = new FeedbackService(dir);
  });

  afterEach(() => {
    svc.stop();
    rmSync(dir, { recursive: true, force: true });
  });

  test('rateMessage creates a rating', () => {
    const r = svc.rateMessage({
      agentSlug: 'test',
      conversationId: 'c1',
      messageIndex: 0,
      messagePreview: 'Hello world',
      rating: 'thumbs_up',
    });
    expect(r.rating).toBe('thumbs_up');
    expect(svc.getRatings()).toHaveLength(1);
  });

  test('rateMessage upserts on same message', () => {
    svc.rateMessage({
      agentSlug: 'a',
      conversationId: 'c1',
      messageIndex: 0,
      messagePreview: 'x',
      rating: 'thumbs_up',
    });
    svc.rateMessage({
      agentSlug: 'a',
      conversationId: 'c1',
      messageIndex: 0,
      messagePreview: 'x',
      rating: 'thumbs_down',
    });
    const ratings = svc.getRatings();
    expect(ratings).toHaveLength(1);
    expect(ratings[0].rating).toBe('thumbs_down');
  });

  test('removeRating deletes a rating', () => {
    svc.rateMessage({
      agentSlug: 'a',
      conversationId: 'c1',
      messageIndex: 0,
      messagePreview: 'x',
      rating: 'thumbs_up',
    });
    expect(svc.removeRating('c1', 0)).toBe(true);
    expect(svc.getRatings()).toHaveLength(0);
  });

  test('removeRating returns false for missing', () => {
    expect(svc.removeRating('nope', 0)).toBe(false);
  });

  test('getSummary returns null initially', () => {
    expect(svc.getSummary()).toBeNull();
  });

  test('getBehaviorGuidelines returns empty with no summary', () => {
    expect(svc.getBehaviorGuidelines()).toBe('');
  });

  test('hasAnalyzeCallback false by default', () => {
    expect(svc.hasAnalyzeCallback()).toBe(false);
  });

  test('getStatus reflects state', () => {
    const status = svc.getStatus();
    expect(status.totalRatings).toBe(0);
    expect(status.isAnalyzing).toBe(false);
    expect(status.analyzeCallbackAvailable).toBe(false);
  });

  test('clearAnalysis resets analysis data', () => {
    svc.rateMessage({
      agentSlug: 'a',
      conversationId: 'c1',
      messageIndex: 0,
      messagePreview: 'x',
      rating: 'thumbs_up',
    });
    svc.clearAnalysis();
    const ratings = svc.getRatings();
    expect(ratings[0].analysis).toBeUndefined();
    expect(svc.getSummary()).toBeNull();
  });
});
