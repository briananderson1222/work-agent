interface ProjectKnowledgeRulesEditorProps {
  rulesLoaded: boolean;
  rulesLoading: boolean;
  rulesContent: string;
  savingRules: boolean;
  onRulesChange: (value: string) => void;
  onSaveRules: () => void;
}

export function ProjectKnowledgeRulesEditor({
  rulesLoaded,
  rulesLoading,
  rulesContent,
  savingRules,
  onRulesChange,
  onSaveRules,
}: ProjectKnowledgeRulesEditorProps) {
  return (
    <div className="project-page__rules-editor">
      <div className="project-page__rules-hint">
        ⚡ Injected into every chat message&apos;s system prompt. Saved as{' '}
        <code>project-rules.md</code>.
      </div>
      {!rulesLoaded && rulesLoading ? (
        <div className="project-page__rules-loading">Loading rules…</div>
      ) : (
        <>
          <textarea
            value={rulesContent}
            onChange={(event) => onRulesChange(event.target.value)}
            placeholder="Add project rules... e.g. 'Always respond in bullet points' or 'This project uses Python 3.12 with FastAPI'"
            className="project-page__rules-textarea"
          />
          <button
            onClick={onSaveRules}
            disabled={savingRules || !rulesContent.trim()}
            className="project-page__add-btn project-page__add-btn--primary"
          >
            {savingRules ? 'Saving…' : 'Save Rules'}
          </button>
        </>
      )}
    </div>
  );
}
