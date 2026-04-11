import { LoadingState } from '@stallion-ai/sdk';
import type { SchedulerJob } from '@stallion-ai/contracts/scheduler';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ConfirmModal } from '../components/ConfirmModal';
import { JobFormModal } from '../components/scheduler';
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
import { useSortableTable } from './SortableTable';
import { ScheduleEmptyState } from './schedule/ScheduleEmptyState';
import { ScheduleJobsTable } from './schedule/ScheduleJobsTable';
import { ScheduleStats } from './schedule/ScheduleStats';
import { buildEnrichedSchedulerJobs } from './schedule/utils';
import './ScheduleView.css';
import './page-layout.css';

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
  const { isRunning, markErrorShown, getMissedCount } =
    useSchedulerEvents(schedulerAvailable);
  const runJob = useRunJob();
  const toggleJob = useToggleJob();
  const deleteJob = useDeleteJob();
  const openArtifact = useOpenArtifact();
  const { updateParams } = useNavigation();
  const { showToast } = useToast();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editingJob, setEditingJob] = useState<SchedulerJob | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [prefill, setPrefill] = useState<
    | Partial<{
        name: string;
        cron: string;
        prompt: string;
      }>
    | undefined
  >(undefined);
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

  const enrichedJobs = buildEnrichedSchedulerJobs({ jobs, stats });

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
    Object.values(status?.providers || {}).some(
      (p) => (p as { running?: boolean }).running,
    );
  const schedulerHealthy =
    !statusError &&
    Object.values(status?.providers || {}).every(
      (p) => (p as { healthy?: boolean }).healthy !== false,
    );
  const lastTickAt = Object.values(status?.providers || {}).find(
    (p) => (p as { lastTickAt?: string }).lastTickAt,
  ) as { lastTickAt?: string } | undefined;
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

      {isLoading || loadingStats || loadingStatus ? (
        <LoadingState message="Loading scheduler..." />
      ) : (
        <>
          <ScheduleStats
            daemonOk={daemonOk}
            jobsCount={jobs.length}
            lastTickAt={lastTickAt?.lastTickAt}
            schedulerHealthy={schedulerHealthy}
            statusError={statusError}
            successRate={successRate}
            totalRuns={totalRuns}
          />

          {sortedJobs.length === 0 ? (
            <ScheduleEmptyState
              filterText={filterText}
              onSelectTemplate={(template) => {
                setPrefill(template);
                setShowAddForm(true);
              }}
            />
          ) : (
            <ScheduleJobsTable
              autoOpenRun={autoOpenRun}
              daemonOk={daemonOk}
              expanded={expanded}
              filterText={filterText}
              getMissedCount={getMissedCount}
              handleRun={handleRun}
              isRunning={isRunning}
              onDelete={(job) => {
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
              onDuplicate={(job) => {
                setPrefill({
                  name: `${job.name}-copy`,
                  cron: job.cron,
                  prompt: job.prompt,
                });
                setShowAddForm(true);
              }}
              onEdit={setEditingJob}
              onExpand={setExpanded}
              onFilterChange={setFilterText}
              onOpenArtifact={(artifactPath) => openArtifact.mutate(artifactPath)}
              onToggle={(job, running) => {
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
                  return;
                }

                toggleJob.mutate({
                  target: job.name,
                  enabled: !job.enabled,
                });
              }}
              sortDir={sortDir}
              sortKey={sortKey}
              sortedJobs={sortedJobs}
              toggleSort={toggle}
            />
          )}
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
            setPrefill(undefined);
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
