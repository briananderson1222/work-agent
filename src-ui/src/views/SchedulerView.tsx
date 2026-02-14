import { useState } from 'react';
import { useToast } from '../contexts/ToastContext';
import { useAgents } from '../contexts/AgentsContext';
import {
  useScheduledJobs,
  useSchedulerHistory,
  useSchedulerActions,
  type ScheduledJob,
  type CreateJobInput,
  type JobSchedule,
  type JobAction,
  type JobExecution,
} from '../hooks/useScheduler';

// Cron preset options
const CRON_PRESETS = [
  { label: 'Every hour', value: '0 * * * *' },
  { label: 'Every day at 9am', value: '0 9 * * *' },
  { label: 'Every weekday at 9am', value: '0 9 * * 1-5' },
  { label: 'Every Monday at 9am', value: '0 9 * * 1' },
  { label: 'Every 6 hours', value: '0 */6 * * *' },
  { label: 'Every Friday at 5pm', value: '0 17 * * 5' },
  { label: 'Custom', value: '' },
];

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diff = now - date;

  if (diff < 60_000) return 'just now';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
  return `${Math.floor(diff / 86400_000)}d ago`;
}

function formatFutureTime(dateStr: string): string {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diff = date - now;

  if (diff < 0) return 'now';
  if (diff < 60_000) return 'in <1m';
  if (diff < 3600_000) return `in ${Math.floor(diff / 60_000)}m`;
  if (diff < 86400_000) return `in ${Math.floor(diff / 3600_000)}h ${Math.floor((diff % 3600_000) / 60_000)}m`;
  return `in ${Math.floor(diff / 86400_000)}d`;
}

function describeSchedule(schedule: JobSchedule): string {
  if (schedule.type === 'interval') {
    const ms = schedule.intervalMs || 0;
    if (ms >= 86400_000) return `Every ${Math.floor(ms / 86400_000)} day(s)`;
    if (ms >= 3600_000) return `Every ${Math.floor(ms / 3600_000)} hour(s)`;
    if (ms >= 60_000) return `Every ${Math.floor(ms / 60_000)} minute(s)`;
    return `Every ${Math.floor(ms / 1000)} second(s)`;
  }
  // Try to match cron to a preset
  const preset = CRON_PRESETS.find(p => p.value === schedule.expression);
  if (preset && preset.value) return preset.label;
  return schedule.expression || 'Unknown';
}

function describeAction(action: JobAction): string {
  switch (action.type) {
    case 'agent-conversation':
      return `Agent: ${action.agentSlug}`;
    case 'tool-invocation':
      return `Tool: ${action.toolServer}/${action.toolName}`;
    case 'workflow':
      return `Workflow: ${action.steps.length} steps`;
    default:
      return 'Unknown';
  }
}

// --- Job Create/Edit Dialog ---

interface JobDialogProps {
  job?: ScheduledJob;
  onSave: (input: CreateJobInput) => Promise<void>;
  onCancel: () => void;
  agents: { slug: string; name: string }[];
}

function JobDialog({ job, onSave, onCancel, agents }: JobDialogProps) {
  const [name, setName] = useState(job?.name || '');
  const [description, setDescription] = useState(job?.description || '');
  const [scheduleType, setScheduleType] = useState<'cron' | 'interval'>(
    job?.schedule.type || 'cron'
  );
  const [cronExpression, setCronExpression] = useState(
    job?.schedule.type === 'cron' ? job.schedule.expression || '' : '0 9 * * 1-5'
  );
  const [intervalMinutes, setIntervalMinutes] = useState(
    job?.schedule.type === 'interval' ? Math.floor((job.schedule.intervalMs || 60_000) / 60_000) : 60
  );
  const [actionType, setActionType] = useState<'agent-conversation' | 'tool-invocation'>(
    job?.action.type === 'tool-invocation' ? 'tool-invocation' : 'agent-conversation'
  );
  const [agentSlug, setAgentSlug] = useState(
    job?.action.type === 'agent-conversation' ? job.action.agentSlug : agents[0]?.slug || ''
  );
  const [message, setMessage] = useState(
    job?.action.type === 'agent-conversation' ? job.action.message : ''
  );
  const [toolName, setToolName] = useState(
    job?.action.type === 'tool-invocation' ? job.action.toolName : ''
  );
  const [toolServer, setToolServer] = useState(
    job?.action.type === 'tool-invocation' ? job.action.toolServer : ''
  );
  const [toolParams, setToolParams] = useState(
    job?.action.type === 'tool-invocation' ? JSON.stringify(job.action.parameters, null, 2) : '{}'
  );
  const [saving, setSaving] = useState(false);
  const [cronPreset, setCronPreset] = useState(
    CRON_PRESETS.find(p => p.value === cronExpression)?.value ?? ''
  );

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);

    try {
      const schedule: JobSchedule = scheduleType === 'cron'
        ? { type: 'cron', expression: cronExpression }
        : { type: 'interval', intervalMs: intervalMinutes * 60_000 };

      let action: JobAction;
      if (actionType === 'agent-conversation') {
        action = { type: 'agent-conversation', agentSlug, message };
      } else {
        let params = {};
        try { params = JSON.parse(toolParams); } catch { /* use empty */ }
        action = { type: 'tool-invocation', toolName, toolServer, parameters: params };
      }

      await onSave({ name, description, schedule, action, enabled: true });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center',
      justifyContent: 'center', zIndex: 1000,
    }}>
      <div style={{
        background: 'var(--bg-primary)', borderRadius: '12px', padding: '24px',
        width: '560px', maxHeight: '80vh', overflow: 'auto',
        border: '1px solid var(--border-primary)',
      }}>
        <h2 style={{ margin: '0 0 16px', fontSize: '18px' }}>
          {job ? 'Edit Job' : 'New Scheduled Job'}
        </h2>

        {/* Name */}
        <label style={{ display: 'block', marginBottom: '12px' }}>
          <span style={{ fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Name</span>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Morning Briefing"
            style={{
              width: '100%', padding: '8px 12px', borderRadius: '6px',
              border: '1px solid var(--border-primary)', background: 'var(--bg-secondary)',
              color: 'var(--text-primary)', fontSize: '14px', boxSizing: 'border-box',
            }}
          />
        </label>

        {/* Description */}
        <label style={{ display: 'block', marginBottom: '16px' }}>
          <span style={{ fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Description (optional)</span>
          <input
            type="text"
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Summarize overnight pipeline changes"
            style={{
              width: '100%', padding: '8px 12px', borderRadius: '6px',
              border: '1px solid var(--border-primary)', background: 'var(--bg-secondary)',
              color: 'var(--text-primary)', fontSize: '14px', boxSizing: 'border-box',
            }}
          />
        </label>

        {/* Schedule */}
        <div style={{ marginBottom: '16px' }}>
          <span style={{ fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Schedule</span>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
            <button
              type="button"
              className={`button ${scheduleType === 'cron' ? 'button--primary' : 'button--secondary'}`}
              onClick={() => setScheduleType('cron')}
              style={{ fontSize: '13px', padding: '6px 12px' }}
            >Cron</button>
            <button
              type="button"
              className={`button ${scheduleType === 'interval' ? 'button--primary' : 'button--secondary'}`}
              onClick={() => setScheduleType('interval')}
              style={{ fontSize: '13px', padding: '6px 12px' }}
            >Interval</button>
          </div>

          {scheduleType === 'cron' ? (
            <div>
              <select
                value={cronPreset}
                onChange={e => {
                  const val = e.target.value;
                  setCronPreset(val);
                  if (val) setCronExpression(val);
                }}
                style={{
                  width: '100%', padding: '8px 12px', borderRadius: '6px', marginBottom: '8px',
                  border: '1px solid var(--border-primary)', background: 'var(--bg-secondary)',
                  color: 'var(--text-primary)', fontSize: '14px',
                }}
              >
                {CRON_PRESETS.map(p => (
                  <option key={p.value || 'custom'} value={p.value}>{p.label}</option>
                ))}
              </select>
              {cronPreset === '' && (
                <input
                  type="text"
                  value={cronExpression}
                  onChange={e => setCronExpression(e.target.value)}
                  placeholder="0 9 * * 1-5"
                  style={{
                    width: '100%', padding: '8px 12px', borderRadius: '6px',
                    border: '1px solid var(--border-primary)', background: 'var(--bg-secondary)',
                    color: 'var(--text-primary)', fontSize: '14px', fontFamily: 'monospace',
                    boxSizing: 'border-box',
                  }}
                />
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '13px' }}>Every</span>
              <input
                type="number"
                min={1}
                value={intervalMinutes}
                onChange={e => setIntervalMinutes(parseInt(e.target.value) || 1)}
                style={{
                  width: '80px', padding: '8px 12px', borderRadius: '6px',
                  border: '1px solid var(--border-primary)', background: 'var(--bg-secondary)',
                  color: 'var(--text-primary)', fontSize: '14px',
                }}
              />
              <span style={{ fontSize: '13px' }}>minutes</span>
            </div>
          )}
        </div>

        {/* Action Type */}
        <div style={{ marginBottom: '16px' }}>
          <span style={{ fontSize: '13px', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Action</span>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
            <button
              type="button"
              className={`button ${actionType === 'agent-conversation' ? 'button--primary' : 'button--secondary'}`}
              onClick={() => setActionType('agent-conversation')}
              style={{ fontSize: '13px', padding: '6px 12px' }}
            >Agent Chat</button>
            <button
              type="button"
              className={`button ${actionType === 'tool-invocation' ? 'button--primary' : 'button--secondary'}`}
              onClick={() => setActionType('tool-invocation')}
              style={{ fontSize: '13px', padding: '6px 12px' }}
            >Tool Call</button>
          </div>

          {actionType === 'agent-conversation' ? (
            <div>
              <select
                value={agentSlug}
                onChange={e => setAgentSlug(e.target.value)}
                style={{
                  width: '100%', padding: '8px 12px', borderRadius: '6px', marginBottom: '8px',
                  border: '1px solid var(--border-primary)', background: 'var(--bg-secondary)',
                  color: 'var(--text-primary)', fontSize: '14px',
                }}
              >
                {agents.map(a => (
                  <option key={a.slug} value={a.slug}>{a.name}</option>
                ))}
              </select>
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="Give me a summary of overnight changes..."
                rows={4}
                style={{
                  width: '100%', padding: '8px 12px', borderRadius: '6px',
                  border: '1px solid var(--border-primary)', background: 'var(--bg-secondary)',
                  color: 'var(--text-primary)', fontSize: '14px', resize: 'vertical',
                  fontFamily: 'inherit', boxSizing: 'border-box',
                }}
              />
            </div>
          ) : (
            <div>
              <input
                type="text"
                value={toolServer}
                onChange={e => setToolServer(e.target.value)}
                placeholder="Tool server (e.g., sat-salesforce)"
                style={{
                  width: '100%', padding: '8px 12px', borderRadius: '6px', marginBottom: '8px',
                  border: '1px solid var(--border-primary)', background: 'var(--bg-secondary)',
                  color: 'var(--text-primary)', fontSize: '14px', boxSizing: 'border-box',
                }}
              />
              <input
                type="text"
                value={toolName}
                onChange={e => setToolName(e.target.value)}
                placeholder="Tool name (e.g., query)"
                style={{
                  width: '100%', padding: '8px 12px', borderRadius: '6px', marginBottom: '8px',
                  border: '1px solid var(--border-primary)', background: 'var(--bg-secondary)',
                  color: 'var(--text-primary)', fontSize: '14px', boxSizing: 'border-box',
                }}
              />
              <textarea
                value={toolParams}
                onChange={e => setToolParams(e.target.value)}
                placeholder='{"query": "SELECT Id FROM Account"}'
                rows={4}
                style={{
                  width: '100%', padding: '8px 12px', borderRadius: '6px',
                  border: '1px solid var(--border-primary)', background: 'var(--bg-secondary)',
                  color: 'var(--text-primary)', fontSize: '13px', resize: 'vertical',
                  fontFamily: 'monospace', boxSizing: 'border-box',
                }}
              />
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
          <button
            type="button"
            className="button button--secondary"
            onClick={onCancel}
            style={{ fontSize: '14px', padding: '8px 16px' }}
          >Cancel</button>
          <button
            type="button"
            className="button button--primary"
            onClick={handleSave}
            disabled={saving || !name.trim()}
            style={{ fontSize: '14px', padding: '8px 16px' }}
          >{saving ? 'Saving...' : (job ? 'Save Changes' : 'Create Job')}</button>
        </div>
      </div>
    </div>
  );
}

// --- Main View ---

export function SchedulerView() {
  const { jobs, loading, refetch } = useScheduledJobs();
  const { history, refetch: refetchHistory } = useSchedulerHistory();
  const { createJob, updateJob, deleteJob, enableJob, disableJob, runJobNow } = useSchedulerActions();
  const { showToast } = useToast();
  const agents = useAgents();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingJob, setEditingJob] = useState<ScheduledJob | null>(null);
  const [runningJobId, setRunningJobId] = useState<string | null>(null);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);

  const handleCreate = async (input: CreateJobInput) => {
    try {
      await createJob(input);
      showToast('Job created');
      setShowCreateDialog(false);
      refetch();
    } catch (err: any) {
      showToast(`Failed to create job: ${err.message}`);
    }
  };

  const handleUpdate = async (input: CreateJobInput) => {
    if (!editingJob) return;
    try {
      await updateJob(editingJob.id, input);
      showToast('Job updated');
      setEditingJob(null);
      refetch();
    } catch (err: any) {
      showToast(`Failed to update job: ${err.message}`);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteJob(id);
      showToast('Job deleted');
      refetch();
    } catch (err: any) {
      showToast(`Failed to delete job: ${err.message}`);
    }
  };

  const handleToggle = async (job: ScheduledJob) => {
    try {
      if (job.enabled) {
        await disableJob(job.id);
        showToast(`${job.name} disabled`);
      } else {
        await enableJob(job.id);
        showToast(`${job.name} enabled`);
      }
      refetch();
    } catch (err: any) {
      showToast(`Failed to toggle job: ${err.message}`);
    }
  };

  const handleRunNow = async (job: ScheduledJob) => {
    setRunningJobId(job.id);
    try {
      const result = await runJobNow(job.id);
      if (result.status === 'success') {
        showToast(`${job.name} completed successfully`);
      } else {
        showToast(`${job.name} failed: ${result.error || 'Unknown error'}`);
      }
      refetch();
      refetchHistory();
    } catch (err: any) {
      showToast(`Failed to run job: ${err.message}`);
    } finally {
      setRunningJobId(null);
    }
  };

  return (
    <div style={{ padding: '24px', maxWidth: '900px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 700 }}>Scheduled Jobs</h1>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
            Automate agent tasks and tool invocations on a schedule
          </p>
        </div>
        <button
          type="button"
          className="button button--primary"
          onClick={() => setShowCreateDialog(true)}
          style={{ fontSize: '14px', padding: '8px 16px' }}
        >+ New Job</button>
      </div>

      {/* Job List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
          Loading jobs...
        </div>
      ) : jobs.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '60px 24px', borderRadius: '12px',
          border: '1px dashed var(--border-primary)', color: 'var(--text-secondary)',
        }}>
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>&#9200;</div>
          <div style={{ fontSize: '15px', fontWeight: 600, marginBottom: '4px' }}>No scheduled jobs yet</div>
          <div style={{ fontSize: '13px', marginBottom: '16px' }}>
            Create a job to run agent conversations or tool calls on a schedule.
          </div>
          <button
            type="button"
            className="button button--primary"
            onClick={() => setShowCreateDialog(true)}
            style={{ fontSize: '14px', padding: '8px 16px' }}
          >Create your first job</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {jobs.map(job => (
            <div
              key={job.id}
              style={{
                border: '1px solid var(--border-primary)',
                borderRadius: '10px',
                padding: '16px',
                background: 'var(--bg-primary)',
                opacity: job.enabled ? 1 : 0.6,
              }}
            >
              {/* Top row */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{
                    width: '8px', height: '8px', borderRadius: '50%',
                    background: job.enabled
                      ? (job.lastRunStatus === 'failure' ? '#ef4444' : '#22c55e')
                      : '#9ca3af',
                    display: 'inline-block',
                  }} />
                  <span style={{ fontWeight: 600, fontSize: '15px' }}>{job.name}</span>
                  {!job.enabled && (
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)', padding: '2px 6px', borderRadius: '4px', background: 'var(--bg-secondary)' }}>
                      Disabled
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    type="button"
                    className="button button--secondary"
                    onClick={() => handleRunNow(job)}
                    disabled={runningJobId === job.id}
                    style={{ fontSize: '12px', padding: '4px 10px' }}
                    title="Run now"
                  >{runningJobId === job.id ? 'Running...' : 'Run Now'}</button>
                  <button
                    type="button"
                    className="button button--secondary"
                    onClick={() => setEditingJob(job)}
                    style={{ fontSize: '12px', padding: '4px 10px' }}
                  >Edit</button>
                  <button
                    type="button"
                    className="button button--secondary"
                    onClick={() => handleToggle(job)}
                    style={{ fontSize: '12px', padding: '4px 10px' }}
                  >{job.enabled ? 'Disable' : 'Enable'}</button>
                  <button
                    type="button"
                    className="button button--secondary"
                    onClick={() => {
                      if (confirm(`Delete "${job.name}"?`)) handleDelete(job.id);
                    }}
                    style={{ fontSize: '12px', padding: '4px 10px', color: '#ef4444' }}
                  >Delete</button>
                </div>
              </div>

              {/* Details row */}
              <div style={{ display: 'flex', gap: '24px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                <span>{describeAction(job.action)}</span>
                <span>{describeSchedule(job.schedule)}</span>
                {job.nextRunAt && <span>Next: {formatFutureTime(job.nextRunAt)}</span>}
                {job.lastRunAt && (
                  <span>
                    Last: {job.lastRunStatus === 'success' ? 'Success' : job.lastRunStatus === 'failure' ? 'Failed' : 'Running'}{' '}
                    ({formatRelativeTime(job.lastRunAt)})
                  </span>
                )}
              </div>

              {/* Expandable description */}
              {job.description && (
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '6px' }}>
                  {job.description}
                </div>
              )}

              {/* Expand for last error */}
              {job.lastRunStatus === 'failure' && job.lastRunError && (
                <div style={{
                  marginTop: '8px', padding: '8px 12px', borderRadius: '6px',
                  background: 'rgba(239, 68, 68, 0.1)', fontSize: '12px', fontFamily: 'monospace',
                  color: '#ef4444',
                }}>
                  {job.lastRunError}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Execution History */}
      {history.length > 0 && (
        <div style={{ marginTop: '32px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px' }}>
            Recent Execution History
          </h2>
          <div style={{
            border: '1px solid var(--border-primary)', borderRadius: '10px',
            overflow: 'hidden',
          }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: 'var(--bg-secondary)' }}>
                  <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 600 }}>Time</th>
                  <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 600 }}>Job</th>
                  <th style={{ textAlign: 'left', padding: '8px 12px', fontWeight: 600 }}>Status</th>
                  <th style={{ textAlign: 'right', padding: '8px 12px', fontWeight: 600 }}>Duration</th>
                </tr>
              </thead>
              <tbody>
                {history.slice(0, 20).map((exec: JobExecution) => (
                  <tr
                    key={exec.id}
                    style={{ borderTop: '1px solid var(--border-primary)', cursor: 'pointer' }}
                    onClick={() => setExpandedJobId(expandedJobId === exec.id ? null : exec.id)}
                  >
                    <td style={{ padding: '8px 12px' }}>
                      {new Date(exec.startedAt).toLocaleTimeString()}
                    </td>
                    <td style={{ padding: '8px 12px' }}>{exec.jobName}</td>
                    <td style={{ padding: '8px 12px' }}>
                      <span style={{
                        color: exec.status === 'success' ? '#22c55e' : exec.status === 'failure' ? '#ef4444' : '#f59e0b',
                      }}>
                        {exec.status === 'success' ? 'Success' : exec.status === 'failure' ? 'Failed' : 'Running'}
                      </span>
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                      {exec.durationMs ? `${(exec.durationMs / 1000).toFixed(1)}s` : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create Dialog */}
      {showCreateDialog && (
        <JobDialog
          onSave={handleCreate}
          onCancel={() => setShowCreateDialog(false)}
          agents={agents}
        />
      )}

      {/* Edit Dialog */}
      {editingJob && (
        <JobDialog
          job={editingJob}
          onSave={handleUpdate}
          onCancel={() => setEditingJob(null)}
          agents={agents}
        />
      )}
    </div>
  );
}
