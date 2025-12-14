import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { SessionManagementMenu } from './SessionManagementMenu';
import { SessionPickerModal } from './SessionPickerModal';
import { ConversationStats, ContextPercentage } from './ConversationStats';
import { FileAttachmentInput } from './FileAttachmentInput';
import { SlashCommandSelector } from './SlashCommandSelector';
import { ModelSelectorAutocomplete } from './ModelSelector';
import { AgentBadge } from './AgentBadge';
import { useDerivedSessions } from '../hooks/useDerivedSessions';
import { useSlashCommands } from '../hooks/useSlashCommands';
import { useKeyboardShortcut, useShortcutDisplay } from '../hooks/useKeyboardShortcut';
import { useActiveChatActions, useActiveChatState, useSendMessage, useCreateChatSession, useCancelMessage, useOpenConversation, useRehydrateSessions } from '../contexts/ActiveChatsContext';
import { useConversationStatus, useConversationActions } from '../contexts/ConversationsContext';
import { useToast } from '../contexts/ToastContext';
import { useApiBase, useConfig, CONFIG_DEFAULTS } from '../contexts/ConfigContext';
import { useNavigation } from '../contexts/NavigationContext';
import { useAgents } from '../contexts/AgentsContext';
import { useModels } from '../contexts/ModelsContext';
import { useStreaming } from '../contexts/StreamingContext';
import { useToolApproval } from '../hooks/useToolApproval';
import { useSlashCommandHandler } from '../hooks/useSlashCommandHandler';
import { getAgentIcon, getAgentIconStyle, getUserIconStyle, getInitials } from '../utils/workspace';
import { useModelSupportsAttachments } from '../contexts/ModelCapabilitiesContext';
import { log } from '@/utils/logger';
import type { AgentSummary } from '../types';
import type { SlashCommand } from '../hooks/useSlashCommands';

function ReasoningSection({ content, fontSize, show }: { content: string; fontSize: number; show: boolean }) {
  if (!show) return null;
  
  return (
    <div 
      style={{ 
        display: 'block', 
        margin: '0.5rem 0',
        padding: '0.5rem',
        background: 'var(--color-bg-secondary)',
        border: '1px solid var(--color-border)',
        borderRadius: '4px',
        fontSize: `${fontSize}px`,
      }}
    >
      <div style={{
        fontSize: '0.85em',
        color: 'var(--text-secondary)',
        fontStyle: 'italic',
        whiteSpace: 'pre-wrap',
        lineHeight: '1.5'
      }}>
        {content}
      </div>
    </div>
  );
}

function ToolCallDisplay({ toolCall, onApprove, showDetails = true }: { 
  toolCall: { 
    type: string; // 'tool-{name}' format
    toolCallId?: string;
    tool?: {
      id: string;
      name: string;
      server?: string;
      toolName?: string;
      args: any;
      result?: any;
      error?: string;
      state?: string;
      needsApproval?: boolean;
      cancelled?: boolean;
      approvalStatus?: 'auto-approved' | 'user-approved' | 'user-denied';
    };
    input?: any; 
    output?: any; 
    state?: string; 
    errorText?: string;
    // Streaming-only metadata
    needsApproval?: boolean;
    cancelled?: boolean;
    approvalStatus?: 'auto-approved' | 'user-approved' | 'user-denied';
  }; 
  onApprove?: (action: 'once' | 'trust' | 'deny') => void;
  showDetails?: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  if (!showDetails) return null;
  
  // Handle both formats: direct properties or nested tool object
  const tool = toolCall.tool || toolCall;
  const id = tool.id || toolCall.toolCallId || '';
  const server = tool.server || toolCall.server;
  const toolName = tool.toolName || toolCall.toolName || tool.name || toolCall.type?.replace('tool-', '') || '';
  const originalName = tool.originalName || toolCall.originalName; // The actual original name (e.g., sat-outlook_calendar_view)
  const args = tool.args || toolCall.input;
  const result = tool.result || toolCall.output;
  const error = tool.error || toolCall.errorText;
  const needsApproval = tool.needsApproval || toolCall.needsApproval;
  const cancelled = tool.cancelled || toolCall.cancelled;
  const approvalStatus = tool.approvalStatus || toolCall.approvalStatus;
  
  // Create abbreviated args preview
  const argsPreview = args 
    ? Object.keys(args).length > 0
      ? Object.keys(args).map(k => `${k}: ${JSON.stringify(args[k])}`).join(', ')
      : 'no args'
    : 'no args';

  return (
    <div 
      className="tool-call" 
      style={{ 
        display: 'block', 
        margin: '0.5rem 0',
        padding: '0.5rem',
        background: 'var(--color-bg-secondary)',
        border: '1px solid var(--color-border)',
        borderRadius: '4px',
        cursor: 'pointer',
      }}
      onClick={() => setIsExpanded(!isExpanded)}
    >
      <div 
        className="tool-call__header" 
        style={{ 
          display: 'block',
          padding: 0,
          color: 'inherit',
          textAlign: 'left',
          width: '100%'
        }}
      >
        <div 
          style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginBottom: '0.25rem' }}
        >
          <span className="tool-call__toggle">
            {isExpanded ? '▼' : '▶'}
          </span>
          {server && (
            <span style={{ 
              fontSize: '0.7em',
              padding: '2px 6px',
              background: 'var(--color-bg-tertiary)',
              color: 'var(--text-secondary)',
              borderRadius: '3px',
              fontFamily: 'monospace'
            }}>
              {server}
            </span>
          )}
          <span className="tool-call__name" style={{ fontWeight: 500 }}>{toolName}</span>
          {approvalStatus === 'auto-approved' && (
            <span style={{ 
              fontSize: '0.7em',
              padding: '2px 6px',
              background: 'var(--color-bg-tertiary)',
              color: 'var(--text-secondary)',
              borderRadius: '3px',
              marginLeft: '0.25rem'
            }}>
              Auto-approved
            </span>
          )}
          {approvalStatus === 'user-approved' && (
            <span style={{ 
              fontSize: '0.7em',
              padding: '2px 6px',
              background: 'var(--success-secondary)',
              color: 'var(--success-primary)',
              borderRadius: '3px',
              marginLeft: '0.25rem'
            }}>
              User approved
            </span>
          )}
          {approvalStatus === 'user-denied' && (
            <span style={{ 
              fontSize: '0.7em',
              padding: '2px 6px',
              background: 'var(--error-secondary)',
              color: 'var(--error-primary)',
              borderRadius: '3px',
              marginLeft: '0.25rem'
            }}>
              User denied
            </span>
          )}
          {result && !error && <span style={{ color: 'var(--success-primary)' }} title="Success">✓</span>}
          {error && <span style={{ color: 'var(--error-primary)' }} title="Error">✗</span>}
          {needsApproval && onApprove && !error && !result && !cancelled && (
            <>
              <button 
                onClick={(e) => { e.stopPropagation(); onApprove('once'); }} 
                style={{ 
                  padding: '2px 6px', 
                  fontSize: '0.7em',
                  background: 'var(--color-primary)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  fontWeight: 400,
                  marginLeft: '0.25rem'
                }}
                onMouseDown={(e) => (e.target as HTMLElement).style.transform = 'scale(0.95)'}
                onMouseUp={(e) => (e.target as HTMLElement).style.transform = 'scale(1)'}
                onMouseOver={(e) => (e.target as HTMLElement).style.opacity = '0.8'}
                onMouseOut={(e) => { (e.target as HTMLElement).style.opacity = '1'; (e.target as HTMLElement).style.transform = 'scale(1)'; }}
              >
                Allow Once
              </button>
              <button 
                onClick={(e) => { e.stopPropagation(); onApprove('trust'); }} 
                style={{ 
                  padding: '2px 6px', 
                  fontSize: '0.7em',
                  background: 'var(--color-bg)',
                  color: 'var(--color-text)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  fontWeight: 400
                }}
                onMouseDown={(e) => (e.target as HTMLElement).style.transform = 'scale(0.95)'}
                onMouseUp={(e) => (e.target as HTMLElement).style.transform = 'scale(1)'}
                onMouseOver={(e) => (e.target as HTMLElement).style.background = 'var(--color-bg-secondary)'}
                onMouseOut={(e) => { (e.target as HTMLElement).style.background = 'var(--color-bg)'; (e.target as HTMLElement).style.transform = 'scale(1)'; }}
              >
                Always Allow
              </button>
              <button 
                onClick={(e) => { e.stopPropagation(); onApprove('deny'); }} 
                style={{ 
                  padding: '2px 6px', 
                  fontSize: '0.7em',
                  background: 'var(--color-error)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  fontWeight: 400
                }}
                onMouseDown={(e) => (e.target as HTMLElement).style.transform = 'scale(0.95)'}
                onMouseUp={(e) => (e.target as HTMLElement).style.transform = 'scale(1)'}
                onMouseOver={(e) => (e.target as HTMLElement).style.opacity = '0.8'}
                onMouseOut={(e) => { (e.target as HTMLElement).style.opacity = '1'; (e.target as HTMLElement).style.transform = 'scale(1)'; }}
              >
                Deny
              </button>
            </>
          )}
          {needsApproval && !error && !result && !cancelled && <span style={{ color: 'orange' }}>⏸</span>}
          {error && <span className="tool-call__error">⚠️</span>}
        </div>
        <div style={{ fontSize: '0.85em', opacity: 0.7, paddingLeft: '1rem', width: '100%', wordBreak: 'break-word', whiteSpace: 'normal' }}>{argsPreview}</div>
      </div>
      {isExpanded && (
        <div className="tool-call__details" style={{ marginTop: '0.5rem', fontSize: '0.9em' }}>
          <div className="tool-call__section" style={{ fontSize: '0.85em', opacity: 0.7, marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <span>
              <strong>ID:</strong> <span style={{ fontFamily: 'monospace', fontSize: '0.9em' }}>{id}</span>
            </span>
            {server && (
              <span>
                <strong>Server:</strong> <span style={{ fontFamily: 'monospace', fontSize: '0.9em' }}>{server}</span>
              </span>
            )}
            {toolName && (
              <span>
                <strong>Tool:</strong> <span style={{ fontFamily: 'monospace', fontSize: '0.9em' }}>{toolName}</span>
              </span>
            )}
            {originalName && originalName !== `${server}_${toolName}` && (
              <span>
                <strong>Original Name:</strong> <span style={{ fontFamily: 'monospace', fontSize: '0.9em' }}>{originalName}</span>
              </span>
            )}
            {(result || error) && (
              <span>
                <strong>Status:</strong>{' '}
                <span style={{ color: error ? 'var(--error-primary)' : 'var(--success-primary)' }}>
                  {error ? 'Failed' : 'Success'}
                </span>
              </span>
            )}
          </div>
          <div className="tool-call__section">
            <strong>Arguments:</strong>
            <pre style={{ margin: '0.25rem 0', padding: '0.5rem', background: 'var(--color-bg)', borderRadius: '2px', overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{JSON.stringify(args, null, 2)}</pre>
          </div>
          {result && (
            <div className="tool-call__section">
              <strong>Response:</strong>
              <pre style={{ margin: '0.25rem 0', padding: '0.5rem', background: 'var(--color-bg)', borderRadius: '2px', overflowX: 'auto', maxHeight: '200px', overflowY: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{JSON.stringify(result, null, 2)}</pre>
            </div>
          )}
          {error && (
            <div className="tool-call__section tool-call__section--error">
              <strong>Error:</strong>
              <pre style={{ margin: '0.25rem 0', padding: '0.5rem', background: 'var(--color-bg)', borderRadius: '2px', overflowX: 'auto', color: 'var(--error-primary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{error}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface ChatDockProps {
  onRequestAuth?: () => void;
}

export function ChatDock({ onRequestAuth }: ChatDockProps) {
  // Get data from contexts
  const { apiBase } = useApiBase();
  const { selectedAgent, isDockOpen, isDockMaximized, activeChat, setDockState, setActiveChat } = useNavigation();
  const agents = useAgents();
  const availableModels = useModels(apiBase);
  const { showToast } = useToast();
  const appConfig = useConfig(apiBase);
  const defaultFontSize = appConfig?.defaultChatFontSize ?? CONFIG_DEFAULTS.defaultChatFontSize;
  const handleToolApproval = useToolApproval(apiBase);
  const handleSlashCommand = useSlashCommandHandler(apiBase);
  const { getStreamingMessage } = useStreaming();
  
  // DEBUG: Log when component renders
  const renderTimestamp = new Date().toISOString();

  
  // Chat dock UI state (height and dragging only - open/maximized from navigation)
  const [dockHeight, setDockHeight] = useState(400);
  const [previousDockHeight, setPreviousDockHeight] = useState(400);
  const [previousDockOpen, setPreviousDockOpen] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  
  // Update CSS variable for content-view padding
  useEffect(() => {
    const height = !isDockOpen ? 43 : isDockMaximized ? window.innerHeight - 107 : dockHeight;
    document.documentElement.style.setProperty('--chat-dock-height', `${height}px`);
  }, [isDockOpen, isDockMaximized, dockHeight]);
  
  // Chat UI state
  const [chatFontSize, setChatFontSize] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const querySize = params.get('fontSize');
    return querySize ? parseInt(querySize, 10) : defaultFontSize;
  });
  const [showStatsPanel, setShowStatsPanel] = useState(false);
  const [showReasoning, setShowReasoning] = useState(true);
  const [showToolDetails, setShowToolDetails] = useState(true);
  const [showChatSettings, setShowChatSettings] = useState(false);
  const [isUserScrolledUp, setIsUserScrolledUp] = useState(false);
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [showSessionPicker, setShowSessionPicker] = useState(false);
  const [newChatSearch, setNewChatSearch] = useState('');
  const [newChatSelectedIndex, setNewChatSelectedIndex] = useState(0);
  const [showScrollButtons, setShowScrollButtons] = useState({ left: false, right: false });
  const [commandQuery, setCommandQuery] = useState<string | null>(null);
  const [modelQuery, setModelQuery] = useState<string | null>(null);
  
  // History navigation index (local UI state only)
  const [historyIndex, setHistoryIndex] = useState<Map<string, number>>(new Map());
  
  // Session state
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  
  // Track removing messages for animation
  const [removingMessages, setRemovingMessages] = useState<Set<string>>(new Set());
  const [removingMessageContent, setRemovingMessageContent] = useState<Map<string, any>>(new Map());
  
  // Derive sessions from contexts (includes messages for all sessions)
  const sessions = useDerivedSessions(apiBase, selectedAgent);
  const { initChat, updateChat, clearInput, removeChat, addEphemeralMessage, clearEphemeralMessages, addToInputHistory, navigateHistoryUp, navigateHistoryDown } = useActiveChatActions();
  const openConversationAction = useOpenConversation(apiBase);
  const rehydrateSessions = useRehydrateSessions(apiBase);
  
  // Wrap slash command handler with callbacks (after updateChat is available)
  const wrappedSlashCommandHandler = useCallback(async (sessionId: string, command: string) => {
    return handleSlashCommand(
      sessionId, 
      command,
      () => {
        // Set input to /model with space to trigger autocomplete
        updateChat(sessionId, { input: '/model ' });
        setModelQuery('');
      },
      () => setShowStatsPanel(true)
    );
  }, [handleSlashCommand, updateChat]);
  
  // Rehydrate sessions on mount
  useEffect(() => {
    rehydrateSessions();
  }, [rehydrateSessions]);
  
  // Shortcut displays
  const toggleDockShortcut = useShortcutDisplay('dock.toggle');
  const maximizeShortcut = useShortcutDisplay('dock.maximize');
  const newChatShortcut = useShortcutDisplay('dock.newChat');
  const openConversationShortcut = useShortcutDisplay('dock.openConversation');
  const closeTabShortcut = useShortcutDisplay('dock.closeTab');
  
  // Sync activeChat from URL to local state on mount/change
  useEffect(() => {
    if (activeChat && sessions.some(s => s.id === activeChat)) {
      setActiveSessionId(activeChat);
    }
  }, [activeChat, sessions]);
  
  // Send message handler
  const sendMessage = useSendMessage(
    apiBase,
    (newSessionId) => {
      // Update activeSessionId when session migrates to conversationId
      setActiveSessionId(newSessionId);
      setActiveChat(newSessionId);
    },
    (error) => {
      if (error.message.includes('401')) {
        onRequestAuth?.();
      } else {
        showToast(`Error: ${error.message}`, 'error');
      }
    },
    wrappedSlashCommandHandler
  );

  // Wrapper for backward compatibility - now just calls sendMessage directly
  const handleSendMessage = useCallback(async (sessionId: string, agentSlug: string, conversationId: string | undefined, content: string) => {
    // Save to history
    addToInputHistory(sessionId, content);
    setHistoryIndex(prev => new Map(prev).set(sessionId, -1));
    
    await sendMessage(sessionId, agentSlug, conversationId, content);
  }, [sendMessage, addToInputHistory]);
  
  // Cancel message handler
  const cancelMessage = useCancelMessage();
  
  // Create chat session handler
  const createChatSession = useCreateChatSession();
  
  const activeSession = sessions.find(s => s.id === activeSessionId) || null;
  const activeChatState = useActiveChatState(activeSessionId);
  
  // Check if current model supports attachments
  const currentModelId = activeSession?.model || agents.find(a => a.slug === activeSession?.agentSlug)?.model;
  const modelSupportsAttachments = useModelSupportsAttachments(
    typeof currentModelId === 'string' ? currentModelId : currentModelId?.modelId
  );
  
  // Get slash commands for current agent
  const slashCommands = useSlashCommands(activeSession?.agentSlug || null);
  const ephemeralMessages = activeChatState?.ephemeralMessages || [];
  const unreadCount = sessions.filter(s => s.hasUnread).length;
  
  
  // Refs
  const chatSectionRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const tabListRef = useRef<HTMLDivElement>(null);
  const isDockOpenRef = useRef(isDockOpen);
  
  // Update ref when state changes
  useEffect(() => {
    isDockOpenRef.current = isDockOpen;
  }, [isDockOpen]);
  
  // Handlers
  const focusSession = useCallback((sessionId: string) => {
    setActiveSessionId(sessionId);
    setActiveChat(sessionId);
    setDockState(true, isDockMaximized);
    updateChat(sessionId, { hasUnread: false });
    
    // Scroll to bottom after session is focused
    setTimeout(() => {
      if (messagesContainerRef.current) {
        messagesContainerRef.current.scrollTo({
          top: messagesContainerRef.current.scrollHeight,
          behavior: 'smooth'
        });
        setIsUserScrolledUp(false);
      }
    }, 100);
  }, [updateChat, setDockState, isDockMaximized, setActiveChat]);
  
  const removeSession = useCallback((sessionId: string) => {
    removeChat(sessionId);
    if (activeSessionId === sessionId) {
      const remaining = sessions.filter(s => s.id !== sessionId);
      const next = remaining[remaining.length - 1]?.id ?? null;
      setActiveSessionId(next);
      setActiveChat(next);
    }
  }, [removeChat, activeSessionId, sessions, setActiveChat]);
  
  const openChatForAgent = useCallback((agent: AgentSummary) => {
    const sessionId = createChatSession(agent.slug, agent.name);
    setActiveSessionId(sessionId);
    setActiveChat(sessionId);
    setDockState(true, false);
    
    // Focus the textarea after chat is opened
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
      }
      if (messagesContainerRef.current) {
        messagesContainerRef.current.scrollTo({
          top: messagesContainerRef.current.scrollHeight,
          behavior: 'smooth'
        });
        setIsUserScrolledUp(false);
      }
    }, 100);
  }, [createChatSession, setDockState, setActiveChat]);
  
  const openConversation = useCallback(async (conversationId: string, agentSlug: string) => {
    const agent = agents.find(a => a.slug === agentSlug);
    if (!agent) return;
    
    // Check if already open
    const existing = sessions.find(s => s.conversationId === conversationId);
    if (existing) {
      focusSession(existing.id);
      return;
    }
    
    const sessionId = await openConversationAction(conversationId, agentSlug, agent.name);
    setActiveSessionId(sessionId);
    setActiveChat(sessionId);
    setDockState(true, false);
    
    // Scroll to bottom after conversation is opened
    setTimeout(() => {
      if (messagesContainerRef.current) {
        messagesContainerRef.current.scrollTo({
          top: messagesContainerRef.current.scrollHeight,
          behavior: 'smooth'
        });
        setIsUserScrolledUp(false);
      }
    }, 100);
  }, [agents, sessions, focusSession, openConversationAction, setActiveChat, setDockState]);
  
  const executeCommand = useCallback(async (command: SlashCommand, sessionId: string) => {
    const cmdName = command.cmd.slice(1);
    
    // Save to history before clearing input
    addToInputHistory(sessionId, command.cmd);
    
    // Don't clear input for /model - we need to set it to trigger autocomplete
    if (cmdName !== 'model') {
      clearInput(sessionId);
    }
    setCommandQuery(null);
    
    switch (cmdName) {
      case 'clear':
      case 'new':
        updateChat(sessionId, { messages: [] });
        showToast('Conversation cleared');
        break;
        
      case 'stats':
        setShowStatsPanel(true);
        break;
        
      case 'mcp': {
        try {
          const agent = agents.find(a => a.slug === activeSession?.agentSlug);
          const response = await fetch(`${apiBase}/agents/${agent?.slug}`);
          const data = await response.json();
          const agentData = data.data;
          
          const tools = agentData?.tools || [];
          const mcpServers = [...new Set(
            tools
              .map((t: any) => {
                const name = typeof t === 'string' ? t : (t.name || t.id || '');
                return name.includes('_') ? name.split('_')[0] : null;
              })
              .filter((s: string | null) => s !== null)
          )].sort();
          
          const content = mcpServers.length > 0
            ? `**MCP Servers (${mcpServers.length}):**\n\n${mcpServers.map((s: string) => `- ${s}`).join('\n')}`
            : 'No MCP servers loaded for this agent.';
          
          addEphemeralMessage(sessionId, { role: 'system', content });
        } catch (error) {
          addEphemeralMessage(sessionId, { role: 'system', content: `Error: ${error}` });
        }
        break;
      }
        
      case 'tools': {
        try {
          const agent = agents.find(a => a.slug === activeSession?.agentSlug);
          const response = await fetch(`${apiBase}/agents/${agent?.slug}`);
          const data = await response.json();
          const agentData = data.data;
          
          const tools = agentData?.tools || [];
          const autoApproveList = agentData?.autoApprove || [];
          
          if (tools.length > 0) {
            const sortedTools = [...tools].sort((a: any, b: any) => {
              const nameA = typeof a === 'string' ? a : (a.name || a.id || '');
              const nameB = typeof b === 'string' ? b : (b.name || b.id || '');
              return nameA.localeCompare(nameB);
            });
            
            const toolLines = sortedTools.map((t: any) => {
              const name = typeof t === 'string' ? t : (t.name || t.id || 'unknown');
              const isAutoApproved = autoApproveList.some((pattern: string) => {
                if (pattern.includes('*')) {
                  const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
                  return regex.test(name);
                }
                return pattern === name;
              });
              return `- ${name}${isAutoApproved ? ' ✓' : ''}`;
            });
            
            const content = `**Available Tools (${tools.length}):**\n\n${toolLines.join('\n')}\n\n✓ = Auto-approved`;
            addEphemeralMessage(sessionId, { role: 'system', content });
          } else {
            addEphemeralMessage(sessionId, { role: 'system', content: 'No tools available for this agent.' });
          }
        } catch (error) {
          addEphemeralMessage(sessionId, { role: 'system', content: `Error: ${error}` });
        }
        break;
      }
        
      case 'model': {
        // Trigger model autocomplete
        updateChat(sessionId, { input: '/model ' });
        setModelQuery('');
        break;
      }
        
      case 'prompts': {
        const agent = agents.find(a => a.slug === activeSession?.agentSlug);
        if (agent?.commands && Object.keys(agent.commands).length > 0) {
          const cmdList = Object.entries(agent.commands).map(([name, cmd]: [string, any]) => 
            `- **/${name}**: ${cmd.description || 'No description'}`
          ).join('\n');
          addEphemeralMessage(sessionId, { role: 'system', content: `**Custom Commands:**\n\n${cmdList}` });
        } else {
          addEphemeralMessage(sessionId, { role: 'system', content: 'No custom commands defined for this agent.' });
        }
        break;
      }
        
      default:
        if (command.isCustom) {
          const agent = agents.find(a => a.slug === activeSession?.agentSlug);
          const customCmd = agent?.commands?.[cmdName];
          if (customCmd) {
            // Add ephemeral message explaining the prompt launch
            addEphemeralMessage(sessionId, { 
              role: 'system', 
              content: `🚀 Launching prompt: **${customCmd.description || cmdName}**` 
            });
            
            // Send the prompt
            await sendMessage(
              sessionId,
              activeSession!.agentSlug,
              activeSession!.conversationId,
              customCmd.prompt
            );
          }
        } else {
          showToast(`Unknown command: ${command.cmd}`, 'error');
        }
    }
  }, [clearInput, updateChat, showToast, agents, activeSession, sendMessage, apiBase, addEphemeralMessage, addToInputHistory]);
  
  // Drag to resize
  useEffect(() => {
    if (!isDragging) return;
    
    const handleMouseMove = (e: MouseEvent) => {
      const newHeight = window.innerHeight - e.clientY;
      setDockHeight(Math.max(200, Math.min(newHeight, window.innerHeight - 150)));
    };
    
    const handleMouseUp = () => {
      setIsDragging(false);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);
  
  // Scroll buttons visibility
  useEffect(() => {
    const checkScroll = () => {
      if (tabListRef.current) {
        const { scrollLeft, scrollWidth, clientWidth } = tabListRef.current;
        setShowScrollButtons({
          left: scrollLeft > 0,
          right: scrollLeft < scrollWidth - clientWidth - 1,
        });
      }
    };
    
    checkScroll();
    window.addEventListener('resize', checkScroll);
    return () => window.removeEventListener('resize', checkScroll);
  }, [sessions.length]);
  
  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (!isUserScrolledUp && messagesContainerRef.current && activeSession) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, [activeSession?.messages, ephemeralMessages, isUserScrolledUp]);
  
  // Ctrl+C to cancel active request
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'c' && activeSession?.status === 'sending') {
        e.preventDefault();
        cancelMessage(activeSession.id);
        showToast('Request cancelled');
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeSession, cancelMessage, showToast]);
  
  // Keyboard shortcuts
  useKeyboardShortcut('dock.toggle', 'd', ['cmd'], 'Toggle dock', useCallback(() => {
    setDockState(!isDockOpen, isDockMaximized);
  }, [isDockOpen, isDockMaximized, setDockState]));

  useKeyboardShortcut('dock.maximize', 'm', ['cmd'], 'Maximize/restore dock', useCallback(() => {
    if (isDockMaximized) {
      setDockHeight(previousDockHeight);
      setDockState(previousDockOpen, false);
    } else {
      setPreviousDockHeight(dockHeight);
      setPreviousDockOpen(isDockOpen);
      setDockHeight(window.innerHeight - 107);
      setDockState(true, true);
    }
  }, [isDockMaximized, dockHeight, isDockOpen, previousDockHeight, previousDockOpen, setDockState]));

  useKeyboardShortcut('dock.newChat', 't', ['cmd'], 'New chat', useCallback(() => {
    if (selectedAgent) {
      const newSessionId = `session-${Date.now()}`;
      initChat(newSessionId, selectedAgent, null);
      setActiveSessionId(newSessionId);
      setActiveChat(newSessionId);
      
      // Scroll to bottom after chat is created
      setTimeout(() => {
        if (messagesContainerRef.current) {
          messagesContainerRef.current.scrollTo({
            top: messagesContainerRef.current.scrollHeight,
            behavior: 'smooth'
          });
          setIsUserScrolledUp(false);
        }
      }, 100);
    }
  }, [selectedAgent, initChat, setActiveChat]));

  useKeyboardShortcut('dock.openConversation', 'o', ['cmd'], 'Open conversation', useCallback(() => {
    setShowSessionPicker(true);
  }, []));

  useKeyboardShortcut('dock.closeTab', 'x', ['cmd'], 'Close tab', useCallback(() => {
    if (activeSessionId && sessions.length > 1) {
      const currentIndex = sessions.findIndex(s => s.id === activeSessionId);
      const nextSession = sessions[currentIndex + 1] || sessions[currentIndex - 1];
      if (nextSession) {
        focusSession(nextSession.id);
      }
      removeChat(activeSessionId);
    }
  }, [activeSessionId, sessions, focusSession, removeChat]));

  // Session switching shortcuts (⌘1-9)
  for (let i = 1; i <= 9; i++) {
    useKeyboardShortcut(`dock.session${i}`, String(i), ['cmd'], `Switch to session ${i}`, useCallback(() => {
      if (sessions[i - 1]) {
        focusSession(sessions[i - 1].id);
      }
    }, [sessions, focusSession]));
  }

  // Cancel ongoing request with Ctrl+C
  useKeyboardShortcut('dock.cancel', 'c', ['ctrl'], 'Cancel request', useCallback(() => {
    if (activeSession?.abortController) {
      cancelMessage(activeSession.id);
      addEphemeralMessage(activeSession.id, {
        role: 'system',
        content: 'User canceled the ongoing request.'
      });
    }
  }, [activeSession, cancelMessage, addEphemeralMessage]));
  
  return (
    <>
      <div
        className={`chat-dock ${!isDockOpen ? 'is-collapsed' : ''} ${isDockMaximized ? 'is-maximized' : ''} ${isDragging ? 'is-dragging' : ''}`}
        style={{ 
          height: !isDockOpen 
            ? '49px' 
            : isDockMaximized 
              ? `calc(100vh - 46px)` 
              : `${dockHeight}px`
        }}
        ref={chatSectionRef}
      >
        {isDockOpen && !isDockMaximized && (
          <div
            className="chat-dock__resize-handle"
            onMouseDown={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
          />
        )}
        <div className="chat-dock__header" 
          onClick={() => {
            const newOpen = !isDockOpen;
            if (isDockMaximized) {
              setDockHeight(previousDockHeight);
              setDockState(newOpen, false);
            } else {
              setDockState(newOpen, false);
            }
          }}
          style={{
            cursor: 'pointer',
            ...(isDockMaximized && {
              background: 'rgba(var(--color-primary-rgb, 59, 130, 246), 0.1)',
              borderBottom: '2px solid var(--color-primary)'
            })
          }}>
          <div className="chat-dock__title" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>Chat Dock</span>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{toggleDockShortcut}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowChatSettings(prev => !prev);
              }}
              title="Chat settings"
              style={{
                background: 'none',
                border: 'none',
                color: 'inherit',
                cursor: 'pointer',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
                opacity: 1,
                transition: 'opacity 0.2s',
              }}
              onMouseEnter={(e) => e.currentTarget.style.opacity = '0.7'}
              onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
            >
              <svg style={{ width: '14px', height: '14px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>
          <div className="chat-dock__header-actions" onClick={(e) => e.stopPropagation()}>
            {(() => {
              const activeSessions = sessions.filter(s => s.status === 'sending');
              if (activeSessions.length > 0) {
                return (
                  <div style={{ position: 'relative' }}>
                    <button
                      onClick={() => {
                        const dropdown = document.getElementById('activity-dropdown');
                        if (dropdown) {
                          dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
                        }
                      }}
                      onMouseEnter={(e) => {
                        const dropdown = document.getElementById('activity-dropdown');
                        if (dropdown) dropdown.style.display = 'block';
                      }}
                      onMouseLeave={(e) => {
                        const dropdown = document.getElementById('activity-dropdown');
                        if (dropdown) dropdown.style.display = 'none';
                      }}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--accent-primary)',
                        cursor: 'pointer',
                        padding: '4px 8px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <span className="loading-dots" style={{ display: 'inline-block' }}>
                        <span style={{ animationDelay: '0s' }}>●</span>
                        <span style={{ animationDelay: '0.2s' }}>●</span>
                        <span style={{ animationDelay: '0.4s' }}>●</span>
                      </span>
                      {activeSessions.length}
                    </button>
                    <div
                      id="activity-dropdown"
                      style={{
                        display: 'none',
                        position: 'absolute',
                        bottom: '100%',
                        right: 0,
                        marginBottom: '4px',
                        background: 'var(--bg-primary)',
                        border: '1px solid var(--border-primary)',
                        borderRadius: '8px',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                        minWidth: '200px',
                        zIndex: 1001,
                      }}
                    >
                      {activeSessions.map((session, idx) => {
                        const sessionIndex = sessions.findIndex(s => s.id === session.id);
                        return (
                          <button
                            key={session.id}
                            onClick={() => {
                              focusSession(session.id);
                              const dropdown = document.getElementById('activity-dropdown');
                              if (dropdown) dropdown.style.display = 'none';
                            }}
                            style={{
                              width: '100%',
                              padding: '10px 12px',
                              border: 'none',
                              borderBottom: idx < activeSessions.length - 1 ? '1px solid var(--border-primary)' : 'none',
                              background: 'transparent',
                              textAlign: 'left',
                              cursor: 'pointer',
                              color: 'var(--text-primary)',
                              fontSize: '14px',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              gap: '8px',
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                          >
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {session.title}
                            </span>
                            {sessionIndex < 9 && (
                              <span style={{ fontSize: '10px', color: 'var(--text-muted)', flexShrink: 0 }}>
                                ⌘{sessionIndex + 1}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              }
              return null;
            })()}
            <span className="chat-dock__counter">
              {sessions.length} session{sessions.length === 1 ? '' : 's'}
            </span>
            {unreadCount > 0 && <span className="chat-dock__badge">{unreadCount}</span>}
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (isDockMaximized) {
                  setDockHeight(previousDockHeight);
                  setDockState(previousDockOpen, false);
                } else {
                  setPreviousDockHeight(dockHeight);
                  setPreviousDockOpen(isDockOpen);
                  setDockHeight(window.innerHeight - 107);
                  setDockState(true, true);
                }
              }}
              style={{
                background: 'none',
                border: 'none',
                color: 'inherit',
                cursor: 'pointer',
                padding: '0.25rem 0.5rem',
                fontSize: '1rem',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                opacity: 1,
                transition: 'opacity 0.2s',
              }}
              onMouseEnter={(e) => e.currentTarget.style.opacity = '0.7'}
              onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
              title={isDockMaximized ? `Restore (${maximizeShortcut})` : `Maximize (${maximizeShortcut})`}
            >
              {isDockMaximized ? '⬇' : '⬆'}
              <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{maximizeShortcut}</span>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setDockState(!isDockOpen, isDockMaximized);
              }}
              style={{
                background: 'none',
                border: 'none',
                color: 'inherit',
                cursor: 'pointer',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
              }}
              title={!isDockOpen ? 'Expand' : 'Collapse'}
            >
              <svg style={{ 
                width: '16px', 
                height: '16px',
                transform: !isDockOpen ? 'rotate(0deg)' : 'rotate(180deg)',
                transition: 'transform 0.2s',
              }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
        </div>

        {isDockOpen && (
          <>
            <div className="chat-dock__tabs">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0, position: 'relative' }}>
                <SessionManagementMenu
                  sessions={sessions.filter(s => s.conversationId)}
                  activeSessionId={activeSessionId}
                  apiBase={apiBase}
                  agents={agents}
                  chatDockRef={chatSectionRef}
                  onTitleUpdate={(sessionId, title) => updateChat(sessionId, { title })}
                  onDelete={(sessionId) => removeSession(sessionId)}
                  onSelect={(sessionId) => focusSession(sessionId)}
                  onOpenConversation={openConversation}
                />
                {showScrollButtons.left && (
                  <button
                    type="button"
                    onClick={() => {
                      if (tabListRef.current) {
                        tabListRef.current.scrollBy({ left: -200, behavior: 'smooth' });
                      }
                    }}
                    style={{
                      position: 'absolute',
                      left: '48px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      zIndex: 10,
                      background: 'var(--bg-primary)',
                      border: '1px solid var(--border-primary)',
                      borderRadius: '4px',
                      padding: '4px 8px',
                      cursor: 'pointer',
                      color: 'var(--text-primary)',
                      boxShadow: '2px 0 8px rgba(0,0,0,0.15)',
                    }}
                  >
                    ←
                  </button>
                )}
                <div 
                  className="chat-dock__tab-list"
                  ref={tabListRef}
                  onScroll={() => {
                    if (tabListRef.current) {
                      const { scrollLeft, scrollWidth, clientWidth } = tabListRef.current;
                      setShowScrollButtons({
                        left: scrollLeft > 0,
                        right: scrollLeft < scrollWidth - clientWidth - 1,
                      });
                    }
                  }}
                >
                  {sessions.map((session, idx) => {
                    const agent = agents.find(a => a.slug === session.agentSlug);
                    const agentIcon = agent ? getAgentIcon(agent) : null;
                    
                    // Build tooltip content
                    const tooltipParts = [
                      `Title: ${session.title}`,
                      `Agent: ${session.agentName}`,
                      `Messages: ${session.messages.length}`,
                    ];
                    if (session.conversationId) {
                      tooltipParts.push(`Conversation: ${session.conversationId.slice(-6)}`);
                    }
                    const tooltip = tooltipParts.join('\n');
                    
                    return (
                    <button
                      type="button"
                      key={session.id}
                      ref={(el) => {
                        if (el && session.id === activeSessionId) {
                          el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                        }
                      }}
                      className={`chat-dock__tab ${
                        session.id === activeSessionId ? 'is-active' : ''
                      } ${session.hasUnread ? 'has-unread' : ''} ${session.status === 'sending' ? 'is-processing' : ''}`}
                      onClick={() => focusSession(session.id)}
                      title={tooltip}
                    >
                      {agentIcon && (
                        <div style={{
                          ...getAgentIconStyle(agent!, 20),
                          marginRight: '8px'
                        }}>
                          {agentIcon.display}
                        </div>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="chat-dock__tab-title">
                          {session.title}
                          {session.status === 'sending' && (
                            <span className="chat-dock__tab-badge">●</span>
                          )}
                        </div>
                        <div className="chat-dock__tab-agent">
                          <AgentBadge agentSlug={session.agentSlug} size="sm" />
                        </div>
                        {(() => {
                          const agent = agents.find(a => a.slug === session.agentSlug);
                          const agentModelId = typeof agent?.model === 'string' ? agent.model : agent?.model?.modelId;
                          const isCustomModel = session.model && session.model !== agentModelId;
                          if (!isCustomModel) return null;
                          const modelInfo = availableModels.find(m => m.id === session.model);
                          return (
                            <div style={{ fontSize: '9px', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: '2px' }}>
                              {modelInfo?.name || 'Custom'}
                            </div>
                          );
                        })()}
                      </div>
                      {idx < 9 && (
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)', flexShrink: 0 }}>
                          ⌘{idx + 1}
                        </span>
                      )}
                      <span
                        className="chat-dock__tab-close"
                        role="button"
                        tabIndex={0}
                        onClick={(event) => {
                          event.stopPropagation();
                          removeSession(session.id);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            event.stopPropagation();
                            removeSession(session.id);
                          }
                        }}
                        title={`Close (${closeTabShortcut})`}
                        style={{ flexShrink: 0 }}
                      >
                        ×
                      </span>
                    </button>
                  );
                  })}
                </div>
                {showScrollButtons.right && (
                  <button
                    type="button"
                    onClick={() => {
                      if (tabListRef.current) {
                        tabListRef.current.scrollBy({ left: 200, behavior: 'smooth' });
                      }
                    }}
                    style={{
                      position: 'absolute',
                      right: '0',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      zIndex: 10,
                      background: 'var(--bg-primary)',
                      border: '1px solid var(--border-primary)',
                      borderRadius: '4px',
                      padding: '4px 8px',
                      cursor: 'pointer',
                      color: 'var(--text-primary)',
                      boxShadow: '-2px 0 8px rgba(0,0,0,0.15)',
                    }}
                  >
                    →
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                <button
                  type="button"
                  className="chat-dock__new"
                  onClick={() => {
                    setShowSessionPicker(true);
                  }}
                  title={`Open Conversation (${openConversationShortcut})`}
                >
                  Open <span style={{ fontSize: '10px', opacity: 0.7 }}>{openConversationShortcut}</span>
                </button>
                <button
                  type="button"
                  className="chat-dock__new"
                  onClick={() => {
                    if (agents.length === 1) {
                      openChatForAgent(agents[0]);
                    } else {
                      setShowNewChatModal(true);
                      setNewChatSearch('');
                      setNewChatSelectedIndex(0);
                    }
                  }}
                  title={`New Chat (${newChatShortcut})`}
                >
                  + New <span style={{ fontSize: '10px', opacity: 0.7 }}>{newChatShortcut}</span>
                </button>
              </div>
            </div>

            <div className="chat-dock__body">
              {activeSession ? (
                <>
                  {(() => {
                    const agent = agents.find(a => a.slug === activeSession.agentSlug);
                    return (
                      <>
                  {showStatsPanel && (
                    <ConversationStats
                      agentSlug={activeSession.agentSlug}
                      conversationId={activeSession.conversationId || ''}
                      apiBase={apiBase}
                      isVisible={showStatsPanel}
                      onToggle={() => setShowStatsPanel(!showStatsPanel)}
                      messageCount={activeSession.messages.length}
                      key={`${activeSession.conversationId || activeSession.agentSlug}-${activeSession.status}`}
                    />
                  )}
                  <div 
                    className="chat-messages"
                    ref={messagesContainerRef}
                    style={{ fontSize: `${chatFontSize}px` }}
                    onScroll={(e) => {
                      const target = e.currentTarget;
                      const isAtBottom = target.scrollHeight - target.scrollTop - target.clientHeight < 10;
                      setIsUserScrolledUp(!isAtBottom);
                    }}
                  >
                    {activeSession.messages.length === 0 ? (
                      <div className="empty-state">
                        <h3>Start a conversation</h3>
                        <p>Type a message below to chat with {activeSession.agentName}</p>
                        <p style={{ fontSize: '0.9em', color: 'var(--text-muted)', marginTop: '8px' }}>
                          💡 Type <code style={{ 
                            padding: '2px 6px', 
                            background: 'var(--bg-tertiary)', 
                            borderRadius: '3px',
                            fontFamily: 'monospace'
                          }}>/</code> to see available commands
                        </p>
                      </div>
                    ) : (
                      <>
                        {activeSession.messages.map((msg, idx) => {
                          
                          const textContent = msg.contentParts?.filter(p => p.type === 'text').map(p => p.content).join('\n') || msg.content || '';
                          
                          // Handle ephemeral messages with special styling
                          if (msg.ephemeral) {
                            const messageId = msg.id || `ephemeral-${idx}`;
                            return (
                              <div 
                                key={messageId}
                                className={`message system ephemeral-message ${removingMessages.has(messageId) ? 'removing' : ''}`}
                                style={{
                                  padding: '12px 40px 12px 12px',
                                  background: 'var(--bg-secondary)',
                                  border: '1px solid var(--border-primary)',
                                  borderRadius: '6px',
                                  marginTop: '8px',
                                  marginBottom: '0',
                                  position: 'relative',
                                  fontSize: `${chatFontSize}px`,
                                  opacity: removingMessages.has(messageId) ? 0 : 1,
                                  transform: removingMessages.has(messageId) ? 'translateY(-10px)' : 'translateY(0px)',
                                  transition: 'opacity 0.3s ease, transform 0.3s ease'
                                }}
                              >
                                <button
                                  onClick={() => {
                                    setRemovingMessages(prev => new Set(prev).add(messageId));
                                    
                                    // Wait for animation, then remove from data
                                    setTimeout(() => {
                                      const updated = ephemeralMessages.filter(m => (m.id || `ephemeral-${ephemeralMessages.indexOf(m)}`) !== messageId);
                                      if (updated.length === 0) {
                                        clearEphemeralMessages(activeSession.id);
                                      } else {
                                        updateChat(activeSession.id, { ephemeralMessages: updated });
                                      }
                                      setRemovingMessages(prev => {
                                        const next = new Set(prev);
                                        next.delete(messageId);
                                        return next;
                                      });
                                    }, 300);
                                  }}
                                  style={{
                                    position: 'absolute',
                                    top: '8px',
                                    right: '8px',
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    fontSize: '18px',
                                    color: 'var(--text-muted)',
                                    padding: '4px',
                                    lineHeight: 1,
                                  }}
                                  title="Dismiss"
                                >
                                  ×
                                </button>
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>{textContent}</ReactMarkdown>
                                {msg.action && (
                                  <button
                                    onClick={() => {
                                      msg.action.handler();
                                      clearEphemeralMessages(activeSession.id);
                                    }}
                                    style={{
                                      marginTop: '12px',
                                      padding: '8px 16px',
                                      borderRadius: '6px',
                                      border: 'none',
                                      background: 'var(--color-primary)',
                                      color: 'white',
                                      cursor: 'pointer',
                                      fontSize: '13px',
                                      fontWeight: 500
                                    }}
                                  >
                                    {msg.action.label}
                                  </button>
                                )}
                              </div>
                            );
                          }
                          
                          // Check if this is a system event message
                          const isSystemEvent = msg.role === 'user' && textContent.startsWith('[SYSTEM_EVENT]');
                          const displayContent = isSystemEvent ? textContent.replace(/^\[SYSTEM_EVENT\]\s*/, '') : textContent;
                          
                          // Render system events with special styling
                          if (isSystemEvent) {
                            return (
                              <div key={`${activeSession.id}-msg-${idx}`} className="message system-event" style={{
                                padding: '8px 12px',
                                margin: '8px 0',
                                background: 'var(--bg-secondary)',
                                border: '1px solid var(--border-primary)',
                                borderRadius: '6px',
                                fontSize: '0.85em',
                                fontStyle: 'italic',
                                color: 'var(--text-muted)',
                                textAlign: 'center'
                              }}>
                                {displayContent}
                              </div>
                            );
                          }
                          
                          return (
                            <div 
                              key={`${activeSession.id}-msg-${idx}`} 
                              style={{ 
                                display: 'flex',
                                gap: '8px',
                                alignItems: 'flex-start',
                                flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
                                marginBottom: '12px'
                              }}
                            >
                              <div style={{ 
                                ...(msg.role === 'assistant' 
                                  ? (() => {
                                      const agent = agents.find(a => a.slug === activeSession.agentSlug);
                                      return agent ? getAgentIconStyle(agent, 20) : {
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        width: '20px',
                                        height: '20px',
                                        borderRadius: '50%',
                                        background: 'var(--accent-primary)',
                                        fontSize: '11px',
                                        flexShrink: 0,
                                        color: 'var(--text-primary)',
                                      };
                                    })()
                                  : getUserIconStyle({ name: 'Default User' }, 20)),
                                marginTop: '4px'
                              }}>
                                {msg.role === 'assistant' 
                                  ? (() => {
                                      const agent = agents.find(a => a.slug === activeSession.agentSlug);
                                      return agent?.icon || getInitials(agent?.name || 'AI');
                                    })()
                                  : getInitials('Default User')
                                }
                              </div>
                              <div 
                                className={`message ${msg.role}`} 
                                style={{ 
                                  position: 'relative',
                                  maxWidth: '70%',
                                  ...(msg.role === 'user' && msg.fromPrompt ? {
                                    background: 'var(--bg-tertiary)',
                                    borderLeft: '3px solid var(--accent-primary, #0066cc)'
                                  } : {})
                                }}
                              >
                              {msg.traceId && (
                                <a
                                  href={`/monitoring?filters=${encodeURIComponent(JSON.stringify({ trace: [msg.traceId] }))}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{
                                    position: 'absolute',
                                    top: '8px',
                                    right: '8px',
                                    fontSize: '0.65em',
                                    color: 'var(--text-muted)',
                                    textDecoration: 'none',
                                    opacity: 0.4,
                                    fontFamily: 'monospace',
                                    letterSpacing: '0.5px',
                                    transition: 'opacity 0.2s',
                                  }}
                                  onMouseOver={(e) => (e.currentTarget.style.opacity = '0.7')}
                                  onMouseOut={(e) => (e.currentTarget.style.opacity = '0.4')}
                                  title={`Trace: ${msg.traceId}`}
                                >
                                  {msg.traceId.slice(-8)}
                                </a>
                              )}
                              {msg.role === 'assistant' && textContent && (
                                <button
                                  onClick={() => {
                                    navigator.clipboard.writeText(textContent);
                                    showToast('Copied to clipboard');
                                  }}
                                  style={{
                                    position: 'absolute',
                                    bottom: '5px',
                                    right: '5px',
                                    padding: '0.25rem',
                                    background: 'var(--bg-secondary)',
                                    border: '1px solid var(--border-primary)',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    opacity: 0.6,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: 'var(--text-secondary)',
                                  }}
                                  onMouseOver={(e) => (e.currentTarget.style.opacity = '1')}
                                  onMouseOut={(e) => (e.currentTarget.style.opacity = '0.6')}
                                  title="Copy message"
                                >
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                                  </svg>
                                </button>
                              )}
                              {msg.role === 'assistant' && msg.model && (
                                <div style={{ fontSize: '0.64em', color: 'var(--text-muted)', marginBottom: '4px', fontStyle: 'italic', opacity: 0.6 }}>
                                  {msg.model.includes('claude-3-7-sonnet') ? '🤖 Claude 3.7 Sonnet' :
                                   msg.model.includes('claude-3-5-sonnet-20241022') ? '🤖 Claude 3.5 Sonnet v2' :
                                   msg.model.includes('claude-3-5-sonnet') ? '🤖 Claude 3.5 Sonnet' :
                                   msg.model.includes('claude-3-opus') ? '🤖 Claude 3 Opus' :
                                   msg.model.includes('claude-3-haiku') ? '🤖 Claude 3 Haiku' : '🤖 Custom'}
                                </div>
                              )}
                              {msg.attachments && msg.attachments.length > 0 && (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
                                  {msg.attachments.map((att) => (
                                    <div key={att.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px', background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)', borderRadius: '4px', maxWidth: '200px' }}>
                                      {att.preview && <img src={att.preview} alt={att.name} style={{ maxWidth: '120px', maxHeight: '120px', borderRadius: '4px' }} />}
                                      <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: '0.85em', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{att.name}</div>
                                        <div style={{ fontSize: '0.75em', color: 'var(--text-muted)' }}>{att.type}</div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                              {msg.contentParts && msg.contentParts.length > 0 ? (
                                (() => {
                                  return msg.contentParts.map((part, i) => {
                                    if (part.type === 'reasoning' && part.content) {
                                      return <ReasoningSection key={i} content={part.content} fontSize={chatFontSize} show={showReasoning} />;
                                    } else if (part.type === 'text' && part.content) {
                                      return <ReactMarkdown key={i} remarkPlugins={[remarkGfm]}>{part.content}</ReactMarkdown>;
                                    } else if (part.type === 'tool' || part.type?.startsWith('tool-')) {
                                      // Tool parts are already enriched by ConversationsContext
                                      const isStreamingMessage = idx === activeSession.messages.length - 1 && msg.role === 'assistant';
                                      return (
                                        <ToolCallDisplay 
                                          key={i} 
                                          toolCall={part}
                                          showDetails={showToolDetails}
                                          onApprove={isStreamingMessage && part.tool?.needsApproval ? (action) => {
                                            handleToolApproval(
                                              activeSession.id,
                                              activeSession.agentSlug,
                                              part.tool!.approvalId!,
                                              part.tool!.name,
                                              action
                                            );
                                          } : undefined}
                                        />
                                      );
                                    }
                                    return null;
                                  });
                                })()
                              ) : (
                                textContent && <ReactMarkdown remarkPlugins={[remarkGfm]}>{textContent}</ReactMarkdown>
                              )}
                              {/* Show loading/approval indicators at the end of last assistant message when it has content */}
                              {msg.role === 'assistant' && idx === activeSession.messages.length - 1 && (
                                <>
                                  {activeSession.isThinking && textContent && (
                                    <div style={{ 
                                      display: 'flex', 
                                      alignItems: 'center', 
                                      gap: '8px', 
                                      color: 'var(--text-muted)',
                                      marginTop: '8px'
                                    }}>
                                      <span className="loading-dots">
                                        <span style={{ animationDelay: '0s' }}>●</span>
                                        <span style={{ animationDelay: '0.2s' }}>●</span>
                                        <span style={{ animationDelay: '0.4s' }}>●</span>
                                      </span>
                                    </div>
                                  )}
                                  {activeSession.pendingApprovals && activeSession.pendingApprovals.length > 0 && (
                                    <div style={{ 
                                      display: 'flex', 
                                      alignItems: 'center', 
                                      gap: '8px', 
                                      color: 'var(--warning-primary, orange)',
                                      marginTop: '8px',
                                      padding: '8px',
                                      background: 'var(--warning-bg, rgba(255, 165, 0, 0.1))',
                                      borderRadius: '4px',
                                      fontSize: '0.9em'
                                    }}>
                                      <span>⏸</span>
                                      <span>Awaiting tool approval ({activeSession.pendingApprovals.length})</span>
                                    </div>
                                  )}
                                </>
                              )}
                              </div>
                            </div>
                          );
                        })}
                        
                        {/* Render streaming message being built in real-time */}
                        {(() => {
                          const streamingMessage = getStreamingMessage(activeSession.id);
                          if (!streamingMessage) return null;
                          
                          return (
                          <div style={{ 
                            display: 'flex',
                            gap: '8px',
                            alignItems: 'flex-start',
                            marginBottom: '12px'
                          }}>
                            <div style={{ 
                              ...(() => {
                                const agent = agents.find(a => a.slug === activeSession.agentSlug);
                                return agent ? getAgentIconStyle(agent, 20) : {
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  width: '20px',
                                  height: '20px',
                                  borderRadius: '50%',
                                  background: 'var(--accent-primary)',
                                  fontSize: '11px',
                                  flexShrink: 0,
                                  color: 'var(--text-primary)',
                                };
                              })(),
                              marginTop: '4px'
                            }}>
                              {(() => {
                                const agent = agents.find(a => a.slug === activeSession.agentSlug);
                                return agent?.icon || getInitials(agent?.name || 'AI');
                              })()}
                            </div>
                            <div className="message assistant" style={{ maxWidth: '70%', fontSize: `${chatFontSize}px` }}>
                              {streamingMessage.contentParts && streamingMessage.contentParts.length > 0 ? (
                                streamingMessage.contentParts.map((part, i) => {
                                  if (part.type === 'text' && part.content) {
                                    return <ReactMarkdown key={i} remarkPlugins={[remarkGfm]}>{part.content}</ReactMarkdown>;
                                  } else if (part.type === 'tool' || part.type?.startsWith('tool-')) {
                                    return (
                                      <ToolCallDisplay 
                                        key={i} 
                                        toolCall={part}
                                        showDetails={showToolDetails}
                                      />
                                    );
                                  }
                                  return null;
                                })
                              ) : (
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>{streamingMessage.content}</ReactMarkdown>
                              )}
                            </div>
                          </div>
                        );
                        })()}
                        
                      </>
                    )}
                    {/* Show loading indicator in new bubble when starting a new response */}
                    {activeSession.isThinking && (!activeSession.messages.length || activeSession.messages[activeSession.messages.length - 1]?.role !== 'assistant' || !activeSession.messages[activeSession.messages.length - 1]?.content) && (
                      <div style={{ 
                        display: 'flex',
                        gap: '8px',
                        alignItems: 'flex-start',
                        marginBottom: '12px'
                      }}>
                        <div style={{ 
                          ...(() => {
                            const agent = agents.find(a => a.slug === activeSession.agentSlug);
                            return agent ? getAgentIconStyle(agent, 20) : {
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: '20px',
                              height: '20px',
                              borderRadius: '50%',
                              background: 'var(--accent-primary)',
                              fontSize: '11px',
                              flexShrink: 0,
                              color: 'var(--text-primary)',
                            };
                          })(),
                          marginTop: '4px'
                        }}>
                          {(() => {
                            const agent = agents.find(a => a.slug === activeSession.agentSlug);
                            return agent?.icon || getInitials(agent?.name || 'AI');
                          })()}
                        </div>
                        <div className="message assistant" style={{ maxWidth: '70%' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)' }}>
                            <span className="loading-dots">
                              <span style={{ animationDelay: '0s' }}>●</span>
                              <span style={{ animationDelay: '0.2s' }}>●</span>
                              <span style={{ animationDelay: '0.4s' }}>●</span>
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  {isUserScrolledUp && (
                    <button
                      onClick={() => {
                        if (messagesContainerRef.current) {
                          messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
                          setIsUserScrolledUp(false);
                        }
                      }}
                      style={{
                        position: 'absolute',
                        bottom: '80px',
                        right: '20px',
                        background: 'var(--color-primary)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '50%',
                        width: '40px',
                        height: '40px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                        zIndex: 10,
                        fontSize: '20px',
                        fontWeight: 'bold',
                        transition: 'all 0.2s',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'scale(1.1)';
                        e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,0,0,0.3)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'scale(1)';
                        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
                      }}
                      title="Scroll to bottom"
                    >
                      ↓
                    </button>
                  )}
                  {activeSession.attachments && activeSession.attachments.length > 0 && (
                    <div style={{ 
                      padding: '8px 12px', 
                      borderTop: '1px solid var(--border-primary)',
                      background: 'var(--bg-secondary)',
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '8px'
                    }}>
                      {activeSession.attachments.map((att) => (
                        <div 
                          key={att.id} 
                          style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '8px', 
                            padding: '6px 10px', 
                            background: 'var(--bg-primary)', 
                            border: '1px solid var(--border-primary)', 
                            borderRadius: '6px',
                            fontSize: '0.85em'
                          }}
                        >
                          {att.preview && (
                            <img 
                              src={att.preview} 
                              alt={att.name} 
                              style={{ 
                                width: '32px', 
                                height: '32px', 
                                objectFit: 'cover', 
                                borderRadius: '4px' 
                              }} 
                            />
                          )}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {att.name}
                            </div>
                            <div style={{ fontSize: '0.85em', color: 'var(--text-muted)' }}>
                              {att.type}
                            </div>
                          </div>
                          <button
                            onClick={() => {
                              const newAttachments = activeSession.attachments?.filter(a => a.id !== att.id) || [];
                              updateChat(activeSession.id, { attachments: newAttachments });
                            }}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: 'var(--text-muted)',
                              cursor: 'pointer',
                              padding: '2px',
                              fontSize: '16px',
                              lineHeight: 1,
                            }}
                            title="Remove attachment"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="chat-input" style={{ display: 'flex', alignItems: 'stretch', position: 'relative' }}>
                    {modelQuery !== null && activeSession && (
                      <ModelSelectorAutocomplete
                        query={modelQuery}
                        models={availableModels}
                        currentModel={activeChatState?.model || agents.find(a => a.slug === activeSession.agentSlug)?.model}
                        agentDefaultModel={agents.find(a => a.slug === activeSession.agentSlug)?.model}
                        maxHeight={`calc(${dockHeight}px - 200px)`}
                        onSelect={(model) => {
                          const agent = agents.find(a => a.slug === activeSession.agentSlug);
                          const agentModelId = typeof agent?.model === 'string' ? agent.model : agent?.model?.modelId;
                          const currentModelStr = activeChatState?.model || agentModelId || '';
                          const isAlreadyActive = currentModelStr === model.id;
                          
                          updateChat(activeSession.id, { 
                            input: '',
                            model: model.id
                          });
                          
                          if (!isAlreadyActive) {
                            addEphemeralMessage(activeSession.id, { 
                              role: 'system', 
                              content: `Model changed to **${model.name}**` 
                            });
                          }
                          
                          setModelQuery(null);
                        }}
                        onClose={() => {
                          setModelQuery(null);
                          clearInput(activeSession.id);
                        }}
                      />
                    )}
                    {commandQuery !== null && activeSession && (
                      <SlashCommandSelector
                        query={commandQuery}
                        commands={slashCommands}
                        maxHeight={`calc(${dockHeight}px - 200px)`}
                        onSelect={(command) => {
                          executeCommand(command, activeSession.id);
                        }}
                        onClose={() => {
                          setCommandQuery(null);
                          clearInput(activeSession.id);
                        }}
                      />
                    )}
                    <div style={{ position: 'relative', flex: 1, display: 'flex' }}>
                      <textarea
                        ref={textareaRef}
                        placeholder="Type a message... (Enter to send, Shift+Enter for new line)"
                        value={activeSession.input || ''}
                        disabled={!agent}
                        tabIndex={0}
                        onChange={(e) => {
                          let value = e.target.value;
                          
                          // Strip [SYSTEM_EVENT] prefix if user tries to type it
                          if (value.includes('[SYSTEM_EVENT]')) {
                            value = value.replace(/\[SYSTEM_EVENT\]\s*/g, '');
                        }
                        
                        updateChat(activeSession.id, { input: value });
                        
                        // Reset history index when user types
                        setHistoryIndex(prev => new Map(prev).set(activeSession.id, -1));
                        
                        // Update model query
                        if (value.startsWith('/model ')) {
                          setModelQuery(value.slice(7)); // Remove '/model '
                          setCommandQuery(null);
                        }
                        // Update command query
                        else if (value.startsWith('/') && !value.includes(' ')) {
                          setCommandQuery(value.slice(1));
                          setModelQuery(null);
                        } else {
                          setCommandQuery(null);
                          setModelQuery(null);
                        }
                      }}
                      onKeyDown={async (e) => {
                        // Handle Escape to dismiss autocomplete
                        if (e.key === 'Escape' && (commandQuery !== null || modelQuery !== null)) {
                          e.preventDefault();
                          setCommandQuery(null);
                          setModelQuery(null);
                          return;
                        }
                        
                        // Selectors handle their own keyboard events
                        if (commandQuery !== null || modelQuery !== null) return;
                        
                        // Allow Tab to navigate to chat controls
                        if (e.key === 'Tab' && !e.shiftKey) {
                          // Let default tab behavior work
                          return;
                        }
                        
                        // Handle arrow up/down for history navigation
                        if (e.key === 'ArrowUp') {
                          e.preventDefault();
                          navigateHistoryUp(activeSession.id);
                          return;
                        }
                        
                        if (e.key === 'ArrowDown') {
                          e.preventDefault();
                          navigateHistoryDown(activeSession.id);
                          return;
                        }
                        
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          if (activeSession.input?.trim()) {
                            await handleSendMessage(activeSession.id, activeSession.agentSlug, activeSession.conversationId, activeSession.input.trim());
                          }
                        }
                      }}
                      style={{ fontSize: `${chatFontSize}px`, flex: 1, resize: 'none', minHeight: 0 }}
                    />
                    {activeSession.input && (
                      <button
                        onClick={() => clearInput(activeSession.id)}
                        style={{
                          position: 'absolute',
                          right: '20px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          background: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: '18px',
                          color: 'var(--text-muted)',
                          padding: '4px',
                          lineHeight: '1',
                          zIndex: 1
                        }}
                        title="Clear input"
                      >
                        ×
                      </button>
                    )}
                    </div>
                    <div className="chat-controls">
                      <div className="chat-controls-row">
                        <FileAttachmentInput
                          attachments={activeSession.attachments || []}
                          onAdd={(files) => {
                            const existing = activeSession.attachments || [];
                            updateChat(activeSession.id, { attachments: [...existing, ...files] });
                          }}
                          onRemove={(id) => {
                            const newAttachments = activeSession.attachments?.filter(a => a.id !== id) || [];
                            updateChat(activeSession.id, { attachments: newAttachments });
                          }}
                          disabled={!agent || activeSession.status === 'sending' || !modelSupportsAttachments}
                          supportsImages={modelSupportsAttachments}
                          supportsFiles={modelSupportsAttachments}
                          style={{ flex: '0 0 25%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        />
                        {activeSession.abortController ? (
                          <button
                            onClick={() => {
                              cancelMessage(activeSession.id);
                              addEphemeralMessage(activeSession.id, {
                                role: 'system',
                                content: 'User canceled the ongoing request.'
                              });
                            }}
                            tabIndex={0}
                            className="send-button"
                            style={{ 
                              background: 'var(--error-bg)',
                              padding: 0,
                              border: '1px solid var(--error-border)',
                              color: 'var(--error-text)',
                              cursor: 'pointer',
                              fontSize: '13px',
                              fontWeight: 500,
                              flex: '0 0 75%',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                          >
                            Cancel
                          </button>
                        ) : (
                          <button
                            onClick={async () => {
                              if (activeSession.input?.trim()) {
                                await handleSendMessage(activeSession.id, activeSession.agentSlug, activeSession.conversationId, activeSession.input.trim());
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && activeSession.input?.trim()) {
                                e.preventDefault();
                                handleSendMessage(activeSession.id, activeSession.agentSlug, activeSession.conversationId, activeSession.input.trim());
                              }
                            }}
                            disabled={!activeSession.input?.trim()}
                            tabIndex={0}
                            className="send-button"
                            style={{
                              padding: 0,
                              border: 'none',
                              background: activeSession.input?.trim() ? 'var(--color-primary)' : 'var(--bg-tertiary)',
                              color: activeSession.input?.trim() ? 'white' : 'var(--text-muted)',
                              cursor: activeSession.input?.trim() ? 'pointer' : 'not-allowed',
                              fontSize: '13px',
                              fontWeight: 500,
                              opacity: activeSession.input?.trim() ? 1 : 0.25,
                              flex: '0 0 75%',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                          >
                            Send
                          </button>
                        )}
                      </div>
                      <button 
                        onClick={() => {
                          updateChat(activeSession.id, { input: '/model ' });
                          setModelQuery('');
                          if (textareaRef.current) {
                            textareaRef.current.focus();
                          }
                        }}
                        onMouseEnter={(e) => {
                          const agentDefaultModelId = typeof agent?.model === 'string' ? agent.model : agent?.model?.modelId;
                          const currentModelId = activeChatState?.model;
                          const isOverride = currentModelId && currentModelId !== agentDefaultModelId;
                          e.currentTarget.style.background = isOverride 
                            ? 'rgba(var(--accent-primary-rgb, 0, 102, 204), 0.25)' 
                            : 'rgba(var(--accent-primary-rgb, 0, 102, 204), 0.2)';
                        }}
                        onMouseLeave={(e) => {
                          const agentDefaultModelId = typeof agent?.model === 'string' ? agent.model : agent?.model?.modelId;
                          const currentModelId = activeChatState?.model;
                          const isOverride = currentModelId && currentModelId !== agentDefaultModelId;
                          e.currentTarget.style.background = isOverride 
                            ? 'rgba(var(--accent-primary-rgb, 0, 102, 204), 0.12)' 
                            : 'rgba(var(--accent-primary-rgb, 0, 102, 204), 0.08)';
                        }}
                        style={{
                          fontSize: '10px',
                          color: (() => {
                            const agentDefaultModelId = typeof agent?.model === 'string' ? agent.model : agent?.model?.modelId;
                            const currentModelId = activeChatState?.model;
                            const isOverride = currentModelId && currentModelId !== agentDefaultModelId;
                            return isOverride ? 'var(--accent-yellow)' : 'var(--text-muted)';
                          })(),
                          padding: '4px 8px',
                          textAlign: 'center',
                          cursor: 'pointer',
                          fontWeight: (() => {
                            const agentDefaultModelId = typeof agent?.model === 'string' ? agent.model : agent?.model?.modelId;
                            const currentModelId = activeChatState?.model;
                            const isOverride = currentModelId && currentModelId !== agentDefaultModelId;
                            return isOverride ? 600 : 400;
                          })(),
                          borderBottom: '1px solid var(--border-primary)',
                          border: 'none',
                          width: '100%',
                          background: (() => {
                            const agentDefaultModelId = typeof agent?.model === 'string' ? agent.model : agent?.model?.modelId;
                            const currentModelId = activeChatState?.model;
                            const isOverride = currentModelId && currentModelId !== agentDefaultModelId;
                            return isOverride 
                              ? 'rgba(var(--accent-primary-rgb, 0, 102, 204), 0.12)' 
                              : 'rgba(var(--accent-primary-rgb, 0, 102, 204), 0.08)';
                          })(),
                          transition: 'background 0.2s',
                        }}
                        title={(() => {
                          const agentDefaultModelId = typeof agent?.model === 'string' ? agent.model : agent?.model?.modelId;
                          const currentModelId = activeChatState?.model;
                          const isOverride = currentModelId && currentModelId !== agentDefaultModelId;
                          return isOverride ? "Model override active - click to change" : "Click to change model";
                        })()}
                      >
                        {(() => {
                          const modelId = activeChatState?.model || agent?.model;
                          const modelInfo = availableModels.find(m => m.id === modelId);
                          return modelInfo?.name || 'Default Model';
                        })()}
                      </button>
                      {activeSession.conversationId && (
                        <ContextPercentage
                          agentSlug={activeSession.agentSlug}
                          conversationId={activeSession.conversationId}
                          apiBase={apiBase}
                          messageCount={activeSession.messages.length}
                          onClick={() => setShowStatsPanel(true)}
                        />
                      )}
                    </div>
                  </div>
                      </>
                    );
                  })()}
                </>
              ) : (
                <div className="empty-state">
                  <h3>No active session</h3>
                  <p>Click "+ New" to start a chat</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* New Chat Modal */}
      {showNewChatModal && (() => {
        const filteredAgents = (agents || []).filter(a => 
          a.name.toLowerCase().includes(newChatSearch.toLowerCase()) ||
          a.slug.toLowerCase().includes(newChatSearch.toLowerCase())
        );
        
        return (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
          }}
          onClick={() => setShowNewChatModal(false)}
        >
          <div
            style={{
              background: 'var(--bg-primary)',
              border: '1px solid var(--border-primary)',
              borderRadius: '12px',
              width: '90%',
              maxWidth: '500px',
              maxHeight: '600px',
              display: 'flex',
              flexDirection: 'column',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: '20px', borderBottom: '1px solid var(--border-primary)' }}>
              <h3 style={{ margin: '0 0 12px 0' }}>New Chat</h3>
              <input
                type="text"
                placeholder="Search agents..."
                value={newChatSearch}
                onChange={(e) => {
                  setNewChatSearch(e.target.value);
                  setNewChatSelectedIndex(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setNewChatSelectedIndex((prev) => Math.min(prev + 1, filteredAgents.length - 1));
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setNewChatSelectedIndex((prev) => Math.max(prev - 1, 0));
                  } else if (e.key === 'Enter' && filteredAgents[newChatSelectedIndex]) {
                    openChatForAgent(filteredAgents[newChatSelectedIndex]);
                    setShowNewChatModal(false);
                  } else if (e.key === 'Escape') {
                    setShowNewChatModal(false);
                  }
                }}
                autoFocus
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid var(--border-primary)',
                  borderRadius: '8px',
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  fontSize: '14px',
                }}
              />
            </div>
            <div style={{ overflowY: 'auto', maxHeight: '400px' }}>
              {filteredAgents.map((agent, idx) => (
                  <button
                    key={agent.slug}
                    onClick={() => {
                      openChatForAgent(agent);
                      setShowNewChatModal(false);
                    }}
                    onMouseEnter={() => setNewChatSelectedIndex(idx)}
                    style={{
                      width: '100%',
                      padding: '12px 20px',
                      border: 'none',
                      borderBottom: '1px solid var(--border-primary)',
                      background: idx === newChatSelectedIndex ? 'var(--accent-primary)' : 'transparent',
                      textAlign: 'left',
                      cursor: 'pointer',
                      color: idx === newChatSelectedIndex ? 'white' : 'var(--text-primary)',
                      transition: 'all 0.15s',
                    }}
                  >
                    <div style={{ fontWeight: 600 }}>{agent.name}</div>
                  </button>
              ))}
            </div>
          </div>
        </div>
        );
      })()}

      {/* Session Picker Modal */}
      {showChatSettings && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000
          }}
          onClick={() => setShowChatSettings(false)}
        >
          <div 
            style={{
              background: 'var(--bg-primary)',
              border: '1px solid var(--border-primary)',
              borderRadius: '8px',
              padding: '24px',
              minWidth: '400px',
              maxWidth: '500px'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 20px 0', fontSize: '18px', fontWeight: 600 }}>Chat Settings</h3>
            
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: 500 }}>
                Font Size
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  onClick={() => setChatFontSize(prev => Math.max(10, prev - 1))}
                  disabled={chatFontSize <= 10}
                  style={{
                    background: 'transparent',
                    border: '1px solid var(--border-primary)',
                    color: 'var(--text-primary)',
                    cursor: chatFontSize <= 10 ? 'not-allowed' : 'pointer',
                    padding: '6px 12px',
                    borderRadius: '4px',
                    fontSize: '14px',
                    opacity: chatFontSize <= 10 ? 0.3 : 1
                  }}
                >
                  A−
                </button>
                <button
                  onClick={() => setChatFontSize(defaultFontSize)}
                  style={{
                    background: 'transparent',
                    border: '1px solid var(--border-primary)',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                    padding: '6px 12px',
                    borderRadius: '4px',
                    fontSize: '14px',
                    opacity: chatFontSize === defaultFontSize ? 0.5 : 1
                  }}
                >
                  A
                </button>
                <button
                  onClick={() => setChatFontSize(prev => Math.min(24, prev + 1))}
                  disabled={chatFontSize >= 24}
                  style={{
                    background: 'transparent',
                    border: '1px solid var(--border-primary)',
                    color: 'var(--text-primary)',
                    cursor: chatFontSize >= 24 ? 'not-allowed' : 'pointer',
                    padding: '6px 12px',
                    borderRadius: '4px',
                    fontSize: '14px',
                    opacity: chatFontSize >= 24 ? 0.3 : 1
                  }}
                >
                  A+
                </button>
                <span style={{ fontSize: '14px', color: 'var(--text-secondary)', marginLeft: '8px' }}>
                  {chatFontSize}px ({Math.round((chatFontSize / defaultFontSize) * 100)}%)
                </span>
              </div>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={showReasoning}
                  onChange={(e) => setShowReasoning(e.target.checked)}
                  style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                />
                <span style={{ fontSize: '14px', fontWeight: 500 }}>Show reasoning</span>
              </label>
              <p style={{ margin: '4px 0 0 24px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                Display model reasoning steps in chat messages
              </p>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={showToolDetails}
                  onChange={(e) => setShowToolDetails(e.target.checked)}
                  style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                />
                <span style={{ fontSize: '14px', fontWeight: 500 }}>Show tool details</span>
              </label>
              <p style={{ margin: '4px 0 0 24px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                Allow expanding tool calls to view arguments and results
              </p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '24px' }}>
              <button
                onClick={() => setShowChatSettings(false)}
                style={{
                  background: 'var(--accent-primary)',
                  color: 'white',
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: '4px',
                  fontSize: '14px',
                  cursor: 'pointer',
                  fontWeight: 500
                }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {showSessionPicker && (
        <SessionPickerModal
          isOpen={showSessionPicker}
          apiBase={apiBase}
          agents={agents}
          activeConversationIds={sessions.map(s => s.conversationId).filter(Boolean) as string[]}
          onSelect={(conversationId, agentSlug) => {
            openConversation(conversationId, agentSlug);
            setShowSessionPicker(false);
          }}
          onClose={() => setShowSessionPicker(false)}
        />
      )}
    </>
  );
}
