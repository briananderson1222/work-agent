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
      <div className="event-detail-empty">
        <p>Select an event to view details</p>
      </div>
    );
  }

  const meetingProvider = detectMeetingProvider(meetingDetails?.location, meetingDetails?.body);

  return (
    <div className="workspace-dashboard__card">
      <div className="event-detail-container">
        <div className="event-detail-header">
          <div className="event-detail-title-section">
            <h3 className="event-detail-title">{selectedEvent.subject}</h3>
            {selectedEvent.categories && selectedEvent.categories.length > 0 && (
              <div className="event-detail-categories">
                {selectedEvent.categories.map(cat => (
                  <span key={cat} className="event-detail-category-tag">
                    {cat}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="event-detail-actions">
            <button 
              onClick={onLogActivity}
              className="event-detail-log-btn"
            >
              Log Activity
            </button>
            <button
              onClick={() => {
                const meetingInfo = `Meeting: ${meetingDetails?.subject || selectedEvent.subject}\nTime: ${new Date(selectedEvent.start).toLocaleString()} - ${new Date(selectedEvent.end).toLocaleTimeString()}\nLocation: ${meetingDetails?.location || 'Not specified'}${meetingDetails?.attendees ? `\nAttendees: ${meetingDetails.attendees.map(a => a.email).join(', ')}` : ''}`;
                sendToChat(`I need to log an SA activity for this meeting:\n\n${meetingInfo}\n\nWorkflow:\n- Search my email for meeting notes or follow-ups related to "${selectedEvent.subject}"\n- Use the attendee list and meeting subject to identify the relevant Salesforce account\n- Find any related opportunities for this account\n- Present matching accounts/opportunities as a numbered list for me to choose from\n- Help me create the SA activity log with the meeting notes and context`);
              }}
              className="event-detail-agent-btn"
              title="Ask agent for help"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
              </svg>
            </button>
          </div>
        </div>
        {selectedEvent && salesContext?.state?.loggedActivities?.[selectedEvent.meetingId] && (
          <div className="event-detail-logged-activity">
            <div className="event-detail-logged-status">
              ✓ Activity Logged
            </div>
            <a
              href={`${CRM_BASE_URL}/lightning/r/Task/${salesContext.state.loggedActivities[selectedEvent.meetingId].id}/view`}
              target="_blank"
              rel="noopener noreferrer"
              className="event-detail-logged-link"
            >
              {salesContext.state.loggedActivities[selectedEvent.meetingId].subject}
            </a>
          </div>
        )}
        <div>
          {meetingDetails?.organizer && (
            <div className="event-detail-organizer-section">
              <span>
                Organized by{' '}
                <a href={`mailto:${meetingDetails.organizer}`} className="event-detail-organizer-link">
                  {meetingDetails.organizer}
                </a>
              </span>
              {meetingProvider && (
                <a
                  href={meetingProvider.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="event-detail-join-btn"
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
                <ul className="event-detail-attendees-list">
                  {(showAllAttendees ? meetingDetails.attendees : meetingDetails.attendees.slice(0, 5)).map((a, i) => (
                    <li key={i}>
                      <a href={`mailto:${a.email}`} className="event-detail-attendee-link">
                        {a.name || a.email}
                      </a>
                      {a.email?.endsWith('@amazon.com') && (
                        <button
                          onClick={() => onPhoneLookup(a.email.replace('@amazon.com', ''))}
                          title="Phonetool lookup"
                          className="event-detail-phone-btn"
                        >📞</button>
                      )}
                      <span 
                        className={`attendee-status attendee-status--${a.status.toLowerCase().replace(' ', '-')} event-detail-attendee-status`}
                      >
                        ({a.status})
                      </span>
                    </li>
                  ))}
                </ul>
                {meetingDetails.attendees.length > 5 && (
                  <button 
                    onClick={() => setShowAllAttendees(!showAllAttendees)}
                    className="event-detail-show-attendees-btn"
                  >
                    {showAllAttendees ? 'Show less' : `Show ${meetingDetails.attendees.length - 5} more`}
                  </button>
                )}
              </div>
            )}
            
            {meetingDetails.body?.replace(/<[^>]*>/g, '').trim() ? (
              <div className="event-detail-content-section">
                <div className="event-detail-content-header">
                  <strong>Content:</strong>
                </div>
                <div className="event-detail-content-wrapper">
                  <div 
                    className={`meeting-body-content event-detail-content-body ${!contentExpanded ? 'event-detail-content-body--collapsed' : ''}`}
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
                  <div className="event-detail-content-fade">
                    <button
                      onClick={() => setContentExpanded(true)}
                      className="event-detail-show-more-btn"
                    >
                      Show more
                    </button>
                  </div>
                )}
                {contentExpanded && (
                  <div className="event-detail-show-less-wrapper">
                    <button
                      onClick={() => setContentExpanded(false)}
                      className="event-detail-show-less-btn"
                    >
                      Show less
                    </button>
                  </div>
                )}
                </div>
              </div>
            ) : (
              <div className="event-detail-no-content">
                <p className="event-detail-no-content-text">No content to show.</p>
              </div>
            )}
          </div>

          {/* RSVP + Take Notes */}
          <div className="event-detail-rsvp-section">
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
                    showToast?.({ title: `Meeting ${resp}ed`, type: 'success' });
                  } catch (e: unknown) {
                    const error = e as Error;
                    showToast?.({ title: `Failed: ${error.message}`, type: 'error' });
                  }
                }}
                className={`event-detail-rsvp-btn event-detail-rsvp-btn--${resp}`}
              >
                {resp === 'accept' ? '✓ Accept' : resp === 'decline' ? '✗ Decline' : '? Tentative'}
              </button>
            ))}
            <button
              onClick={() => setMeetingNotes(prev => prev !== null ? null : '')}
              className={`event-detail-notes-btn ${meetingNotes !== null ? 'event-detail-notes-btn--active' : 'event-detail-notes-btn--inactive'}`}
            >📝 Take Notes</button>
          </div>

          {meetingNotes !== null && (
            <div className="event-detail-notes-section">
              <textarea
                value={meetingNotes}
                onChange={e => setMeetingNotes(e.target.value)}
                placeholder="Meeting notes..."
                className="event-detail-notes-textarea"
              />
              <div className="event-detail-notes-actions">
                <button
                  disabled={!meetingNotes.trim()}
                  onClick={async () => {
                    const context = `# ${meetingDetails.subject}\n**Date:** ${new Date(meetingDetails.start).toLocaleString()}\n**Attendees:** ${meetingDetails.attendees?.map((a: any) => a.name || a.email).join(', ') || 'None'}\n\n## Notes\n${meetingNotes}`;
                    try {
                      await navigator.clipboard.writeText(context);
                      showToast?.({ title: 'Notes copied to clipboard (Obsidian integration pending)', type: 'info' });
                    } catch {
                      showToast?.({ title: 'Failed to copy notes', type: 'error' });
                    }
                  }}
                  className="event-detail-save-notes-btn"
                >Save to Obsidian</button>
                <button
                  onClick={() => setMeetingNotes(null)}
                  className="event-detail-cancel-notes-btn"
                >Cancel</button>
              </div>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}