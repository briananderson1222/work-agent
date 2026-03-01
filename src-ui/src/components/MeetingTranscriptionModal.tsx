/**
 * MeetingTranscriptionModal — full-screen continuous speech capture.
 *
 * Records speech until the user stops, then lets them review the transcript
 * and optionally send it to the agent as a prompt asking for action items.
 */
import { useEffect, useRef } from 'react';
import type { UseMeetingTranscriptionResult } from '../hooks/useMeetingTranscription';

interface MeetingTranscriptionModalProps {
  isOpen: boolean;
  transcription: UseMeetingTranscriptionResult;
  /** Called with the full transcript text when the user clicks "Send to Agent". */
  onSend: (prompt: string) => void;
  onClose: () => void;
}

export function MeetingTranscriptionModal({
  isOpen,
  transcription,
  onSend,
  onClose,
}: MeetingTranscriptionModalProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { running, finalTranscript, interimTranscript, start, stop, clear } =
    transcription;

  // Auto-scroll to bottom as text grows
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [finalTranscript, interimTranscript]);

  // Start recording when modal opens
  useEffect(() => {
    if (isOpen && !running && transcription.supported) {
      start();
    }
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleClose = () => {
    stop();
    clear();
    onClose();
  };

  const handleSend = () => {
    const fullText = (finalTranscript + interimTranscript).trim();
    if (!fullText) return;
    const prompt = `Here is a meeting transcript. Please extract the key action items, decisions made, and any important points:\n\n${fullText}`;
    onSend(prompt);
    stop();
    clear();
    onClose();
  };

  const handleSendRaw = () => {
    const fullText = (finalTranscript + interimTranscript).trim();
    if (!fullText) return;
    onSend(fullText);
    stop();
    clear();
    onClose();
  };

  if (!isOpen) return null;

  const hasContent = !!(finalTranscript || interimTranscript);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div
        style={{
          background: 'var(--bg-secondary)',
          borderRadius: 12,
          width: '100%',
          maxWidth: 560,
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 16px',
            borderBottom: '1px solid var(--border-primary)',
            gap: 8,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Live recording indicator */}
            {running && (
              <>
                <style>{`
                  @keyframes rec-blink {
                    0%, 100% { opacity: 1; }
                    50%       { opacity: 0.3; }
                  }
                `}</style>
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background: 'var(--color-error, #ef4444)',
                    animation: 'rec-blink 1.2s ease-in-out infinite',
                    flexShrink: 0,
                  }}
                />
              </>
            )}
            <span style={{ fontWeight: 600, fontSize: 15 }}>
              {running ? 'Recording…' : 'Transcript'}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {running ? (
              <button
                type="button"
                className="button button--secondary button--small"
                onClick={stop}
              >
                Pause
              </button>
            ) : (
              <button
                type="button"
                className="button button--secondary button--small"
                onClick={start}
                disabled={!transcription.supported}
              >
                Resume
              </button>
            )}
            <button
              type="button"
              className="button button--secondary button--small"
              onClick={clear}
              disabled={!hasContent}
            >
              Clear
            </button>
            <button
              type="button"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 18, padding: '0 4px' }}
              onClick={handleClose}
              title="Close"
            >
              ×
            </button>
          </div>
        </div>

        {/* Transcript body */}
        <div
          ref={scrollRef}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '14px 16px',
            minHeight: 200,
            fontSize: 14,
            lineHeight: 1.7,
            color: 'var(--text-primary)',
          }}
        >
          {!hasContent && !running && (
            <div style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
              {transcription.supported
                ? 'Press Resume to start recording…'
                : 'Speech recognition is not supported in this browser.'}
            </div>
          )}
          {!hasContent && running && (
            <div style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
              Listening… speak now.
            </div>
          )}
          {finalTranscript && (
            <span>{finalTranscript}</span>
          )}
          {interimTranscript && (
            <span style={{ color: 'var(--text-secondary)', fontStyle: 'italic' }}>
              {interimTranscript}
            </span>
          )}
        </div>

        {/* Footer actions */}
        <div
          style={{
            padding: '12px 16px',
            borderTop: '1px solid var(--border-primary)',
            display: 'flex',
            gap: 8,
            justifyContent: 'flex-end',
          }}
        >
          <button
            type="button"
            className="button button--secondary button--small"
            onClick={handleSendRaw}
            disabled={!hasContent}
          >
            Send as message
          </button>
          <button
            type="button"
            className="button button--primary button--small"
            onClick={handleSend}
            disabled={!hasContent}
          >
            Extract action items
          </button>
        </div>
      </div>
    </div>
  );
}
