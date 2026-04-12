import { ConnectionStatusDot } from '@stallion-ai/connect';
import type { ComponentProps } from 'react';

type ConnectionStatus = ComponentProps<typeof ConnectionStatusDot>['status'];

interface OverflowMenuProps {
  isOpen: boolean;
  connStatus: ConnectionStatus;
  onClose: () => void;
  onOpenConnections: () => void;
  onOpenHelp: () => void;
}

export function OverflowMenu({
  isOpen,
  connStatus,
  onClose,
  onOpenConnections,
  onOpenHelp,
}: OverflowMenuProps) {
  if (!isOpen) return null;

  return (
    <>
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 99 }}
        onClick={onClose}
      />
      <div className="app-toolbar__overflow-menu">
        <button
          onClick={() => {
            onClose();
            onOpenConnections();
          }}
        >
          <ConnectionStatusDot status={connStatus} size={7} />
          Connections
        </button>
        <button
          onClick={(event) => {
            event.stopPropagation();
            onClose();
            onOpenHelp();
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          Help
        </button>
      </div>
    </>
  );
}
