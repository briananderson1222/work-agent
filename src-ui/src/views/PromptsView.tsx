import './page-layout.css';

export function PromptsView() {
  return (
    <div className="page">
      <div className="page__header">
        <div className="page__header-text">
          <div className="page__label">manage / prompts</div>
          <h1 className="page__title">Prompts</h1>
          <p className="page__subtitle">
            Create reusable prompts for workspaces and agent commands
          </p>
        </div>
      </div>
      <div className="page__empty">
        <div className="page__empty-icon">⌘</div>
        <p className="page__empty-title">Prompts management coming soon</p>
        <p className="page__empty-desc">
          Global prompts and saved workflows will be managed here
        </p>
      </div>
    </div>
  );
}
