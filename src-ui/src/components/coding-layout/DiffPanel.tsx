import { useCodingDiffQuery } from '@stallion-ai/sdk';
import { useApiBase } from '../../contexts/ApiBaseContext';

interface DiffLine {
  text: string;
  type: 'add' | 'remove' | 'context' | 'meta';
  oldNum?: number;
  newNum?: number;
}

interface DiffHunk {
  header: string;
  lines: DiffLine[];
}

function renderDiff(text: string) {
  if (!text) {
    return (
      <div
        style={{
          padding: '12px',
          fontSize: '12px',
          color: 'var(--text-muted)',
        }}
      >
        No changes
      </div>
    );
  }

  const hunks: DiffHunk[] = [];
  let currentHunk: DiffHunk | null = null;
  let oldLine = 0;
  let newLine = 0;

  for (const raw of text.split('\n')) {
    if (raw.startsWith('@@')) {
      const match = raw.match(/@@ -(\d+)(?:,\d+)? \+(\d+)/);
      oldLine = match ? parseInt(match[1], 10) : 0;
      newLine = match ? parseInt(match[2], 10) : 0;
      currentHunk = { header: raw, lines: [] };
      hunks.push(currentHunk);
      continue;
    }

    if (
      raw.startsWith('diff ') ||
      raw.startsWith('index ') ||
      raw.startsWith('---') ||
      raw.startsWith('+++')
    ) {
      if (!currentHunk) {
        currentHunk = { header: '', lines: [] };
        hunks.push(currentHunk);
      }
      currentHunk.lines.push({ text: raw, type: 'meta' });
      continue;
    }

    if (!currentHunk) {
      continue;
    }

    if (raw.startsWith('+')) {
      currentHunk.lines.push({
        text: raw.slice(1),
        type: 'add',
        newNum: newLine++,
      });
      continue;
    }

    if (raw.startsWith('-')) {
      currentHunk.lines.push({
        text: raw.slice(1),
        type: 'remove',
        oldNum: oldLine++,
      });
      continue;
    }

    currentHunk.lines.push({
      text: raw.slice(1) || raw,
      type: 'context',
      oldNum: oldLine++,
      newNum: newLine++,
    });
  }

  return hunks.map((hunk, index) => (
    <div key={`${hunk.header}-${index}`} style={{ marginBottom: '8px' }}>
      {hunk.header && (
        <div
          style={{
            color: '#2196f3',
            fontFamily: 'monospace',
            fontSize: '11px',
            padding: '4px 8px',
            background: 'rgba(33,150,243,0.08)',
            borderRadius: '3px',
            marginBottom: '2px',
          }}
        >
          {hunk.header}
        </div>
      )}
      {hunk.lines.map((line, lineIndex) => {
        const background =
          line.type === 'add'
            ? 'rgba(76,175,80,0.1)'
            : line.type === 'remove'
              ? 'rgba(244,67,54,0.1)'
              : 'transparent';
        const color =
          line.type === 'add'
            ? '#4caf50'
            : line.type === 'remove'
              ? '#f44336'
              : line.type === 'meta'
                ? 'var(--text-muted)'
                : 'var(--text-secondary)';
        const prefix =
          line.type === 'add'
            ? '+'
            : line.type === 'remove'
              ? '-'
              : line.type === 'meta'
                ? ''
                : ' ';

        return (
          <div
            key={`${line.text}-${lineIndex}`}
            style={{
              display: 'flex',
              fontFamily: 'monospace',
              fontSize: '11px',
              lineHeight: '1.6',
              background,
            }}
          >
            <span
              style={{
                width: '36px',
                textAlign: 'right',
                color: 'var(--text-muted)',
                opacity: 0.5,
                paddingRight: '4px',
                flexShrink: 0,
                userSelect: 'none',
              }}
            >
              {line.oldNum ?? ''}
            </span>
            <span
              style={{
                width: '36px',
                textAlign: 'right',
                color: 'var(--text-muted)',
                opacity: 0.5,
                paddingRight: '8px',
                flexShrink: 0,
                userSelect: 'none',
              }}
            >
              {line.newNum ?? ''}
            </span>
            <span style={{ color, whiteSpace: 'pre' }}>
              {prefix}
              {line.text || '\u00a0'}
            </span>
          </div>
        );
      })}
    </div>
  ));
}

export function DiffPanel({ workingDir }: { workingDir: string }) {
  const { apiBase } = useApiBase();
  const {
    data: diff = '',
    isLoading: loading,
    error: queryError,
  } = useCodingDiffQuery(workingDir, apiBase);
  const error = queryError?.message || null;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div
        style={{
          padding: '6px 12px 4px',
          fontSize: '11px',
          fontWeight: 600,
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          flexShrink: 0,
        }}
      >
        Git Diff
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 12px 12px' }}>
        {loading && (
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Loading…
          </div>
        )}
        {error && (
          <div style={{ fontSize: '12px', color: 'var(--error-text)' }}>
            {error}
          </div>
        )}
        {!loading && !error && renderDiff(diff)}
      </div>
    </div>
  );
}
