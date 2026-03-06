import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigation } from '../contexts/NavigationContext';
import {
  useAddJob,
  useDeleteJob,
  useEditJob,
  useFetchRunOutput,
  useJobLogs,
  useOpenArtifact,
  usePreviewSchedule,
  useRunJob,
  useSchedulerEvents,
  useSchedulerJobs,
  useSchedulerProviders,
  useSchedulerStats,
  useSchedulerStatus,
  useToggleJob,
} from '../hooks/useScheduler';
import { useAgents, type AgentData } from '../contexts/AgentsContext';
import { AgentIcon } from '../components/AgentIcon';
import { SortHeader, TableFilter, useSortableTable } from './SortableTable';
import './ScheduleView.css';
import './page-layout.css';

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

function localizeSchedule(human: string | undefined, schedule: string, nextFire?: string): string {
  if (!human) return schedule;
  const ref = nextFire ? new Date(nextFire) : new Date();
  const m = schedule.match(/^cron\s+(\d+)\s+(\d+)\s/);
  if (m) {
    const d = new Date(ref);
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
      const d = new Date(ref);
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
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <circle cx="8" cy="8" r="5.5" />
    <path d="M6 10l4-4M6 6l4 4" />
  </svg>
);
const IconResume = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <circle cx="8" cy="8" r="5.5" />
    <path d="M8 4.5v3.5" />
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
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11.5 2.5l2 2-8 8H3.5v-2z" />
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
function JobDetail({ name, autoOpenRun }: { name: string; autoOpenRun?: string | null }) {
  const { data: logs = [] } = useJobLogs(name);
  const fetchOutput = useFetchRunOutput();
  const openArtifact = useOpenArtifact();
  const [viewIdx, setViewIdx] = useState<number | null>(null);
  const [outputContent, setOutputContent] = useState<string | null>(null);
  const autoOpened = useRef(false);

  const reversedLogs = useMemo(() => [...logs].reverse(), [logs]);

  const handleViewOutput = async (i: number) => {
    setViewIdx(i);
    setOutputContent(null);
    try {
      const data = await fetchOutput.mutateAsync(reversedLogs[i].output);
      setOutputContent(data.content);
    } catch {
      setOutputContent('Failed to load output');
    }
  };

  // Auto-open a specific run's output when deep-linked
  useEffect(() => {
    if (autoOpened.current || !autoOpenRun || !reversedLogs.length) return;
    const idx = reversedLogs.findIndex((r: any) => r.id === autoOpenRun);
    if (idx >= 0) {
      autoOpened.current = true;
      handleViewOutput(idx);
    }
  }, [autoOpenRun, reversedLogs]);

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

  if (!reversedLogs.length)
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
            <th>Started At</th>
            <th>Status</th>
            <th>Duration</th>
            <th>Missed</th>
            <th>Type</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {reversedLogs.map((r: any, i: number) => (
            <tr key={r.startedAt}>
              <td>
                {new Date(r.startedAt).toLocaleString(undefined, {
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
              <td>{r.durationSecs != null ? `${r.durationSecs.toFixed(1)}s` : '-'}</td>
              <td>{r.missedCount || '-'}</td>
              <td>{r.manual ? 'manual' : 'cron'}</td>
              <td>
                <button
                  onClick={() => handleViewOutput(i)}
                  disabled={fetchOutput.isPending && viewIdx === i}
                  className="schedule__action-btn"
                >
                  Output
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {viewIdx !== null && (
        <div className="schedule__output-overlay" onClick={() => setViewIdx(null)}>
          <div className="schedule__output-modal" onClick={e => e.stopPropagation()}>
            <div className="schedule__modal-header">
              <h3>{name} — Run Output</h3>
              <button className="schedule__modal-close" onClick={() => setViewIdx(null)}>
                <IconX />
              </button>
            </div>
            <pre className="schedule__output-modal-body">
              {outputContent === null ? 'Loading...' : outputContent}
            </pre>
            <div className="schedule__modal-footer">
              <button
                className="schedule__modal-cancel"
                onClick={() => openArtifact.mutate(reversedLogs[viewIdx].output)}
              >
                Open File
              </button>
              <button
                className="schedule__modal-submit"
                onClick={handleDownload}
                disabled={!outputContent}
              >
                Download
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Cron Editor (crontab.guru-style) ── */
const CRON_FIELDS = [
  { label: 'minute', range: '0-59', allowed: [0, 59] },
  { label: 'hour', range: '0-23', allowed: [0, 23] },
  { label: 'day', range: '1-31', allowed: [1, 31] },
  { label: 'month', range: '1-12', allowed: [1, 12] },
  { label: 'weekday', range: '0-6', allowed: [0, 6] },
];

const CRON_SYNTAX = [
  { sym: '*', desc: 'any value' },
  { sym: ',', desc: 'value list separator' },
  { sym: '-', desc: 'range of values' },
  { sym: '/', desc: 'step values' },
];

function validateCronField(value: string, min: number, max: number): string | null {
  if (!value || value.trim() === '') return 'required';
  if (value === '*') return null;
  for (const part of value.split(',')) {
    const [range, step] = part.split('/');
    if (step && (isNaN(+step) || +step < 1)) return `invalid step "${step}"`;
    if (range === '*') continue;
    if (range.includes('-')) {
      const [a, b] = range.split('-').map(Number);
      if (isNaN(a) || isNaN(b)) return `"${range}" is not a valid range`;
      if (a < min || b > max) return `range must be ${min}-${max}`;
      if (a > b) return `${a} > ${b} in range`;
    } else {
      const n = Number(range);
      if (isNaN(n)) return `"${range}" is not a number`;
      if (n < min || n > max) return `must be ${min}-${max}`;
    }
  }
  return null;
}

function CronEditor({ value, onChange }: { value: string; onChange: (cron: string) => void }) {
  const parts = (value || '* * * * *').split(/\s+/);
  while (parts.length < 5) parts.push('*');
  const [active, setActive] = useState<number | null>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const setPart = (idx: number, val: string) => {
    const next = [...parts];
    next[idx] = val;
    onChange(next.join(' '));
  };

  const errors = parts.map((p, i) => validateCronField(p, CRON_FIELDS[i].allowed[0], CRON_FIELDS[i].allowed[1]));
  const hasError = errors.some(e => e !== null);
  const activeErr = active !== null ? errors[active] : null;

  return (
    <div className="cron-editor">
      <div className={`cron-editor__fields ${hasError ? 'cron-editor__fields--error' : ''}`}>
        {parts.map((p, i) => (
          <input
            key={i}
            ref={el => { inputRefs.current[i] = el; }}
            className={`cron-editor__input ${errors[i] ? 'cron-editor__input--error' : ''}`}
            value={p}
            onChange={e => setPart(i, e.target.value)}
            onFocus={() => setActive(i)}
            onBlur={() => setActive(null)}
          />
        ))}
      </div>
      <div className="cron-editor__labels">
        {CRON_FIELDS.map((f, i) => (
          <span
            key={f.label}
            className={`cron-editor__label ${!errors[i] && parts[i] !== '*' ? 'cron-editor__label--active' : ''} ${active === i ? 'cron-editor__label--focused' : ''} ${errors[i] ? 'cron-editor__label--error' : ''}`}
            onClick={() => inputRefs.current[i]?.focus()}
          >
            {f.label}
          </span>
        ))}
      </div>
      {active !== null ? (
        <div className="cron-editor__help">
          <table className="cron-editor__syntax">
            <tbody>
              {CRON_SYNTAX.map(s => (
                <tr key={s.sym}>
                  <td className="cron-editor__sym">{s.sym}</td>
                  <td>{s.desc}</td>
                </tr>
              ))}
              <tr className={activeErr ? 'cron-editor__syntax--error' : ''}>
                <td className="cron-editor__sym">{CRON_FIELDS[active].range}</td>
                <td>{activeErr || 'allowed values'}</td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        <div className="cron-editor__help">
          <table className="cron-editor__syntax">
            <tbody>
              {CRON_SYNTAX.map(s => (
                <tr key={s.sym}>
                  <td className="cron-editor__sym">{s.sym}</td>
                  <td>{s.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ── Cron → Human Description ── */
function cronToHuman(cron: string, referenceDate?: Date): string | null {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  const [min, hour, dom, mon, dow] = parts;

  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const MONTHS = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  // Format time in local timezone, using referenceDate to get correct DST offset
  const fmtTime = (h: string, m: string) => {
    const d = referenceDate ? new Date(referenceDate) : new Date();
    d.setUTCHours(parseInt(h, 10), parseInt(m, 10), 0, 0);
    const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    const tz = d.toLocaleTimeString(undefined, { timeZoneName: 'short' }).split(' ').pop();
    return `${time} ${tz}`;
  };

  const fmtDow = (d: string) => {
    if (d === '*') return '';
    if (d === '1-5') return 'Monday through Friday';
    if (d === '0,6') return 'weekends';
    return d.split(',').map(v => {
      if (v.includes('-')) {
        const [a, b] = v.split('-').map(Number);
        return `${DAYS[a]} through ${DAYS[b]}`;
      }
      return DAYS[parseInt(v, 10)] || v;
    }).join(', ');
  };

  const fmtDom = (d: string) => {
    if (d === '*') return '';
    return `on day ${d} of the month`;
  };

  const fmtMon = (m: string) => {
    if (m === '*') return '';
    return `in ${m.split(',').map(v => MONTHS[parseInt(v, 10)] || v).join(', ')}`;
  };

  try {
    const time = (hour !== '*' && min !== '*') ? fmtTime(hour, min) : hour === '*' ? `every minute` : `at minute ${min} of every hour`;
    const dowStr = fmtDow(dow);
    const domStr = fmtDom(dom);
    const monStr = fmtMon(mon);

    if (hour !== '*' && min !== '*' && dom === '*' && mon === '*' && dow === '*') return `Daily at ${time}`;
    if (hour !== '*' && min !== '*' && dom === '*' && mon === '*' && dow === '1-5') return `Weekdays at ${time}`;
    if (hour !== '*' && min !== '*' && dom === '*' && mon === '*' && dowStr) return `At ${time} on ${dowStr}`;
    if (hour !== '*' && min !== '*' && domStr && mon === '*' && dow === '*') return `At ${time} ${domStr}`;

    const pieces = [time, domStr, monStr, dowStr ? `on ${dowStr}` : ''].filter(Boolean);
    return pieces.join(' ') || null;
  } catch { return null; }
}

/* ── Cron Preview ── */
function CronPreview({ cron }: { cron: string }) {
  const { data, isLoading } = usePreviewSchedule(cron || null);
  if (!cron) return null;

  const valid = data && Array.isArray(data) && data.length > 0;
  const human = cronToHuman(cron, valid ? new Date(data[0]) : undefined);

  if (isLoading) return (
    <div className="schedule__cron-preview">
      <div className="schedule__cron-human schedule__cron-human--muted">{human || '--'}</div>
      <span className="schedule__cron-label">Next fires:</span>
      <span className="schedule__cron-time">...</span>
    </div>
  );

  return (
    <div className="schedule__cron-preview">
      <div className={`schedule__cron-human ${valid ? '' : 'schedule__cron-human--muted'}`}>{human || '--'}</div>
      <span className="schedule__cron-label">Next fires:</span>
      {valid
        ? data.slice(0, 3).map((d: any, i: number) => (
            <span key={i} className="schedule__cron-time">{new Date(d).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })}</span>
          ))
        : <span className="schedule__cron-time">--</span>
      }
    </div>
  );
}

/* ── Agent Picker ── */
function AgentPicker({ value, onChange }: { value: string; onChange: (slug: string) => void }) {
  const agents = useAgents();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const triggerRef = useRef<HTMLDivElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const selected = agents.find((a) => a.slug === value);

  const filtered = useMemo(() => {
    if (!filter) return agents;
    const q = filter.toLowerCase();
    return agents.filter((a) => a.name.toLowerCase().includes(q) || a.slug.toLowerCase().includes(q));
  }, [agents, filter]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (triggerRef.current?.contains(e.target as Node) || dropRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  useEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setPos({ top: rect.bottom + 2, left: rect.left, width: rect.width });
  }, [open]);

  const toolCount = (a: AgentData) => {
    const tc = a.toolsConfig;
    if (!tc) return 0;
    return (tc.available?.length || 0) + (tc.mcpServers?.length || 0);
  };

  const select = (slug: string) => { onChange(slug); setOpen(false); setFilter(''); };

  if (!agents.length) {
    return <input value={value} onChange={(e) => onChange(e.target.value)} placeholder="agent slug" />;
  }

  return (
    <>
      <div
        ref={triggerRef}
        onClick={() => setOpen(!open)}
        style={{ padding: '0.5rem', border: '1px solid var(--border-primary)', borderRadius: '0.375rem', background: 'var(--bg-input)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-primary)', minHeight: '2.25rem' }}
      >
        {selected && <AgentIcon agent={selected} size="small" />}
        <span style={{ flex: 1 }}>{selected ? selected.name : value || 'Select agent…'}</span>
        {selected && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{selected.model || 'default model'}</span>}
        <span style={{ fontSize: '0.7rem', opacity: 0.5 }}>▼</span>
      </div>
      {open && pos && createPortal(
        <div
          ref={dropRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 10000, background: 'var(--bg-elevated)', border: '1px solid var(--border-primary)', borderRadius: '0.375rem', maxHeight: 280, overflow: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}
        >
          {agents.length > 1 && (
            <div style={{ padding: '0.375rem', borderBottom: '1px solid var(--border-primary)' }}>
              <input
                autoFocus
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter agents…"
                onClick={(e) => e.stopPropagation()}
                style={{ width: '100%', padding: '0.375rem 0.5rem', border: '1px solid var(--border-primary)', borderRadius: '0.25rem', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '0.8rem', boxSizing: 'border-box' }}
              />
            </div>
          )}
          {filtered.map((a) => (
            <div
              key={a.slug}
              onClick={() => select(a.slug)}
              style={{ padding: '0.5rem 0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, background: a.slug === value ? 'var(--bg-highlight)' : undefined }}
              onMouseEnter={(e) => { if (a.slug !== value) (e.currentTarget.style.background = 'var(--bg-hover)'); }}
              onMouseLeave={(e) => { if (a.slug !== value) (e.currentTarget.style.background = ''); }}
            >
              <AgentIcon agent={a} size={28} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-primary)' }}>
                  {a.name}
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginLeft: 6, fontWeight: 400 }}>{a.slug}</span>
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 1 }}>
                  {a.model || 'default model'}{toolCount(a) > 0 ? ` · ${toolCount(a)} tools` : ''}
                </div>
              </div>
              {a.slug === value && <span style={{ color: 'var(--accent-primary)', fontSize: '0.8rem' }}>✓</span>}
            </div>
          ))}
          {filtered.length === 0 && (
            <div style={{ padding: '0.75rem', color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'center' }}>No matching agents</div>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}

/* ── Job Form Modal (Add / Edit) ── */
function JobFormModal({ job, prefill, onClose, providers = [] }: { job?: any; prefill?: any; onClose: () => void; providers?: any[] }) {
  const isEdit = !!job;
  const addJob = useAddJob();
  const editJob = useEditJob();
  const [selectedProvider, setSelectedProvider] = useState(job?.provider || providers[0]?.id || 'built-in');
  const activeProvider = providers.find((p: any) => p.id === selectedProvider);
  const extraFields: any[] = activeProvider?.formFields || [];
  const init = prefill || {};

  const [form, setForm] = useState({
    name: job?.name || init.name || '',
    cron: job?.schedule?.replace(/^cron\s+/, '') || init.cron || '',
    prompt: job?.prompt || init.prompt || '',
    agent: job?.agent || init.agent || 'default',
    ...Object.fromEntries(extraFields.map((f: any) => [f.key, job?.[f.key] || ''])),
  });
  const [cronInput, setCronInput] = useState(form.cron);

  useEffect(() => {
    const t = setTimeout(() => setCronInput(form.cron), 400);
    return () => clearTimeout(t);
  }, [form.cron]);

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [field]: e.target.value }));

  const setBool = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [field]: e.target.checked }));

  const handleSubmit = () => {
    if (isEdit) {
      const opts: Record<string, string> = {};
      if (form.cron && form.cron !== job.schedule?.replace(/^cron\s+/, '')) opts.cron = form.cron;
      if (form.prompt !== (job.prompt || '')) opts.prompt = form.prompt;
      if (form.agent !== (job.agent || '')) opts.agent = form.agent;
      for (const f of extraFields) {
        if (form[f.key] !== (job[f.key] || '')) opts[f.key] = form[f.key];
      }
      editJob.mutate({ target: job.name, ...opts }, { onSuccess: onClose });
    } else {
      if (!form.name.trim()) return;
      addJob.mutate({
        name: form.name,
        provider: selectedProvider,
        cron: form.cron || undefined,
        prompt: form.prompt || undefined,
        agent: form.agent || undefined,
        ...Object.fromEntries(extraFields.map((f: any) => [f.key, form[f.key] || undefined]).filter(([, v]: any) => v)),
      }, { onSuccess: onClose });
    }
  };

  const pending = addJob.isPending || editJob.isPending;

  return (
    <div className="schedule__modal-overlay" onClick={onClose}>
      <div className="schedule__modal" onClick={e => e.stopPropagation()}>
        <div className="schedule__modal-header">
          <h3>{isEdit ? `Edit: ${job.name}` : 'Add Job'}</h3>
          <button className="schedule__modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="schedule__modal-body">
          {!isEdit && providers.length > 1 && (
            <label className="schedule__field">
              <span className="schedule__field-label">Run with</span>
              <select value={selectedProvider} onChange={(e) => setSelectedProvider(e.target.value)}>
                {providers.map((p: any) => (
                  <option key={p.id} value={p.id}>{p.displayName}</option>
                ))}
              </select>
            </label>
          )}
          {!isEdit && (
            <label className="schedule__field">
              <span className="schedule__field-label">Name</span>
              <input value={form.name} onChange={set('name')} placeholder="my-daily-briefing" />
            </label>
          )}
          <label className="schedule__field">
            <span className="schedule__field-label">Agent</span>
            <AgentPicker value={form.agent} onChange={(v) => setForm(f => ({ ...f, agent: v }))} />
          </label>
          <label className="schedule__field">
            <span className="schedule__field-label">Prompt</span>
            <textarea value={form.prompt} onChange={set('prompt')} rows={3} placeholder="What should the agent do?" />
          </label>
          <div className="schedule__form-divider" />
          <label className="schedule__field">
            <span className="schedule__field-label">Schedule</span>
            <CronEditor value={form.cron} onChange={(v) => setForm(f => ({ ...f, cron: v }))} />
            <CronPreview cron={cronInput} />
          </label>
          {extraFields.length > 0 && <div className="schedule__form-divider" />}
          {extraFields.map((f: any) => (
            <label key={f.key} className="schedule__field">
              <span className="schedule__field-label">{f.label} {f.hint && <span className="schedule__field-hint">({f.hint})</span>}</span>
              {f.type === 'boolean' ? (
                <input type="checkbox" checked={!!form[f.key]} onChange={setBool(f.key)} />
              ) : f.type === 'textarea' ? (
                <textarea value={form[f.key] || ''} onChange={set(f.key)} rows={3} placeholder={f.placeholder} />
              ) : (
                <input value={form[f.key] || ''} onChange={set(f.key)} placeholder={f.placeholder} />
              )}
            </label>
          ))}
        </div>
        <div className="schedule__modal-footer">
          <button className="schedule__modal-cancel" onClick={onClose}>Cancel</button>
          <button className="schedule__modal-submit" onClick={handleSubmit} disabled={pending || (!isEdit && !form.name.trim())}>
            {pending ? 'Saving...' : isEdit ? 'Save Changes' : 'Add Job'}
          </button>
        </div>
      </div>
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
  const { data: providers = [] } = useSchedulerProviders();
  const schedulerAvailable = !jobsError && !statusError;
  const { isRunning } = useSchedulerEvents(schedulerAvailable);
  const runJob = useRunJob();
  const toggleJob = useToggleJob();
  const deleteJob = useDeleteJob();
  const openArtifact = useOpenArtifact();
  const addJob = useAddJob();
  const { updateParams } = useNavigation();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editingJob, setEditingJob] = useState<any | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [prefill, setPrefill] = useState<any>(null);
  const deepLinked = useRef(false);
  const [autoOpenRun, setAutoOpenRun] = useState<string | null>(null);

  // Deep link: ?job=X&run=Y auto-expands that job and opens run output
  useEffect(() => {
    if (deepLinked.current || isLoading || !jobs.length) return;
    const params = new URLSearchParams(window.location.search);
    const jobParam = params.get('job');
    const runParam = params.get('run');
    if (jobParam && jobs.some((j: any) => j.name === jobParam)) {
      setExpanded(jobParam);
      if (runParam) setAutoOpenRun(runParam);
      deepLinked.current = true;
      updateParams({ job: null, run: null });
    }
  }, [jobs, isLoading, updateParams]);

  const statsMap = new Map<string, any>();
  if (stats?.providers) {
    for (const provStats of Object.values(stats.providers) as any[]) {
      for (const s of provStats.jobs || []) statsMap.set(s.name, s);
    }
  }

  const enrichedJobs = jobs.map((job: any) => {
    const js = statsMap.get(job.name);
    return { ...job, successRate: js ? (js.total > 0 ? js.success_rate : -1) : -1 };
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
      runJob.mutate(name);
    },
    [runJob],
  );

  // Scheduler unavailable
  if (jobsError && statusError) {
    return (
      <div className="schedule__setup">
        <div className="schedule__setup-header">
          <div className="schedule__setup-icon">⏰</div>
          <h2 className="schedule__setup-title">Scheduler Unavailable</h2>
          <p className="schedule__setup-desc">
            Could not connect to the scheduler service. Check that the server is running.
          </p>
        </div>
      </div>
    );
  }

  const daemonOk = !statusError && Object.values(status?.providers || {}).some((p: any) => p.running);
  const totalRuns = stats?.summary?.totalRuns ?? 0;
  const successRate = stats?.summary?.successRate ?? -1;

  return (
    <div className="schedule page">
      <div className="page__header">
        <div className="page__header-text">
          <div className="page__label">sys / schedule</div>
          <h1 className="page__title">Schedule</h1>
          <p className="page__subtitle">Manage scheduled jobs and automation</p>
        </div>
        <div className="page__actions">
          <button className="page__btn-primary" onClick={() => setShowAddForm(true)}>+ Add Job</button>
        </div>
      </div>

      {isLoading && loadingStats && loadingStatus ? (
        <div className="schedule__loading">Loading scheduler...</div>
      ) : (
        <>
          {/* Stats */}
          <div className="schedule__stats">
            <div
              className={`stat-card ${statusError ? 'stat-card--warning' : daemonOk ? 'stat-card--success' : 'stat-card--error'}`}
            >
              <div className="stat-card__label">Scheduler</div>
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
                {successRate >= 0 ? `${successRate}%` : '-'}
              </div>
            </div>
            <div className="stat-card stat-card--accent">
              <div className="stat-card__label">Total Runs</div>
              <div className="stat-card__value">
                {totalRuns > 0 ? totalRuns : '-'}
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
                      ];})().map((t) => (
                        <button
                          key={t.name}
                          onClick={() => {
                            setPrefill({ name: t.name, cron: t.cron, prompt: t.prompt });
                            setShowAddForm(true);
                          }}
                          className="schedule__starter-btn"
                        >
                          <div className="schedule__starter-label">
                            {t.label}
                          </div>
                          <div className="schedule__starter-meta">
                            {t.meta}
                          </div>
                        </button>
                      ))}
                    </div>
                    <p className="schedule__starter-hint">
                      Templates pre-fill the form — you choose the agent and schedule.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="schedule__table">
                  <thead>
                    <tr>
                      <SortHeader
                        label="Name"
                        sortKey="name"
                        active={sortKey === 'name'}
                        dir={sortDir}
                        onClick={toggle}
                      />
                      <th className="schedule__th">Schedule</th>
                      <th className="schedule__th">Status</th>
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
                      <th className="schedule__th">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedJobs.map((job: any) => {
                      const jobStats = statsMap.get(job.name);
                      const isExpanded = expanded === job.name;
                      const running = isRunning(job.name);
                      return (
                        <Fragment key={job.id}>
                        <tr
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
                              <div>{job.cron || '-'}</div>
                              {job.cron && <div className="schedule__cron-human-inline">{cronToHuman(job.cron, job.nextRun ? new Date(job.nextRun) : undefined) || ''}</div>}
                            </td>
                            <td className="schedule__td" onClick={(e) => {
                              e.stopPropagation();
                              if (running) {
                                if (confirm(`Disabling '${job.name}' will cancel the running job. Continue?`))
                                  toggleJob.mutate({ target: job.name, enabled: false });
                              } else {
                                toggleJob.mutate({ target: job.name, enabled: !job.enabled });
                              }
                            }}>
                              <span className={`schedule__status schedule__status--clickable`}>
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
                                <button
                                  title={
                                    job.openArtifact
                                      ? 'Open artifact'
                                      : 'No artifact'
                                  }
                                  disabled={!job.openArtifact}
                                  onClick={() =>
                                    job.openArtifact &&
                                    openArtifact.mutate(job.openArtifact)
                                  }
                                  className="schedule__action-btn"
                                >
                                  <IconFile />
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
                                    <div className="schedule__detail-actions">
                                      {job.openArtifact && (
                                        <button
                                          onClick={() =>
                                            openArtifact.mutate(job.openArtifact)
                                          }
                                          className="page__btn-primary"
                                          style={{ fontSize: '0.75rem', padding: '0.35rem 0.75rem' }}
                                        >
                                          Open Latest Artifact
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                  {(job.description || job.prompt || job.command || job.agent) && (
                                    <div className="schedule__detail-meta">
                                      {job.description && <div className="schedule__detail-desc">{job.description}</div>}
                                      {job.agent && <div className="schedule__detail-field"><span className="schedule__detail-label">Agent</span><span className="schedule__detail-value">{job.agent}</span></div>}
                                      {job.prompt && <div className="schedule__detail-field"><span className="schedule__detail-label">Prompt</span><span className="schedule__detail-value">{job.prompt}</span></div>}
                                      {job.command && <div className="schedule__detail-field"><span className="schedule__detail-label">Command</span><code className="schedule__detail-code">{job.command}</code></div>}
                                    </div>
                                  )}
                                  <JobDetail name={job.name} autoOpenRun={expanded === job.name ? autoOpenRun : null} />
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
      {editingJob && <JobFormModal job={editingJob} onClose={() => setEditingJob(null)} providers={providers} />}
      {showAddForm && <JobFormModal prefill={prefill} onClose={() => { setShowAddForm(false); setPrefill(null); }} providers={providers} />}
    </div>
  );
}
