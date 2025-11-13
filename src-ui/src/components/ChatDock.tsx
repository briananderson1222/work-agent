import { useState, useEffect, useRef, useCallback } from 'react';
import type { AgentSummary, ChatSession } from '../types';

interface ChatDockProps {
  agents: AgentSummary[];
  apiBase: string;
  availableModels: any[];
  onRequestAuth?: () => void;
}

export function ChatDock({ agents, apiBase, availableModels, onRequestAuth }: ChatDockProps) {
  // Chat dock state
  const [isDockCollapsed, setIsDockCollapsed] = useState(() => {
    const saved = localStorage.getItem('chatDockCollapsed');
    return saved ? JSON.parse(saved) : false;
  });
  
  const [isDockMaximized, setIsDockMaximized] = useState(false);
  const [dockHeight, setDockHeight] = useState(() => {
    const saved = localStorage.getItem('chatDockHeight');
    return saved ? parseInt(saved, 10) : 300;
  });
  
  const [isDragging, setIsDragging] = useState(false);
  const [previousDockHeight, setPreviousDockHeight] = useState(300);
  const [previousDockCollapsed, setPreviousDockCollapsed] = useState(false);
  
  // Session state
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [ephemeralMessages, setEphemeralMessages] = useState<Record<string, any[]>>({});
  const [showStatsPanel, setShowStatsPanel] = useState(false);
  const [isUserScrolledUp, setIsUserScrolledUp] = useState(false);
  
  // Refs
  const chatSectionRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const tabListRef = useRef<HTMLDivElement>(null);
  
  // Persist dock state
  useEffect(() => {
    localStorage.setItem('chatDockCollapsed', JSON.stringify(isDockCollapsed));
  }, [isDockCollapsed]);
  
  useEffect(() => {
    localStorage.setItem('chatDockHeight', String(dockHeight));
  }, [dockHeight]);

  // TODO: Move all chat handlers and logic here
  
  return (
    <div
      className={`chat-dock ${isDockCollapsed ? 'is-collapsed' : ''} ${isDockMaximized ? 'is-maximized' : ''} ${isDragging ? 'is-dragging' : ''}`}
      style={{ 
        height: isDockCollapsed 
          ? '43px' 
          : isDockMaximized 
            ? `${window.innerHeight - 107}px` 
            : `${dockHeight}px`
      }}
      ref={chatSectionRef}
    >
      <div className="chat-dock__header" 
        onClick={() => {
          if (isDockMaximized) {
            setDockHeight(previousDockHeight);
            setIsDockMaximized(false);
          }
          setIsDockCollapsed((prev) => !prev);
        }}
        style={{ cursor: 'pointer' }}
      >
        <div className="chat-dock__title" style={{ flex: 1 }}>
          <span>Chat Dock</span>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '8px' }}>⌘D</span>
        </div>
      </div>
      
      {!isDockCollapsed && (
        <div className="chat-dock__body">
          <div className="empty-state">
            <h3>Chat Dock</h3>
            <p>Chat functionality will be moved here</p>
          </div>
        </div>
      )}
    </div>
  );
}
