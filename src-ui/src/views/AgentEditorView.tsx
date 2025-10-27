import { useState, useEffect } from 'react';
import type { AgentSummary, Tool } from '../types';

export interface AgentEditorViewProps {
  apiBase: string;
  slug?: string;
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
  tools: string[];
  uiComponent: string;
  quickPrompts: Array<{ id: string; label: string; prompt: string }>;
  workflowShortcuts: string[];
}

type FormStep = 'basic' | 'model' | 'tools' | 'ui';

export function AgentEditorView({ apiBase, slug, onBack, onSaved }: AgentEditorViewProps) {
  const [currentStep, setCurrentStep] = useState<FormStep>('basic');
  const [formData, setFormData] = useState<AgentFormData>({
    slug: '',
    name: '',
    description: '',
    prompt: '',
    modelId: '',
    region: '',
    guardrails: '',
    tools: [],
    uiComponent: '',
    quickPrompts: [],
    workflowShortcuts: [],
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

  const isEditMode = !!slug;

  useEffect(() => {
    if (slug) {
      loadAgent(slug);
    }
    loadTools();
  }, [slug]);

  const loadAgent = async (agentSlug: string) => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await fetch(`${apiBase}/agents`);
      if (!response.ok) throw new Error('Failed to load agents');
      const data = await response.json();
      const agent = (data.data || []).find((a: any) => a.slug === agentSlug || a.id === agentSlug);
      if (!agent) throw new Error('Agent not found');

      setFormData({
        slug: agent.slug || agent.id,
        name: agent.name || '',
        description: agent.description || '',
        prompt: agent.prompt || '',
        modelId: typeof agent.model === 'string' ? agent.model : agent.model?.modelId || '',
        region: agent.region || '',
        guardrails: agent.guardrails || '',
        tools: agent.tools || [],
        uiComponent: agent.ui?.component || '',
        quickPrompts: agent.ui?.quickPrompts || [],
        workflowShortcuts: agent.ui?.workflowShortcuts || [],
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

    const steps: FormStep[] = ['basic', 'model', 'tools', 'ui'];
    const currentIndex = steps.indexOf(currentStep);
    if (currentIndex < steps.length - 1) {
      setCurrentStep(steps[currentIndex + 1]);
    }
  };

  const prevStep = () => {
    const steps: FormStep[] = ['basic', 'model', 'tools', 'ui'];
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
        model: { modelId: formData.modelId },
        region: formData.region || undefined,
        guardrails: formData.guardrails || undefined,
        tools: formData.tools,
        ui: {
          component: formData.uiComponent || undefined,
          quickPrompts: formData.quickPrompts.length > 0 ? formData.quickPrompts : undefined,
          workflowShortcuts:
            formData.workflowShortcuts.length > 0 ? formData.workflowShortcuts : undefined,
        },
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
      onSaved?.(savedAgent.data?.slug || formData.slug);
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

  const addQuickPrompt = () => {
    setFormData((prev) => ({
      ...prev,
      quickPrompts: [
        ...prev.quickPrompts,
        { id: `prompt-${Date.now()}`, label: '', prompt: '' },
      ],
    }));
  };

  const updateQuickPrompt = (index: number, field: 'label' | 'prompt', value: string) => {
    setFormData((prev) => ({
      ...prev,
      quickPrompts: prev.quickPrompts.map((item, i) =>
        i === index ? { ...item, [field]: value } : item
      ),
    }));
  };

  const removeQuickPrompt = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      quickPrompts: prev.quickPrompts.filter((_, i) => i !== index),
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
          <button type="button" className="button button--secondary" onClick={onBack}>
            Back
          </button>
          <h2>{isEditMode ? 'Edit Agent' : 'New Agent'}</h2>
        </div>
        <div className="management-view__loading">Loading agent...</div>
      </div>
    );
  }

  return (
    <div className="management-view">
      <div className="management-view__header">
        <button type="button" className="button button--secondary" onClick={onBack}>
          Back
        </button>
        <h2>{isEditMode ? `Edit Agent: ${formData.name}` : 'New Agent'}</h2>
      </div>

      {error && <div className="management-view__error">{error}</div>}

      <div className="agent-editor">
        <div className="agent-editor__steps">
          <button
            type="button"
            className={`step-indicator ${currentStep === 'basic' ? 'is-active' : ''}`}
            onClick={() => setCurrentStep('basic')}
          >
            1. Basic Info
          </button>
          <button
            type="button"
            className={`step-indicator ${currentStep === 'model' ? 'is-active' : ''}`}
            onClick={() => setCurrentStep('model')}
          >
            2. Model Config
          </button>
          <button
            type="button"
            className={`step-indicator ${currentStep === 'tools' ? 'is-active' : ''}`}
            onClick={() => setCurrentStep('tools')}
          >
            3. Tools
          </button>
          <button
            type="button"
            className={`step-indicator ${currentStep === 'ui' ? 'is-active' : ''}`}
            onClick={() => setCurrentStep('ui')}
          >
            4. UI Customization
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
                <div className="field-with-help">
                  <input
                    id="modelId"
                    type="text"
                    value={formData.modelId}
                    onChange={(e) => setFormData({ ...formData, modelId: e.target.value })}
                    placeholder="anthropic.claude-3-7-sonnet-20250219-v1:0"
                  />
                  <a
                    href="https://docs.aws.amazon.com/bedrock/latest/userguide/models-supported.html"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="help-icon"
                    title="View supported Bedrock models"
                  >
                    ?
                  </a>
                </div>
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
                  placeholder="us-east-1"
                />
                <span className="form-help">Leave empty to use default region</span>
              </div>

              <div className="form-group">
                <label htmlFor="guardrails">Guardrails</label>
                <input
                  id="guardrails"
                  type="text"
                  value={formData.guardrails}
                  onChange={(e) => setFormData({ ...formData, guardrails: e.target.value })}
                  placeholder="guardrail-id"
                />
                <span className="form-help">Optional guardrail configuration</span>
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

          {currentStep === 'ui' && (
            <div className="form-panel">
              <div className="form-group">
                <label htmlFor="uiComponent">Workspace Component</label>
                <input
                  id="uiComponent"
                  type="text"
                  value={formData.uiComponent}
                  onChange={(e) => setFormData({ ...formData, uiComponent: e.target.value })}
                  placeholder="WorkAgentDashboard"
                />
                <span className="form-help">React component name for the agent workspace</span>
              </div>

              <div className="form-group">
                <label>Quick Prompts</label>
                {formData.quickPrompts.map((qp, index) => (
                  <div key={qp.id} className="quick-prompt-editor">
                    <input
                      type="text"
                      value={qp.label}
                      onChange={(e) => updateQuickPrompt(index, 'label', e.target.value)}
                      placeholder="Button label (e.g., 'Summarize')"
                    />
                    <textarea
                      value={qp.prompt}
                      onChange={(e) => updateQuickPrompt(index, 'prompt', e.target.value)}
                      placeholder="Full prompt text that will be sent to the agent..."
                      rows={3}
                    />
                    <button
                      type="button"
                      className="button button--danger button--small"
                      onClick={() => removeQuickPrompt(index)}
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <button type="button" className="button button--secondary" onClick={addQuickPrompt}>
                  Add Quick Prompt
                </button>
              </div>

              <div className="form-group">
                <label htmlFor="workflowShortcuts">Workflow Shortcuts</label>
                <input
                  id="workflowShortcuts"
                  type="text"
                  value={formData.workflowShortcuts.join(', ')}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      workflowShortcuts: e.target.value
                        .split(',')
                        .map((s) => s.trim())
                        .filter(Boolean),
                    })
                  }
                  placeholder="workflow-1, workflow-2"
                />
                <span className="form-help">Comma-separated workflow IDs</span>
              </div>
            </div>
          )}
        </div>

        <div className="agent-editor__actions">
          {currentStep !== 'basic' && (
            <button type="button" className="button button--secondary" onClick={prevStep}>
              Previous
            </button>
          )}
          {currentStep !== 'ui' ? (
            <button type="button" className="button button--primary" onClick={nextStep}>
              Next
            </button>
          ) : (
            <button
              type="button"
              className="button button--primary"
              onClick={saveAgent}
              disabled={isSaving}
            >
              {isSaving ? 'Saving...' : isEditMode ? 'Save Changes' : 'Create Agent'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
