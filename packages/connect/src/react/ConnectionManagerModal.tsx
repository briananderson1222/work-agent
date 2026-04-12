import { ConnectionManagerModalContent } from './ConnectionManagerModalContent';

export interface ConnectionManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  /**
   * Injected health-checker so the library stays server-agnostic.
   * Should return true when the server at the given URL is healthy.
   */
  checkHealth: (url: string) => Promise<boolean>;
}

export function ConnectionManagerModal({
  isOpen,
  onClose,
  checkHealth,
}: ConnectionManagerModalProps) {
  if (!isOpen) return null;
  return (
    <ConnectionManagerModalContent
      onClose={onClose}
      checkHealth={checkHealth}
    />
  );
}
