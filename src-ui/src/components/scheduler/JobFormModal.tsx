import type { SchedulerJob } from '@stallion-ai/shared';
import { useEffect, useState } from 'react';
import type { SchedulerProviderInfo } from '../../hooks/useScheduler';
import { useAddJob, useEditJob } from '../../hooks/useScheduler';
import { Toggle } from '../Toggle';
import { AgentPicker } from './AgentPicker';
import { CronEditor, CronPreview } from './CronEditor';

export function JobFormModal({
  job,
  prefill,
  onClose,
  providers = [],
}: {
  job?: SchedulerJob;
  prefill?: Partial<{
    name: string;
    cron: string;
    prompt: string;
    agent: string;
  }>;
  onClose: () => void;
  providers?: SchedulerProviderInfo[];
}) {
  const isEdit = !!job;
  const addJob = useAddJob();
  const editJob = useEditJob();
  const [selectedProvider, setSelectedProvider] = useState(
    job?.provider || providers[0]?.id || 'built-in',
  );
  const activeProvider = providers.find((p) => p.id === selectedProvider);
  const extraFields: SchedulerProviderInfo['formFields'] =
    activeProvider?.formFields || [];
  const init = prefill || {};

  const [form, setForm] = useState<Record<string, any>>({
    name: job?.name || init.name || '',
    cron:
      (job as Record<string, unknown>)?.schedule
        ?.toString()
        .replace(/^cron\s+/, '') ||
      init.cron ||
      '* * * * *',
    prompt: job?.prompt || init.prompt || '',
    agent: job?.agent || init.agent || 'default',
    retryCount: job?.retryCount ?? 0,
    retryDelaySecs: job?.retryDelaySecs ?? 60,
    ...Object.fromEntries(extraFields.map((f) => [f.key, job?.[f.key] || ''])),
  });
  const [cronInput, setCronInput] = useState(form.cron);

  useEffect(() => {
    const t = setTimeout(() => setCronInput(form.cron), 400);
    return () => clearTimeout(t);
  }, [form.cron]);

  const set =
    (field: string) =>
    (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >,
    ) =>
      setForm((f) => ({
        ...f,
        [field]: e.target.value,
      }));

  const handleSubmit = () => {
    if (isEdit) {
      const opts: Record<string, string | number> = {};
      if (
        form.cron &&
        form.cron !==
          (job as Record<string, unknown>)?.schedule
            ?.toString()
            .replace(/^cron\s+/, '')
      )
        opts.cron = form.cron;
      if (form.prompt !== (job.prompt || '')) opts.prompt = form.prompt;
      if (form.agent !== (job.agent || '')) opts.agent = form.agent;
      if (form.retryCount !== (job.retryCount ?? 0))
        opts.retryCount = form.retryCount;
      if (form.retryDelaySecs !== (job.retryDelaySecs ?? 60))
        opts.retryDelaySecs = form.retryDelaySecs;
      for (const f of extraFields) {
        if (form[f.key] !== (job[f.key] || '')) opts[f.key] = form[f.key];
      }
      editJob.mutate({ target: job.name, ...opts }, { onSuccess: onClose });
    } else {
      if (!form.name.trim()) return;
      addJob.mutate(
        {
          name: form.name,
          provider: selectedProvider,
          cron: form.cron || undefined,
          prompt: form.prompt || undefined,
          agent: form.agent || undefined,
          retryCount: form.retryCount || undefined,
          retryDelaySecs: form.retryCount ? form.retryDelaySecs : undefined,
          ...Object.fromEntries(
            extraFields
              .map((f) => [f.key, form[f.key] || undefined])
              .filter(([, v]) => v),
          ),
        },
        { onSuccess: onClose },
      );
    }
  };

  const pending = addJob.isPending || editJob.isPending;

  return (
    <div className="schedule__modal-overlay" onClick={onClose}>
      <div className="schedule__modal" onClick={(e) => e.stopPropagation()}>
        <div className="schedule__modal-header">
          <h3>{isEdit ? `Edit: ${job.name}` : 'Add Job'}</h3>
          <button className="schedule__modal-close" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="schedule__modal-body">
          {!isEdit && providers.length > 1 && (
            <label className="schedule__field">
              <span className="schedule__field-label">Run with</span>
              <select
                value={selectedProvider}
                onChange={(e) => setSelectedProvider(e.target.value)}
              >
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.displayName}
                  </option>
                ))}
              </select>
            </label>
          )}
          {!isEdit && (
            <label className="schedule__field">
              <span className="schedule__field-label">Name</span>
              <input
                value={form.name}
                onChange={set('name')}
                placeholder="my-daily-briefing"
              />
              {form.name && !/^[a-z0-9-]+$/.test(form.name) && (
                <span className="schedule__field-error">
                  Lowercase letters, numbers, and hyphens only
                </span>
              )}
            </label>
          )}
          <label className="schedule__field">
            <span className="schedule__field-label">Agent</span>
            <AgentPicker
              value={form.agent}
              onChange={(v) => setForm((f) => ({ ...f, agent: v }))}
            />
          </label>
          <label className="schedule__field">
            <span className="schedule__field-label">Prompt</span>
            <textarea
              value={form.prompt}
              onChange={set('prompt')}
              rows={3}
              placeholder="What should the agent do?"
            />
          </label>
          <div className="schedule__form-divider" />
          <label className="schedule__field">
            <span className="schedule__field-label">Schedule</span>
            <CronEditor
              value={form.cron}
              onChange={(v) => setForm((f) => ({ ...f, cron: v }))}
            />
            <CronPreview cron={cronInput} />
          </label>
          <label className="schedule__field">
            <span className="schedule__field-label">Retries</span>
            <input
              type="number"
              min={0}
              max={10}
              value={form.retryCount}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  retryCount: Number(e.target.value) || 0,
                }))
              }
            />
          </label>
          {form.retryCount > 0 && (
            <label className="schedule__field">
              <span className="schedule__field-label">Retry delay (s)</span>
              <input
                type="number"
                min={0}
                max={3600}
                value={form.retryDelaySecs}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    retryDelaySecs: Number(e.target.value) || 0,
                  }))
                }
              />
            </label>
          )}
          {extraFields.length > 0 && <div className="schedule__form-divider" />}
          {extraFields.map((f) => (
            <label key={f.key} className="schedule__field">
              <span className="schedule__field-label">
                {f.label}{' '}
                {f.hint && (
                  <span className="schedule__field-hint">({f.hint})</span>
                )}
              </span>
              {f.type === 'boolean' ? (
                <Toggle
                  checked={!!form[f.key]}
                  onChange={(v) =>
                    setForm((prev) => ({
                      ...prev,
                      [f.key]: v,
                    }))
                  }
                  size="sm"
                />
              ) : f.type === 'textarea' ? (
                <textarea
                  value={form[f.key] || ''}
                  onChange={set(f.key)}
                  rows={3}
                  placeholder={f.placeholder}
                />
              ) : (
                <input
                  value={form[f.key] || ''}
                  onChange={set(f.key)}
                  placeholder={f.placeholder}
                />
              )}
            </label>
          ))}
        </div>
        <div className="schedule__modal-footer">
          <button className="schedule__modal-cancel" onClick={onClose}>
            Cancel
          </button>
          <button
            className="schedule__modal-submit"
            onClick={handleSubmit}
            disabled={pending || (!isEdit && !form.name.trim())}
          >
            {pending ? 'Saving...' : isEdit ? 'Save Changes' : 'Add Job'}
          </button>
        </div>
      </div>
    </div>
  );
}
