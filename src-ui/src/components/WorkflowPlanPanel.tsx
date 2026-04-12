import { useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ChatMessage } from '../types';
import {
  deriveLatestPlanArtifactFromMessages,
  type PlanArtifact,
} from '../utils/planArtifacts';
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

function buildMarkdown(title: string, steps: WorkflowPlanStep[]) {
  if (steps.length === 0) {
    return `# ${title}`;
  }

  const checklist = steps
    .map((step) => {
      const checkbox =
        step.status === 'completed'
          ? 'x'
          : step.status === 'in_progress'
            ? '>'
            : ' ';
      return `- [${checkbox}] ${step.label}`;
    })
    .join('\n');

  return `# ${title}\n\n${checklist}`;
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

export function deriveWorkflowPlanArtifact(
  messages: ChatMessage[],
): WorkflowPlanArtifact | null {
  return toWorkflowPlanArtifact(
    deriveLatestPlanArtifactFromMessages(messages as any),
  );
}

export function toWorkflowPlanArtifact(
  artifact: PlanArtifact | null | undefined,
): WorkflowPlanArtifact | null {
  if (!artifact) {
    return null;
  }

  const title = extractTitle(artifact.rawText);
  const steps = artifact.steps.map((step, index) => ({
    id: `plan-step-${index}`,
    label: step.content,
    status: step.status,
  }));
  const markdown =
    /^#{1,6}\s+/m.test(artifact.rawText) ||
    MARKDOWN_STEP_PATTERN.test(artifact.rawText)
      ? artifact.rawText
      : buildMarkdown(title, steps);

  return {
    title,
    markdown,
    rawText: artifact.rawText,
    steps,
    updatedAt: artifact.updatedAt ? Date.parse(artifact.updatedAt) : undefined,
  };
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
  runtimeState,
}: {
  artifact: WorkflowPlanArtifact | null;
  sessionTitle?: string | null;
  runtimeState?: {
    status?: string | null;
    pendingApprovals?: number;
    isProcessingStep?: boolean;
  };
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

  const runtimeLabel = useMemo(() => {
    if ((runtimeState?.pendingApprovals || 0) > 0) {
      return `Approval required (${runtimeState?.pendingApprovals})`;
    }
    if (runtimeState?.isProcessingStep) {
      return 'Tool activity running';
    }
    if (runtimeState?.status === 'awaiting-approval') {
      return 'Awaiting approval';
    }
    if (
      runtimeState?.status === 'running' ||
      runtimeState?.status === 'sending'
    ) {
      return 'Runtime running';
    }
    if (
      runtimeState?.status === 'completed' ||
      runtimeState?.status === 'exited'
    ) {
      return 'Runtime complete';
    }
    return null;
  }, [runtimeState]);

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
          {runtimeLabel && (
            <div className="workflow-plan-panel__runtime-state">
              <span className="workflow-plan-panel__runtime-dot" />
              <span>{runtimeLabel}</span>
            </div>
          )}
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
