import { useState, useEffect, useRef } from 'react';

const API_BASE = 'http://localhost:3141';

interface Agent {
  slug: string;
  name: string;
  prompt: string;
}

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

function App() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch agents on mount
  useEffect(() => {
    fetchAgents();
  }, []);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const fetchAgents = async () => {
    try {
      const response = await fetch(`${API_BASE}/agents`);
      if (!response.ok) throw new Error('Failed to fetch agents');

      const data = await response.json();
      const agentList: Agent[] = (data.data || []).map((agent: any) => ({
        slug: agent.id,
        name: agent.name,
        prompt: agent.description || '',
      }));

      setAgents(agentList);
      if (agentList.length > 0 && !selectedAgent) {
        setSelectedAgent(agentList[0].slug);
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || !selectedAgent || loading) return;

    const userMessage: Message = { role: 'user', content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/agents/${selectedAgent}/text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMessage].map((m) => ({
            role: m.role,
            content: m.content,
          })),
          userId: 'tauri-ui-user',
          conversationId: `tauri-${selectedAgent}`,
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      const assistantMessage: Message = {
        role: 'assistant',
        content: data.text || 'No response',
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err: any) {
      setError(err.message);
      setMessages((prev) => [
        ...prev,
        { role: 'system', content: `Error: ${err.message}` },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const switchAgent = (slug: string) => {
    setSelectedAgent(slug);
    setMessages([]);
    setError(null);
  };

  const currentAgent = agents.find((a) => a.slug === selectedAgent);

  return (
    <div className="app">
      {/* Sidebar */}
      <div className="sidebar">
        <div className="sidebar-header">
          <h1>Work Agent</h1>
          <p>VoltAgent Desktop</p>
        </div>
        <div className="agent-list">
          {agents.length === 0 ? (
            <div className="loading">Loading agents...</div>
          ) : (
            agents.map((agent) => (
              <div
                key={agent.slug}
                className={`agent-item ${selectedAgent === agent.slug ? 'active' : ''}`}
                onClick={() => switchAgent(agent.slug)}
              >
                <h3>{agent.name}</h3>
                <p>{agent.prompt.substring(0, 60)}...</p>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="main-content">
        {selectedAgent ? (
          <>
            <div className="chat-header">
              <h2>{currentAgent?.name || selectedAgent}</h2>
            </div>
            <div className="chat-messages">
              {messages.length === 0 ? (
                <div className="empty-state">
                  <h3>Start a conversation</h3>
                  <p>Type a message below to chat with {currentAgent?.name}</p>
                </div>
              ) : (
                messages.map((msg, idx) => (
                  <div key={idx} className={`message ${msg.role}`}>
                    {msg.content}
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>
            <div className="chat-input-container">
              {error && <div className="error">{error}</div>}
              <div className="chat-input">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type a message... (Enter to send, Shift+Enter for new line)"
                  disabled={loading}
                />
                <button onClick={sendMessage} disabled={loading || !input.trim()}>
                  {loading ? 'Sending...' : 'Send'}
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="empty-state">
            <h3>No agent selected</h3>
            <p>Select an agent from the sidebar to start chatting</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
