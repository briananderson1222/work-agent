import { useFileSystemBrowseQuery } from '@stallion-ai/sdk';
import { useEffect, useMemo, useRef, useState } from 'react';
import './PathAutocomplete.css';

function resolveBrowsePath(value: string): string | undefined {
  const shouldSuggest = value.startsWith('/') || value.startsWith('~');
  if (!shouldSuggest) return undefined;

  if (value === '~') return '~';
  if (value === '/') return '/';

  const endsWithSlash = value.endsWith('/');
  if (endsWithSlash) {
    return value === '/' ? '/' : value.replace(/\/$/, '');
  }

  const lastSlash = value.lastIndexOf('/');
  if (value.startsWith('~/') && lastSlash === 1) {
    return '~';
  }
  if (lastSlash <= 0) {
    return value.startsWith('~') ? '~' : '/';
  }
  return value.substring(0, lastSlash);
}

function buildSuggestionPath(basePath: string, entryName: string): string {
  if (basePath === '/' || basePath === '') {
    return `/${entryName}`;
  }
  if (basePath === '~') {
    return `~/${entryName}`;
  }
  return `${basePath.replace(/\/$/, '')}/${entryName}`;
}

function normalizePathValue(value: string): string {
  if (value === '/' || value === '~') return value;
  return value.replace(/\/+$/, '');
}

function getPathLabel(path: string): string {
  if (path === '/' || path === '~') return path;
  return path.split('/').filter(Boolean).pop() ?? path;
}

export function PathAutocomplete({
  value,
  onChange,
  onSubmit,
  onBlur,
  placeholder,
  disabled,
  apiBase: _apiBase,
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
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const [userDismissed, setUserDismissed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const pickingRef = useRef(false);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const shouldSuggest = value.startsWith('/') || value.startsWith('~');
  const endsWithSlash = value.endsWith('/');
  const browsePath = resolveBrowsePath(value);
  const normalizedValue = normalizePathValue(value);
  const prefix = !shouldSuggest
    ? ''
    : endsWithSlash
      ? ''
      : value.substring(value.lastIndexOf('/') + 1).toLowerCase();

  const { data } = useFileSystemBrowseQuery(browsePath, {
    enabled: shouldSuggest,
  });

  const suggestions = useMemo(() => {
    if (!shouldSuggest || !browsePath) {
      return [];
    }
    const items: Array<{
      badge: string;
      label: string;
      path: string;
      variant: 'exact' | 'directory';
    }> = [];
    const seen = new Set<string>();
    const hasExactParentMatch =
      !endsWithSlash &&
      !!prefix &&
      (data?.entries ?? []).some(
        (entry) => entry.isDirectory && entry.name.toLowerCase() === prefix,
      );

    if (hasExactParentMatch) {
      const exactPath = normalizedValue;
      if (exactPath && !seen.has(exactPath)) {
        seen.add(exactPath);
        items.push({
          path: exactPath,
          label: getPathLabel(exactPath),
          badge: 'folder',
          variant: 'exact',
        });
      }
    }

    for (const entry of data?.entries ?? []) {
      if (!entry.isDirectory) continue;
      if (prefix && !entry.name.toLowerCase().includes(prefix)) continue;

      const path = buildSuggestionPath(browsePath, entry.name);
      if (seen.has(path)) continue;
      seen.add(path);
      items.push({
        path,
        label: entry.name,
        badge: entry.name.toLowerCase() === prefix ? 'folder' : 'match',
        variant: 'directory',
      });
    }

    return items;
  }, [
    browsePath,
    data?.entries,
    endsWithSlash,
    normalizedValue,
    prefix,
    shouldSuggest,
  ]);

  const show = !userDismissed && suggestions.length > 0;

  useEffect(() => {
    setSelectedIdx(-1);
    if (suggestions.length > 0) {
      setUserDismissed(false);
    }
  }, [suggestions]);

  const pick = (path: string) => {
    pickingRef.current = true;
    onChange(`${path}/`);
    setUserDismissed(false);
    inputRef.current?.focus();
    setTimeout(() => {
      pickingRef.current = false;
    }, 300);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!show || suggestions.length === 0) {
      if (e.key === 'Enter') {
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
      const exactSuggestion = suggestions.find(
        (suggestion) => suggestion.variant === 'exact',
      );
      if (exactSuggestion) {
        pick(exactSuggestion.path);
      } else if (suggestions.length === 1) {
        pick(suggestions[0].path);
      } else if (suggestions.length > 1) {
        setSelectedIdx((i) => (i + 1) % suggestions.length);
      }
    } else if (e.key === 'Enter') {
      if (selectedIdx >= 0) {
        e.preventDefault();
        pick(suggestions[selectedIdx].path);
      } else {
        const exactSuggestion = suggestions.find(
          (suggestion) => suggestion.variant === 'exact',
        );
        if (exactSuggestion) {
          e.preventDefault();
          pick(exactSuggestion.path);
        } else if (suggestions.length === 1) {
          e.preventDefault();
          pick(suggestions[0].path);
        } else {
          setUserDismissed(true);
          onSubmit?.();
        }
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setUserDismissed(true);
      inputRef.current?.blur();
    }
  };

  return (
    <div className="path-autocomplete">
      <input
        ref={inputRef}
        className={className ?? 'editor-input path-autocomplete__input'}
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setUserDismissed(false);
        }}
        onKeyDown={onKeyDown}
        onBlur={() =>
          setTimeout(() => {
            if (!pickingRef.current) {
              setUserDismissed(true);
              onBlur?.();
            }
          }, 200)
        }
        onFocus={() => setUserDismissed(false)}
        placeholder={placeholder}
        disabled={disabled}
      />
      {show && (
        <div className="path-autocomplete__dropdown">
          {suggestions.map((suggestion, i) => (
            <button
              key={suggestion.path}
              className={`path-autocomplete__option${i === selectedIdx ? ' path-autocomplete__option--selected' : ''}`}
              onMouseDown={() => pick(suggestion.path)}
              type="button"
            >
              <span className="path-autocomplete__icon">📁</span>
              <span className="path-autocomplete__content">
                <span className="path-autocomplete__label-row">
                  <span className="path-autocomplete__label">
                    {suggestion.label}
                  </span>
                  <span className="path-autocomplete__badge">
                    {suggestion.badge}
                  </span>
                </span>
                <span className="path-autocomplete__path">
                  {suggestion.path}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
