import { useSendToChat, useConversations, useNavigation } from '@stallion-ai/sdk';
import { useCalendarEvents, useEmailInbox } from './data';
import './workspace.css';

export function Today() {
  const sendToChat = useSendToChat('work-agent');
  const today = new Date();
  const { data: events } = useCalendarEvents(today);
  const { data: inbox } = useEmailInbox({ count: 1 });
  const conversations = useConversations('work-agent') as any[];
  const nav = useNavigation();

  const fmt = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

  const prompts = [
    { title: '📋 Daily Briefing', desc: 'Review calendar and email priorities', msg: 'Review my calendar and email for today. Summarize priorities and action items.' },
    { title: '🤝 Meeting Prep', desc: 'Prepare for upcoming meetings', msg: 'Prepare me for my upcoming meetings today. Research attendees and gather account context.' },
    { title: '📝 Log Activity', desc: 'Update Salesforce with meeting notes', msg: 'Review my customer meetings and help me log activities in Salesforce.' },
    { title: '💡 Generate Insights', desc: 'Create leadership insights (SIFTs)', msg: 'Analyze my recent activities and suggest leadership insights (SIFTs) to create.' },
  ];

  const recentConversations = (conversations || [])
    .sort((a: any, b: any) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .slice(0, 10);

  const openConversation = (id: string) => {
    nav.setDockState(true);
    nav.setActiveChat(id);
  };

  const relTime = (ts: number) => {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  const thStyle = { padding: '0.5rem 0.75rem', textAlign: 'left' as const, color: 'var(--color-text-secondary)', fontSize: '0.8rem', fontWeight: 500 };
  const tdStyle = { padding: '0.5rem 0.75rem', fontSize: '0.875rem' };

  return (
    <div style={{ padding: '1rem', display: 'grid', gap: '1.5rem' }}>
      {/* Date header */}
      <div>
        <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600, color: 'var(--color-text, var(--text-primary))' }}>
          {today.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </h2>
      </div>

      {/* Quick Actions */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.75rem' }}>
        {prompts.map(p => (
          <button key={p.title} onClick={() => sendToChat(p.msg)}
            className="workspace-dashboard__card" style={{ overflow: 'visible', cursor: 'pointer', textAlign: 'left', border: '1px solid var(--color-border)', background: 'var(--color-bg, var(--bg-secondary))' }}>
            <div style={{ padding: '0.75rem' }}>
              <div style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--color-text, var(--text-primary))', marginBottom: '0.25rem' }}>{p.title}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary, var(--text-secondary))' }}>{p.desc}</div>
            </div>
          </button>
        ))}
      </div>

      {/* Today's Meetings */}
      <div className="workspace-dashboard__card" style={{ overflow: 'visible' }}>
        <div className="workspace-dashboard__card-header">
          <h3 className="workspace-dashboard__card-title">Today's Meetings ({events?.length || 0})</h3>
        </div>
        <div className="workspace-dashboard__card-content">
          {events && events.length > 0 ? events.map(e => (
            <div key={e.id} className="workspace-dashboard__card-item" style={{ display: 'flex', gap: '1rem', alignItems: 'baseline' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', minWidth: '5rem' }}>{fmt(new Date(e.start))}</span>
              <span style={{ color: 'var(--color-text, var(--text-primary))', fontSize: '0.875rem' }}>{e.subject}</span>
            </div>
          )) : (
            <div className="workspace-dashboard__empty"><div>No meetings today</div></div>
          )}
        </div>
      </div>

      {/* Recent Conversations */}
      <div className="workspace-dashboard__card" style={{ overflow: 'visible' }}>
        <div className="workspace-dashboard__card-header">
          <h3 className="workspace-dashboard__card-title">Recent Conversations</h3>
        </div>
        {recentConversations.length > 0 ? (
          <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ position: 'sticky', top: 0, background: 'var(--color-bg, var(--bg-secondary))' }}>
                <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <th style={thStyle}>Conversation</th>
                  <th style={thStyle}>Messages</th>
                  <th style={thStyle}>Last Active</th>
                  <th style={thStyle}></th>
                </tr>
              </thead>
              <tbody>
                {recentConversations.map((c: any) => (
                  <tr key={c.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td style={{ ...tdStyle, color: 'var(--color-text, var(--text-primary))' }}>
                      {c.title || c.lastMessage?.slice(0, 50) || c.id.slice(0, 8)}
                    </td>
                    <td style={{ ...tdStyle, color: 'var(--color-text-secondary)' }}>{c.messageCount || '-'}</td>
                    <td style={{ ...tdStyle, color: 'var(--color-text-secondary)' }}>{c.updatedAt ? relTime(c.updatedAt) : '-'}</td>
                    <td style={tdStyle}>
                      <button onClick={() => openConversation(c.id)}
                        style={{ background: 'none', border: '1px solid var(--color-border)', padding: '0.2rem 0.5rem', borderRadius: '0.25rem', cursor: 'pointer', fontSize: '0.75rem', color: 'var(--color-primary)' }}>
                        Resume
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="workspace-dashboard__empty"><div>No conversations yet</div></div>
        )}
      </div>
    </div>
  );
}
