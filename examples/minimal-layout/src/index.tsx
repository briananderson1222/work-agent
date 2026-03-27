import {
  useAgents,
  useNavigation,
  useToast,
  type WorkspaceComponentProps,
} from '@stallion-ai/sdk';

/**
 * Minimal Workspace - Example plugin component
 *
 * Demonstrates basic SDK usage:
 * - Accessing agents via useAgents()
 * - Controlling chat dock via useNavigation()
 * - Showing notifications via useToast()
 */
export default function MinimalWorkspace({
  layout: _layout,
  onShowChat: _onShowChat,
}: WorkspaceComponentProps) {
  const agents = useAgents();
  const { setDockState } = useNavigation();
  const { showToast } = useToast();

  const handleOpenChat = () => {
    setDockState(true);
    showToast({
      type: 'info',
      message: 'Chat dock opened',
    });
  };

  return (
    <div style={{ padding: '2rem' }}>
      <h1>{layout?.name || 'Minimal Layout'}</h1>
      <p>{layout?.description || 'A minimal layout plugin example'}</p>

      <div style={{ marginTop: '2rem' }}>
        <h2>Available Agents</h2>
        <ul>
          {agents.map((agent: { slug: string; name: string }) => (
            <li key={agent.slug}>
              {agent.name} ({agent.slug})
            </li>
          ))}
        </ul>
      </div>

      <div style={{ marginTop: '2rem' }}>
        <button
          type="button"
          onClick={handleOpenChat}
          style={{
            padding: '0.5rem 1rem',
            background: 'var(--bg-accent)',
            color: 'var(--text-primary)',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          Open Chat Dock
        </button>
      </div>
    </div>
  );
}
