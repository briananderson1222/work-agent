/**
 * Syntax-highlighted code block for ReactMarkdown.
 *
 * Usage:
 *   <ReactMarkdown components={markdownComponents}>...</ReactMarkdown>
 */

import { memo, useMemo, useState, useCallback } from 'react';
import { useSyntaxHighlighter } from '../contexts/SyntaxHighlighterContext';

const LANG_REGEX = /language-(\S+)/;

function extractLang(className?: string): string | undefined {
  const match = className?.match(LANG_REGEX);
  return match?.[1];
}

const HighlightedCode = memo(function HighlightedCode({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  const highlighter = useSyntaxHighlighter();
  const [copied, setCopied] = useState(false);
  const code = String(children).replace(/\n$/, '');
  const lang = extractLang(className);

  const html = useMemo(() => {
    if (!highlighter.ready || !lang) return null;
    return highlighter.highlight(code, lang);
  }, [highlighter, highlighter.ready, code, lang]);

  const handleCopy = useCallback(() => {
    navigator.clipboard?.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [code]);

  // Inline code (no language class) — render as-is
  if (!lang) {
    return <code className={className}>{children}</code>;
  }

  return (
    <div style={{ position: 'relative', margin: '8px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 12px', background: '#161b22', borderRadius: '6px 6px 0 0', borderBottom: '1px solid #30363d' }}>
        <span style={{ fontSize: '11px', color: '#8b949e' }}>{lang}</span>
        <button
          type="button"
          onClick={handleCopy}
          style={{ background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer', fontSize: '11px', padding: '2px 6px' }}
        >
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>
      {html ? (
        <div
          style={{ fontSize: '12px', lineHeight: '1.5', overflowX: 'auto' }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <pre style={{ margin: 0, padding: '12px', background: '#0d1117', borderRadius: '0 0 6px 6px', overflowX: 'auto' }}>
          <code style={{ fontFamily: 'monospace', fontSize: '12px', color: '#e6edf3' }}>{code}</code>
        </pre>
      )}
    </div>
  );
});

/**
 * ReactMarkdown components override — pass to `components` prop.
 */
export const markdownCodeComponents = {
  code: HighlightedCode,
};
