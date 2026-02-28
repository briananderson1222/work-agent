import { useEffect, useRef, useState } from 'react';
import { useShortcutDisplay } from '../hooks/useKeyboardShortcut';
import type { WorkspaceMetadata } from '../types';
import { getWorkspaceIcon } from '../utils/workspace';

export interface WorkspaceSelectorProps {
  workspaces: WorkspaceMetadata[];
  selectedWorkspace: WorkspaceMetadata | null;
  onSelect: (slug: string) => void;
  onCreateWorkspace: () => void;
  onEditWorkspace: (slug: string) => void;
  onSettings: () => void;
}

export function WorkspaceSelector({
  workspaces,
  selectedWorkspace,
  onSelect,
  onCreateWorkspace,
  onEditWorkspace,
  onSettings,
}: WorkspaceSelectorProps) {
  const newWorkspaceShortcut = useShortcutDisplay('app.newWorkspace');
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const close = () => {
    setIsOpen(false);
    setFocusedIndex(-1);
  };

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        close();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close();
        buttonRef.current?.focus();
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        setFocusedIndex((prev) => Math.min(prev + 1, workspaces.length - 1));
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setFocusedIndex((prev) => Math.max(prev - 1, -1));
      } else if (event.key === 'Enter' && focusedIndex >= 0) {
        event.preventDefault();
        handleSelect(workspaces[focusedIndex].slug);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, focusedIndex, workspaces]); // eslint-disable-line

  const handleSelect = (slug: string) => {
    onSelect(slug);
    close();
  };

  const getDropdownStyle = () => {
    if (!buttonRef.current) return {};
    const rect = buttonRef.current.getBoundingClientRect();
    const maxHeight = window.innerHeight * 0.6;
    return {
      position: 'fixed' as const,
      top: `${rect.bottom + 8}px`,
      left: `${rect.left}px`,
      width: '320px',
      maxHeight: `${maxHeight}px`,
      backgroundColor: 'var(--bg-primary)',
      borderRadius: '8px',
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
      border: '2px solid var(--border-primary)',
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column' as const,
    };
  };

  return (
    <div className="relative workspace-selector" ref={menuRef}>
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 12px',
          backgroundColor: 'var(--bg-secondary)',
          color: 'var(--text-primary)',
          border: '1px solid var(--border-primary)',
          borderRadius: '8px',
          cursor: 'pointer',
          transition: 'background-color 0.2s',
        }}
        onMouseEnter={(e) =>
          (e.currentTarget.style.backgroundColor = 'var(--bg-hover)')
        }
        onMouseLeave={(e) =>
          (e.currentTarget.style.backgroundColor = 'var(--bg-secondary)')
        }
      >
        {selectedWorkspace && (
          <div
            style={{
              width: '24px',
              height: '24px',
              borderRadius: '50%',
              backgroundColor: 'var(--color-primary)',
              color: 'var(--bg-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: getWorkspaceIcon(selectedWorkspace).isCustomIcon
                ? '14px'
                : '11px',
              fontWeight: 600,
            }}
          >
            {getWorkspaceIcon(selectedWorkspace).display}
          </div>
        )}
        <span style={{ fontWeight: 500 }}>
          {selectedWorkspace?.name || 'Select Workspace'}
        </span>
        <svg
          style={{
            width: '16px',
            height: '16px',
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s',
          }}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {isOpen && (
        <div style={getDropdownStyle()}>
          <div
            style={{
              padding: '6px 8px',
              borderBottom: '1px solid var(--border-primary)',
              display: 'flex',
              justifyContent: 'flex-end',
            }}
          >
            <button
              onClick={() => {
                close();
                onCreateWorkspace();
              }}
              style={{
                padding: '4px 10px',
                backgroundColor: 'transparent',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-primary)',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.backgroundColor = 'var(--bg-hover)')
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.backgroundColor = 'transparent')
              }
              title={`New (${newWorkspaceShortcut})`}
            >
              <span style={{ fontSize: '16px' }}>+</span>
              <span>New</span>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                {newWorkspaceShortcut}
              </span>
            </button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
            {workspaces.length === 0 ? (
              <div
                style={{
                  padding: '12px 16px',
                  textAlign: 'center',
                  color: 'var(--text-muted)',
                  fontSize: '14px',
                }}
              >
                No workspaces found. Create one to get started.
              </div>
            ) : (
              workspaces.map((ws, idx) => (
                <div
                  key={ws.slug}
                  style={{
                    marginBottom: '4px',
                    padding: '8px 12px',
                    backgroundColor:
                      selectedWorkspace?.slug === ws.slug
                        ? 'var(--bg-hover)'
                        : focusedIndex === idx
                          ? 'var(--bg-hover)'
                          : 'transparent',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-primary)',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                  }}
                  onClick={() => handleSelect(ws.slug)}
                  onMouseEnter={() => setFocusedIndex(idx)}
                >
                  <div
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      backgroundColor: 'var(--color-primary)',
                      color: 'var(--bg-primary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: getWorkspaceIcon(ws).isCustomIcon
                        ? '18px'
                        : '13px',
                      fontWeight: 600,
                      flexShrink: 0,
                    }}
                  >
                    {getWorkspaceIcon(ws).display}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 500,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {ws.name}
                    </div>
                    {ws.description && (
                      <div
                        style={{
                          fontSize: '14px',
                          color: 'var(--text-secondary)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {ws.description}
                      </div>
                    )}
                    <div
                      style={{ fontSize: '12px', color: 'var(--text-muted)' }}
                    >
                      {ws.tabCount} tab{ws.tabCount !== 1 ? 's' : ''}
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      close();
                      onEditWorkspace(ws.slug);
                    }}
                    style={{
                      padding: '4px 6px',
                      backgroundColor: 'transparent',
                      color: 'var(--text-secondary)',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      flexShrink: 0,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor =
                        'var(--bg-secondary)';
                      e.currentTarget.style.color = 'var(--text-primary)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                      e.currentTarget.style.color = 'var(--text-secondary)';
                    }}
                    title="Edit workspace"
                  >
                    ✏️
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
