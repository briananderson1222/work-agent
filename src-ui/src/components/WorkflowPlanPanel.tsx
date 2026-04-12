import { useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ChatMessage } from '../types';
import { markdownCodeComponents } from './HighlightedCodeBlock';

export type WorkflowPlanStepStatus = 'completed' | 'in_progress' | 'pending';

export interface WorkflowPlanStep {
  id: string;
  label: string;
  status: WorkflowPlanStepStatus;
}

export interface WorkflowPlanArtifact {
  title: string;
  markdown: string;
  rawText: string;
  steps: WorkflowPlanStep[];
  updatedAt?: number;
}

const PLAN_LINE_PATTERN =
  /^\s*(?:(?:[-*]\s+)?\[(x|X| |>)\]|(✅|☑️?|🔄|⬜|☐))\s+(.+)$/;
const MARKDOWN_STEP_PATTERN = /^\s*(?:[-*]|\d+\.)\s+\[(x|X| |>)\]\s+(.+)$/;
const MARKDOWN_TITLE_PATTERN = /^#{1,6}\s+(.+)$/m;

function slugifyTitle(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'workflow-plan'
  );
}

function normalizeStatus(
  symbol: string | undefined,
  emoji: string | undefined,
) {
  if (
    symbol?.toLowerCase() === 'x' ||
    emoji === '✅' ||
    emoji?.startsWith('☑')
  ) {
    return 'completed';
  }
  if (symbol === '>' || emoji === '🔄') {
    return 'in_progress';
  }
  return 'pending';
}

function buildMarkdown(title: string, steps: WorkflowPlanStep[]) {
  if (steps.length === 0) {
    return `# ${title}`;
  }

  const checklist = steps
    .map((step) => {
      const checkbox = step.status === 'completed' ? 'x' : ' ';
      return `- [${checkbox}] ${step.label}`;
    })
    .join('\n');

  return `# ${title}\n\n${checklist}`;
}

function extractSteps(content: string): WorkflowPlanStep[] {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .map((line, index) => {
      const iconMatch = line.match(PLAN_LINE_PATTERN);
      if (iconMatch) {
        const [, symbol, emoji, label] = iconMatch;
        return {
          id: `plan-step-${index}`,
          label: label.trim(),
          status: normalizeStatus(symbol, emoji),
        } satisfies WorkflowPlanStep;
      }

      const markdownMatch = line.match(MARKDOWN_STEP_PATTERN);
      if (markdownMatch) {
        const [, symbol, label] = markdownMatch;
        return {
          id: `plan-step-${index}`,
          label: label.trim(),
          status: normalizeStatus(symbol, undefined),
        } satisfies WorkflowPlanStep;
      }

      return null;
    })
    .filter((step): step is WorkflowPlanStep => Boolean(step));
}

function looksLikePlanContent(content: string, steps: WorkflowPlanStep[]) {
  if (steps.length >= 2) {
    return true;
  }

  return (
    /(^|\n)#{1,6}\s+.*plan/i.test(content) ||
    /(^|\n)(steps?|checklist|next steps?):/i.test(content)
  );
}

function extractTitle(content: string) {
  const heading = content.match(MARKDOWN_TITLE_PATTERN)?.[1]?.trim();
  if (heading) {
    return heading;
  }

  const planLine = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => /plan/i.test(line));

  return planLine || 'Workflow plan';
}

function extractArtifactFromContent(
  content: string,
  updatedAt?: number,
): WorkflowPlanArtifact | null {
  const normalized = content.trim();
  if (!normalized) {
    return null;
  }

  const steps = extractSteps(normalized);
  if (!looksLikePlanContent(normalized, steps)) {
    return null;
  }

  const title = extractTitle(normalized);
  const markdown =
    /^#{1,6}\s+/m.test(normalized) || MARKDOWN_STEP_PATTERN.test(normalized)
      ? normalized
      : buildMarkdown(title, steps);

  return {
    title,
    markdown,
    rawText: normalized,
    steps,
    updatedAt,
  };
}

export function deriveWorkflowPlanArtifact(
  messages: ChatMessage[],
): WorkflowPlanArtifact | null {
  for (
    let messageIndex = messages.length - 1;
    messageIndex >= 0;
    messageIndex--
  ) {
    const message = messages[messageIndex];
    if (message.role !== 'assistant') {
      continue;
    }

    const parts = message.contentParts || [];
    const candidates = [
      ...parts
        .filter(
          (part) =>
            (part.type === 'reasoning' || part.type === 'text') &&
            typeof part.content === 'string',
        )
        .map((part) => part.content as string),
      message.content,
    ].filter(
      (value): value is string =>
        typeof value === 'string' && value.trim().length > 0,
    );

    for (const candidate of candidates) {
      const artifact = extractArtifactFromContent(candidate, message.timestamp);
      if (artifact) {
        return artifact;
      }
    }
  }

  return null;
}

function downloadFile(filename: string, mimeType: string, contents: string) {
  const blob = new Blob([contents], { type: mimeType });
  const anchor = document.createElement('a');
  anchor.href = URL.createObjectURL(blob);
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(anchor.href);
}

function StepStatusBadge({ status }: { status: WorkflowPlanStepStatus }) {
  const label =
    status === 'completed'
      ? 'Completed'
      : status === 'in_progress'
        ? 'Active'
        : 'Pending';
  return (
    <span
      className={`workflow-plan-panel__step-badge workflow-plan-panel__step-badge--${status}`}
    >
      {label}
    </span>
  );
}

export function WorkflowPlanPanel({
  artifact,
  sessionTitle,
}: {
  artifact: WorkflowPlanArtifact | null;
  sessionTitle?: string | null;
}) {
  const [activeView, setActiveView] = useState<'steps' | 'markdown'>('steps');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timeout = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  const markdownFilename = useMemo(() => {
    const title = artifact?.title || 'workflow-plan';
    return `${slugifyTitle(title)}.md`;
  }, [artifact?.title]);

  const exportFilename = useMemo(() => {
    const title = artifact?.title || 'workflow-plan';
    return `${slugifyTitle(title)}.json`;
  }, [artifact?.title]);

  const hasSteps = (artifact?.steps.length || 0) > 0;
  const summary = useMemo(() => {
    const steps = artifact?.steps || [];
    return {
      completed: steps.filter((step) => step.status === 'completed').length,
      active: steps.filter((step) => step.status === 'in_progress').length,
      pending: steps.filter((step) => step.status === 'pending').length,
    };
  }, [artifact]);

  const handleCopy = async () => {
    if (!artifact?.markdown) return;
    try {
      await navigator.clipboard?.writeText(artifact.markdown);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const handleSave = () => {
    if (!artifact?.markdown) return;
    downloadFile(markdownFilename, 'text/markdown', artifact.markdown);
  };

  const handleExport = () => {
    if (!artifact) return;
    downloadFile(
      exportFilename,
      'application/json',
      JSON.stringify(
        {
          title: artifact.title,
          markdown: artifact.markdown,
          steps: artifact.steps,
          updatedAt: artifact.updatedAt ?? null,
        },
        null,
        2,
      ),
    );
  };

  return (
    <aside className="workflow-plan-panel">
      <div className="workflow-plan-panel__header">
        <div>
          <p className="workflow-plan-panel__eyebrow">Workflow plan</p>
          <h2 className="workflow-plan-panel__title">
            {artifact?.title || 'No plan captured yet'}
          </h2>
          <p className="workflow-plan-panel__subtitle">
            {sessionTitle
              ? `Linked to ${sessionTitle}`
              : 'Plan artifacts appear here as the active coding chat updates.'}
          </p>
        </div>
        <div className="workflow-plan-panel__actions">
          <button
            type="button"
            className="workflow-plan-panel__action"
            onClick={handleCopy}
            disabled={!artifact}
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button
            type="button"
            className="workflow-plan-panel__action"
            onClick={handleSave}
            disabled={!artifact}
          >
            Save
          </button>
          <button
            type="button"
            className="workflow-plan-panel__action"
            onClick={handleExport}
            disabled={!artifact}
          >
            Export
          </button>
        </div>
      </div>

      {artifact ? (
        <>
          <div className="workflow-plan-panel__summary">
            <div>
              <span className="workflow-plan-panel__summary-value">
                {summary.active}
              </span>
              <span className="workflow-plan-panel__summary-label">active</span>
            </div>
            <div>
              <span className="workflow-plan-panel__summary-value">
                {summary.completed}
              </span>
              <span className="workflow-plan-panel__summary-label">done</span>
            </div>
            <div>
              <span className="workflow-plan-panel__summary-value">
                {summary.pending}
              </span>
              <span className="workflow-plan-panel__summary-label">queued</span>
            </div>
          </div>

          <div className="workflow-plan-panel__view-switcher" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={activeView === 'steps'}
              className={`workflow-plan-panel__view-tab${activeView === 'steps' ? ' is-active' : ''}`}
              onClick={() => setActiveView('steps')}
            >
              Steps
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeView === 'markdown'}
              className={`workflow-plan-panel__view-tab${activeView === 'markdown' ? ' is-active' : ''}`}
              onClick={() => setActiveView('markdown')}
            >
              Markdown
            </button>
          </div>

          <div className="workflow-plan-panel__body">
            {activeView === 'steps' ? (
              hasSteps ? (
                <ol className="workflow-plan-panel__steps">
                  {artifact.steps.map((step) => (
                    <li
                      key={step.id}
                      className={`workflow-plan-panel__step workflow-plan-panel__step--${step.status}`}
                    >
                      <div className="workflow-plan-panel__step-row">
                        <StepStatusBadge status={step.status} />
                        <span className="workflow-plan-panel__step-label">
                          {step.label}
                        </span>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <div className="workflow-plan-panel__empty">
                  <p>This plan does not expose structured steps yet.</p>
                  <p>Open the markdown view for the full artifact.</p>
                </div>
              )
            ) : (
              <div className="workflow-plan-panel__markdown markdown-body">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={markdownCodeComponents}
                >
                  {artifact.markdown}
                </ReactMarkdown>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="workflow-plan-panel__empty workflow-plan-panel__empty--shell">
          <p>No plan artifact is available for this project yet.</p>
          <p>
            Start or resume a coding chat with planning updates to populate the
            panel.
          </p>
        </div>
      )}
    </aside>
  );
}
