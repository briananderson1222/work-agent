import { useState, useCallback } from 'react';
import {
  useSchedulerJobs, useSchedulerStats, useSchedulerStatus,
  useJobLogs, useRunJob, useToggleJob, useDeleteJob, useFetchRunOutput,
  useSchedulerEvents, useOpenArtifact,
} from '../hooks/useScheduler';

function relTime(iso: string | null) {
  if (!iso) return 'never';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
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
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function localizeSchedule(human: string | undefined, schedule: string): string {
  if (!human) return schedule;
  const m = schedule.match(/^cron\s+(\d+)\s+(\d+)\s/);
  if (m) {
    const d = new Date();
    d.setUTCHours(parseInt(m[2]), parseInt(m[1]), 0, 0);
    const local = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    return human.replace(/\d{1,2}:\d{2}\s*(AM|PM)\s*UTC/, local);
  }
  const r = schedule.match(/^cron\s+\S+\s+(\d+)-(\d+)\s/);
  if (r) {
    const fmt = (h: number) => { const d = new Date(); d.setUTCHours(h, 0); return d.toLocaleTimeString(undefined, { hour: 'numeric' }); };
    return human.replace(/\(\d+-\d+\s*UTC\)/, `(${fmt(parseInt(r[1]))}–${fmt(parseInt(r[2]))})`);
  }
  return human.replace(/ UTC$/, '');
}

const thStyle: React.CSSProperties = { padding: '0.5rem 0.75rem', textAlign: 'left', color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 500 };
const tdStyle: React.CSSProperties = { padding: '0.5rem 0.75rem', fontSize: '0.875rem' };
const thSm: React.CSSProperties = { ...thStyle, padding: '0.35rem 0.5rem' };
const tdSm: React.CSSProperties = { ...tdStyle, padding: '0.35rem 0.5rem', fontSize: '0.8rem', color: 'var(--text-primary)' };
const btnStyle: React.CSSProperties = {
  background: 'none', border: '1px solid var(--border-primary)', padding: '0.2rem 0.45rem',
  borderRadius: '0.25rem', cursor: 'pointer', fontSize: '0.75rem', color: 'var(--accent-primary)',
};

function rateColor(rate: number) {
  if (rate >= 90) return 'var(--success-text)';
  if (rate >= 50) return 'var(--warning-text)';
  return 'var(--error-text)';
}

/** Pulsing dot for running jobs */
function RunningIndicator() {
  return (
    <span
      data-testid="running-indicator"
      style={{
        display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
        background: 'var(--success-text)', marginRight: 6, verticalAlign: 'middle',
        animation: 'pulse-dot 1.5s ease-in-out infinite',
      }}
    />
  );
}

function JobDetail({ name }: { name: string }) {
  const { data: logs = [] } = useJobLogs(name);
  const fetchOutput = useFetchRunOutput();
  const [viewIdx, setViewIdx] = useState<number | null>(null);
  const [outputContent, setOutputContent] = useState<string | null>(null);

  const handleViewOutput = async (i: number) => {
    if (viewIdx === i) { setViewIdx(null); setOutputContent(null); return; }
    setViewIdx(i);
    setOutputContent(null);
    try {
      const data = await fetchOutput.mutateAsync(logs[i].output_path);
      setOutputContent(data.content);
    } catch { setOutputContent('Failed to load output'); }
  };

  if (!logs.length) return <div style={{ padding: '0.75rem', color: 'var(--text-secondary)' }}>No run history</div>;

  return (
    <div style={{ padding: '0.5rem 0.75rem' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border-primary)' }}>
            <th style={thSm}>Fired At</th><th style={thSm}>Status</th><th style={thSm}>Duration</th>
            <th style={thSm}>Missed</th><th style={thSm}>Type</th><th style={thSm}></th>
          </tr>
        </thead>
        <tbody>
          {logs.map((r: any, i: number) => (
            <tr key={r.fired_at} style={{ borderBottom: '1px solid var(--border-primary)' }}>
              <td style={tdSm}>{new Date(r.fired_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
              <td style={{ ...tdSm, color: r.success ? 'var(--success-text)' : 'var(--error-text)' }}>{r.success ? '✓' : '✗'}</td>
              <td style={tdSm}>{r.duration_secs.toFixed(1)}s</td>
              <td style={tdSm}>{r.missed_count || '-'}</td>
              <td style={tdSm}>{r.manual ? 'manual' : 'cron'}</td>
              <td style={tdSm}>
                <button onClick={() => handleViewOutput(i)} disabled={fetchOutput.isPending && viewIdx === i} style={btnStyle}>
                  {viewIdx === i ? 'Hide' : 'Output'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {viewIdx !== null && (
        <pre style={{ marginTop: '0.5rem', padding: '0.75rem', background: 'var(--bg-tertiary)', borderRadius: '0.375rem', fontSize: '0.75rem', maxHeight: '300px', overflow: 'auto', color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>
          {outputContent === null ? 'Loading...' : outputContent}
        </pre>
      )}
    </div>
  );
}

export function ScheduleView() {
  const { data: jobs = [], isLoading } = useSchedulerJobs();
  const { data: stats, isLoading: loadingStats } = useSchedulerStats();
  const { data: status, isLoading: loadingStatus, isError: statusError } = useSchedulerStatus();
  const { isRunning } = useSchedulerEvents();
  const runJob = useRunJob();
  const toggleJob = useToggleJob();
  const deleteJob = useDeleteJob();
  const openArtifact = useOpenArtifact();
  const [expanded, setExpanded] = useState<string | null>(null);

  const statsMap = new Map<string, any>();
  if (stats?.jobs) for (const s of stats.jobs) statsMap.set(s.name, s);

  const handleRun = useCallback((name: string) => {
    runJob.mutate(name);
  }, [runJob]);

  return (
    <div style={{ padding: '1.5rem', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Pulse animation */}
      <style>{`@keyframes pulse-dot { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }`}</style>

      <h2 style={{ margin: '0 0 1rem', fontSize: '1.25rem', fontWeight: 600, color: 'var(--text-primary)' }}>Schedule</h2>

      {isLoading && loadingStats && loadingStatus ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading scheduler...</div>
      ) : (<>

      {/* Stats bar */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        {[
          { label: 'Daemon', value: statusError ? '⚠ Unreachable' : status?.daemon_running ? '● Running' : '○ Stopped', color: statusError ? 'var(--warning-text)' : status?.daemon_running ? 'var(--success-text)' : 'var(--error-text)' },
          { label: 'Jobs', value: `${jobs.length}` },
          { label: 'Success Rate', value: stats?.total?.success_rate != null ? `${stats.total.success_rate}%` : '-' },
          { label: 'Total Runs', value: stats?.total?.total_runs ?? '-' },
          { label: 'Failures (7d)', value: stats?.total?.last_7d?.failures ?? '-', color: (stats?.total?.last_7d?.failures || 0) > 0 ? 'var(--error-text)' : undefined },
        ].map(s => (
          <div key={s.label} style={{ padding: '0.75rem 1rem', minWidth: '120px', flex: '1', background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)', borderRadius: '0.5rem' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{s.label}</div>
            <div style={{ fontSize: '1.125rem', fontWeight: 600, color: s.color || 'var(--text-primary)' }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Job table */}
      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)', borderRadius: '0.5rem' }}>
        {isLoading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading jobs...</div>
        ) : jobs.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>No scheduled jobs</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-primary)' }}>
                  <th style={thStyle}>Name</th><th style={thStyle}>Schedule</th>
                  <th style={thStyle}>Status</th><th style={thStyle}>Last Run</th>
                  <th style={thStyle}>Next Fire</th><th style={thStyle}>Success%</th>
                  <th style={thStyle}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job: any) => {
                  const jobStats = statsMap.get(job.name);
                  const isExpanded = expanded === job.name;
                  const running = isRunning(job.name);
                  return (
                    <tr key={job.id} data-testid={`job-row-${job.name}`}
                      style={{ borderBottom: '1px solid var(--border-primary)', cursor: 'pointer', background: isExpanded ? 'var(--bg-tertiary)' : undefined }}
                      onClick={() => setExpanded(isExpanded ? null : job.name)}>
                      <td style={{ ...tdStyle, fontWeight: 500, color: 'var(--text-primary)' }}>
                        {running && <RunningIndicator />}
                        {job.name}
                      </td>
                      <td style={{ ...tdStyle, color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{localizeSchedule(job.schedule_human, job.schedule)}</td>
                      <td style={tdStyle}>
                        {running ? (
                          <span style={{ color: 'var(--success-text)', fontSize: '0.8rem' }}>● running</span>
                        ) : job.enabled === 'yes' ? (
                          <span style={{ color: status?.daemon_running ? 'var(--success-text)' : 'var(--warning-text)', fontSize: '0.8rem' }}>● on</span>
                        ) : (
                          <span style={{ color: 'var(--error-text)', fontSize: '0.8rem' }}>○ off</span>
                        )}
                      </td>
                      <td style={{ ...tdStyle, color: 'var(--text-secondary)' }}>{relTime(job.last_run)}</td>
                      <td style={{ ...tdStyle, color: 'var(--text-secondary)' }}>{localTime(job.next_fire)}</td>
                      <td style={tdStyle}>
                        {jobStats ? <span style={{ color: rateColor(jobStats.success_rate) }}>{jobStats.success_rate}%</span> : '-'}
                      </td>
                      <td style={{ ...tdStyle, width: 140 }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: '0.35rem', justifyContent: 'flex-end' }}>
                          <button title="Run now" data-testid={`run-${job.name}`} disabled={running} onClick={() => handleRun(job.name)} style={btnStyle}>
                            {running ? '⏳' : '▶'}
                          </button>
                          <button title={job.artifact_file ? 'Open artifact' : 'No artifact'} disabled={!job.artifact_file}
                            onClick={() => job.artifact_file && openArtifact.mutate(job.artifact_file)}
                            style={{ ...btnStyle, opacity: job.artifact_file ? 1 : 0.25 }}>📄</button>
                          <button title={job.enabled === 'yes' ? 'Disable' : 'Enable'}
                            onClick={() => toggleJob.mutate({ target: job.name, enabled: job.enabled !== 'yes' })}
                            style={btnStyle}>{job.enabled === 'yes' ? '⏸' : '⏵'}</button>
                          <button title="Delete"
                            onClick={() => { if (confirm(`Delete job "${job.name}"?`)) deleteJob.mutate(job.name); }}
                            style={{ ...btnStyle, borderColor: 'var(--error-text)', color: 'var(--error-text)' }}>✕</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ marginTop: '0.75rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)', borderRadius: '0.5rem', padding: '0.5rem' }}>
          <div style={{ padding: '0.5rem 0.75rem', fontWeight: 500, color: 'var(--text-primary)', borderBottom: '1px solid var(--border-primary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{expanded} — Run History</span>
            {jobs.find((j: any) => j.name === expanded)?.artifact_file && (
              <button onClick={() => openArtifact.mutate(jobs.find((j: any) => j.name === expanded).artifact_file)} style={{ ...btnStyle, fontSize: '0.7rem' }}>
                Open Latest Artifact
              </button>
            )}
          </div>
          <JobDetail name={expanded} />
        </div>
      )}

      </>)}
    </div>
  );
}
