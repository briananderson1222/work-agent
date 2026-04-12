import type { SchedulerJob } from '@stallion-ai/contracts/scheduler';

type ScheduleTone = 'success' | 'warning' | 'error';

export function getScheduleStatusTone({
  statusError,
  daemonOk,
  schedulerHealthy,
}: {
  statusError: boolean;
  daemonOk: boolean;
  schedulerHealthy: boolean;
}): ScheduleTone {
  if (statusError) {
    return 'warning';
  }
  if (daemonOk && schedulerHealthy) {
    return 'success';
  }
  if (daemonOk) {
    return 'warning';
  }
  return 'error';
}

export function getScheduleStatusLabel({
  statusError,
  daemonOk,
  schedulerHealthy,
}: {
  statusError: boolean;
  daemonOk: boolean;
  schedulerHealthy: boolean;
}): string {
  if (statusError) {
    return '⚠ Unreachable';
  }
  if (daemonOk && schedulerHealthy) {
    return '● Healthy';
  }
  if (daemonOk) {
    return '⚠ Degraded';
  }
  return '○ Stopped';
}

function getUtcHour(localHour: number): number {
  const date = new Date();
  date.setHours(localHour, 0, 0, 0);
  return date.getUTCHours();
}

export function getScheduleStarterTemplates(): Array<{
  name: string;
  label: string;
  cron: string;
  prompt: string;
  meta: string;
}> {
  return [
    {
      name: 'good-morning',
      label: 'Morning Briefing',
      cron: `0 ${getUtcHour(8)} * * 1-5`,
      prompt:
        'Review my calendar and email for today. Summarize priorities, prep for meetings, and flag anything urgent.',
      meta: 'Weekdays · 8:00 AM',
    },
    {
      name: 'catch-up-emails',
      label: 'Email Catch-up',
      cron: `0 ${getUtcHour(12)} * * 1-5`,
      prompt:
        'Check my recent emails and summarize anything I need to respond to or follow up on.',
      meta: 'Weekdays · 12:00 PM',
    },
    {
      name: 'wrap-up-day',
      label: 'End of Day Wrap',
      cron: `0 ${getUtcHour(17)} * * 1-5`,
      prompt:
        'Summarize what I accomplished today. Check for any customer meetings that need activity logging. Preview tomorrow.',
      meta: 'Weekdays · 5:00 PM',
    },
    {
      name: 'prep-week',
      label: 'Weekly Prep',
      cron: `0 ${getUtcHour(8)} * * 1`,
      prompt:
        'Prepare my weekly overview: key meetings, customer engagements, deadlines, and priorities for the week ahead.',
      meta: 'Mondays · 8:00 AM',
    },
  ];
}

export function buildEnrichedSchedulerJobs({
  jobs,
  stats,
}: {
  jobs: SchedulerJob[];
  stats?: {
    providers?: Record<
      string,
      { jobs?: { name: string; total: number; success_rate: number }[] }
    >;
  };
}): Array<SchedulerJob & { successRate: number }> {
  const statsMap = new Map<
    string,
    { name: string; total: number; success_rate: number }
  >();

  if (stats?.providers) {
    for (const providerStats of Object.values(stats.providers)) {
      for (const jobStats of providerStats.jobs || []) {
        statsMap.set(jobStats.name, jobStats);
      }
    }
  }

  return jobs.map((job) => {
    const jobStats = statsMap.get(job.name);
    return {
      ...job,
      successRate: jobStats
        ? jobStats.total > 0
          ? jobStats.success_rate
          : -1
        : -1,
    };
  });
}
