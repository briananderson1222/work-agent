import { useCallback, useState } from 'react';
import {
  useAddJob,
  useDeleteJob,
  useFetchRunOutput,
  useJobLogs,
  useOpenArtifact,
  useRunJob,
  useSchedulerEvents,
  useSchedulerJobs,
  useSchedulerStats,
  useSchedulerStatus,
  useToggleJob,
} from '../hooks/useScheduler';
import { useSystemStatus } from '../hooks/useSystemStatus';
import { SortHeader, TableFilter, useSortableTable } from './SortableTable';
import './ScheduleView.css';

function relTime(iso: string | null) {
  if (!iso) return 'never';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function localTime(iso: string | null) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function localizeSchedule(human: string | undefined, schedule: string): string {
  if (!human) return schedule;
  const m = schedule.match(/^cron\s+(\d+)\s+(\d+)\s/);
  if (m) {
    const d = new Date();
    d.setUTCHours(parseInt(m[2], 10), parseInt(m[1], 10), 0, 0);
    const local = d.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    });
    return human.replace(/\d{1,2}:\d{2}\s*(AM|PM)\s*UTC/, local);
  }
  const r = schedule.match(/^cron\s+\S+\s+(\d+)-(\d+)\s/);
  if (r) {
    const fmt = (h: number) => {
      const d = new Date();
      d.setUTCHours(h, 0);
      return d.toLocaleTimeString(undefined, { hour: 'numeric' });
    };
    return human.replace(
      /\(\d+-\d+\s*UTC\)/,
      `(${fmt(parseInt(r[1], 10))}–${fmt(parseInt(r[2], 10))})`,
    );
  }
  return human.replace(/ UTC$/, '');
}

function rateColor(rate: number) {
  if (rate >= 90) return 'high';
  if (rate >= 50) return 'mid';
  return 'low';
}

const rateTextColor = (rate: number) =>
  rate >= 90
    ? 'var(--success-text)'
    : rate >= 50
      ? 'var(--warning-text)'
      : 'var(--error-text)';

/* ── SVG Icons ── */
const IconPlay = () => (
  <svg viewBox="0 0 16 16" fill="currentColor">
    <path d="M4 2.5v11l9-5.5z" />
  </svg>
);
const IconFile = () => (
  <svg
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M9 1.5H4a1 1 0 00-1 1v11a1 1 0 001 1h8a1 1 0 001-1V5.5L9 1.5z" />
    <path d="M9 1.5V5.5h4" />
  </svg>
);
const IconPause = () => (
  <svg viewBox="0 0 16 16" fill="currentColor">
    <rect x="3" y="2" width="3.5" height="12" rx="0.75" />
    <rect x="9.5" y="2" width="3.5" height="12" rx="0.75" />
  </svg>
);
const IconResume = () => (
  <svg viewBox="0 0 16 16" fill="currentColor">
    <path d="M4 2.5v11l9-5.5z" />
  </svg>
);
const IconX = () => (
  <svg
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
  >
    <path d="M4 4l8 8M12 4l-8 8" />
  </svg>
);
const IconChevron = () => (
  <svg
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M6 4l4 4-4 4" />
  </svg>
);
const IconSpinner = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M8 2a6 6 0 11-4.24 1.76" strokeLinecap="round" />
  </svg>
);

/* ── Success Rate Bar ── */
function RateCell({ rate }: { rate: number | undefined }) {
  if (rate == null || rate < 0)
    return <span className="schedule__td--muted">-</span>;
  const tier = rateColor(rate);
  return (
    <span className="schedule__rate">
      <span style={{ color: rateTextColor(rate) }}>{rate}%</span>
      <span className="schedule__rate-bar">
        <span
          className={`schedule__rate-fill schedule__rate-fill--${tier}`}
          style={{ width: `${rate}%` }}
        />
      </span>
    </span>
  );
}

/* ── Job Detail (inline) ── */
function JobDetail({ name }: { name: string }) {
  const { data: logs = [] } = useJobLogs(name);
  const fetchOutput = useFetchRunOutput();
  const [viewIdx, setViewIdx] = useState<number | null>(null);
  const [outputContent, setOutputContent] = useState<string | null>(null);

  const handleViewOutput = async (i: number) => {
    if (viewIdx === i) {
      setViewIdx(null);
      setOutputContent(null);
      return;
    }
    setViewIdx(i);
    setOutputContent(null);
    try {
      const data = await fetchOutput.mutateAsync(logs[i].output_path);
      setOutputContent(data.content);
    } catch {
      setOutputContent('Failed to load output');
    }
  };

  if (!logs.length)
    return (
      <div style={{ padding: '0.75rem', color: 'var(--text-secondary)' }}>
        No run history
      </div>
    );

  return (
    <div style={{ padding: '0.5rem 0.75rem' }}>
      <table className="schedule__logs">
        <thead>
          <tr>
            <th>Fired At</th>
            <th>Status</th>
            <th>Duration</th>
            <th>Missed</th>
            <th>Type</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {logs.map((r: any, i: number) => (
            <tr key={r.fired_at}>
              <td>
                {new Date(r.fired_at).toLocaleString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </td>
              <td
                style={{
                  color: r.success
                    ? 'var(--success-text)'
                    : 'var(--error-text)',
                }}
              >
                {r.success ? '✓' : '✗'}
              </td>
              <td>{r.duration_secs.toFixed(1)}s</td>
              <td>{r.missed_count || '-'}</td>
              <td>{r.manual ? 'manual' : 'cron'}</td>
              <td>
                <button
                  onClick={() => handleViewOutput(i)}
                  disabled={fetchOutput.isPending && viewIdx === i}
                  className="schedule__action-btn"
                >
                  {viewIdx === i ? 'Hide' : 'Output'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {viewIdx !== null && (
        <pre className="schedule__output">
          {outputContent === null ? 'Loading...' : outputContent}
        </pre>
      )}
    </div>
  );
}

export function ScheduleView() {
  const { data: jobs = [], isLoading, isError: jobsError } = useSchedulerJobs();
  const { data: stats, isLoading: loadingStats } = useSchedulerStats();
  const {
    data: status,
    isLoading: loadingStatus,
    isError: statusError,
  } = useSchedulerStatus();
  const { isRunning } = useSchedulerEvents();
  const runJob = useRunJob();
  const toggleJob = useToggleJob();
  const deleteJob = useDeleteJob();
  const openArtifact = useOpenArtifact();
  const addJob = useAddJob();
  const { data: systemStatus } = useSystemStatus();
  const [expanded, setExpanded] = useState<string | null>(null);

  // Boo not installed — setup checklist
  if (jobsError && statusError) {
    const steps = [
      {
        label: 'kiro-cli installed',
        done: systemStatus?.acp.connected ?? false,
        help: 'Install kiro-cli to enable ACP agent connections and scheduled prompts.',
      },
      {
        label: 'ACP connected',
        done: systemStatus?.acp.connected ?? false,
        help: 'kiro-cli connects automatically once installed and on your PATH.',
      },
      {
        label: 'boo installed',
        done: systemStatus?.scheduler.booInstalled ?? false,
        help: (
          <>
            Download from{' '}
            <a
              href="https://github.com/briananderson1222/boo/releases"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--accent-primary)' }}
            >
              GitHub releases
            </a>{' '}
            then run{' '}
            <code
              style={{
                padding: '2px 6px',
                background: 'var(--bg-tertiary)',
                borderRadius: '0.25rem',
                fontSize: '0.8rem',
              }}
            >
              boo install
            </code>
          </>
        ),
      },
    ];

    return (
      <div className="schedule__setup">
        <div className="schedule__setup-header">
          <div className="schedule__setup-icon">⏰</div>
          <h2 className="schedule__setup-title">Scheduler Setup</h2>
          <p className="schedule__setup-desc">
            The scheduler runs prompts on a cron schedule via{' '}
            <strong>boo</strong> and <strong>kiro-cli</strong>.
          </p>
        </div>
        <div className="schedule__setup-steps">
          {steps.map((step, i) => (
            <div key={i} className="schedule__setup-step">
              <div className="schedule__setup-step-row">
                <span
                  className={`schedule__setup-check ${step.done ? 'schedule__setup-check--done' : ''}`}
                >
                  {step.done ? '✓' : i + 1}
                </span>
                <span
                  style={{
                    fontWeight: 500,
                    color: step.done
                      ? 'var(--text-primary)'
                      : 'var(--text-secondary)',
                  }}
                >
                  {step.label}
                </span>
              </div>
              {!step.done && (
                <div className="schedule__setup-help">{step.help}</div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  const statsMap = new Map<string, any>();
  if (stats?.jobs) for (const s of stats.jobs) statsMap.set(s.name, s);

  const enrichedJobs = jobs.map((job: any) => ({
    ...job,
    success_rate: statsMap.get(job.name)?.success_rate ?? -1,
  }));

  const {
    sorted: sortedJobs,
    sortKey,
    sortDir,
    toggle,
    filterText,
    setFilterText,
  } = useSortableTable(enrichedJobs, 'name', 'asc', ['name']);

  const handleRun = useCallback(
    (name: string) => {
      runJob.mutate(name);
    },
    [runJob],
  );

  const daemonOk = !statusError && status?.daemon_running;
  const failures = stats?.total?.last_7d?.failures || 0;

  return (
    <div className="schedule">
      <h2 className="schedule__title">Schedule</h2>

      {isLoading && loadingStats && loadingStatus ? (
        <div className="schedule__loading">Loading scheduler...</div>
      ) : (
        <>
          {/* Stats */}
          <div className="schedule__stats">
            <div
              className={`stat-card ${statusError ? 'stat-card--warning' : daemonOk ? 'stat-card--success' : 'stat-card--error'}`}
            >
              <div className="stat-card__label">Daemon</div>
              <div
                className="stat-card__value"
                style={{
                  color: statusError
                    ? 'var(--warning-text)'
                    : daemonOk
                      ? 'var(--success-text)'
                      : 'var(--error-text)',
                }}
              >
                {statusError
                  ? '⚠ Unreachable'
                  : daemonOk
                    ? '● Running'
                    : '○ Stopped'}
              </div>
            </div>
            <div className="stat-card stat-card--accent">
              <div className="stat-card__label">Jobs</div>
              <div className="stat-card__value">{jobs.length}</div>
            </div>
            <div className="stat-card stat-card--accent">
              <div className="stat-card__label">Success Rate</div>
              <div className="stat-card__value">
                {stats?.total?.success_rate != null
                  ? `${stats.total.success_rate}%`
                  : '-'}
              </div>
            </div>
            <div className="stat-card stat-card--accent">
              <div className="stat-card__label">Total Runs</div>
              <div className="stat-card__value">
                {stats?.total?.total_runs ?? '-'}
              </div>
            </div>
            <div
              className={`stat-card ${failures > 0 ? 'stat-card--error' : ''}`}
            >
              <div className="stat-card__label">Failures (7d)</div>
              <div
                className="stat-card__value"
                style={{
                  color: failures > 0 ? 'var(--error-text)' : undefined,
                }}
              >
                {stats?.total?.last_7d?.failures ?? '-'}
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="schedule__table-wrap">
            <div className="schedule__filter">
              <TableFilter
                value={filterText}
                onChange={setFilterText}
                placeholder="Filter jobs…"
              />
            </div>

            {isLoading ? (
              <div className="schedule__loading">Loading jobs...</div>
            ) : sortedJobs.length === 0 ? (
              <div className="schedule__empty">
                {filterText ? (
                  'No matching jobs'
                ) : (
                  <div>
                    <p style={{ marginBottom: '1rem' }}>
                      No scheduled jobs yet. Get started with a recommended
                      schedule:
                    </p>
                    <div className="schedule__starters">
                      {[
                        {
                          name: 'good-morning',
                          label: '☀️ Morning Briefing',
                          cron: '0 14 * * 1-5',
                          prompt:
                            'Review my calendar and email for today. Summarize priorities, prep for meetings, and flag anything urgent.',
                          artifact: 'daily-*.html',
                        },
                        {
                          name: 'catch-up-emails',
                          label: '📧 Email Catch-up',
                          cron: '0 18 * * 1-5',
                          prompt:
                            'Check my recent emails and summarize anything I need to respond to or follow up on.',
                          artifact: 'daily-*.html',
                        },
                        {
                          name: 'wrap-up-day',
                          label: '🌙 End of Day Wrap',
                          cron: '0 22 * * 1-5',
                          prompt:
                            'Summarize what I accomplished today. Check for any customer meetings that need activity logging. Preview tomorrow.',
                          artifact: 'daily-*.html',
                        },
                        {
                          name: 'prep-week',
                          label: '📋 Weekly Prep',
                          cron: '0 3 * * 1',
                          prompt:
                            'Prepare my weekly overview: key meetings, customer engagements, deadlines, and priorities for the week ahead.',
                          artifact: 'daily-*.html',
                        },
                      ].map((t) => (
                        <button
                          key={t.name}
                          disabled={addJob.isPending}
                          onClick={() =>
                            addJob.mutate({
                              name: t.name,
                              cron: t.cron,
                              prompt: t.prompt,
                              openArtifact: t.artifact,
                              notifyStart: true,
                            })
                          }
                          className="schedule__starter-btn"
                        >
                          <div className="schedule__starter-label">
                            {t.label}
                          </div>
                          <div className="schedule__starter-meta">
                            {t.cron.includes('* 1') ? 'Mondays' : 'Weekdays'} ·
                            kiro-cli
                          </div>
                        </button>
                      ))}
                    </div>
                    <p className="schedule__starter-hint">
                      Schedules run via <strong>kiro-cli</strong> against your
                      ACP agents. Times are UTC.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="schedule__table">
                  <thead>
                    <tr
                      style={{
                        borderBottom: '1px solid var(--border-primary)',
                      }}
                    >
                      <SortHeader
                        label="Name"
                        sortKey="name"
                        active={sortKey === 'name'}
                        dir={sortDir}
                        onClick={toggle}
                        style={{
                          padding: '0.5rem 0.75rem',
                          textAlign: 'left' as const,
                          color: 'var(--text-secondary)',
                          fontSize: '0.8rem',
                          fontWeight: 500,
                        }}
                      />
                      <th className="schedule__th">Schedule</th>
                      <th className="schedule__th">Status</th>
                      <SortHeader
                        label="Last Run"
                        sortKey="last_run"
                        active={sortKey === 'last_run'}
                        dir={sortDir}
                        onClick={toggle}
                        style={{
                          padding: '0.5rem 0.75rem',
                          textAlign: 'left' as const,
                          color: 'var(--text-secondary)',
                          fontSize: '0.8rem',
                          fontWeight: 500,
                        }}
                      />
                      <SortHeader
                        label="Next Fire"
                        sortKey="next_fire"
                        active={sortKey === 'next_fire'}
                        dir={sortDir}
                        onClick={toggle}
                        style={{
                          padding: '0.5rem 0.75rem',
                          textAlign: 'left' as const,
                          color: 'var(--text-secondary)',
                          fontSize: '0.8rem',
                          fontWeight: 500,
                        }}
                      />
                      <SortHeader
                        label="Success%"
                        sortKey="success_rate"
                        active={sortKey === 'success_rate'}
                        dir={sortDir}
                        onClick={toggle}
                        style={{
                          padding: '0.5rem 0.75rem',
                          textAlign: 'left' as const,
                          color: 'var(--text-secondary)',
                          fontSize: '0.8rem',
                          fontWeight: 500,
                        }}
                      />
                      <th className="schedule__th">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedJobs.map((job: any) => {
                      const jobStats = statsMap.get(job.name);
                      const isExpanded = expanded === job.name;
                      const running = isRunning(job.name);
                      return (
                        <>
                          <tr
                            key={job.id}
                            data-testid={`job-row-${job.name}`}
                            className={`schedule__row ${isExpanded ? 'schedule__row--expanded' : ''}`}
                            onClick={() =>
                              setExpanded(isExpanded ? null : job.name)
                            }
                          >
                            <td className="schedule__td schedule__td--name">
                              <span
                                className={`schedule__chevron ${isExpanded ? 'schedule__chevron--open' : ''}`}
                              >
                                <IconChevron />
                              </span>
                              {job.name}
                            </td>
                            <td className="schedule__td schedule__td--schedule">
                              {localizeSchedule(
                                job.schedule_human,
                                job.schedule,
                              )}
                            </td>
                            <td className="schedule__td">
                              <span className="schedule__status">
                                <span
                                  className={`schedule__status-dot ${
                                    running
                                      ? 'schedule__status-dot--running'
                                      : job.enabled === 'yes'
                                        ? (
                                            status?.daemon_running
                                              ? 'schedule__status-dot--on'
                                              : 'schedule__status-dot--warn'
                                          )
                                        : 'schedule__status-dot--off'
                                  }`}
                                />
                                {running
                                  ? 'running'
                                  : job.enabled === 'yes'
                                    ? 'on'
                                    : 'off'}
                              </span>
                            </td>
                            <td className="schedule__td schedule__td--muted">
                              {relTime(job.last_run)}
                            </td>
                            <td className="schedule__td schedule__td--muted">
                              {localTime(job.next_fire)}
                            </td>
                            <td className="schedule__td">
                              <RateCell rate={jobStats?.success_rate} />
                            </td>
                            <td
                              className="schedule__td schedule__td--actions"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="schedule__actions">
                                <button
                                  title="Run now"
                                  data-testid={`run-${job.name}`}
                                  disabled={running}
                                  onClick={() => handleRun(job.name)}
                                  className="schedule__action-btn"
                                >
                                  {running ? <IconSpinner /> : <IconPlay />}
                                </button>
                                <button
                                  title={
                                    job.artifact_file
                                      ? 'Open artifact'
                                      : 'No artifact'
                                  }
                                  disabled={!job.artifact_file}
                                  onClick={() =>
                                    job.artifact_file &&
                                    openArtifact.mutate(job.artifact_file)
                                  }
                                  className="schedule__action-btn"
                                >
                                  <IconFile />
                                </button>
                                <button
                                  title={
                                    job.enabled === 'yes' ? 'Disable' : 'Enable'
                                  }
                                  onClick={() =>
                                    toggleJob.mutate({
                                      target: job.name,
                                      enabled: job.enabled !== 'yes',
                                    })
                                  }
                                  className="schedule__action-btn"
                                >
                                  {job.enabled === 'yes' ? (
                                    <IconPause />
                                  ) : (
                                    <IconResume />
                                  )}
                                </button>
                                <button
                                  title="Delete"
                                  onClick={() => {
                                    if (confirm(`Delete job "${job.name}"?`))
                                      deleteJob.mutate(job.name);
                                  }}
                                  className="schedule__action-btn schedule__action-btn--danger"
                                >
                                  <IconX />
                                </button>
                              </div>
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr
                              key={`${job.id}-detail`}
                              className="schedule__detail-row"
                            >
                              <td colSpan={7}>
                                <div className="schedule__detail">
                                  <div className="schedule__detail-header">
                                    <span>{job.name} — Run History</span>
                                    {job.artifact_file && (
                                      <button
                                        onClick={() =>
                                          openArtifact.mutate(job.artifact_file)
                                        }
                                        className="schedule__action-btn"
                                        style={{ fontSize: '0.7rem' }}
                                      >
                                        Open Latest Artifact
                                      </button>
                                    )}
                                  </div>
                                  <JobDetail name={job.name} />
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
