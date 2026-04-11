import {
  useAddLayoutFromPluginMutation,
  useAvailableProjectLayoutsQuery,
  useCreateLayoutMutation,
  useDeleteProjectLayoutMutation,
  useProjectLayoutsQuery,
} from '@stallion-ai/sdk';
import { useState } from 'react';

export function LayoutsSection({ slug }: { slug: string }) {
  const [showAdd, setShowAdd] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const { data: availableLayouts = [] } = useAvailableProjectLayoutsQuery({
    enabled: showAdd,
  });

  const { data: projectLayouts = [] } = useProjectLayoutsQuery(slug) as {
    data?: Array<{
      id: string;
      slug: string;
      name: string;
      icon?: string;
      type: string;
      config?: Record<string, unknown>;
    }>;
  };

  const removeMutation = useDeleteProjectLayoutMutation(slug);
  const createLayoutMutation = useCreateLayoutMutation(slug);
  const addLayoutFromPluginMutation = useAddLayoutFromPluginMutation(slug);

  async function addLayout(item: (typeof availableLayouts)[0]) {
    setAdding(item.slug);
    try {
      if (item.source === 'plugin' && item.plugin) {
        await addLayoutFromPluginMutation.mutateAsync(item.plugin);
      } else {
        await createLayoutMutation.mutateAsync({
          type: item.type,
          name: item.name,
          slug: `${item.slug}-${Date.now().toString(36)}`,
          icon: item.icon,
          config: {},
        });
      }
      setShowAdd(false);
    } catch {
      /* ignore */
    }
    setAdding(null);
  }

  return (
    <section className="knowledge-section">
      <div className="knowledge-section__header">
        <h3 className="knowledge-section__title">📐 Layouts</h3>
        <button
          className="knowledge-section__action-btn"
          onClick={() => setShowAdd(true)}
        >
          + Add Layout
        </button>
      </div>

      {projectLayouts.length > 0 ? (
        <div className="knowledge-section__doc-list">
          {projectLayouts.map((layout) => (
            <div key={layout.id} className="knowledge-section__doc">
              <span className="knowledge-section__doc-name">
                {layout.icon && `${layout.icon} `}
                {layout.name}
              </span>
              <span className="knowledge-section__badge">{layout.type}</span>
              <button
                className="knowledge-section__doc-remove"
                onClick={() => removeMutation.mutate(layout.slug)}
                title="Remove layout"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="knowledge-section__empty">
          No layouts. Click "+ Add Layout" to get started.
        </p>
      )}

      {showAdd && (
        <div
          className="project-dashboard__modal-overlay"
          onClick={() => setShowAdd(false)}
        >
          <div
            className="project-dashboard__modal"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="knowledge-section__title">Add Layout</h3>
            <div className="knowledge-section__doc-list project-settings__actions--top">
              {availableLayouts.map((item) => (
                <button
                  key={`${item.source}-${item.slug}`}
                  className="project-dashboard__layout-btn"
                  disabled={adding === item.slug}
                  onClick={() => addLayout(item)}
                >
                  {item.icon && <span>{item.icon}</span>}
                  <div className="project-settings__layout-item">
                    <div className="knowledge-section__source-name">
                      {item.name}
                    </div>
                    {item.description && (
                      <div className="knowledge-section__source-path">
                        {item.description}
                      </div>
                    )}
                  </div>
                  <span className="knowledge-section__badge">
                    {item.source === 'plugin' ? item.plugin : item.type}
                  </span>
                </button>
              ))}
            </div>
            <div className="project-settings__actions">
              <button
                className="knowledge-section__action-btn"
                onClick={() => setShowAdd(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
