import { useState } from 'react';
import { useAgents, useAuth, useNavigation, type WorkspaceComponentProps } from '@work-agent/sdk';

function Welcome({ onShowChat }: WorkspaceComponentProps) {
  const agents = useAgents();
  const { status, provider, user } = useAuth();
  const { setDockState } = useNavigation();

  return (
    <div style={{ padding: '2rem', maxWidth: '720px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>👋 Welcome to Work Agent</h1>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>
        This is a demo workspace. Install plugins to add real functionality.
      </p>

      <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: '1fr 1fr' }}>
        <Card title="🤖 Agents" value={`${agents.length} available`}>
          <ul style={{ margin: 0, padding: '0 0 0 1.2rem', fontSize: '0.85rem' }}>
            {agents.map(a => <li key={a.slug}>{a.name} ({a.slug})</li>)}
          </ul>
        </Card>

        <Card title="🔐 Auth" value={`${status}${provider ? ` (${provider})` : ''}`}>
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            {user?.alias ? `Logged in as ${user.name || user.alias}` : 'No user identity configured'}
          </p>
        </Card>
      </div>

      <div style={{ marginTop: '2rem' }}>
        <button onClick={() => { setDockState(true); onShowChat?.(); }}
          style={{ padding: '0.6rem 1.2rem', background: 'var(--accent-primary, #3b82f6)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.9rem' }}>
          💬 Open Chat
        </button>
      </div>

      <div style={{ marginTop: '2rem', padding: '1rem', background: 'var(--bg-secondary)', borderRadius: '8px', fontSize: '0.85rem' }}>
        <strong>Getting Started</strong>
        <ol style={{ margin: '0.5rem 0 0', paddingLeft: '1.2rem' }}>
          <li>Install a workspace plugin: <code>npx @work-agent/cli install &lt;git-url&gt;</code></li>
          <li>Restart the server to load new agents and providers</li>
          <li>Switch to the installed workspace from the workspace selector</li>
        </ol>
      </div>
    </div>
  );
}

function Notes() {
  const [notes, setNotes] = useState(() => {
    try { return localStorage.getItem('work-agent-demo-notes') || ''; } catch { return ''; }
  });

  const save = (value: string) => {
    setNotes(value);
    try { localStorage.setItem('work-agent-demo-notes', value); } catch {}
  };

  return (
    <div style={{ padding: '2rem', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <h2 style={{ fontSize: '1.2rem', marginBottom: '0.75rem' }}>📝 Notes</h2>
      <textarea
        value={notes}
        onChange={e => save(e.target.value)}
        placeholder="Type your notes here..."
        style={{
          flex: 1, width: '100%', padding: '1rem', fontSize: '0.9rem', lineHeight: 1.6,
          background: 'var(--bg-secondary)', color: 'var(--text-primary)',
          border: '1px solid var(--border-primary)', borderRadius: '8px',
          resize: 'none', fontFamily: 'inherit',
        }}
      />
    </div>
  );
}

function Card({ title, value, children }: { title: string; value: string; children?: React.ReactNode }) {
  return (
    <div style={{ padding: '1rem', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border-primary)' }}>
      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>{title}</div>
      <div style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>{value}</div>
      {children}
    </div>
  );
}

export const components = {
  'demo-workspace-welcome': Welcome,
  'demo-workspace-notes': Notes,
};

export default Welcome;
