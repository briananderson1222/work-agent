import { Checkbox } from '../../components/Checkbox';
import type { AgentEditorFormProps } from './types';

export function AgentEditorSkillsTab({
  form,
  setForm,
  locked,
  availableSkills,
  availablePrompts,
  onNavigate,
  onOpenAddModal,
}: Pick<
  AgentEditorFormProps,
  | 'form'
  | 'setForm'
  | 'locked'
  | 'availableSkills'
  | 'availablePrompts'
  | 'onNavigate'
  | 'onOpenAddModal'
>) {
  return (
    <>
      <div className="agent-editor__section">
        <div className="editor-field">
          <div className="editor-label-row">
            <label className="editor-label">Skills</label>
            <span className="editor-label-row__actions">
              <span className="editor__tools-server-count">
                {form.skills.length} enabled
              </span>
              {!locked && (
                <button
                  type="button"
                  className="editor-enrich-btn"
                  onClick={() => onOpenAddModal('skills')}
                >
                  + Add
                </button>
              )}
            </span>
          </div>
          {form.skills.length === 0 ? (
            <div className="editor__tools-empty">
              No skills enabled.{' '}
              {!locked && availableSkills.length > 0 && (
                <button
                  type="button"
                  className="editor__tools-link"
                  onClick={() => onOpenAddModal('skills')}
                >
                  Add skills
                </button>
              )}
            </div>
          ) : (
            <div className="editor__tools-server">
              <div className="editor__tools-list">
                {availableSkills
                  .filter((skill: any) => form.skills.includes(skill.name))
                  .map((skill: any) => (
                    <div
                      key={skill.name}
                      className="editor__tool-item editor__tool-item--active"
                    >
                      <Checkbox
                        checked={true}
                        disabled={locked}
                        onChange={() => {
                          if (locked) {
                            return;
                          }
                          setForm((current) => ({
                            ...current,
                            skills: current.skills.filter(
                              (entry: string) => entry !== skill.name,
                            ),
                          }));
                        }}
                      />
                      <div className="editor__tool-info">
                        <div className="editor__tool-name">{skill.name}</div>
                        {skill.description && (
                          <div className="editor__tool-desc">
                            {skill.description}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="agent-editor__section">
        <div className="editor-field">
          <div className="editor-label-row">
            <label className="editor-label">Playbooks</label>
            <span className="editor-label-row__actions">
              <span className="editor__tools-server-count">
                {form.prompts.length} enabled
              </span>
              <button
                type="button"
                className="editor-enrich-btn"
                onClick={() => onNavigate({ type: 'playbooks' })}
              >
                + new
              </button>
              {!locked && (
                <button
                  type="button"
                  className="editor-enrich-btn"
                  onClick={() => onOpenAddModal('prompts')}
                >
                  + Add
                </button>
              )}
            </span>
          </div>
          {form.prompts.length === 0 ? (
            <div className="editor__tools-empty">
              No prompts enabled.{' '}
              {!locked && availablePrompts.length > 0 && (
                <button
                  type="button"
                  className="editor__tools-link"
                  onClick={() => onOpenAddModal('prompts')}
                >
                  Add prompts
                </button>
              )}
            </div>
          ) : (
            <div className="editor__tools-server">
              <div className="editor__tools-list">
                {availablePrompts
                  .filter((prompt: any) => form.prompts.includes(prompt.id))
                  .map((prompt: any) => (
                    <div
                      key={prompt.id}
                      className="editor__tool-item editor__tool-item--active"
                    >
                      <Checkbox
                        checked={true}
                        disabled={locked}
                        onChange={() => {
                          if (locked) {
                            return;
                          }
                          setForm((current) => ({
                            ...current,
                            prompts: current.prompts.filter(
                              (entry: string) => entry !== prompt.id,
                            ),
                          }));
                        }}
                      />
                      <div className="editor__tool-info">
                        <div className="editor__tool-name">{prompt.name}</div>
                        {prompt.description && (
                          <div className="editor__tool-desc">
                            {prompt.description}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
