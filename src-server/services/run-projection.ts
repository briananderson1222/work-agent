import type { AgentRunSummary } from '@stallion-ai/contracts/orchestration';
import type { RunOutputRef, RunSummary } from '@stallion-ai/contracts/runs';
import type { SchedulerLogEntry } from '@stallion-ai/contracts/scheduler';

function encodeRunPart(value: string): string {
  return encodeURIComponent(value);
}

function decodeRunPart(value: string): string {
  return decodeURIComponent(value);
}

export function createScheduleRunId(
  providerId: string,
  jobName: string,
  logId: string,
): string {
  return `schedule:${encodeRunPart(providerId)}:${encodeRunPart(jobName)}:${encodeRunPart(logId)}`;
}

export function parseScheduleRunId(
  runId: string,
): { providerId: string; jobName: string; logId: string } | null {
  const [source, providerId, jobName, logId, ...rest] = runId.split(':');
  if (source !== 'schedule' || !providerId || !jobName || !logId || rest.length)
    return null;
  return {
    providerId: decodeRunPart(providerId),
    jobName: decodeRunPart(jobName),
    logId: decodeRunPart(logId),
  };
}

export function createOrchestrationRunId(
  providerId: string,
  sessionId: string,
): string {
  return `orchestration:${encodeRunPart(providerId)}:${encodeRunPart(sessionId)}`;
}

export function projectOrchestrationRun(run: AgentRunSummary): RunSummary {
  const runId = createOrchestrationRunId(run.providerId, run.sessionId);
  return {
    runId,
    providerId: run.providerId,
    source: 'orchestration',
    sourceId: run.sessionId,
    status: run.status,
    startedAt: run.startedAt,
    updatedAt: run.updatedAt,
    completedAt: run.completedAt,
    failureKind: run.failureKind,
    failureMessage: run.failureMessage,
    retryEligible: run.retryEligible,
    attempt: run.attempt,
    metadata: {
      legacyRunId: run.runId,
      sessionId: run.sessionId,
      executionClass: run.executionClass,
      cwd: run.cwd,
      runtimeThreadId: run.runtimeThreadId,
      eventCount: run.eventCount,
    },
  };
}

export function projectSchedulerLogToRun(
  providerId: string,
  log: SchedulerLogEntry,
): RunSummary {
  const runId = createScheduleRunId(providerId, log.job, log.id);
  const outputRef: RunOutputRef | undefined = log.output
    ? {
        source: 'schedule',
        providerId,
        runId,
        artifactId: log.id,
        kind: 'output',
      }
    : undefined;

  return {
    runId,
    providerId,
    source: 'schedule',
    sourceId: log.job,
    status: log.success ? 'completed' : 'failed',
    startedAt: log.startedAt,
    updatedAt: log.completedAt ?? log.startedAt,
    completedAt: log.completedAt,
    failureKind: log.success ? undefined : 'agent_error',
    failureMessage: log.error,
    retryEligible:
      !log.success &&
      (log.attempt ?? 1) < (log.maxAttempts ?? log.attempt ?? 1),
    attempt: log.attempt ?? 1,
    maxAttempts: log.maxAttempts,
    outputRef,
    metadata: {
      job: log.job,
      manual: log.manual ?? false,
      missedCount: log.missedCount,
      durationSecs: log.durationSecs,
      legacyLogId: log.id,
    },
  };
}
