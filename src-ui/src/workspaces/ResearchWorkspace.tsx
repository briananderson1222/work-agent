import { useState, useEffect } from 'react';
import type { AgentWorkspaceProps } from './index';
import { isTauriApp, openResearchUrl } from '../lib/tauri';

const RESEARCH_TOOLS = [
  { name: 'Perplexity', url: 'https://www.perplexity.ai', icon: '🔍', color: '#20808d', embedBlocked: true },
  { name: 'Google Scholar', url: 'https://scholar.google.com', icon: '🎓', color: '#4285f4', embedBlocked: false },
  { name: 'Semantic Scholar', url: 'https://www.semanticscholar.org', icon: '📚', color: '#1857b6', embedBlocked: false },
  { name: 'Arxiv', url: 'https://arxiv.org', icon: '📄', color: '#b31b1b', embedBlocked: false },
];

export function ResearchWorkspace({ agent, onShowChat }: AgentWorkspaceProps) {
  const [selectedTool, setSelectedTool] = useState(RESEARCH_TOOLS[0]);
  const [iframeError, setIframeError] = useState(RESEARCH_TOOLS[0].embedBlocked);
  const [isInTauri, setIsInTauri] = useState(false);

  useEffect(() => {
    setIsInTauri(isTauriApp());
  }, []);

  const handleOpenUrl = async (url: string, title: string) => {
    if (isInTauri) {
      // In Tauri: open in native WebView window (bypasses X-Frame-Options)
      await openResearchUrl(url, title);
    } else {
      // In browser: open in new tab
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div className="workspace-dashboard" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <header className="workspace-dashboard__header">
        <div>
          <h2>Research Workspace {isInTauri && '🚀'}</h2>
          <p>{isInTauri
            ? `Native desktop app - research sites open in dedicated windows (no X-Frame restrictions!)`
            : `Access research tools and discuss findings with ${agent.name}`
          }</p>
        </div>
        <div className="workspace-dashboard__actions">
          <button className="workspace-dashboard__action" onClick={() => onShowChat?.()} type="button">
            Open Chat Dock
          </button>
        </div>
      </header>

      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        padding: '1rem',
        overflow: 'hidden'
      }}>
        {/* Research Tool Selector */}
        <div style={{
          display: 'flex',
          gap: '0.5rem',
          marginBottom: '1rem',
          flexWrap: 'wrap'
        }}>
          {RESEARCH_TOOLS.map(tool => (
            <button
              key={tool.name}
              onClick={() => {
                setSelectedTool(tool);
                setIframeError(tool.embedBlocked);
              }}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: selectedTool.name === tool.name ? tool.color : '#2a2a2a',
                color: 'white',
                border: selectedTool.name === tool.name ? `2px solid ${tool.color}` : '1px solid #444',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.875rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                transition: 'all 0.2s'
              }}
            >
              <span>{tool.icon}</span>
              <span>{tool.name}</span>
            </button>
          ))}
        </div>

        {/* Main Content Area */}
        <div style={{
          flex: 1,
          border: '1px solid #333',
          borderRadius: '8px',
          overflow: 'hidden',
          backgroundColor: '#1a1a1a',
          display: 'flex',
          flexDirection: 'column'
        }}>
          {/* Browser-like header */}
          <div style={{
            padding: '0.5rem 1rem',
            backgroundColor: '#2a2a2a',
            borderBottom: '1px solid #333',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.875rem', color: '#888' }}>{selectedTool.icon}</span>
              <span style={{ fontSize: '0.875rem', color: '#ccc' }}>{selectedTool.url.replace('https://', '')}</span>
            </div>
            <button
              onClick={() => handleOpenUrl(selectedTool.url, selectedTool.name)}
              style={{
                padding: '0.25rem 0.75rem',
                backgroundColor: selectedTool.color,
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '0.75rem'
              }}
            >
              {isInTauri ? 'Open in Window →' : 'Open in New Tab →'}
            </button>
          </div>

          {/* Iframe with fallback */}
          {!iframeError ? (
            <iframe
              key={selectedTool.url}
              src={selectedTool.url}
              style={{
                flex: 1,
                border: 'none',
                width: '100%',
                backgroundColor: 'white'
              }}
              title={`${selectedTool.name} Research`}
              sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
              allow="accelerometer; camera; encrypted-media; geolocation; gyroscope; microphone"
              onError={() => setIframeError(true)}
            />
          ) : (
            <div style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '2rem',
              textAlign: 'center',
              color: '#999'
            }}>
              <span style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔒</span>
              <h3 style={{ color: '#ccc', marginBottom: '0.5rem' }}>Content Cannot Be Embedded</h3>
              <p style={{ fontSize: '0.875rem', marginBottom: '1.5rem', maxWidth: '400px' }}>
                {selectedTool.name} prevents embedding for security reasons. {isInTauri
                  ? 'Click below to open it in a dedicated window.'
                  : 'Click below to open it in a new tab.'
                }
              </p>
              <button
                onClick={() => handleOpenUrl(selectedTool.url, selectedTool.name)}
                style={{
                  padding: '0.75rem 1.5rem',
                  backgroundColor: selectedTool.color,
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  fontWeight: 'bold'
                }}
              >
                Open {selectedTool.name} {isInTauri ? 'in Window' : 'in New Tab'} →
              </button>
            </div>
          )}
        </div>

        {/* Tips Section */}
        <div style={{
          marginTop: '1rem',
          padding: '1rem',
          backgroundColor: '#1a1a1a',
          border: '1px solid #333',
          borderRadius: '8px'
        }}>
          <h3 style={{ fontSize: '0.875rem', color: '#ccc', marginBottom: '0.5rem' }}>
            💡 Research Workflow {isInTauri && '(Desktop Mode)'}
          </h3>
          <ul style={{ fontSize: '0.8rem', color: '#888', margin: 0, paddingLeft: '1.5rem' }}>
            {isInTauri ? (
              <>
                <li>🚀 Desktop app bypasses X-Frame-Options - sites open in native windows!</li>
                <li>Click "{isInTauri ? 'Open in Window' : 'Open in New Tab'}" to launch {selectedTool.name}</li>
                <li>Research in the dedicated window without restrictions</li>
                <li>Copy findings and discuss them with {agent.name} in the Chat Dock</li>
                <li>Switch between research tools using the buttons above</li>
              </>
            ) : (
              <>
                <li>Click "Open in New Tab" to launch {selectedTool.name} in your browser</li>
                <li>Research your topic and gather relevant information</li>
                <li>Copy interesting findings and paste them into the Chat Dock</li>
                <li>Ask {agent.name} to analyze, synthesize, or expand on your research</li>
                <li>Switch between different research tools using the buttons above</li>
              </>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
