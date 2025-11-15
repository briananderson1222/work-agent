import { useState, useEffect } from 'react';
import type { AgentSummary, Tool } from '../types';
import { getAgentIcon } from '../utils/workspace';
import { AgentIcon } from '../components/AgentIcon';
import { useModels } from '../contexts/ModelsContext';
import { ModelSelector } from '../components/ModelSelector';
import { useTabKeyboardShortcuts } from '../hooks/useTabKeyboardShortcuts';
import { useCloseShortcut } from '../hooks/useCloseShortcut';

export interface AgentEditorViewProps {
  apiBase: string;
  slug?: string;
  initialTab?: 'basic' | 'model' | 'tools' | 'commands';
  onBack: () => void;
  onSaved?: (slug: string) => void;
}

interface AgentFormData {
  slug: string;
  name: string;
  description: string;
  prompt: string;
  modelId: string;
  region: string;
  guardrails: string;
  maxTurns: string;
  tools: string[];
  icon?: string;
  commands?: Record<string, any>;
}

type FormStep = 'basic' | 'model' | 'tools' | 'commands';

const FORM_STEPS: readonly FormStep[] = ['basic', 'model', 'tools', 'commands'] as const;

export function AgentEditorView({ apiBase, slug, initialTab, onBack, onSaved }: AgentEditorViewProps) {
  const availableModels = useModels(apiBase);
  const [currentStep, setCurrentStep] = useState<FormStep>(initialTab || 'basic');
  const [expandedCommands, setExpandedCommands] = useState<Record<string, boolean>>({});
  
  useTabKeyboardShortcuts(FORM_STEPS, currentStep, setCurrentStep);
  useCloseShortcut(onBack);

  const [formData, setFormData] = useState<AgentFormData>({
    slug: '',
    name: '',
    description: '',
    prompt: '',
    modelId: '',
    region: '',
    guardrails: '',
    maxTurns: '',
    tools: [],
  });
  const [availableTools, setAvailableTools] = useState<Tool[]>([]);
  const [isLoading, setIsLoading] = useState(!!slug);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false);
  const [showNewToolForm, setShowNewToolForm] = useState(false);
  const [newTool, setNewTool] = useState({
    id: '',
    name: '',
    description: '',
    kind: 'mcp' as 'mcp' | 'builtin',
    transport: 'stdio' as 'stdio' | 'ws' | 'tcp',
    command: '',
    args: '',
  });
  const [isCreatingTool, setIsCreatingTool] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionTestResult, setConnectionTestResult] = useState<'success' | 'failed' | null>(null);
  const [appConfig, setAppConfig] = useState<{ region?: string; defaultModel?: string; defaultMaxTurns?: number } | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const isEditMode = !!slug;

  useEffect(() => {
    if (slug) {
      loadAgent(slug);
    }
    loadTools();
    loadAppConfig();
  }, [slug]);

  const loadAppConfig = async () => {
    try {
      const response = await fetch(`${apiBase}/config/app`);
      if (!response.ok) throw new Error('Failed to load app config');
      const data = await response.json();
      setAppConfig(data.data);
    } catch (err) {
      console.error('Failed to load app config:', err);
    }
  };

  const loadAgent = async (agentSlug: string) => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await fetch(`${apiBase}/api/agents`);
      if (!response.ok) throw new Error('Failed to load agents');
      const data = await response.json();
      const agent = (data.data || []).find((a: any) => a.slug === agentSlug || a.id === agentSlug);
      if (!agent) throw new Error('Agent not found');

      setUpdatedAt(agent.updatedAt);
      setFormData({
        slug: agent.slug || agent.id,
        name: agent.name || '',
        description: agent.description || '',
        prompt: agent.prompt || '',
        modelId: typeof agent.model === 'string' ? agent.model : agent.model?.modelId || '',
        region: agent.region || '',
        guardrails: agent.guardrails || '',
        maxTurns: agent.maxTurns?.toString() || '',
        tools: agent.tools || [],
        icon: agent.icon || '',
        commands: agent.commands || {},
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const loadTools = async () => {
    try {
      const response = await fetch(`${apiBase}/tools`);
      if (!response.ok) throw new Error('Failed to load tools');
      const data = await response.json();
      setAvailableTools(data.data || []);
    } catch (err: any) {
      console.error('Failed to load tools:', err);
    }
  };

  const validateStep = (step: FormStep): boolean => {
    const errors: Record<string, string> = {};

    if (step === 'basic') {
      if (!formData.name.trim()) errors.name = 'Name is required';
      if (!isEditMode && !formData.slug.trim()) errors.slug = 'Slug is required';
      if (!isEditMode && !/^[a-z0-9-]+$/.test(formData.slug))
        errors.slug = 'Slug must contain only lowercase letters, numbers, and hyphens';
    }

    if (step === 'model') {
      if (!formData.modelId.trim()) errors.modelId = 'Model ID is required';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const nextStep = () => {
    if (!validateStep(currentStep)) return;

    const steps: FormStep[] = ['basic', 'model', 'tools', 'commands'];
    const currentIndex = steps.indexOf(currentStep);
    if (currentIndex < steps.length - 1) {
      setCurrentStep(steps[currentIndex + 1]);
    }
  };

  const prevStep = () => {
    const steps: FormStep[] = ['basic', 'model', 'tools', 'commands'];
    const currentIndex = steps.indexOf(currentStep);
    if (currentIndex > 0) {
      setCurrentStep(steps[currentIndex - 1]);
    }
  };

  const saveAgent = async () => {
    if (!validateStep(currentStep)) return;

    try {
      setIsSaving(true);
      setError(null);

      const payload = {
        slug: formData.slug,
        name: formData.name,
        description: formData.description,
        prompt: formData.prompt,
        model: formData.modelId || undefined,
        region: formData.region || undefined,
        guardrails: formData.guardrails || undefined,
        maxTurns: formData.maxTurns ? parseInt(formData.maxTurns) : undefined,
        tools: formData.tools.length > 0 ? { use: formData.tools } : undefined,
        icon: formData.icon || undefined,
        commands: formData.commands && Object.keys(formData.commands).length > 0 ? formData.commands : undefined,
      };

      const url = isEditMode ? `${apiBase}/agents/${slug}` : `${apiBase}/agents`;
      const method = isEditMode ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save agent');
      }

      const savedAgent = await response.json();
      const savedSlug = savedAgent.data?.slug || formData.slug;
      
      // Reload the agent data to show updated values
      if (isEditMode) {
        await loadAgent(savedSlug);
      }
      
      onSaved?.(savedSlug);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const toggleTool = (toolId: string) => {
    setFormData((prev) => ({
      ...prev,
      tools: prev.tools.includes(toolId)
        ? prev.tools.filter((id) => id !== toolId)
        : [...prev.tools, toolId],
    }));
  };

  const generateSystemPrompt = async () => {
    try {
      setIsGeneratingPrompt(true);
      setError(null);

      const currentPrompt = formData.prompt.trim();
      const userMessage = currentPrompt
        ? `I have this system prompt: "${currentPrompt}"\n\nPlease help me improve and expand it for an AI assistant. Make it clear, professional, and comprehensive.`
        : `Please generate a professional system prompt for an AI assistant named "${formData.name}". The assistant should be helpful, clear, and professional.`;

      // Use the default agent to generate the prompt
      const response = await fetch(`${apiBase}/agents/work-agent/text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: [{ role: 'user', content: userMessage }],
          options: { userId: 'ui-user' },
        }),
      });

      if (!response.ok) throw new Error('Failed to generate prompt');

      const data = await response.json();
      const generatedPrompt = data.data?.text || data.text || '';

      setFormData({ ...formData, prompt: generatedPrompt });
    } catch (err: any) {
      setError(`Failed to generate prompt: ${err.message}`);
    } finally {
      setIsGeneratingPrompt(false);
    }
  };

  const testMCPConnection = async () => {
    try {
      setIsTestingConnection(true);
      setConnectionTestResult(null);
      setError(null);

      // Validate required fields
      if (!newTool.command) {
        throw new Error('Command is required for MCP test');
      }

      const toolPayload: any = {
        id: newTool.id || 'test-tool',
        name: newTool.name || 'Test Tool',
        kind: 'mcp',
        transport: newTool.transport,
        command: newTool.command,
      };

      if (newTool.args) {
        toolPayload.args = newTool.args.split(',').map((s) => s.trim()).filter(Boolean);
      }

      // Test the MCP connection via API
      const response = await fetch(`${apiBase}/tools/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toolPayload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'MCP connection test failed');
      }

      const data = await response.json();
      setConnectionTestResult('success');

      // If test successful, show available tools count
      if (data.data?.toolCount) {
        setError(null);
        alert(`MCP connection successful! Found ${data.data.toolCount} tools.`);
      }
    } catch (err: any) {
      setConnectionTestResult('failed');
      setError(`Connection test failed: ${err.message}`);
    } finally {
      setIsTestingConnection(false);
    }
  };

  const createNewTool = async () => {
    try {
      setIsCreatingTool(true);
      setError(null);

      // Basic validation
      if (!newTool.id || !newTool.name) {
        throw new Error('Tool ID and name are required');
      }

      // Create tool via API
      const toolPayload: any = {
        id: newTool.id,
        name: newTool.name,
        description: newTool.description,
        kind: newTool.kind,
      };

      if (newTool.kind === 'mcp') {
        toolPayload.transport = newTool.transport;
        toolPayload.command = newTool.command;
        if (newTool.args) {
          toolPayload.args = newTool.args.split(',').map((s) => s.trim()).filter(Boolean);
        }
      }

      const response = await fetch(`${apiBase}/tools`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toolPayload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create tool');
      }

      // Reload tools and auto-select the new one
      await loadTools();
      setFormData((prev) => ({
        ...prev,
        tools: [...prev.tools, newTool.id],
      }));

      // Reset form
      setNewTool({
        id: '',
        name: '',
        description: '',
        kind: 'mcp',
        transport: 'stdio',
        command: '',
        args: '',
      });
      setShowNewToolForm(false);
      setConnectionTestResult(null);
    } catch (err: any) {
      setError(`Failed to create tool: ${err.message}`);
    } finally {
      setIsCreatingTool(false);
    }
  };

  if (isLoading) {
    return (
      <div className="management-view">
        <div className="management-view__header">
          <h2>{isEditMode ? 'Edit Agent' : 'New Agent'}</h2>
          <button type="button" className="button button--secondary" onClick={onBack}>
            Back
          </button>
        </div>
        <div className="management-view__loading">Loading agent...</div>
      </div>
    );
  }

  return (
    <div className="management-view" tabIndex={-1} ref={(el) => el?.focus()} style={{ outline: 'none' }}>
      <div className="management-view__header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <h2>{isEditMode ? formData.name : 'New Agent'}</h2>
          {isEditMode && updatedAt && (
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 'normal' }}>
              Last updated: {new Date(updatedAt).toLocaleString()}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button 
            type="button" 
            className="button button--secondary" 
            onClick={() => window.history.back()}
            title="Back"
          >
            Back
          </button>
          <button 
            type="button" 
            className="button button--secondary" 
            onClick={onBack}
            style={{ 
              minWidth: '40px',
              padding: '8px 12px',
              fontSize: '18px',
              lineHeight: '1'
            }}
            title="Close (⌘X)"
          >
            ×
          </button>
        </div>
      </div>

      {error && <div className="management-view__error">{error}</div>}

      <div className="agent-editor">
        <div className="agent-editor__steps">
          <button
            type="button"
            className={`step-indicator ${currentStep === 'basic' ? 'is-active' : ''}`}
            onClick={() => {
              setCurrentStep('basic');
              window.history.replaceState({}, '', `${window.location.pathname}${window.location.search}#/agents/${slug || 'new'}/edit?tab=basic`);
            }}
            title="Basic Info (⌘1)"
          >
            Basic Info <span style={{ fontSize: '10px', opacity: 0.6, marginLeft: '6px' }}>⌘1</span>
          </button>
          <button
            type="button"
            className={`step-indicator ${currentStep === 'model' ? 'is-active' : ''}`}
            onClick={() => {
              setCurrentStep('model');
              window.history.replaceState({}, '', `${window.location.pathname}${window.location.search}#/agents/${slug || 'new'}/edit?tab=model`);
            }}
            title="Model Config (⌘2)"
          >
            Model Config <span style={{ fontSize: '10px', opacity: 0.6, marginLeft: '6px' }}>⌘2</span>
          </button>
          <button
            type="button"
            className={`step-indicator ${currentStep === 'tools' ? 'is-active' : ''}`}
            onClick={() => {
              setCurrentStep('tools');
              window.history.replaceState({}, '', `${window.location.pathname}${window.location.search}#/agents/${slug || 'new'}/edit?tab=tools`);
            }}
            title="Tools (⌘3)"
          >
            Tools <span style={{ fontSize: '10px', opacity: 0.6, marginLeft: '6px' }}>⌘3</span>
          </button>
          <button
            type="button"
            className={`step-indicator ${currentStep === 'commands' ? 'is-active' : ''}`}
            onClick={() => {
              setCurrentStep('commands');
              window.history.replaceState({}, '', `${window.location.pathname}${window.location.search}#/agents/${slug || 'new'}/edit?tab=commands`);
            }}
            title="Slash Commands (⌘4)"
          >
            Slash Commands <span style={{ fontSize: '10px', opacity: 0.6, marginLeft: '6px' }}>⌘4</span>
          </button>
        </div>

        <div className="agent-editor__content">
          {currentStep === 'basic' && (
            <div className="form-panel">
              <div className="form-group">
                <label htmlFor="slug">Slug</label>
                <input
                  id="slug"
                  type="text"
                  value={formData.slug}
                  onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                  disabled={isEditMode}
                  placeholder="my-agent"
                />
                {validationErrors.slug && (
                  <span className="form-error">{validationErrors.slug}</span>
                )}
                <span className="form-help">
                  Unique identifier (lowercase, numbers, hyphens only)
                </span>
              </div>

              <div className="form-group">
                <label htmlFor="name">Name</label>
                <input
                  id="name"
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="My Agent"
                />
                {validationErrors.name && <span className="form-error">{validationErrors.name}</span>}
              </div>

              <div className="form-group">
                <label>Icon</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <AgentIcon 
                    agent={{ name: formData.name || 'Agent', icon: formData.icon }} 
                    size="large"
                    style={{ borderRadius: '12px' }}
                  />
                  <div style={{ flex: 1 }}>
                    <input
                      type="text"
                      value={formData.icon || ''}
                      onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                      placeholder="Enter emoji (e.g., 🤖) or leave empty for initials"
                      style={{ marginBottom: '4px' }}
                    />
                    <span className="form-help" style={{ margin: 0 }}>
                      Use an emoji or leave empty to auto-generate from name
                    </span>
                  </div>
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="description">Description</label>
                <input
                  id="description"
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="A helpful agent for..."
                />
              </div>

              <div className="form-group">
                <label htmlFor="prompt">System Prompt</label>
                <textarea
                  id="prompt"
                  value={formData.prompt}
                  onChange={(e) => setFormData({ ...formData, prompt: e.target.value })}
                  placeholder="You are a helpful assistant..."
                  rows={8}
                />
                <button
                  type="button"
                  className="generate-button"
                  onClick={generateSystemPrompt}
                  disabled={isGeneratingPrompt}
                >
                  {isGeneratingPrompt ? 'Generating...' : '✨ Generate with AI'}
                </button>
                <span className="form-help">
                  AI will help write or improve your system prompt
                </span>
              </div>
            </div>
          )}

          {currentStep === 'model' && (
            <div className="form-panel">
              <div className="form-group">
                <label htmlFor="modelId">Model ID</label>
                <ModelSelector
                  value={formData.modelId}
                  onChange={(modelId) => setFormData({ ...formData, modelId })}
                  placeholder="Select a model..."
                />
                {validationErrors.modelId && (
                  <span className="form-error">{validationErrors.modelId}</span>
                )}
                <span className="form-help">
                  AWS Bedrock model identifier
                </span>
              </div>

              <div className="form-group">
                <label htmlFor="region">AWS Region</label>
                <input
                  id="region"
                  type="text"
                  value={formData.region}
                  onChange={(e) => setFormData({ ...formData, region: e.target.value })}
                  placeholder={appConfig?.region || 'us-east-1'}
                />
                <span className="form-help">Leave empty to use default region ({appConfig?.region || 'us-east-1'})</span>
              </div>

              <div className="form-group">
                <label htmlFor="guardrails">Guardrails</label>
                <input
                  id="guardrails"
                  type="text"
                  value={formData.guardrails}
                  onChange={(e) => setFormData({ ...formData, guardrails: e.target.value })}
                  placeholder="Optional guardrail ID"
                />
                <span className="form-help">Optional guardrail configuration</span>
              </div>

              <div className="form-group">
                <label htmlFor="maxTurns">Max Turns</label>
                <input
                  id="maxTurns"
                  type="number"
                  min="1"
                  max="100"
                  value={formData.maxTurns}
                  onChange={(e) => setFormData({ ...formData, maxTurns: e.target.value })}
                  placeholder={appConfig?.defaultMaxTurns?.toString() || '10'}
                />
                <span className="form-help">Maximum conversation turns (default: {appConfig?.defaultMaxTurns || 10})</span>
              </div>
            </div>
          )}

          {currentStep === 'tools' && (
            <div className="form-panel">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3>Available Tools</h3>
                <button
                  type="button"
                  className="button button--secondary button--small"
                  onClick={() => setShowNewToolForm(!showNewToolForm)}
                >
                  {showNewToolForm ? 'Cancel' : '+ New Tool'}
                </button>
              </div>

              {showNewToolForm && (
                <div className="new-tool-form">
                  <h4>Create New Tool</h4>
                  <div className="form-group">
                    <label htmlFor="newToolId">Tool ID</label>
                    <input
                      id="newToolId"
                      type="text"
                      value={newTool.id}
                      onChange={(e) => setNewTool({ ...newTool, id: e.target.value })}
                      placeholder="my-tool"
                    />
                    <span className="form-help">Lowercase, hyphenated identifier</span>
                  </div>
                  <div className="form-group">
                    <label htmlFor="newToolName">Tool Name</label>
                    <input
                      id="newToolName"
                      type="text"
                      value={newTool.name}
                      onChange={(e) => setNewTool({ ...newTool, name: e.target.value })}
                      placeholder="My Tool"
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="newToolDescription">Description</label>
                    <input
                      id="newToolDescription"
                      type="text"
                      value={newTool.description}
                      onChange={(e) => setNewTool({ ...newTool, description: e.target.value })}
                      placeholder="What this tool does..."
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="newToolKind">Kind</label>
                    <select
                      id="newToolKind"
                      value={newTool.kind}
                      onChange={(e) => setNewTool({ ...newTool, kind: e.target.value as 'mcp' | 'builtin' })}
                    >
                      <option value="mcp">MCP Server</option>
                      <option value="builtin">Built-in</option>
                    </select>
                  </div>
                  {newTool.kind === 'mcp' && (
                    <>
                      <div className="form-group">
                        <label htmlFor="newToolTransport">Transport</label>
                        <select
                          id="newToolTransport"
                          value={newTool.transport}
                          onChange={(e) => setNewTool({ ...newTool, transport: e.target.value as 'stdio' | 'ws' | 'tcp' })}
                        >
                          <option value="stdio">Standard I/O (stdio)</option>
                          <option value="ws">WebSocket (ws)</option>
                          <option value="tcp">TCP</option>
                        </select>
                      </div>
                      <div className="form-group">
                        <label htmlFor="newToolCommand">Command</label>
                        <input
                          id="newToolCommand"
                          type="text"
                          value={newTool.command}
                          onChange={(e) => setNewTool({ ...newTool, command: e.target.value })}
                          placeholder="node"
                        />
                      </div>
                      <div className="form-group">
                        <label htmlFor="newToolArgs">Arguments</label>
                        <input
                          id="newToolArgs"
                          type="text"
                          value={newTool.args}
                          onChange={(e) => setNewTool({ ...newTool, args: e.target.value })}
                          placeholder="arg1, arg2, arg3"
                        />
                        <span className="form-help">Comma-separated arguments</span>
                      </div>
                    </>
                  )}
                  <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
                    {newTool.kind === 'mcp' && (
                      <button
                        type="button"
                        className={`button ${connectionTestResult === 'success' ? 'button--secondary' : connectionTestResult === 'failed' ? 'button--danger' : 'button--secondary'}`}
                        onClick={testMCPConnection}
                        disabled={isTestingConnection || !newTool.command}
                        title="Test MCP server connection before creating the tool"
                      >
                        {isTestingConnection
                          ? 'Testing...'
                          : connectionTestResult === 'success'
                            ? '✓ Connection OK'
                            : connectionTestResult === 'failed'
                              ? '✗ Test Failed'
                              : 'Test Connection'}
                      </button>
                    )}
                    <button
                      type="button"
                      className="button button--primary"
                      onClick={createNewTool}
                      disabled={isCreatingTool}
                    >
                      {isCreatingTool ? 'Creating...' : 'Create Tool'}
                    </button>
                    <button
                      type="button"
                      className="button button--secondary"
                      onClick={() => {
                        setShowNewToolForm(false);
                        setConnectionTestResult(null);
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {availableTools.length === 0 ? (
                <p className="form-help">No tools available. Create a tool to get started.</p>
              ) : (
                <div className="tool-grid">
                  {availableTools.map((tool) => (
                    <label key={tool.id} className="tool-checkbox">
                      <input
                        type="checkbox"
                        checked={formData.tools.includes(tool.id)}
                        onChange={() => toggleTool(tool.id)}
                      />
                      <div className="tool-info">
                        <span className="tool-name">{tool.name}</span>
                        {tool.description && <span className="tool-desc">{tool.description}</span>}
                        <span className="tool-meta">
                          {tool.kind} {tool.transport && `· ${tool.transport}`}
                        </span>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {currentStep === 'commands' && (
            <div className="form-panel">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                <div>
                  <h3>Slash Commands</h3>
                  <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '8px' }}>
                    Define custom slash commands that users can invoke in chat. Commands can accept parameters and execute specific prompts.
                  </p>
                </div>
                {(() => {
                  const hasCommands = formData.commands && Object.keys(formData.commands).length > 0;
                  return hasCommands ? (
                    <button
                      type="button"
                      className="button button--primary button--small"
                      onClick={() => {
                        const commandKey = `cmd-${Date.now()}`;
                        console.log('Adding command:', commandKey);
                        setFormData({
                          ...formData,
                          commands: {
                            [commandKey]: {
                              name: '',
                              description: '',
                              prompt: '',
                              params: []
                            },
                            ...formData.commands
                          }
                        });
                        // Auto-expand the new command
                        setExpandedCommands({ ...expandedCommands, [commandKey]: true });
                      }}
                      style={{ flexShrink: 0 }}
                    >
                      + Add Command
                    </button>
                  ) : null;
                })()}
              </div>

              {(!formData.commands || Object.keys(formData.commands).length === 0) ? (
                <div style={{ 
                  padding: '32px', 
                  textAlign: 'center', 
                  color: 'var(--text-muted)',
                  border: '2px dashed var(--border-primary)',
                  borderRadius: '8px'
                }}>
                  <p>No slash commands defined yet.</p>
                  <button
                    type="button"
                    className="button button--primary button--small"
                    style={{ marginTop: '12px' }}
                    onClick={() => {
                      const commandKey = 'cmd-1';
                      setFormData({
                        ...formData,
                        commands: {
                          [commandKey]: {
                            name: '',
                            description: '',
                            prompt: '',
                            params: []
                          }
                        }
                      });
                      setExpandedCommands({ [commandKey]: true });
                    }}
                  >
                    + Add First Command
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {Object.entries(formData.commands).map(([key, cmd]: [string, any]) => {
                    const isExpanded = expandedCommands[key] || false;
                    return (
                      <div key={key} style={{
                        border: '1px solid var(--color-border)',
                        borderRadius: '8px',
                        background: 'var(--color-bg-secondary)',
                        overflow: 'hidden'
                      }}>
                        <div 
                          style={{ 
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            alignItems: 'center',
                            padding: '12px 16px',
                            cursor: 'pointer',
                            background: isExpanded ? 'var(--color-bg-tertiary)' : 'transparent'
                          }}
                          onClick={() => setExpandedCommands({ ...expandedCommands, [key]: !isExpanded })}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
                            <span style={{ fontSize: '14px', opacity: 0.6 }}>
                              {isExpanded ? '▼' : '▶'}
                            </span>
                            <div>
                              <strong style={{ fontSize: '15px', color: 'var(--color-text-primary)' }}>/{cmd.name}</strong>
                              <p style={{ color: 'var(--color-text-secondary)', fontSize: '13px', marginTop: '2px', marginBottom: 0 }}>
                                {cmd.description || 'No description'}
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            className="button button--danger button--small"
                            onClick={(e) => {
                              e.stopPropagation();
                              const newCommands = { ...formData.commands };
                              delete newCommands[key];
                              setFormData({ ...formData, commands: newCommands });
                            }}
                          >
                            Delete
                          </button>
                        </div>
                        {isExpanded && (
                          <div style={{ 
                            padding: '16px',
                            borderTop: '1px solid var(--border-primary)',
                            background: 'var(--bg-primary)'
                          }}>
                            <div className="form-group">
                              <label>Command Name</label>
                              <input
                                type="text"
                                value={cmd.name}
                                onChange={(e) => {
                                  const newCommands = { ...formData.commands };
                                  newCommands[key] = { ...cmd, name: e.target.value };
                                  setFormData({ ...formData, commands: newCommands });
                                }}
                                placeholder="command-name"
                              />
                            </div>
                            <div className="form-group">
                              <label>Description</label>
                              <input
                                type="text"
                                value={cmd.description || ''}
                                onChange={(e) => {
                                  const newCommands = { ...formData.commands };
                                  newCommands[key] = { ...cmd, description: e.target.value };
                                  setFormData({ ...formData, commands: newCommands });
                                }}
                                placeholder="What does this command do?"
                              />
                            </div>
                            <div className="form-group">
                              <label>Prompt</label>
                              <textarea
                                value={cmd.prompt || ''}
                                onChange={(e) => {
                                  const newCommands = { ...formData.commands };
                                  newCommands[key] = { ...cmd, prompt: e.target.value };
                                  setFormData({ ...formData, commands: newCommands });
                                }}
                                placeholder="The prompt to execute when this command is invoked..."
                                style={{ 
                                  minHeight: '120px',
                                  resize: 'vertical',
                                  fontFamily: 'monospace',
                                  fontSize: '13px',
                                }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="agent-editor__actions">
          <button
            type="button"
            className="button button--primary"
            onClick={saveAgent}
            disabled={isSaving}
          >
            {isSaving ? 'Saving...' : isEditMode ? 'Save Changes' : 'Create Agent'}
          </button>
        </div>
      </div>
    </div>
  );
}
