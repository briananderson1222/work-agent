import { useCodingFileContentQuery } from '@stallion-ai/sdk';
import DOMPurify from 'dompurify';
import { useMemo } from 'react';
import { useApiBase } from '../../contexts/ApiBaseContext';
import {
  langFromFilePath,
  useSyntaxHighlighter,
} from '../../contexts/SyntaxHighlighterContext';

export function FileContentViewer({
  filePath,
  onClose,
}: {
  filePath: string;
  onClose: () => void;
}) {
  const { apiBase } = useApiBase();
  const highlighter = useSyntaxHighlighter();
  const { data: content = '', isLoading: loading } = useCodingFileContentQuery(
    filePath,
    apiBase,
  );

  const highlighted = useMemo(() => {
    if (!content || !highlighter.ready) {
      return null;
    }
    const language = langFromFilePath(filePath);
    return highlighter.highlight(content, language);
  }, [content, filePath, highlighter]);

  const detectedLang = langFromFilePath(filePath);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 12px 4px',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              fontSize: '11px',
              fontWeight: 600,
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            {filePath.split('/').pop()}
          </span>
          {detectedLang && (
            <span
              style={{
                fontSize: '9px',
                color: 'var(--text-muted)',
                background: 'var(--bg-secondary)',
                borderRadius: '3px',
                padding: '1px 5px',
              }}
            >
              {detectedLang}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            fontSize: '14px',
          }}
        >
          ✕
        </button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 12px 12px' }}>
        {loading ? (
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Loading…
          </div>
        ) : highlighted ? (
          <div
            style={{ fontSize: '11px', lineHeight: '1.6' }}
            dangerouslySetInnerHTML={{
              __html: DOMPurify.sanitize(highlighted),
            }}
          />
        ) : (
          <pre
            style={{
              margin: 0,
              fontFamily: 'monospace',
              fontSize: '11px',
              color: 'var(--text-secondary)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
            }}
          >
            {content}
          </pre>
        )}
      </div>
    </div>
  );
}
