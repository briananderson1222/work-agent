import { useEffect, useRef, useState } from 'react';

export function PathAutocomplete({
  value,
  onChange,
  onSubmit,
  onBlur,
  placeholder,
  disabled,
  apiBase,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit?: () => void;
  onBlur?: () => void;
  placeholder?: string;
  disabled?: boolean;
  apiBase: string;
  className?: string;
}) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const [show, setShow] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const pickingRef = useRef(false);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!value.startsWith('/') && !value.startsWith('~')) {
      setSuggestions([]);
      return;
    }
    const endsWithSlash = value.endsWith('/');
    const dir = endsWithSlash
      ? value.replace(/\/$/, '')
      : value.lastIndexOf('/') <= 0
        ? '/'
        : value.substring(0, value.lastIndexOf('/'));
    const prefix = endsWithSlash
      ? ''
      : value.substring(value.lastIndexOf('/') + 1).toLowerCase();
    const controller = new AbortController();
    fetch(`${apiBase}/api/fs/browse?path=${encodeURIComponent(dir)}`, {
      signal: controller.signal,
    })
      .then((r) => r.json())
      .then((raw) => {
        const data = raw.data ?? raw;
        if (!data.entries) return;
        const matches = data.entries
          .filter((e: any) => !prefix || e.name.toLowerCase().includes(prefix))
          .map((e: any) => `${data.path}/${e.name}`);
        setSuggestions(matches);
        setSelectedIdx(-1);
        setShow(matches.length > 0);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [value, apiBase]);

  const pick = (path: string) => {
    pickingRef.current = true;
    onChange(`${path}/`);
    setShow(true);
    inputRef.current?.focus();
    setTimeout(() => {
      pickingRef.current = false;
    }, 300);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!show || suggestions.length === 0) {
      if (e.key === 'Enter') {
        setShow(false);
        onSubmit?.();
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Tab') {
      e.preventDefault();
      if (suggestions.length === 1) {
        pick(suggestions[0]);
      } else if (suggestions.length > 1) {
        setSelectedIdx((i) => (i + 1) % suggestions.length);
      }
    } else if (e.key === 'Enter') {
      if (selectedIdx >= 0) {
        e.preventDefault();
        pick(suggestions[selectedIdx]);
      } else {
        setShow(false);
        onSubmit?.();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setShow(false);
      inputRef.current?.blur();
    }
  };

  return (
    <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
      <input
        ref={inputRef}
        className={className ?? 'editor-input'}
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setShow(true);
        }}
        onKeyDown={onKeyDown}
        onBlur={() =>
          setTimeout(() => {
            if (!pickingRef.current) {
              setShow(false);
              onBlur?.();
            }
          }, 200)
        }
        onFocus={() => suggestions.length > 0 && setShow(true)}
        placeholder={placeholder}
        disabled={disabled}
      />
      {show && suggestions.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            zIndex: 100,
            background: 'var(--bg-secondary, #1e1e1e)',
            border: '1px solid var(--border-primary)',
            borderRadius: '0 0 8px 8px',
            maxHeight: 200,
            overflowY: 'auto',
          }}
        >
          {suggestions.map((s, i) => (
            <div
              key={s}
              onMouseDown={() => pick(s)}
              style={{
                padding: '6px 12px',
                cursor: 'pointer',
                fontSize: '0.85rem',
                fontFamily: 'monospace',
                color: 'var(--text-primary, #ccc)',
                background:
                  i === selectedIdx
                    ? 'var(--bg-hover, #2a2a2a)'
                    : 'transparent',
              }}
            >
              📁 {s.split('/').pop()}
              <span
                style={{ opacity: 0.4, marginLeft: 8, fontSize: '0.75rem' }}
              >
                {s}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
