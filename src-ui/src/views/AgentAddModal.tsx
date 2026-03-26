import { Checkbox } from '../components/Checkbox';
import type { Tool } from '../types';

interface AgentAddModalProps {
  type: 'integrations' | 'skills' | 'prompts';
  availableTools: Tool[];
  availableSkills: any[];
  availablePrompts: any[];
  form: { tools: { mcpServers: string[]; available: string[] }; skills: string[]; prompts: string[] };
  setForm: React.Dispatch<React.SetStateAction<any>>;
  onClose: () => void;
}

export function AgentAddModal({ type, availableTools, availableSkills, availablePrompts, form, setForm, onClose }: AgentAddModalProps) {
  return (
    <div className="editor-add-modal__overlay" onClick={onClose}>
      <div className="editor-add-modal" onClick={(e) => e.stopPropagation()}>
        <div className="editor-add-modal__header">
          <h3>Add {type === 'integrations' ? 'Integrations' : type === 'skills' ? 'Skills' : 'Prompts'}</h3>
          <button type="button" className="editor-add-modal__close" onClick={onClose}>×</button>
        </div>
        <div className="editor-add-modal__body">
          {type === 'integrations' && availableTools.map((integration) => {
            const enabled = form.tools.mcpServers.includes(integration.id);
            return (
              <div key={integration.id} className={`editor__tool-item${enabled ? ' editor__tool-item--active' : ''}`} onClick={() => {
                setForm((f: any) => {
                  const servers = new Set(f.tools.mcpServers);
                  const avail = [...f.tools.available];
                  if (servers.has(integration.id)) {
                    servers.delete(integration.id);
                    return { ...f, tools: { ...f.tools, mcpServers: [...servers], available: avail.filter((p: string) => !p.startsWith(`${integration.id}_`)) } };
                  }
                  servers.add(integration.id);
                  avail.push(`${integration.id}_*`);
                  return { ...f, tools: { ...f.tools, mcpServers: [...servers], available: avail } };
                });
              }}>
                <Checkbox checked={enabled} onChange={() => {}} />
                <div className="editor__tool-info">
                  <div className="editor__tool-name">{integration.displayName || integration.id}</div>
                  {integration.description && <div className="editor__tool-desc">{integration.description}</div>}
                </div>
              </div>
            );
          })}
          {type === 'skills' && availableSkills.map((skill: any) => {
            const enabled = form.skills.includes(skill.name);
            return (
              <div key={skill.name} className={`editor__tool-item${enabled ? ' editor__tool-item--active' : ''}`} onClick={() => {
                setForm((f: any) => ({ ...f, skills: enabled ? f.skills.filter((s: string) => s !== skill.name) : [...f.skills, skill.name] }));
              }}>
                <Checkbox checked={enabled} onChange={() => {}} />
                <div className="editor__tool-info">
                  <div className="editor__tool-name">{skill.name}</div>
                  {skill.description && <div className="editor__tool-desc">{skill.description}</div>}
                </div>
              </div>
            );
          })}
          {type === 'prompts' && availablePrompts.map((prompt: any) => {
            const enabled = form.prompts.includes(prompt.id);
            return (
              <div key={prompt.id} className={`editor__tool-item${enabled ? ' editor__tool-item--active' : ''}`} onClick={() => {
                setForm((f: any) => ({ ...f, prompts: enabled ? f.prompts.filter((p: string) => p !== prompt.id) : [...f.prompts, prompt.id] }));
              }}>
                <Checkbox checked={enabled} onChange={() => {}} />
                <div className="editor__tool-info">
                  <div className="editor__tool-name">{prompt.name}</div>
                  {prompt.description && <div className="editor__tool-desc">{prompt.description}</div>}
                </div>
              </div>
            );
          })}
        </div>
        <div className="editor-add-modal__footer">
          <button type="button" className="editor-btn editor-btn--primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
