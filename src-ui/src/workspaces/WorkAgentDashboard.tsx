import { useMemo, useState } from 'react';
import type { AgentQuickPrompt } from '../types';
import type { AgentWorkspaceProps } from './index';

interface CalendarEvent {
  id: string;
  title: string;
  time: string;
  duration?: string;
  summary: string;
  location?: string;
  attendees?: string[];
  notes?: string;
  followUps?: string[];
  recommendedPrompt?: AgentQuickPrompt;
}

const MOCK_EVENTS: CalendarEvent[] = [
  {
    id: 'kickoff',
    title: 'Project Kickoff Sync',
    time: '09:00',
    duration: '45 min',
    summary: 'Outline this week\'s delivery plan and confirm responsibilities with the core team.',
    location: 'Zoom',
    attendees: ['Sharon', 'Devon', 'Priya'],
    notes: 'Capture open questions from stakeholders and turn them into tasks.',
    followUps: ['Email summary to stakeholders', 'File ticket for API schema update'],
    recommendedPrompt: {
      id: 'prep-kickoff',
      label: 'Prep Kickoff Notes',
      prompt: 'Draft talking points for the kickoff sync focusing on this week\'s milestones and dependencies.'
    }
  },
  {
    id: 'triage',
    title: 'Issue Triage',
    time: '11:30',
    duration: '30 min',
    summary: 'Review high-priority bugs and assign owners before sprint planning.',
    location: 'Linear Board',
    attendees: ['Devon', 'Rowan'],
    followUps: ['Update Linear statuses', 'Confirm reproduction steps for bug #1824']
  },
  {
    id: 'standup',
    title: 'Engineering Standup',
    time: '14:00',
    duration: '15 min',
    summary: 'Share updates and blockers across engineering pods.',
    location: 'Slack Huddle',
    attendees: ['Engineering Team'],
    notes: 'Highlight deployment schedule for the afternoon release.',
    followUps: ['Post deployment checklist', 'Update release notes']
  },
  {
    id: 'focus',
    title: 'Focus Block',
    time: '15:00',
    duration: '90 min',
    summary: 'Heads-down time for implementing chat dock refactor tasks.',
    location: 'Workspace',
    notes: 'Target: deliver tabbed chat experience draft by EOD.'
  }
];

export function WorkAgentDashboard({ agent, onLaunchPrompt, onShowChat }: AgentWorkspaceProps) {
  const events = useMemo(() => MOCK_EVENTS, []);
  const [selectedId, setSelectedId] = useState<string | null>(events[0]?.id ?? null);

  const selectedEvent = events.find((event) => event.id === selectedId) ?? null;

  const handleRecommendedPrompt = () => {
    if (selectedEvent?.recommendedPrompt && onLaunchPrompt) {
      onLaunchPrompt(selectedEvent.recommendedPrompt);
    }
  };

  return (
    <div className="workspace-dashboard">
      <header className="workspace-dashboard__header">
        <div>
          <h2>Today&apos;s Plan</h2>
          <p>Mock schedule for {agent.name}. Replace with live data once integrations are ready.</p>
        </div>
        <div className="workspace-dashboard__actions">
          {selectedEvent?.recommendedPrompt && (
            <button
              className="workspace-dashboard__action"
              onClick={handleRecommendedPrompt}
              type="button"
            >
              Use Prompt: {selectedEvent.recommendedPrompt.label}
            </button>
          )}
          <button className="workspace-dashboard__action" onClick={() => onShowChat?.()} type="button">
            Open Chat Dock
          </button>
        </div>
      </header>
      <div className="workspace-dashboard__content">
        <aside className="workspace-dashboard__calendar">
          <ul>
            {events.map((event) => {
              const isActive = event.id === selectedId;
              return (
                <li
                  key={event.id}
                  className={`workspace-dashboard__calendar-item ${isActive ? 'is-active' : ''}`}
                >
                  <button type="button" onClick={() => setSelectedId(event.id)}>
                    <span className="workspace-dashboard__time">
                      {event.time}
                      {event.duration ? ` · ${event.duration}` : ''}
                    </span>
                    <span className="workspace-dashboard__title">{event.title}</span>
                    <span className="workspace-dashboard__summary">{event.summary}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>
        <section className="workspace-dashboard__details">
          {selectedEvent ? (
            <div className="workspace-dashboard__card">
              <h3>{selectedEvent.title}</h3>
              <p className="workspace-dashboard__details-time">
                {selectedEvent.time}
                {selectedEvent.duration ? ` · ${selectedEvent.duration}` : ''}
              </p>
              <p className="workspace-dashboard__details-summary">{selectedEvent.summary}</p>
              {selectedEvent.location && (
                <p className="workspace-dashboard__details-meta">
                  <strong>Location:</strong> {selectedEvent.location}
                </p>
              )}
              {selectedEvent.attendees && (
                <p className="workspace-dashboard__details-meta">
                  <strong>Attendees:</strong> {selectedEvent.attendees.join(', ')}
                </p>
              )}
              {selectedEvent.notes && (
                <p className="workspace-dashboard__details-notes">{selectedEvent.notes}</p>
              )}
              {selectedEvent.followUps && selectedEvent.followUps.length > 0 && (
                <div className="workspace-dashboard__details-followups">
                  <h4>Follow-ups</h4>
                  <ul>
                    {selectedEvent.followUps.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className="workspace-dashboard__empty">
              <p>Select an event to view details.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
