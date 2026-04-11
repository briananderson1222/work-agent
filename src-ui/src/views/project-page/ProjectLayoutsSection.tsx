import type { AvailableLayout } from './types';

export function ProjectLayoutsSection({
  slug,
  layouts,
  setLayout,
  onOpenAddLayout,
}: {
  slug: string;
  layouts: any[];
  setLayout: (projectSlug: string, layoutSlug: string) => void;
  onOpenAddLayout: () => void;
}) {
  return (
    <div className="project-page__layouts">
      <div className="project-page__section-header">
        <span className="project-page__section-label">Open</span>
        <button className="project-page__add-btn" onClick={onOpenAddLayout}>
          + Add
        </button>
      </div>
      <div className="project-page__cards">
        {layouts.length > 0 ? (
          layouts.map((layout) => (
            <button
              key={layout.slug}
              className="project-page__card"
              onClick={() => setLayout(slug, layout.slug)}
            >
              {layout.icon && (
                <span className="project-page__card-icon">{layout.icon}</span>
              )}
              <span className="project-page__card-name">{layout.name}</span>
              {layout.description && (
                <span className="project-page__card-desc">{layout.description}</span>
              )}
              <span className="project-page__card-type">{layout.type}</span>
            </button>
          ))
        ) : (
          <button className="project-page__empty-card" onClick={onOpenAddLayout}>
            + Add your first layout to get started
          </button>
        )}
      </div>
    </div>
  );
}

export function ProjectAddLayoutModal({
  show,
  available,
  adding,
  onClose,
  onAddLayout,
}: {
  show: boolean;
  available: AvailableLayout[];
  adding: string | null;
  onClose: () => void;
  onAddLayout: (item: AvailableLayout) => void;
}) {
  if (!show) {
    return null;
  }

  return (
    <div className="project-page__modal-overlay" onClick={onClose}>
      <div className="project-page__modal" onClick={(event) => event.stopPropagation()}>
        <h3 className="project-page__modal-title">Add Layout</h3>
        <div className="project-page__modal-list">
          {available.map((item) => (
            <button
              key={`${item.source}-${item.slug}`}
              className="project-page__modal-item"
              disabled={adding === item.slug}
              onClick={() => onAddLayout(item)}
            >
              {item.icon && <span>{item.icon}</span>}
              <div className="project-page__modal-item-info">
                <div className="project-page__modal-item-name">{item.name}</div>
                {item.description && (
                  <div className="project-page__modal-item-desc">
                    {item.description}
                  </div>
                )}
              </div>
              <span className="project-page__doc-badge">
                {item.source === 'plugin' ? item.plugin : item.type}
              </span>
            </button>
          ))}
        </div>
        <div className="project-page__modal-cancel">
          <button className="project-page__add-btn" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
