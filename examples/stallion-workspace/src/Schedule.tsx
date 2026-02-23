import { useState } from 'react';
import {
  useSchedulerJobs, useSchedulerStats, useSchedulerStatus,
  useJobLogs, useRunJob, useToggleJob, useDeleteJob, useFetchRunOutput,
} from './data';
import './workspace.css';

function relTime(iso: string | null) {
  if (!iso) return 'never';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso; // fallback for non-ISO strings
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

/** Localize a boo schedule_human string by converting UTC times to local */
function localizeSchedule(human: string | undefined, schedule: string): string {
  if (!human) return schedule;
  // Try to extract fixed UTC hour:min from raw cron: "cron M H * * *"
  const m = schedule.match(/^cron\s+(\d+)\s+(\d+)\s/);
  if (m) {
    const d = new Date();
    d.setUTCHours(parseInt(m[2]), parseInt(m[1]), 0, 0);
    const local = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    // Replace the UTC time portion in the human string
    return human.replace(/\d{1,2}:\d{2}\s*(AM|PM)\s*UTC/, local);
  }
  // For interval crons like "*/30 15-23", localize the hour range
  const r = schedule.match(/^cron\s+\S+\s+(\d+)-(\d+)\s/);
  if (r) {
    const fmt = (h: number) => { const d = new Date(); d.setUTCHours(h, 0); return d.toLocaleTimeString(undefined, { hour: 'numeric' }); };
    return human.replace(/\(\d+-\d+\s*UTC\)/, `(${fmt(parseInt(r[1]))}–${fmt(parseInt(r[2]))})`);
  }
  return human.replace(/ UTC$/, '');
}

const thStyle = { padding: '0.5rem 0.75rem', textAlign: 'left' as const, color: 'var(--color-text-secondary)', fontSize: '0.8rem', fontWeight: 500 };
const tdStyle = { padding: '0.5rem 0.75rem', fontSize: '0.875rem' };
const thSm = { ...thStyle, padding: '0.35rem 0.5rem' };
const tdSm = { ...tdStyle, padding: '0.35rem 0.5rem', fontSize: '0.8rem', color: 'var(--color-text)' };
const btnStyle = {
  background: 'none', border: '1px solid var(--color-border)', padding: '0.2rem 0.45rem',
  borderRadius: '0.25rem', cursor: 'pointer', fontSize: '0.75rem', color: 'var(--color-primary)',
};

function rateColor(rate: number) {
  if (rate >= 90) return '#22c55e';
  if (rate >= 50) return '#f59e0b';
  return '#ef4444';
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

  if (!logs.length) return <div style={{ padding: '0.75rem', color: 'var(--color-text-secondary)' }}>No run history</div>;

  return (
    <div style={{ padding: '0.5rem 0.75rem' }}>
      <div style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: '0.5rem' }}>Run History</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
            <th style={thSm}>Fired At</th><th style={thSm}>Status</th><th style={thSm}>Duration</th>
            <th style={thSm}>Missed</th><th style={thSm}>Type</th><th style={thSm}></th>
          </tr>
        </thead>
        <tbody>
          {logs.map((r: any, i: number) => (
            <tr key={r.fired_at} style={{ borderBottom: '1px solid var(--color-border)' }}>
              <td style={tdSm}>{new Date(r.fired_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
              <td style={{ ...tdSm, color: r.success ? '#22c55e' : '#ef4444' }}>{r.success ? '✓' : '✗'}</td>
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
        <pre style={{ marginTop: '0.5rem', padding: '0.75rem', background: 'var(--color-bg-hover, #1a1a2e)', borderRadius: '0.375rem', fontSize: '0.75rem', maxHeight: '300px', overflow: 'auto', color: 'var(--color-text)', whiteSpace: 'pre-wrap' }}>
          {outputContent === null ? 'Loading...' : outputContent}
        </pre>
      )}
    </div>
  );
}

export function Schedule() {
  const { data: jobs = [], isLoading } = useSchedulerJobs();
  const { data: stats } = useSchedulerStats();
  const { data: status } = useSchedulerStatus();
  const runJob = useRunJob();
  const toggleJob = useToggleJob();
  const deleteJob = useDeleteJob();
  const [expanded, setExpanded] = useState<string | null>(null);

  const statsMap = new Map<string, any>();
  if (stats?.jobs) for (const s of stats.jobs) statsMap.set(s.name, s);

  return (
    <div style={{ padding: '1rem', display: 'grid', gap: '1rem' }}>
      {/* Stats bar */}
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        {[
          { label: 'Daemon', value: status?.daemon_running ? '● Running' : '○ Stopped', color: status?.daemon_running ? '#22c55e' : '#ef4444' },
          { label: 'Jobs', value: `${jobs.length}` },
          { label: 'Success Rate', value: stats?.total?.success_rate != null ? `${stats.total.success_rate}%` : '-' },
          { label: 'Total Runs', value: stats?.total?.total_runs ?? '-' },
          { label: 'Failures (7d)', value: stats?.total?.last_7d?.failures ?? '-', color: (stats?.total?.last_7d?.failures || 0) > 0 ? '#ef4444' : undefined },
        ].map(s => (
          <div key={s.label} className="workspace-dashboard__card" style={{ padding: '0.75rem 1rem', minWidth: '120px', flex: '1' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>{s.label}</div>
            <div style={{ fontSize: '1.125rem', fontWeight: 600, color: s.color || 'var(--color-text)' }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Job table */}
      <div className="workspace-dashboard__card" style={{ overflow: 'visible' }}>
        <div className="workspace-dashboard__card-header">
          <h3 className="workspace-dashboard__card-title">Scheduled Jobs</h3>
        </div>
        {isLoading ? (
          <div className="workspace-dashboard__empty"><div>Loading jobs...</div></div>
        ) : jobs.length === 0 ? (
          <div className="workspace-dashboard__empty"><div>No scheduled jobs</div></div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <th style={thStyle}>Name</th><th style={thStyle}>Schedule</th>
                  <th style={thStyle}>Enabled</th><th style={thStyle}>Last Run</th>
                  <th style={thStyle}>Next Fire</th><th style={thStyle}>Success%</th>
                  <th style={thStyle}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job: any) => {
                  const jobStats = statsMap.get(job.name);
                  const isExpanded = expanded === job.name;
                  return (
                    <tr key={job.id} style={{ borderBottom: '1px solid var(--color-border)', cursor: 'pointer', background: isExpanded ? 'color-mix(in srgb, var(--color-primary) 5%, transparent)' : undefined }}
                      onClick={() => setExpanded(isExpanded ? null : job.name)}>
                      <td style={{ ...tdStyle, fontWeight: 500, color: 'var(--color-text)' }}>{job.name}</td>
                      <td style={{ ...tdStyle, color: 'var(--color-text-secondary)', fontSize: '0.8rem' }}>{localizeSchedule(job.schedule_human, job.schedule)}</td>
                      <td style={tdStyle}>
                        <span style={{ color: job.enabled === 'yes' ? '#22c55e' : '#ef4444', fontSize: '0.8rem' }}>
                          {job.enabled === 'yes' ? '● on' : '○ off'}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, color: 'var(--color-text-secondary)' }}>{relTime(job.last_run)}</td>
                      <td style={{ ...tdStyle, color: 'var(--color-text-secondary)' }}>{localTime(job.next_fire)}</td>
                      <td style={tdStyle}>
                        {jobStats ? <span style={{ color: rateColor(jobStats.success_rate) }}>{jobStats.success_rate}%</span> : '-'}
                      </td>
                      <td style={tdStyle} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: '0.25rem' }}>
                          <button title="Run now" disabled={runJob.isPending}
                            onClick={() => runJob.mutate(job.name)} style={btnStyle}>▶</button>
                          <button title={job.enabled === 'yes' ? 'Disable' : 'Enable'}
                            onClick={() => toggleJob.mutate({ target: job.name, enabled: job.enabled !== 'yes' })}
                            style={btnStyle}>{job.enabled === 'yes' ? '⏸' : '⏵'}</button>
                          <button title="Delete"
                            onClick={() => { if (confirm(`Delete job "${job.name}"?`)) deleteJob.mutate(job.name); }}
                            style={{ ...btnStyle, borderColor: '#ef4444', color: '#ef4444' }}>✕</button>
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
        <div className="workspace-dashboard__card" style={{ overflow: 'visible' }}>
          <div className="workspace-dashboard__card-header">
            <h3 className="workspace-dashboard__card-title">{expanded} — Run History</h3>
          </div>
          <JobDetail name={expanded} />
        </div>
      )}
    </div>
  );
}
