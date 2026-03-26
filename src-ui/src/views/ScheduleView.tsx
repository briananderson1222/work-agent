import { LoadingState } from '@stallion-ai/sdk';
import type { SchedulerJob } from '@stallion-ai/shared';
import {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { ConfirmModal } from '../components/ConfirmModal';
import {
  JobDetail,
  JobFormModal,
  RateCell,
  cronToHuman,
  localTime,
  relTime,
} from '../components/scheduler';
import { useNavigation } from '../contexts/NavigationContext';
import { useToast } from '../contexts/ToastContext';
import {
  useDeleteJob,
  useOpenArtifact,
  useRunJob,
  useSchedulerEvents,
  useSchedulerJobs,
  useSchedulerProviders,
  useSchedulerStats,
  useSchedulerStatus,
  useToggleJob,
} from '../hooks/useScheduler';
import { SortHeader, TableFilter, useSortableTable } from './SortableTable';
import './ScheduleView.css';
import './page-layout.css';

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
const IconEdit = () => (
  <svg
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M11.5 2.5l2 2-8 8H3.5v-2z" />
  </svg>
);

export function ScheduleView() {
  const { data: jobs = [], isLoading, isError: jobsError } = useSchedulerJobs();
  const { data: stats, isLoading: loadingStats } = useSchedulerStats();
  const {
    data: status,
    isLoading: loadingStatus,
    isError: statusError,
  } = useSchedulerStatus();
  const { data: providers = [] } = useSchedulerProviders();
  const schedulerAvailable = !jobsError && !statusError;
  const { isRunning, markErrorShown } = useSchedulerEvents(schedulerAvailable);
  const runJob = useRunJob();
  const toggleJob = useToggleJob();
  const deleteJob = useDeleteJob();
  const openArtifact = useOpenArtifact();
  const { updateParams } = useNavigation();
  const { showToast } = useToast();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editingJob, setEditingJob] = useState<SchedulerJob | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [prefill, setPrefill] = useState<Partial<{ name: string; cron: string; prompt: string }> | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    title: string;
    message: string;
    variant: 'danger' | 'warning';
    onConfirm: () => void;
  } | null>(null);
  const deepLinked = useRef(false);
  const [autoOpenRun, setAutoOpenRun] = useState<string | null>(null);

  // Deep link: ?job=X&run=Y auto-expands that job and opens run output
  useEffect(() => {
    if (deepLinked.current || isLoading || !jobs.length) return;
    const params = new URLSearchParams(window.location.search);
    const jobParam = params.get('job');
    const runParam = params.get('run');
    if (jobParam && jobs.some((j) => j.name === jobParam)) {
      setExpanded(jobParam);
      if (runParam) setAutoOpenRun(runParam);
      deepLinked.current = true;
      updateParams({ job: null, run: null });
    }
  }, [jobs, isLoading, updateParams]);

  const statsMap = new Map<string, { name: string; total: number; success_rate: number }>();
  if (stats?.providers) {
    for (const provStats of Object.values(stats.providers) as { jobs?: { name: string; total: number; success_rate: number }[] }[]) {
      for (const s of provStats.jobs || []) statsMap.set(s.name, s);
    }
  }

  const enrichedJobs = jobs.map((job) => {
    const js = statsMap.get(job.name);
    return {
      ...job,
      successRate: js ? (js.total > 0 ? js.success_rate : -1) : -1,
    };
  });

  const {
    sorted: sortedJobs,
    sortKey,
    sortDir,
    toggle,
    filterText,
    setFilterText,
  } = useSortableTable(enrichedJobs, 'lastRun', 'desc', ['name']);

  const handleRun = useCallback(
    (name: string) => {
      runJob.mutate(name, {
        onError: (e: Error) => {
          markErrorShown(name);
          showToast(`Failed to run '${name}': ${e.message}`);
        },
      });
    },
    [runJob, showToast, markErrorShown],
  );

  // Scheduler unavailable
  if (jobsError && statusError) {
    return (
      <div className="schedule__setup">
        <div className="schedule__setup-header">
          <div className="schedule__setup-icon">
            <svg
              viewBox="0 0 24 24"
              width="48"
              height="48"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
              <line x1="4" y1="4" x2="20" y2="20" />
            </svg>
          </div>
          <h2 className="schedule__setup-title">Scheduler Unavailable</h2>
          <p className="schedule__setup-desc">
            Could not connect to the scheduler service. Check that the server is
            running.
          </p>
        </div>
      </div>
    );
  }

  const daemonOk =
    !statusError &&
    Object.values(status?.providers || {}).some((p) => (p as { running?: boolean }).running);
  const totalRuns = stats?.summary?.totalRuns ?? 0;
  const successRate = stats?.summary?.successRate ?? -1;

  return (
    <div className="schedule page">
      <div className="page__header">
        <div className="page__header-text">
          <div className="page__label">schedule</div>
          <h1 className="page__title">Schedule</h1>
          <p className="page__subtitle">Manage scheduled jobs and automation</p>
        </div>
        <div className="page__actions">
          <button
            className="page__btn-primary"
            onClick={() => setShowAddForm(true)}
          >
            + Add Job
          </button>
        </div>
      </div>

      {isLoading && loadingStats && loadingStatus ? (
        <LoadingState message="Loading scheduler..." />
      ) : (
        <>
          {/* Stats */}
          <div className="schedule__stats" role="status" aria-label="Scheduler statistics">
            <div
              className={`stat-card ${statusError ? 'stat-card--warning' : daemonOk ? 'stat-card--success' : 'stat-card--error'}`}
            >
              <div className="stat-card__label">Scheduler</div>
              <div
                className={`stat-card__value ${
                  statusError
                    ? 'stat-card__value--warning'
                    : daemonOk
                      ? 'stat-card__value--success'
                      : 'stat-card__value--error'
                }`}
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
                {successRate >= 0 ? `${successRate}%` : '-'}
              </div>
            </div>
            <div className="stat-card stat-card--accent">
              <div className="stat-card__label">Total Runs</div>
              <div className="stat-card__value">
                {totalRuns >= 0 ? totalRuns : '-'}
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
              <LoadingState message="Loading jobs..." />
            ) : sortedJobs.length === 0 ? (
              <div className="schedule__empty">
                {filterText ? (
                  'No matching jobs'
                ) : (
                  <div>
                    <p className="schedule__empty-intro">
                      No scheduled jobs yet. Pick a template to get started:
                    </p>
                    <div className="schedule__starters">
                      {(() => {
                        // Convert local hour to UTC for cron
                        const utcHour = (localHour: number) => {
                          const d = new Date();
                          d.setHours(localHour, 0, 0, 0);
                          return d.getUTCHours();
                        };
                        return [
                          {
                            name: 'good-morning',
                            label: '☀️ Morning Briefing',
                            cron: `0 ${utcHour(8)} * * 1-5`,
                            prompt:
                              'Review my calendar and email for today. Summarize priorities, prep for meetings, and flag anything urgent.',
                            meta: 'Weekdays · 8:00 AM',
                          },
                          {
                            name: 'catch-up-emails',
                            label: '📧 Email Catch-up',
                            cron: `0 ${utcHour(12)} * * 1-5`,
                            prompt:
                              'Check my recent emails and summarize anything I need to respond to or follow up on.',
                            meta: 'Weekdays · 12:00 PM',
                          },
                          {
                            name: 'wrap-up-day',
                            label: '🌙 End of Day Wrap',
                            cron: `0 ${utcHour(17)} * * 1-5`,
                            prompt:
                              'Summarize what I accomplished today. Check for any customer meetings that need activity logging. Preview tomorrow.',
                            meta: 'Weekdays · 5:00 PM',
                          },
                          {
                            name: 'prep-week',
                            label: '📋 Weekly Prep',
                            cron: `0 ${utcHour(8)} * * 1`,
                            prompt:
                              'Prepare my weekly overview: key meetings, customer engagements, deadlines, and priorities for the week ahead.',
                            meta: 'Mondays · 8:00 AM',
                          },
                        ];
                      })().map((t) => (
                        <button
                          key={t.name}
                          onClick={() => {
                            setPrefill({
                              name: t.name,
                              cron: t.cron,
                              prompt: t.prompt,
                            });
                            setShowAddForm(true);
                          }}
                          className="schedule__starter-btn"
                        >
                          <div className="schedule__starter-label">
                            {t.label}
                          </div>
                          <div className="schedule__starter-meta">{t.meta}</div>
                        </button>
                      ))}
                    </div>
                    <p className="schedule__starter-hint">
                      Templates pre-fill the form — you choose the agent and
                      schedule.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="schedule__table-scroll">
                <table className="schedule__table" aria-label="Scheduled jobs">
                  <thead>
                    <tr>
                      <SortHeader
                        label="Name"
                        sortKey="name"
                        active={sortKey === 'name'}
                        dir={sortDir}
                        onClick={toggle}
                      />
                      <th className="sortable-table__th">Schedule</th>
                      <th className="sortable-table__th">Status</th>
                      <SortHeader
                        label="Last Run"
                        sortKey="lastRun"
                        active={sortKey === 'lastRun'}
                        dir={sortDir}
                        onClick={toggle}
                      />
                      <SortHeader
                        label="Next Fire"
                        sortKey="nextRun"
                        active={sortKey === 'nextRun'}
                        dir={sortDir}
                        onClick={toggle}
                      />
                      <SortHeader
                        label="Success%"
                        sortKey="successRate"
                        active={sortKey === 'successRate'}
                        dir={sortDir}
                        onClick={toggle}
                      />
                      <th className="sortable-table__th">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedJobs.map((job) => {
                      const isExpanded = expanded === job.name;
                      const running = isRunning(job.name);
                      return (
                        <Fragment key={job.id}>
                          <tr
                            data-testid={`job-row-${job.name}`}
                            className={`schedule__row ${isExpanded ? 'schedule__row--expanded' : ''}`}
                            aria-expanded={isExpanded}
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
                              <div>{job.cron || '-'}</div>
                              {job.cron && (
                                <div className="schedule__cron-human-inline">
                                  {cronToHuman(
                                    job.cron,
                                    job.nextRun
                                      ? new Date(job.nextRun)
                                      : undefined,
                                  ) || ''}
                                </div>
                              )}
                            </td>
                            <td
                              className="schedule__td"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (running) {
                                  setConfirmAction({
                                    title: 'Cancel Running Job',
                                    message: `Disabling '${job.name}' will cancel the currently running job. Continue?`,
                                    variant: 'warning',
                                    onConfirm: () => {
                                      toggleJob.mutate({
                                        target: job.name,
                                        enabled: false,
                                      });
                                      setConfirmAction(null);
                                    },
                                  });
                                } else {
                                  toggleJob.mutate({
                                    target: job.name,
                                    enabled: !job.enabled,
                                  });
                                }
                              }}
                            >
                              <span
                                className={`schedule__status schedule__status--clickable`}
                              >
                                <span
                                  className={`schedule__status-dot ${
                                    running
                                      ? 'schedule__status-dot--running'
                                      : job.enabled
                                        ? (
                                            daemonOk
                                              ? 'schedule__status-dot--on'
                                              : 'schedule__status-dot--warn'
                                          )
                                        : 'schedule__status-dot--off'
                                  }`}
                                />
                                {running
                                  ? 'running'
                                  : job.enabled
                                    ? 'on'
                                    : 'off'}
                              </span>
                            </td>
                            <td className="schedule__td schedule__td--muted">
                              {relTime(job.lastRun)}
                            </td>
                            <td className="schedule__td schedule__td--muted">
                              {localTime(job.nextRun)}
                            </td>
                            <td className="schedule__td">
                              <RateCell rate={job.successRate} />
                            </td>
                            <td
                              className="schedule__td schedule__td--actions"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="schedule__actions">
                                <button
                                  title="Edit"
                                  onClick={() => setEditingJob(job)}
                                  className="schedule__action-btn"
                                >
                                  <IconEdit />
                                </button>
                                <button
                                  title="Run now"
                                  data-testid={`run-${job.name}`}
                                  disabled={running}
                                  onClick={() => handleRun(job.name)}
                                  className="schedule__action-btn"
                                >
                                  {running ? <IconSpinner /> : <IconPlay />}
                                </button>
                                {job.openArtifact && (
                                  <button
                                    title="Open artifact"
                                    onClick={() =>
                                      openArtifact.mutate(job.openArtifact)
                                    }
                                    className="schedule__action-btn"
                                  >
                                    <IconFile />
                                  </button>
                                )}
                                <button
                                  title="Delete"
                                  onClick={() => {
                                    setConfirmAction({
                                      title: 'Delete Job',
                                      message: `Delete job "${job.name}"? This cannot be undone.`,
                                      variant: 'danger',
                                      onConfirm: () => {
                                        deleteJob.mutate(job.name);
                                        setConfirmAction(null);
                                      },
                                    });
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
                                    <div className="schedule__detail-actions">
                                      {job.openArtifact && (
                                        <button
                                          onClick={() =>
                                            openArtifact.mutate(
                                              job.openArtifact,
                                            )
                                          }
                                          className="page__btn-primary schedule__detail-artifact-btn"
                                        >
                                          Open Latest Artifact
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                  {(job.description ||
                                    job.prompt ||
                                    job.command ||
                                    job.agent) && (
                                    <div className="schedule__detail-meta">
                                      {job.description && (
                                        <div className="schedule__detail-desc">
                                          {job.description}
                                        </div>
                                      )}
                                      {job.agent && (
                                        <div className="schedule__detail-field">
                                          <span className="schedule__detail-label">
                                            Agent
                                          </span>
                                          <span className="schedule__detail-value">
                                            {job.agent}
                                          </span>
                                        </div>
                                      )}
                                      {job.prompt && (
                                        <div className="schedule__detail-field">
                                          <span className="schedule__detail-label">
                                            Prompt
                                          </span>
                                          <span className="schedule__detail-value">
                                            {job.prompt}
                                          </span>
                                        </div>
                                      )}
                                      {job.command && (
                                        <div className="schedule__detail-field">
                                          <span className="schedule__detail-label">
                                            Command
                                          </span>
                                          <code className="schedule__detail-code">
                                            {job.command}
                                          </code>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                  <JobDetail
                                    name={job.name}
                                    autoOpenRun={
                                      expanded === job.name ? autoOpenRun : null
                                    }
                                  />
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
      {editingJob && (
        <JobFormModal
          job={editingJob}
          onClose={() => setEditingJob(null)}
          providers={providers}
        />
      )}
      {showAddForm && (
        <JobFormModal
          prefill={prefill}
          onClose={() => {
            setShowAddForm(false);
            setPrefill(null);
          }}
          providers={providers}
        />
      )}
      {confirmAction && (
        <ConfirmModal
          isOpen
          title={confirmAction.title}
          message={confirmAction.message}
          variant={confirmAction.variant}
          confirmLabel={
            confirmAction.variant === 'danger' ? 'Delete' : 'Disable'
          }
          onConfirm={confirmAction.onConfirm}
          onCancel={() => setConfirmAction(null)}
        />
      )}
    </div>
  );
}
