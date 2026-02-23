import { useSendToChat, useConversations, useNavigation, useWorkspaceNavigation } from '@stallion-ai/sdk';
import { useCalendarEvents, useEmailInbox } from './data';
import './workspace.css';

type ConversationItem = { id: string; title?: string; lastMessage?: string; updatedAt?: number; messageCount?: number };

export function Today() {
  const sendToChat = useSendToChat('work-agent');
  const today = new Date();
  const { data: events } = useCalendarEvents(today);
  const { data: inbox } = useEmailInbox({ count: 1 });
  const conversations = useConversations('work-agent') as ConversationItem[];
  const nav = useNavigation();
  const { setTabState } = useWorkspaceNavigation();

  const fmt = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

  const prompts = [
    { title: '📋 Daily Briefing', desc: 'Review calendar and email priorities', msg: 'Review my calendar and email for today. Summarize priorities and action items.' },
    { title: '🤝 Meeting Prep', desc: 'Prepare for upcoming meetings', msg: 'Prepare me for my upcoming meetings today. Research attendees and gather account context.' },
    { title: '📝 Log Activity', desc: 'Update Salesforce with meeting notes', msg: 'Review my customer meetings and help me log activities in Salesforce.' },
    { title: '💡 Generate Insights', desc: 'Create leadership insights (SIFTs)', msg: 'Analyze my recent activities and suggest leadership insights (SIFTs) to create.' },
  ];

  const recentConversations = (conversations || [])
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
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

  return (
    <div className="workspace-dashboard__page">
      {/* Date header */}
      <div>
        <h2 className="workspace-dashboard__page-title">
          {today.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </h2>
      </div>

      {/* Quick Actions */}
      <div className="workspace-dashboard__prompt-grid">
        {prompts.map(p => (
          <button key={p.title} onClick={() => sendToChat(p.msg)} className="workspace-dashboard__prompt-btn">
            <div className="workspace-dashboard__prompt-title">{p.title}</div>
            <div className="workspace-dashboard__prompt-desc">{p.desc}</div>
          </button>
        ))}
      </div>

      {/* Today's Meetings */}
      <div className="workspace-dashboard__card" style={{ overflow: 'visible' }}>
        <div className="workspace-dashboard__card-header">
          <h3 className="workspace-dashboard__card-title">Today's Meetings ({events?.length || 0})</h3>
        </div>
        <div className="workspace-dashboard__scroll-sm workspace-dashboard__card-content">
          {events && events.length > 0 ? events.map(e => (
            <a key={e.id} href={`/workspaces/stallion/calendar`}
              className="workspace-dashboard__card-item workspace-dashboard__meeting-link"
              onClick={ev => {
                ev.preventDefault();
                const params = new URLSearchParams();
                params.set('event', e.id);
                params.set('date', new Date(e.start).toISOString().split('T')[0]);
                setTabState('calendar', params.toString());
                nav.setWorkspaceTab('stallion', 'calendar');
              }}>
              <span className="workspace-dashboard__meeting-time">{fmt(new Date(e.start))}</span>
              <span className="workspace-dashboard__meeting-subject">{e.subject}</span>
            </a>
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
          <div className="workspace-dashboard__scroll-md">
            <table className="workspace-dashboard__table">
              <thead>
                <tr>
                  <th>Conversation</th>
                  <th>Messages</th>
                  <th>Last Active</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {recentConversations.map(c => (
                  <tr key={c.id}>
                    <td style={{ color: 'var(--color-text, var(--text-primary))' }}>
                      {c.title || c.lastMessage?.slice(0, 50) || c.id.slice(0, 8)}
                    </td>
                    <td style={{ color: 'var(--color-text-secondary)' }}>{c.messageCount || '-'}</td>
                    <td style={{ color: 'var(--color-text-secondary)' }}>{c.updatedAt ? relTime(c.updatedAt) : '-'}</td>
                    <td>
                      <button onClick={() => openConversation(c.id)} className="workspace-dashboard__resume-btn">
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
