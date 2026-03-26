import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFetchRunOutput, useJobLogs, useOpenArtifact } from '../../hooks/useScheduler';

const IconX = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M4 4l8 8M12 4l-8 8" />
  </svg>
);

export function relTime(iso: string | null) {
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

export function localTime(iso: string | null) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function rateColor(rate: number) {
  if (rate >= 90) return 'high';
  if (rate >= 50) return 'mid';
  return 'low';
}


export function RateCell({ rate }: { rate: number | undefined }) {
  if (rate == null || rate < 0) return <span className="schedule__td--muted">-</span>;
  const tier = rateColor(rate);
  return (
    <span className="schedule__rate">
      <span className={`schedule__rate-value schedule__rate-value--${tier}`}>{rate}%</span>
      <span className="schedule__rate-bar">
        <span className={`schedule__rate-fill schedule__rate-fill--${tier}`} style={{ width: `${rate}%` }} />
      </span>
    </span>
  );
}

export function JobDetail({ name, autoOpenRun }: { name: string; autoOpenRun?: string | null }) {
  const { data: logs = [] } = useJobLogs(name);
  const fetchOutput = useFetchRunOutput();
  const openArtifact = useOpenArtifact();
  const [viewIdx, setViewIdx] = useState<number | null>(null);
  const [outputContent, setOutputContent] = useState<string | null>(null);
  const autoOpened = useRef(false);

  const reversedLogs = useMemo(() => [...logs].reverse(), [logs]);

  const handleViewOutput = useCallback(async (i: number) => {
    setViewIdx(i);
    setOutputContent(null);
    try {
      const data = await fetchOutput.mutateAsync(reversedLogs[i].output);
      setOutputContent(data.content);
    } catch {
      setOutputContent('Failed to load output');
    }
  }, [fetchOutput, reversedLogs]);

  useEffect(() => {
    if (autoOpened.current || !autoOpenRun || !reversedLogs.length) return;
    const idx = reversedLogs.findIndex((r) => r.id === autoOpenRun);
    if (idx >= 0) { autoOpened.current = true; handleViewOutput(idx); }
  }, [autoOpenRun, reversedLogs, handleViewOutput]);

  const handleDownload = () => {
    if (!outputContent || viewIdx === null) return;
    const blob = new Blob([outputContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (reversedLogs[viewIdx].output || 'output.txt').split('/').pop() || 'output.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!reversedLogs.length) return <div className="schedule__detail-empty">No run history</div>;

  return (
    <div className="schedule__detail-logs-wrap">
      <table className="schedule__logs">
        <thead>
          <tr><th>Started At</th><th>Status</th><th>Duration</th><th>Missed</th><th>Type</th><th></th></tr>
        </thead>
        <tbody>
          {reversedLogs.map((r, i: number) => (
            <tr key={r.startedAt}>
              <td>{new Date(r.startedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
              <td className={`schedule__log-status ${r.success ? 'schedule__log-status--ok' : 'schedule__log-status--fail'}`}>{r.success ? '✓' : '✗'}</td>
              <td>{r.durationSecs != null ? `${r.durationSecs.toFixed(1)}s` : '-'}</td>
              <td>{r.missedCount || '-'}</td>
              <td>{r.manual ? 'manual' : 'cron'}</td>
              <td><button onClick={() => handleViewOutput(i)} disabled={fetchOutput.isPending && viewIdx === i} className="schedule__action-btn">Output</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      {viewIdx !== null && (
        <div className="schedule__output-overlay" onClick={() => setViewIdx(null)}>
          <div className="schedule__output-modal" onClick={(e) => e.stopPropagation()}>
            <div className="schedule__modal-header">
              <h3>{name} — Run Output</h3>
              <button className="schedule__modal-close" onClick={() => setViewIdx(null)}><IconX /></button>
            </div>
            <pre className="schedule__output-modal-body">{outputContent === null ? 'Loading...' : outputContent}</pre>
            <div className="schedule__modal-footer">
              <button className="schedule__modal-cancel" onClick={() => openArtifact.mutate(reversedLogs[viewIdx].output)}>Open File</button>
              <button className="schedule__modal-submit" onClick={handleDownload} disabled={!outputContent}>Download</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
