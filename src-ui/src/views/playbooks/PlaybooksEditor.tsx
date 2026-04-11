import type { Playbook } from '@stallion-ai/contracts/catalog';
import { useMemo } from 'react';
import { DetailHeader } from '../../components/DetailHeader';
import { Toggle } from '../../components/Toggle';
import { useAIEnrich } from '../../hooks/useAIEnrich';
import type { PlaybookForm } from './utils';
import { extractTemplateVariables } from './utils';

interface PlaybooksEditorProps {
  agents: { slug: string; name: string }[];
  categories: string[];
  dirty: boolean;
  form: PlaybookForm;
  isNew: boolean;
  selectedId: string | null;
  selectedPrompt?: Playbook;
  savePending: boolean;
  advancedOpen: boolean;
  touched: Record<string, boolean>;
  onAdvancedOpenChange: (open: boolean) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onExport: () => void;
  onFieldBlur: (field: keyof PlaybookForm) => void;
  onFieldChange: (field: keyof PlaybookForm, value: string) => void;
  onGlobalChange: (value: boolean) => void;
  onSave: () => void;
  onTest: () => void;
  onGenerateContent: (value: string) => void;
  onGenerateDescription: (value: string) => void;
}

export function PlaybooksEditor({
  agents,
  categories,
  dirty,
  form,
  isNew,
  selectedId,
  selectedPrompt,
  savePending,
  advancedOpen,
  touched,
  onAdvancedOpenChange,
  onDelete,
  onDuplicate,
  onExport,
  onFieldBlur,
  onFieldChange,
  onGlobalChange,
  onSave,
  onTest,
  onGenerateContent,
  onGenerateDescription,
}: PlaybooksEditorProps) {
  const { enrich, isEnriching } = useAIEnrich();
  const templateVars = useMemo(
    () => extractTemplateVariables(form.content),
    [form.content],
  );

  return (
    <div className="prompt-editor">
      <DetailHeader
        title={isNew ? 'New Playbook' : form.name || 'Edit Playbook'}
        badge={
          dirty ? { label: 'unsaved', variant: 'warning' as const } : undefined
        }
      >
        {!isNew && selectedId && (
          <button className="editor-btn editor-btn--danger" onClick={onDelete}>
            Delete
          </button>
        )}
        {!isNew && selectedId && (
          <button className="editor-btn" onClick={onDuplicate}>
            Duplicate
          </button>
        )}
        {!isNew && selectedId && (
          <button className="editor-btn" onClick={onExport}>
            Export .md
          </button>
        )}
        {!isNew && selectedId && (
          <button
            className="editor-btn"
            onClick={onTest}
            disabled={!form.content.trim()}
          >
            ▶ Test
          </button>
        )}
        {isNew && (
          <button className="editor-btn" disabled title="Save playbook first">
            ▶ Test
          </button>
        )}
        <button
          className="editor-btn editor-btn--primary"
          onClick={onSave}
          disabled={savePending || !form.name.trim() || !form.content.trim()}
        >
          {savePending ? 'Saving…' : isNew ? 'Create' : 'Save'}
        </button>
      </DetailHeader>

      <div className="editor__section">
        <div className="editor-field">
          <label className="editor-label">Name</label>
          <input
            type="text"
            className="editor-input"
            value={form.name}
            onChange={(e) => onFieldChange('name', e.target.value)}
            onBlur={() => onFieldBlur('name')}
            placeholder="Prompt name"
          />
          {touched.name && !form.name.trim() && (
            <div className="editor-error">Name is required</div>
          )}
        </div>

        <div className="editor-field">
          <div className="editor-label-row">
            <span className="editor-label">Content *</span>
            <button
              type="button"
              className="editor-enrich-btn"
              disabled={isEnriching || !form.name}
              onClick={async () => {
                const text = await enrich(
                  `Write a reusable prompt template named "${form.name}"${form.description ? ` for: ${form.description}` : ''}${form.category ? ` (category: ${form.category})` : ''}. Include {{variable}} placeholders where the user should fill in context. Output only the prompt text.`,
                );
                if (text) {
                  onGenerateContent(text);
                }
              }}
            >
              {isEnriching ? '...' : '✨ Generate'}
            </button>
          </div>
          <textarea
            className="editor-textarea editor-textarea--tall editor-textarea--mono"
            value={form.content}
            onChange={(e) => onFieldChange('content', e.target.value)}
            onBlur={() => onFieldBlur('content')}
            placeholder="Write your prompt here..."
            spellCheck={false}
          />
          {touched.content && !form.content.trim() && (
            <div className="editor-error">Content is required</div>
          )}
          {templateVars.length > 0 && (
            <div className="editor__tags">
              <span className="editor-label editor-label--inline">
                Variables:
              </span>
              {templateVars.map((variable) => (
                <span key={variable} className="editor__tag">
                  {`{{${variable}}}`}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="editor-field">
          <div className="editor-label-row">
            <span className="editor-label">Description</span>
            <button
              type="button"
              className="editor-enrich-btn"
              disabled={isEnriching || !form.name}
              onClick={async () => {
                const text = await enrich(
                  `Write a brief one-sentence description for a prompt named "${form.name}" with this content: ${form.content.slice(0, 200)}`,
                );
                if (text) {
                  onGenerateDescription(text);
                }
              }}
            >
              {isEnriching ? '...' : '✨ Generate'}
            </button>
          </div>
          <textarea
            className="editor-textarea"
            value={form.description}
            onChange={(e) => onFieldChange('description', e.target.value)}
            placeholder="Optional description"
          />
        </div>

        <div className="editor-field editor-field--row">
          <Toggle checked={form.global} onChange={onGlobalChange} size="sm" />
          <span className="editor-label">
            Available as slash command for all agents
          </span>
        </div>
      </div>

      <div className="editor__section">
        <details
          className="editor__expandable"
          open={advancedOpen}
          onToggle={(event) =>
            onAdvancedOpenChange((event.target as HTMLDetailsElement).open)
          }
        >
          <summary className="editor__expandable-header">
            <span className="editor__section-title">Advanced</span>
          </summary>
          <div className="editor__expandable-content">
            <div className="editor-field">
              <label className="editor-label">Category</label>
              <input
                type="text"
                className="editor-input"
                value={form.category}
                onChange={(e) => onFieldChange('category', e.target.value)}
                placeholder="e.g. coding, writing, analysis"
                list="prompt-categories"
              />
              <datalist id="prompt-categories">
                {categories.map((category) => (
                  <option key={category} value={category} />
                ))}
              </datalist>
            </div>

            <div className="editor-field">
              <label className="editor-label">Tags</label>
              <input
                type="text"
                className="editor-input"
                value={form.tags}
                onChange={(e) => onFieldChange('tags', e.target.value)}
                placeholder="comma-separated tags"
              />
            </div>
            {form.tags && (
              <div className="editor__tags">
                {form.tags
                  .split(',')
                  .map((tag) => tag.trim())
                  .filter(Boolean)
                  .map((tag) => (
                    <span key={tag} className="editor__tag">
                      {tag}
                    </span>
                  ))}
              </div>
            )}

            <div className="editor-field">
              <label className="editor-label">Agent</label>
              <select
                className="editor-select"
                value={form.agent}
                onChange={(e) => onFieldChange('agent', e.target.value)}
              >
                <option value="">— none —</option>
                {agents.map((agent) => (
                  <option key={agent.slug} value={agent.slug}>
                    {agent.name || agent.slug}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </details>
      </div>

      <div className="editor__footer">
        {selectedPrompt && (
          <div className="prompt-editor__timestamps">
            <span>
              created {new Date(selectedPrompt.createdAt).toLocaleDateString()}
            </span>
            <span>·</span>
            <span>
              updated {new Date(selectedPrompt.updatedAt).toLocaleDateString()}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
