import type { RunOutputRef, RunSummary } from '@stallion-ai/contracts/runs';
import type { OrchestrationService } from './orchestration-service.js';
import { projectOrchestrationRun } from './run-projection.js';
import type { SchedulerService } from './scheduler-service.js';

export interface RunListFilters {
  source?: 'orchestration' | 'schedule';
  providerId?: string;
  sourceId?: string;
}

export class RunService {
  constructor(
    private readonly orchestrationService: OrchestrationService,
    private readonly schedulerService: SchedulerService,
  ) {}

  async listRuns(filters: RunListFilters = {}): Promise<RunSummary[]> {
    const includeOrchestration =
      !filters.source || filters.source === 'orchestration';
    const includeSchedule = !filters.source || filters.source === 'schedule';

    const [orchestrationRuns, scheduleRuns] = await Promise.all([
      includeOrchestration
        ? this.orchestrationService.listAgentRuns()
        : Promise.resolve([]),
      includeSchedule
        ? this.schedulerService.listRunSummaries({
            providerId: filters.providerId,
            sourceId: filters.sourceId,
          })
        : Promise.resolve([]),
    ]);

    return [
      ...orchestrationRuns
        .map(projectOrchestrationRun)
        .filter((run) => this.matchesFilters(run, filters)),
      ...scheduleRuns,
    ].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  }

  async readRun(runId: string): Promise<RunSummary | null> {
    if (runId.startsWith('schedule:')) {
      return this.schedulerService.readRunSummary(runId);
    }
    if (runId.startsWith('orchestration:')) {
      const runs = await this.orchestrationService.listAgentRuns();
      return (
        runs.map(projectOrchestrationRun).find((run) => run.runId === runId) ??
        null
      );
    }

    const legacy = await this.orchestrationService.readAgentRun(runId);
    return legacy ? projectOrchestrationRun(legacy) : null;
  }

  async readOutput(ref: RunOutputRef): Promise<string> {
    if (ref.source === 'schedule') {
      return this.schedulerService.readOutputRef(ref);
    }
    throw new Error(`Run source '${ref.source}' has no output reader`);
  }

  private matchesFilters(run: RunSummary, filters: RunListFilters): boolean {
    if (filters.providerId && run.providerId !== filters.providerId)
      return false;
    if (filters.sourceId && run.sourceId !== filters.sourceId) return false;
    return true;
  }
}
