import { getScheduleStarterTemplates } from './utils';

export function ScheduleEmptyState({
  filterText,
  onSelectTemplate,
}: {
  filterText: string;
  onSelectTemplate: (template: {
    name: string;
    cron: string;
    prompt: string;
  }) => void;
}) {
  if (filterText) {
    return <div className="schedule__empty">No matching jobs</div>;
  }

  return (
    <div className="schedule__empty">
      <div>
        <p className="schedule__empty-intro">
          No scheduled jobs yet. Pick a template to get started:
        </p>
        <div className="schedule__starters">
          {getScheduleStarterTemplates().map((template) => (
            <button
              key={template.name}
              onClick={() =>
                onSelectTemplate({
                  name: template.name,
                  cron: template.cron,
                  prompt: template.prompt,
                })
              }
              className="schedule__starter-btn"
            >
              <div className="schedule__starter-label">{template.label}</div>
              <div className="schedule__starter-meta">{template.meta}</div>
            </button>
          ))}
        </div>
        <p className="schedule__starter-hint">
          Templates pre-fill the form — you choose the agent and schedule.
        </p>
      </div>
    </div>
  );
}
