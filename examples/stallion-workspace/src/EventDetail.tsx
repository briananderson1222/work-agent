import React, { useState } from 'react';
import DOMPurify from 'dompurify';
import { useToast, useSendToChat, transformTool } from '@stallion-ai/sdk';
import { useSalesContext } from './useSalesContext';
import { CRM_BASE_URL } from './constants';

interface CalendarEvent {
  meetingId: string;
  subject: string;
  start: string;
  end: string;
  categories?: string[];
  organizer?: string;
}

interface MeetingDetails extends CalendarEvent {
  body?: string;
  attendees?: Array<{email: string, name?: string, status: string}>;
  responseStatus?: string;
  meetingChangeKey?: string;
  location?: string;
}

interface EventDetailProps {
  selectedEvent: CalendarEvent | null;
  meetingDetails: MeetingDetails | null;
  loadingDetails: boolean;
  onLogActivity: () => void;
  onPhoneLookup: (alias: string) => void;
}

function detectMeetingProvider(location?: string, body?: string): { provider: string; url: string } | null {
  const providers = [
    { name: 'Teams', patterns: ['teams.microsoft.com', 'teams.live.com'], regex: /https?:\/\/[^\s<]+teams\.(microsoft|live)\.com[^\s<]*/i },
    { name: 'Zoom', patterns: ['zoom.us'], regex: /https?:\/\/[^\s<]+zoom\.us[^\s<]*/i },
    { name: 'Chime', patterns: ['chime.aws'], regex: /https?:\/\/[^\s<]+chime\.aws[^\s<]*/i },
    { name: 'Google Meet', patterns: ['meet.google.com'], regex: /https?:\/\/meet\.google\.com[^\s<]*/i },
    { name: 'Webex', patterns: ['webex.com'], regex: /https?:\/\/[^\s<]+webex\.com[^\s<]*/i },
  ];

  const checkText = (text: string) => {
    const lowerText = text.toLowerCase();
    for (const provider of providers) {
      if (provider.patterns.some(p => lowerText.includes(p))) {
        const match = text.match(provider.regex);
        if (match) return { provider: provider.name, url: match[0] };
      }
    }
    return null;
  };

  return checkText(location || '') || checkText(body || '');
}

export function EventDetail({ 
  selectedEvent, 
  meetingDetails, 
  loadingDetails, 
  onLogActivity,
  onPhoneLookup 
}: EventDetailProps) {
  const [showAllAttendees, setShowAllAttendees] = useState(false);
  const [contentExpanded, setContentExpanded] = useState(false);
  const [meetingNotes, setMeetingNotes] = useState<string | null>(null);
  
  const { showToast } = useToast();
  const sendToChat = useSendToChat('work-agent');
  const salesContext = useSalesContext();

  if (!selectedEvent) {
    return (
      <div style={{ padding: '1rem', color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>
        <p>Select an event to view details</p>
      </div>
    );
  }

  const meetingProvider = detectMeetingProvider(meetingDetails?.location, meetingDetails?.body);

  return (
    <div className="workspace-dashboard__card">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, flexWrap: 'wrap' }}>
            <h3 style={{ minWidth: 'fit-content', marginBottom: '0' }}>{selectedEvent.subject}</h3>
            {selectedEvent.categories && selectedEvent.categories.length > 0 && (
              <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                {selectedEvent.categories.map(cat => (
                  <span key={cat} style={{
                    fontSize: '0.7rem',
                    padding: '2px 6px',
                    borderRadius: '8px',
                    background: 'var(--color-bg)',
                    color: 'var(--color-text-secondary)',
                    border: '1px solid var(--color-border)'
                  }}>
                    {cat}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
            <button 
              onClick={onLogActivity}
              style={{
                padding: '0.5rem 1rem',
                background: 'transparent',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-primary)',
                borderRadius: '0.375rem',
                fontSize: '0.875rem',
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-tertiary)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              Log Activity
            </button>
            <button
              onClick={() => {
                const meetingInfo = `Meeting: ${meetingDetails?.subject || selectedEvent.subject}\nTime: ${new Date(selectedEvent.start).toLocaleString()} - ${new Date(selectedEvent.end).toLocaleTimeString()}\nLocation: ${meetingDetails?.location || 'Not specified'}${meetingDetails?.attendees ? `\nAttendees: ${meetingDetails.attendees.map(a => a.email).join(', ')}` : ''}`;
                sendToChat(`I need to log an SA activity for this meeting:\n\n${meetingInfo}\n\nWorkflow:\n- Search my email for meeting notes or follow-ups related to "${selectedEvent.subject}"\n- Use the attendee list and meeting subject to identify the relevant Salesforce account\n- Find any related opportunities for this account\n- Present matching accounts/opportunities as a numbered list for me to choose from\n- Help me create the SA activity log with the meeting notes and context`);
              }}
              style={{
                padding: '0.5rem 0.75rem',
                background: 'transparent',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-primary)',
                borderRadius: '0.375rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s'
              }}
              title="Ask agent for help"
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-tertiary)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
              </svg>
            </button>
          </div>
        </div>
        {selectedEvent && salesContext?.state?.loggedActivities?.[selectedEvent.meetingId] && (
          <div style={{ 
            marginTop: '0.75rem',
            padding: '0.75rem',
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--color-primary)',
            borderRadius: '6px',
            fontSize: '0.875rem'
          }}>
            <div style={{ color: 'var(--color-primary)', fontWeight: 600, marginBottom: '0.25rem' }}>
              ✓ Activity Logged
            </div>
            <a
              href={`${CRM_BASE_URL}/lightning/r/Task/${salesContext.state.loggedActivities[selectedEvent.meetingId].id}/view`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--color-primary)', textDecoration: 'underline' }}
            >
              {salesContext.state.loggedActivities[selectedEvent.meetingId].subject}
            </a>
          </div>
        )}
        <div>
          {meetingDetails?.organizer && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>
              <span>
                Organized by{' '}
                <a href={`mailto:${meetingDetails.organizer}`} style={{ color: 'var(--color-primary)' }}>
                  {meetingDetails.organizer}
                </a>
              </span>
              {meetingProvider && (
                <a
                  href={meetingProvider.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                    padding: '0.25rem 0.5rem',
                    background: 'var(--color-primary)',
                    color: 'var(--color-bg)',
                    border: 'none',
                    borderRadius: '4px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    textDecoration: 'none',
                    cursor: 'pointer',
                    transition: 'opacity 0.2s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.opacity = '0.9'}
                  onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
                >
                  Join {meetingProvider.provider} →
                </a>
              )}
            </div>
          )}
        </div>
      </div>
      
      {loadingDetails ? (
        <p>Loading meeting details...</p>
      ) : meetingDetails ? (
        <>
          <div>
            <p><strong>Time:</strong> {new Date(meetingDetails.start).toLocaleString()} - {new Date(meetingDetails.end).toLocaleTimeString()}</p>
            {meetingDetails.attendees && meetingDetails.attendees.length > 0 && (
              <div>
                <strong>Attendees ({meetingDetails.attendees.length}):</strong>
                <ul style={{ marginTop: '0.5rem', paddingLeft: '1.5rem' }}>
                  {(showAllAttendees ? meetingDetails.attendees : meetingDetails.attendees.slice(0, 5)).map((a, i) => (
                    <li key={i}>
                      <a href={`mailto:${a.email}`} style={{ color: 'var(--color-primary)' }}>
                        {a.name || a.email}
                      </a>
                      {a.email?.endsWith('@amazon.com') && (
                        <button
                          onClick={() => onPhoneLookup(a.email.replace('@amazon.com', ''))}
                          title="Phonetool lookup"
                          style={{ marginLeft: '0.35rem', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85em', padding: 0 }}
                        >📞</button>
                      )}
                      <span 
                        className={`attendee-status attendee-status--${a.status.toLowerCase().replace(' ', '-')}`}
                        style={{ marginLeft: '0.5rem', fontSize: '0.85em' }}
                      >
                        ({a.status})
                      </span>
                    </li>
                  ))}
                </ul>
                {meetingDetails.attendees.length > 5 && (
                  <button 
                    onClick={() => setShowAllAttendees(!showAllAttendees)}
                    style={{ 
                      marginTop: '0.5rem',
                      background: 'none',
                      border: 'none',
                      color: 'var(--color-primary)',
                      cursor: 'pointer',
                      fontSize: '0.9rem',
                      textDecoration: 'underline'
                    }}
                  >
                    {showAllAttendees ? 'Show less' : `Show ${meetingDetails.attendees.length - 5} more`}
                  </button>
                )}
              </div>
            )}
            
            {meetingDetails.body?.replace(/<[^>]*>/g, '').trim() ? (
              <div style={{ marginTop: '1rem' }}>
                <div style={{ marginBottom: '0.5rem' }}>
                  <strong>Content:</strong>
                </div>
                <div style={{ position: 'relative' }}>
                  <div 
                    className="meeting-body-content"
                    style={{ 
                      padding: '1rem', 
                      background: 'var(--color-bg-secondary)', 
                      borderRadius: '4px', 
                      border: '1px solid var(--color-border)',
                      maxHeight: contentExpanded ? 'none' : '200px',
                      overflow: 'hidden'
                    }}
                    dangerouslySetInnerHTML={{ 
                    __html: DOMPurify.sanitize(meetingDetails.body, {
                      FORBID_ATTR: ['style'],
                      FORBID_TAGS: ['style'],
                      HOOKS: {
                        afterSanitizeAttributes: (node) => {
                          if (node.tagName === 'IMG') {
                            const src = node.getAttribute('src');
                            if (src?.startsWith('cid:') || src?.includes('GetFileAttachment')) {
                              node.remove();
                            }
                          }
                        }
                      }
                    })
                  }}
                />
                {!contentExpanded && (
                  <div style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    height: '60px',
                    background: 'linear-gradient(transparent, var(--color-bg-secondary))',
                    display: 'flex',
                    alignItems: 'flex-end',
                    justifyContent: 'center',
                    paddingBottom: '0.5rem'
                  }}>
                    <button
                      onClick={() => setContentExpanded(true)}
                      style={{
                        padding: '0.5rem 1rem',
                        background: 'var(--color-bg)',
                        border: '1px solid var(--color-border)',
                        borderRadius: '4px',
                        color: 'var(--color-primary)',
                        cursor: 'pointer',
                        fontSize: '0.85rem'
                      }}
                    >
                      Show more
                    </button>
                  </div>
                )}
                {contentExpanded && (
                  <div style={{ textAlign: 'center', marginTop: '0.5rem' }}>
                    <button
                      onClick={() => setContentExpanded(false)}
                      style={{
                        padding: '0.5rem 1rem',
                        background: 'var(--color-bg)',
                        border: '1px solid var(--color-border)',
                        borderRadius: '4px',
                        color: 'var(--color-primary)',
                        cursor: 'pointer',
                        fontSize: '0.85rem'
                      }}
                    >
                      Show less
                    </button>
                  </div>
                )}
                </div>
              </div>
            ) : (
              <div style={{ marginTop: '1rem' }}>
                <p style={{ fontStyle: 'italic', color: 'var(--color-text-secondary)' }}>No content to show.</p>
              </div>
            )}
          </div>

          {/* RSVP + Take Notes */}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
            {(['accept', 'tentative', 'decline'] as const).map(resp => (
              <button key={resp}
                onClick={async () => {
                  try {
                    await transformTool('work-agent', 'sat-outlook_calendar_meeting', {
                      operation: 'update',
                      meetingId: meetingDetails.meetingId || selectedEvent.meetingId,
                      meetingChangeKey: meetingDetails.meetingChangeKey,
                      rsvpResponse: resp,
                    }, 'data => data');
                    showToast?.({ title: `Meeting ${resp}ed`, type: 'success' } as any);
                  } catch (e: any) {
                    showToast?.({ title: `Failed: ${e.message}`, type: 'error' } as any);
                  }
                }}
                style={{
                  padding: '0.35rem 0.75rem', border: 'none', borderRadius: '4px',
                  cursor: 'pointer', fontSize: '0.8rem', fontWeight: 500,
                  background: resp === 'accept' ? 'var(--health-success)' : resp === 'decline' ? 'var(--health-error)' : 'var(--warning-text)',
                  color: 'var(--text-inverted)',
                }}
              >
                {resp === 'accept' ? '✓ Accept' : resp === 'decline' ? '✗ Decline' : '? Tentative'}
              </button>
            ))}
            <button
              onClick={() => setMeetingNotes(prev => prev !== null ? null : '')}
              style={{
                padding: '0.35rem 0.75rem', border: '1px solid var(--color-border)',
                borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 500,
                background: meetingNotes !== null ? 'var(--color-primary)' : 'var(--color-bg)',
                color: meetingNotes !== null ? 'var(--text-inverted)' : 'var(--color-text)',
              }}
            >📝 Take Notes</button>
          </div>

          {meetingNotes !== null && (
            <div style={{ marginTop: '0.75rem' }}>
              <textarea
                value={meetingNotes}
                onChange={e => setMeetingNotes(e.target.value)}
                placeholder="Meeting notes..."
                style={{
                  width: '100%', minHeight: '120px', padding: '0.75rem',
                  border: '1px solid var(--color-border)', borderRadius: '4px',
                  background: 'var(--color-bg)', color: 'var(--color-text)',
                  fontSize: '0.85rem', resize: 'vertical', fontFamily: 'inherit',
                }}
              />
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button
                  disabled={!meetingNotes.trim()}
                  onClick={async () => {
                    const context = `# ${meetingDetails.subject}\n**Date:** ${new Date(meetingDetails.start).toLocaleString()}\n**Attendees:** ${meetingDetails.attendees?.map((a: any) => a.name || a.email).join(', ') || 'None'}\n\n## Notes\n${meetingNotes}`;
                    try {
                      await navigator.clipboard.writeText(context);
                      showToast?.({ title: 'Notes copied to clipboard (Obsidian integration pending)', type: 'info' } as any);
                    } catch {
                      showToast?.({ title: 'Failed to copy notes', type: 'error' } as any);
                    }
                  }}
                  style={{
                    padding: '0.35rem 0.75rem', border: 'none',
                    borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem',
                    background: 'var(--color-primary)', color: 'var(--text-inverted)', fontWeight: 500,
                    opacity: meetingNotes.trim() ? 1 : 0.5,
                  }}
                >Save to Obsidian</button>
                <button
                  onClick={() => setMeetingNotes(null)}
                  style={{
                    padding: '0.35rem 0.75rem', border: '1px solid var(--color-border)',
                    borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem',
                    background: 'var(--color-bg)', color: 'var(--color-text)',
                  }}
                >Cancel</button>
              </div>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}