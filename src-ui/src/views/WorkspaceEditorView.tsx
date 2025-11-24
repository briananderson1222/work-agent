import { useState, useEffect } from 'react';
import { log } from '@/utils/logger';
import type { WorkspaceConfig, WorkspaceTab, WorkspacePrompt, AgentSummary } from '../types';
import { getWorkspaceIcon } from '../utils/workspace';

export interface WorkspaceEditorViewProps {
  apiBase: string;
  slug?: string;
  onBack: () => void;
  onSaved?: (slug: string) => void;
}

export function WorkspaceEditorView({ apiBase, slug, onBack, onSaved }: WorkspaceEditorViewProps) {
  const [formData, setFormData] = useState<WorkspaceConfig>({
    name: '',
    slug: '',
    icon: '',
    description: '',
    tabs: [{ id: 'main', label: 'Main', component: 'project-stallion-dashboard' }],
    globalPrompts: [],
  });
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [isLoading, setIsLoading] = useState(!!slug);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedTabs, setExpandedTabs] = useState<Set<number>>(new Set());
  const [expandedPrompts, setExpandedPrompts] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadAgents();
    if (slug) loadWorkspace(slug);
  }, [slug]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'x') {
        e.preventDefault();
        onBack();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onBack]);

  const loadAgents = async () => {
    try {
      const res = await fetch(`${apiBase}/api/agents`);
      if (!res.ok) throw new Error('Failed to load agents');
      const data = await res.json();
      setAgents(data.data || []);
    } catch (err: any) {
      log.api('Failed to load agents:', err);
    }
  };

  const loadWorkspace = async (workspaceSlug: string) => {
    try {
      setIsLoading(true);
      const res = await fetch(`${apiBase}/workspaces/${workspaceSlug}`);
      if (!res.ok) throw new Error('Failed to load workspace');
      const data = await res.json();
      setFormData(data.data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      setError(null);
      const url = slug 
        ? `${apiBase}/workspaces/${slug}`
        : `${apiBase}/workspaces`;
      const method = slug ? 'PUT' : 'POST';
      
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save workspace');
      }
      
      onSaved?.(formData.slug);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const addTab = () => {
    const newIndex = 0;
    setFormData(prev => ({
      ...prev,
      tabs: [{ id: `tab-${Date.now()}`, label: 'New Tab', component: 'project-stallion-dashboard' }, ...prev.tabs],
    }));
    setExpandedTabs(prev => new Set([...prev, newIndex]));
  };

  const updateTab = (index: number, updates: Partial<WorkspaceTab>) => {
    setFormData(prev => ({
      ...prev,
      tabs: prev.tabs.map((tab, i) => i === index ? { ...tab, ...updates } : tab),
    }));
  };

  const removeTab = (index: number) => {
    setFormData(prev => ({
      ...prev,
      tabs: prev.tabs.filter((_, i) => i !== index),
    }));
  };

  const addPrompt = (tabIndex: number | null) => {
    const newPrompt: WorkspacePrompt = { id: `prompt-${Date.now()}`, label: '', prompt: '' };
    if (tabIndex === null) {
      setFormData(prev => ({
        ...prev,
        globalPrompts: [newPrompt, ...(prev.globalPrompts || [])],
      }));
      setExpandedPrompts(prev => new Set([...prev, `global-0`]));
    } else {
      setFormData(prev => ({
        ...prev,
        tabs: prev.tabs.map((tab, i) => 
          i === tabIndex ? { ...tab, prompts: [newPrompt, ...(tab.prompts || [])] } : tab
        ),
      }));
      setExpandedPrompts(prev => new Set([...prev, `tab-${tabIndex}-0`]));
    }
  };

  const updatePrompt = (tabIndex: number | null, promptIndex: number, updates: Partial<WorkspacePrompt>) => {
    if (tabIndex === null) {
      setFormData(prev => ({
        ...prev,
        globalPrompts: (prev.globalPrompts || []).map((p, i) => i === promptIndex ? { ...p, ...updates } : p),
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        tabs: prev.tabs.map((tab, i) => 
          i === tabIndex ? {
            ...tab,
            prompts: (tab.prompts || []).map((p, j) => j === promptIndex ? { ...p, ...updates } : p),
          } : tab
        ),
      }));
    }
  };

  const removePrompt = (tabIndex: number | null, promptIndex: number) => {
    if (tabIndex === null) {
      setFormData(prev => ({
        ...prev,
        globalPrompts: (prev.globalPrompts || []).filter((_, i) => i !== promptIndex),
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        tabs: prev.tabs.map((tab, i) => 
          i === tabIndex ? { ...tab, prompts: (tab.prompts || []).filter((_, j) => j !== promptIndex) } : tab
        ),
      }));
    }
  };

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--text-primary)' }}>
        Loading...
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg-primary)' }}>
      {/* Header */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between', 
        padding: '16px 24px', 
        borderBottom: '1px solid var(--border-primary)',
        background: 'var(--bg-secondary)',
      }}>
        <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)' }}>
          {slug ? 'Edit Workspace' : 'New Workspace'}
        </h2>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button 
            onClick={handleSave} 
            disabled={isSaving || !formData.name || !formData.slug}
            style={{
              padding: '8px 16px',
              border: 'none',
              borderRadius: '6px',
              background: 'var(--color-primary)',
              color: 'white',
              cursor: isSaving ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              opacity: (isSaving || !formData.name || !formData.slug) ? 0.5 : 1,
            }}
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>
          <button 
            onClick={onBack}
            style={{
              minWidth: '40px',
              padding: '8px 12px',
              border: '1px solid var(--border-primary)',
              borderRadius: '6px',
              background: 'transparent',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              fontSize: '18px',
              lineHeight: '1',
            }}
            title="Close (⌘X)"
          >
            ×
          </button>
        </div>
      </div>

      {error && (
        <div style={{ 
          margin: '16px 24px', 
          padding: '12px', 
          background: 'var(--error-bg)', 
          border: '1px solid var(--error-border)', 
          borderRadius: '6px',
          color: 'var(--error-text)',
          fontSize: '14px',
        }}>
          {error}
        </div>
      )}

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          {/* Basic Info */}
          <section style={{ marginBottom: '32px' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>
              Basic Information
            </h3>
            <div style={{ display: 'grid', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>
                  Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="My Workspace"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid var(--border-primary)',
                    borderRadius: '6px',
                    background: 'var(--bg-secondary)',
                    color: 'var(--text-primary)',
                    fontSize: '14px',
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>
                  Slug * <span style={{ fontSize: '12px', fontWeight: 400, color: 'var(--text-muted)' }}>(URL-safe identifier)</span>
                </label>
                <input
                  type="text"
                  value={formData.slug}
                  onChange={e => setFormData(prev => ({ ...prev, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') }))}
                  disabled={!!slug}
                  placeholder="my-workspace"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid var(--border-primary)',
                    borderRadius: '6px',
                    background: slug ? 'var(--bg-tertiary)' : 'var(--bg-secondary)',
                    color: 'var(--text-primary)',
                    fontSize: '14px',
                    opacity: slug ? 0.6 : 1,
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>
                  Icon
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div
                    style={{
                      width: '48px',
                      height: '48px',
                      borderRadius: '12px',
                      background: 'var(--accent-primary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: formData.icon ? '24px' : '16px',
                      fontWeight: formData.icon ? 'normal' : 600,
                      color: formData.icon ? 'inherit' : 'var(--color-bg)',
                    }}
                  >
                    {formData.icon || getWorkspaceIcon({ name: formData.name || 'Workspace' }).display}
                  </div>
                  <div style={{ flex: 1 }}>
                    <input
                      type="text"
                      value={formData.icon || ''}
                      onChange={e => setFormData(prev => ({ ...prev, icon: e.target.value }))}
                      placeholder="Enter emoji (e.g., 💼) or leave empty for initials"
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        border: '1px solid var(--border-primary)',
                        borderRadius: '6px',
                        background: 'var(--bg-secondary)',
                        color: 'var(--text-primary)',
                        fontSize: '14px',
                        marginBottom: '4px'
                      }}
                    />
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      Use an emoji or leave empty to auto-generate from name
                    </span>
                  </div>
                </div>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>
                  Description
                </label>
                <textarea
                  value={formData.description || ''}
                  onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="A brief description of this workspace"
                  rows={2}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid var(--border-primary)',
                    borderRadius: '6px',
                    background: 'var(--bg-secondary)',
                    color: 'var(--text-primary)',
                    fontSize: '14px',
                    resize: 'vertical',
                  }}
                />
              </div>
            </div>
          </section>

          {/* Global Prompts */}
          <section style={{ marginBottom: '32px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>
                Global Prompts
              </h3>
              <button 
                onClick={() => addPrompt(null)}
                style={{
                  padding: '6px 12px',
                  border: '1px solid var(--border-primary)',
                  borderRadius: '6px',
                  background: 'transparent',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  fontSize: '13px',
                }}
              >
                + Add Prompt
              </button>
            </div>
            {(formData.globalPrompts || []).length === 0 ? (
              <div style={{ 
                padding: '24px', 
                border: '1px dashed var(--border-primary)', 
                borderRadius: '6px', 
                textAlign: 'center',
                color: 'var(--text-muted)',
                fontSize: '14px',
              }}>
                No global prompts yet. Add one to make it available across all tabs.
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '8px' }}>
                {(formData.globalPrompts || []).map((prompt, i) => {
                  const promptKey = `global-${i}`;
                  const isExpanded = expandedPrompts.has(promptKey);
                  const agentName = agents.find(a => a.slug === prompt.agent)?.name;
                  
                  return (
                    <div key={i} style={{ 
                      border: '1px solid var(--border-primary)', 
                      borderRadius: '6px',
                      background: 'var(--bg-secondary)',
                      overflow: 'hidden',
                    }}>
                      {/* Collapsed Header */}
                      <div 
                        style={{
                          padding: '12px 16px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          background: isExpanded ? 'var(--bg-tertiary)' : 'transparent',
                        }}
                      >
                        <div 
                          onClick={() => setExpandedPrompts(prev => {
                            const next = new Set(prev);
                            if (next.has(promptKey)) next.delete(promptKey);
                            else next.add(promptKey);
                            return next;
                          })}
                          style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}
                        >
                          <span style={{ fontSize: '14px', fontWeight: 500 }}>
                            {prompt.label || 'Untitled Prompt'}
                          </span>
                          {agentName && (
                            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                              → {agentName}
                            </span>
                          )}
                          {prompt.prompt && !isExpanded && (
                            <span style={{ fontSize: '12px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {prompt.prompt.substring(0, 60)}{prompt.prompt.length > 60 ? '...' : ''}
                            </span>
                          )}
                          <span style={{ fontSize: '12px', color: 'var(--text-secondary)', marginLeft: 'auto' }}>
                            {isExpanded ? '▼' : '▶'}
                          </span>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removePrompt(null, i);
                          }}
                          style={{
                            padding: '4px 8px',
                            border: 'none',
                            background: 'transparent',
                            color: 'var(--error-text)',
                            cursor: 'pointer',
                            fontSize: '18px',
                            lineHeight: '1',
                          }}
                        >
                          ×
                        </button>
                      </div>
                      
                      {/* Expanded Form */}
                      {isExpanded && (
                        <div style={{ padding: '0 16px 16px 16px' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '12px', marginBottom: '12px' }}>
                            <input
                              type="text"
                              placeholder="Prompt Label"
                              value={prompt.label}
                              onChange={e => updatePrompt(null, i, { label: e.target.value })}
                              style={{
                                padding: '8px 10px',
                                border: '1px solid var(--border-primary)',
                                borderRadius: '4px',
                                background: 'var(--bg-primary)',
                                color: 'var(--text-primary)',
                                fontSize: '13px',
                              }}
                            />
                            <select
                              value={prompt.agent || ''}
                              onChange={e => updatePrompt(null, i, { agent: e.target.value || undefined })}
                              style={{
                                padding: '8px 10px',
                                border: '1px solid var(--border-primary)',
                                borderRadius: '4px',
                                background: 'var(--bg-primary)',
                                color: 'var(--text-primary)',
                                fontSize: '13px',
                              }}
                            >
                              <option value="">Select agent...</option>
                              {agents.map(a => <option key={a.slug} value={a.slug}>{a.name}</option>)}
                            </select>
                            <button
                              onClick={() => removePrompt(null, i)}
                              style={{
                                padding: '4px 8px',
                                border: 'none',
                                borderRadius: '4px',
                                background: 'transparent',
                                color: 'var(--error-text)',
                                cursor: 'pointer',
                                fontSize: '18px',
                                lineHeight: '1',
                              }}
                            >
                              ×
                            </button>
                          </div>
                          <textarea
                            placeholder="Prompt text"
                            value={prompt.prompt}
                            onChange={e => updatePrompt(null, i, { prompt: e.target.value })}
                            rows={3}
                            style={{
                              width: '100%',
                              padding: '8px 10px',
                              border: '1px solid var(--border-primary)',
                              borderRadius: '4px',
                              background: 'var(--bg-primary)',
                              color: 'var(--text-primary)',
                              fontSize: '13px',
                              resize: 'vertical',
                            }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Tabs */}
          <section>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>
                Tabs
              </h3>
              <button 
                onClick={addTab}
                style={{
                  padding: '6px 12px',
                  border: '1px solid var(--border-primary)',
                  borderRadius: '6px',
                  background: 'transparent',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  fontSize: '13px',
                }}
              >
                + Add Tab
              </button>
            </div>
            <div style={{ display: 'grid', gap: '8px' }}>
              {formData.tabs.map((tab, tabIdx) => {
                const isExpanded = expandedTabs.has(tabIdx);
                const promptCount = (tab.prompts || []).length;
                
                return (
                  <div key={tabIdx} style={{ 
                    border: '1px solid var(--border-primary)', 
                    borderRadius: '6px',
                    background: 'var(--bg-secondary)',
                    overflow: 'hidden',
                  }}>
                    {/* Collapsed Header */}
                    <div style={{
                      padding: '12px 16px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: isExpanded ? 'var(--bg-tertiary)' : 'transparent',
                    }}>
                      <div
                        onClick={() => setExpandedTabs(prev => {
                          const next = new Set(prev);
                          if (next.has(tabIdx)) next.delete(tabIdx);
                          else next.add(tabIdx);
                          return next;
                        })}
                        style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}
                      >
                        <span style={{ fontSize: '14px', fontWeight: 500 }}>
                          {tab.label || 'Untitled Tab'}
                        </span>
                        <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                          ID: {tab.id}
                        </span>
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                          {tab.component}
                        </span>
                        {promptCount > 0 && (
                          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                            • {promptCount} prompt{promptCount !== 1 ? 's' : ''}
                          </span>
                        )}
                        <span style={{ fontSize: '12px', color: 'var(--text-secondary)', marginLeft: 'auto' }}>
                          {isExpanded ? '▼' : '▶'}
                        </span>
                      </div>
                      {formData.tabs.length > 1 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeTab(tabIdx);
                          }}
                          style={{
                            padding: '4px 8px',
                            border: 'none',
                            background: 'transparent',
                            color: 'var(--error-text)',
                            cursor: 'pointer',
                            fontSize: '18px',
                            lineHeight: '1',
                          }}
                        >
                          ×
                        </button>
                      )}
                    </div>

                    {/* Expanded Form */}
                    {isExpanded && (
                      <div style={{ padding: '0 16px 16px 16px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                    <div>
                      <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: 'var(--text-muted)' }}>
                        Tab ID
                      </label>
                      <input
                        type="text"
                        placeholder="main"
                        value={tab.id}
                        onChange={e => updateTab(tabIdx, { id: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '8px 10px',
                          border: '1px solid var(--border-primary)',
                          borderRadius: '4px',
                          background: 'var(--bg-primary)',
                          color: 'var(--text-primary)',
                          fontSize: '13px',
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: 'var(--text-muted)' }}>
                        Label
                      </label>
                      <input
                        type="text"
                        placeholder="Main"
                        value={tab.label}
                        onChange={e => updateTab(tabIdx, { label: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '8px 10px',
                          border: '1px solid var(--border-primary)',
                          borderRadius: '4px',
                          background: 'var(--bg-primary)',
                          color: 'var(--text-primary)',
                          fontSize: '13px',
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: '4px', fontSize: '12px', color: 'var(--text-muted)' }}>
                        Component
                      </label>
                      <input
                        type="text"
                        placeholder="project-stallion-dashboard"
                        value={tab.component}
                        onChange={e => updateTab(tabIdx, { component: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '8px 10px',
                          border: '1px solid var(--border-primary)',
                          borderRadius: '4px',
                          background: 'var(--bg-primary)',
                          color: 'var(--text-primary)',
                          fontSize: '13px',
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>Tab Prompts</span>
                      <button 
                        onClick={() => addPrompt(tabIdx)}
                        style={{
                          padding: '4px 8px',
                          border: '1px solid var(--border-primary)',
                          borderRadius: '4px',
                          background: 'transparent',
                          color: 'var(--text-primary)',
                          cursor: 'pointer',
                          fontSize: '12px',
                        }}
                      >
                        + Add
                      </button>
                    </div>
                    {(tab.prompts || []).length === 0 ? (
                      <div style={{ 
                        padding: '16px', 
                        border: '1px dashed var(--border-primary)', 
                        borderRadius: '4px', 
                        textAlign: 'center',
                        color: 'var(--text-muted)',
                        fontSize: '13px',
                      }}>
                        No prompts for this tab
                      </div>
                    ) : (
                      <div style={{ display: 'grid', gap: '8px' }}>
                        {(tab.prompts || []).map((prompt, promptIdx) => {
                          const promptKey = `tab-${tabIdx}-${promptIdx}`;
                          const isPromptExpanded = expandedPrompts.has(promptKey);
                          const agentName = agents.find(a => a.slug === prompt.agent)?.name;
                          
                          return (
                            <div key={promptIdx} style={{ 
                              background: 'var(--bg-primary)', 
                              border: '1px solid var(--border-primary)',
                              borderRadius: '4px',
                              overflow: 'hidden',
                            }}>
                              {/* Collapsed Header */}
                              <div style={{
                                padding: '8px 12px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                background: isPromptExpanded ? 'var(--bg-secondary)' : 'transparent',
                              }}>
                                <div
                                  onClick={() => setExpandedPrompts(prev => {
                                    const next = new Set(prev);
                                    if (next.has(promptKey)) next.delete(promptKey);
                                    else next.add(promptKey);
                                    return next;
                                  })}
                                  style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
                                >
                                  <span style={{ fontSize: '13px', fontWeight: 500 }}>
                                    {prompt.label || 'Untitled'}
                                  </span>
                                  {agentName && (
                                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                                      → {agentName}
                                    </span>
                                  )}
                                  {prompt.prompt && !isPromptExpanded && (
                                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      {prompt.prompt.substring(0, 40)}{prompt.prompt.length > 40 ? '...' : ''}
                                    </span>
                                  )}
                                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)', marginLeft: 'auto' }}>
                                    {isPromptExpanded ? '▼' : '▶'}
                                  </span>
                                </div>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    removePrompt(tabIdx, promptIdx);
                                  }}
                                  style={{
                                    padding: '2px 6px',
                                    border: 'none',
                                    background: 'transparent',
                                    color: 'var(--error-text)',
                                    cursor: 'pointer',
                                    fontSize: '16px',
                                    lineHeight: '1',
                                  }}
                                >
                                  ×
                                </button>
                              </div>

                              {/* Expanded Form */}
                              {isPromptExpanded && (
                                <div style={{ padding: '0 12px 12px 12px' }}>
                                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                              <input
                                type="text"
                                placeholder="Label"
                                value={prompt.label}
                                onChange={e => updatePrompt(tabIdx, promptIdx, { label: e.target.value })}
                                style={{
                                  padding: '6px 8px',
                                  border: '1px solid var(--border-primary)',
                                  borderRadius: '4px',
                                  background: 'var(--bg-secondary)',
                                  color: 'var(--text-primary)',
                                  fontSize: '12px',
                                }}
                              />
                              <select
                                value={prompt.agent || ''}
                                onChange={e => updatePrompt(tabIdx, promptIdx, { agent: e.target.value || undefined })}
                                style={{
                                  padding: '6px 8px',
                                  border: '1px solid var(--border-primary)',
                                  borderRadius: '4px',
                                  background: 'var(--bg-secondary)',
                                  color: 'var(--text-primary)',
                                  fontSize: '12px',
                                }}
                              >
                                <option value="">Select agent...</option>
                                {agents.map(a => <option key={a.slug} value={a.slug}>{a.name}</option>)}
                              </select>
                            </div>
                            <textarea
                              placeholder="Prompt text"
                              value={prompt.prompt}
                              onChange={e => updatePrompt(tabIdx, promptIdx, { prompt: e.target.value })}
                              rows={2}
                              style={{
                                width: '100%',
                                padding: '6px 8px',
                                border: '1px solid var(--border-primary)',
                                borderRadius: '4px',
                                background: 'var(--bg-secondary)',
                                color: 'var(--text-primary)',
                                fontSize: '12px',
                                resize: 'vertical',
                              }}
                            />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
