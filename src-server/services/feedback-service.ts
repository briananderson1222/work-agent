/**
 * FeedbackService — message ratings, automated analysis, and behavior guidelines.
 *
 * Provider-agnostic: owned by StallionRuntime, not by any framework adapter.
 * Works identically for VoltAgent, Strands, ACP, and alternate providers.
 *
 * Two-tier analysis (inspired by KiRoom):
 *   1. Mini-analysis: per-message "why did the user rate this way?"
 *   2. Full-analysis: aggregate into "reinforce" / "avoid" behavior lists
 *
 * Guidelines are injected into all chat paths via stallion-runtime.ts,
 * alongside RAG context — never inside framework adapters.
 */

import { join } from 'node:path';
import { JsonFileStore } from './json-store.js';

// ── Types ──────────────────────────────────────────────

export type RatingValue = 'thumbs_up' | 'thumbs_down';

export interface MessageRating {
  id: string;
  agentSlug: string;
  conversationId: string;
  messageIndex: number;
  /** First ~200 chars of the rated message for analysis context */
  messagePreview: string;
  rating: RatingValue;
  reason?: string;
  /** Per-message analysis: why the user rated this way */
  analysis?: string;
  createdAt: string;
  analyzedAt?: string;
}

export interface FeedbackSummary {
  reinforce: string[];
  avoid: string[];
  analyzedCount: number;
  updatedAt: string;
}

export interface FeedbackStore {
  ratings: MessageRating[];
  summary: FeedbackSummary | null;
}

/** Callback to invoke an LLM for analysis (framework-agnostic). */
export type AnalyzeCallback = (prompt: string) => Promise<string>;

// ── Constants ──────────────────────────────────────────

const ANALYSIS_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_REINFORCE = 25;
const MAX_AVOID = 25;

// ── Service ────────────────────────────────────────────

export class FeedbackService {
  private store: JsonFileStore<FeedbackStore>;
  private timer: ReturnType<typeof setInterval> | null = null;
  private analyzeFn: AnalyzeCallback | null = null;

  constructor(dataDir: string) {
    this.store = new JsonFileStore<FeedbackStore>(
      join(dataDir, 'feedback', 'feedback.json'),
      { ratings: [], summary: null },
    );
  }

  /** Set the LLM callback used for analysis. Called by runtime after agents are ready. */
  setAnalyzeCallback(fn: AnalyzeCallback): void {
    this.analyzeFn = fn;
  }

  // ── Rating CRUD ────────────────────────────────────

  rateMessage(params: {
    agentSlug: string;
    conversationId: string;
    messageIndex: number;
    messagePreview: string;
    rating: RatingValue;
    reason?: string;
  }): MessageRating {
    const data = this.store.read();

    // Upsert: replace existing rating for same message
    const key = `${params.conversationId}:${params.messageIndex}`;
    const existing = data.ratings.findIndex(
      (r) =>
        r.conversationId === params.conversationId &&
        r.messageIndex === params.messageIndex,
    );

    const entry: MessageRating = {
      id: existing >= 0 ? data.ratings[existing].id : key,
      agentSlug: params.agentSlug,
      conversationId: params.conversationId,
      messageIndex: params.messageIndex,
      messagePreview: params.messagePreview.slice(0, 200),
      rating: params.rating,
      reason: params.reason?.slice(0, 100),
      createdAt:
        existing >= 0
          ? data.ratings[existing].createdAt
          : new Date().toISOString(),
      // Clear previous analysis on re-rate
      analysis: undefined,
      analyzedAt: undefined,
    };

    if (existing >= 0) {
      data.ratings[existing] = entry;
    } else {
      data.ratings.push(entry);
    }

    this.store.write(data);
    return entry;
  }

  removeRating(conversationId: string, messageIndex: number): boolean {
    const data = this.store.read();
    const before = data.ratings.length;
    data.ratings = data.ratings.filter(
      (r) =>
        !(
          r.conversationId === conversationId &&
          r.messageIndex === messageIndex
        ),
    );
    if (data.ratings.length < before) {
      this.store.write(data);
      return true;
    }
    return false;
  }

  getRatings(): MessageRating[] {
    return this.store.read().ratings;
  }

  getSummary(): FeedbackSummary | null {
    return this.store.read().summary;
  }

  // ── Guidelines (for prompt injection) ──────────────

  /**
   * Returns a formatted string for injection into agent prompts.
   * Empty string if no feedback has been analyzed yet.
   */
  getBehaviorGuidelines(): string {
    const summary = this.store.read().summary;
    if (
      !summary ||
      (summary.reinforce.length === 0 && summary.avoid.length === 0)
    ) {
      return '';
    }

    const reinforce = summary.reinforce.map((b) => `- ${b}`).join('\n');
    const avoid = summary.avoid.map((b) => `- ${b}`).join('\n');

    return `<feedback_profile>
Based on ${summary.analyzedCount} rated responses, the user prefers:

BEHAVIORS TO REINFORCE:
${reinforce || '(none identified yet)'}

BEHAVIORS TO AVOID:
${avoid || '(none identified yet)'}
</feedback_profile>`;
  }

  // ── Background Analysis ────────────────────────────

  /** Start the periodic analysis loop. */
  start(): void {
    // Run once after a short delay (let agents initialize)
    setTimeout(() => this.runAnalysisPipeline(), 5000);
    this.timer = setInterval(
      () => this.runAnalysisPipeline(),
      ANALYSIS_INTERVAL_MS,
    );
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Manually trigger the full pipeline. */
  async runAnalysisPipeline(): Promise<FeedbackSummary | null> {
    if (!this.analyzeFn) return null;
    try {
      await this.runMiniAnalysis();
      await this.runFullAnalysis();
    } catch {
      // soft-fail — never block the server
    }
    return this.store.read().summary;
  }

  // ── Mini-analysis: per-message "why" ───────────────

  private async runMiniAnalysis(): Promise<void> {
    if (!this.analyzeFn) return;

    const data = this.store.read();
    const pending = data.ratings.filter((r) => !r.analyzedAt);
    if (pending.length === 0) return;

    const ratingsXml = pending
      .map((r, i) => {
        const reasonAttr = r.reason ? ` reason="${escapeAttr(r.reason)}"` : '';
        return `  <rating index="${i + 1}" type="${r.rating}"${reasonAttr}>\n    ${escapeXml(r.messagePreview)}\n  </rating>`;
      })
      .join('\n');

    const prompt = `You are analyzing agent responses that users have rated with thumbs up or thumbs down.

<ratings count="${pending.length}">
${ratingsXml}
</ratings>

For each rated response, provide a 1-2 sentence summary explaining WHY the user likely rated it that way. Focus on actionable behaviors.

Respond with ONLY a JSON array: [{"index": 1, "analysis": "..."}, ...]`;

    try {
      const raw = await this.analyzeFn(prompt);
      const analyses = JSON.parse(extractJson(raw) || '[]') as Array<{
        index: number;
        analysis: string;
      }>;

      const now = new Date().toISOString();
      for (const a of analyses) {
        const rating = pending[a.index - 1];
        if (rating && a.analysis) {
          const idx = data.ratings.findIndex((r) => r.id === rating.id);
          if (idx >= 0) {
            data.ratings[idx].analysis = a.analysis;
            data.ratings[idx].analyzedAt = now;
          }
        }
      }
      this.store.write(data);
    } catch {
      // soft-fail
    }
  }

  // ── Full-analysis: aggregate into behavior lists ───

  private async runFullAnalysis(): Promise<void> {
    if (!this.analyzeFn) return;

    const data = this.store.read();
    const analyzed = data.ratings.filter((r) => r.analysis);
    if (analyzed.length === 0) return;

    // Skip if nothing changed since last run
    if (
      data.summary &&
      data.summary.analyzedCount === analyzed.length
    ) {
      return;
    }

    const liked = analyzed
      .filter((r) => r.rating === 'thumbs_up')
      .map((r) => r.analysis!);
    const disliked = analyzed
      .filter((r) => r.rating === 'thumbs_down')
      .map((r) => r.analysis!);

    const prompt = `You are aggregating user feedback to identify patterns.

<feedback>
<liked count="${liked.length}">
${liked.map((a, i) => `  <analysis index="${i + 1}">${escapeXml(a)}</analysis>`).join('\n')}
</liked>
<disliked count="${disliked.length}">
${disliked.map((a, i) => `  <analysis index="${i + 1}">${escapeXml(a)}</analysis>`).join('\n')}
</disliked>
</feedback>

Identify the TOP ${MAX_REINFORCE} behaviors users LIKED and TOP ${MAX_AVOID} behaviors users DISLIKED.
Each behavior should be a concise, actionable phrase. Rank by frequency.

Respond with ONLY JSON: {"reinforce": ["behavior 1", ...], "avoid": ["behavior 1", ...]}`;

    try {
      const raw = await this.analyzeFn(prompt);
      const result = JSON.parse(extractJson(raw) || '{}') as {
        reinforce?: string[];
        avoid?: string[];
      };

      data.summary = {
        reinforce: (result.reinforce || []).slice(0, MAX_REINFORCE),
        avoid: (result.avoid || []).slice(0, MAX_AVOID),
        analyzedCount: analyzed.length,
        updatedAt: new Date().toISOString(),
      };
      this.store.write(data);
    } catch {
      // soft-fail
    }
  }

  // ── Admin ──────────────────────────────────────────

  clearAnalysis(): void {
    const data = this.store.read();
    for (const r of data.ratings) {
      r.analysis = undefined;
      r.analyzedAt = undefined;
    }
    data.summary = null;
    this.store.write(data);
  }
}

// ── Helpers ────────────────────────────────────────────

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(s: string): string {
  return escapeXml(s).replace(/"/g, '&quot;');
}

/** Extract first JSON object/array from a string (handles LLM commentary). */
function extractJson(text: string): string | null {
  const start =
    text.indexOf('{') === -1
      ? text.indexOf('[')
      : text.indexOf('[') === -1
        ? text.indexOf('{')
        : Math.min(text.indexOf('{'), text.indexOf('['));
  if (start === -1) return null;

  const open = text[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inStr = false;
  let esc = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (esc) {
      esc = false;
      continue;
    }
    if (ch === '\\' && inStr) {
      esc = true;
      continue;
    }
    if (ch === '"') {
      inStr = !inStr;
      continue;
    }
    if (inStr) continue;
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}
