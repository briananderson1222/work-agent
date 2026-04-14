import { useCallback, useEffect, useRef, useState } from 'react';
import { ConfirmModal } from '../components/ConfirmModal';

/**
 * Reusable unsaved-changes guard.
 * Provides beforeunload protection + in-app ConfirmModal.
 *
 * Usage:
 *   const { guard, DiscardModal } = useUnsavedGuard(dirty);
 *   function handleSelect(id) { guard(() => doSelect(id)); }
 *   return <>{view}<DiscardModal /></>;
 */
export function useUnsavedGuard(dirty: boolean) {
  const [showDiscard, setShowDiscard] = useState(false);
  const pendingRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (dirty || !showDiscard) return;
    setShowDiscard(false);
    pendingRef.current = null;
  }, [dirty, showDiscard]);

  // Browser close / reload
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const guard = useCallback(
    (cb: () => void) => {
      if (dirty) {
        pendingRef.current = cb;
        setShowDiscard(true);
      } else {
        cb();
      }
    },
    [dirty],
  );

  const onConfirm = useCallback(() => {
    setShowDiscard(false);
    pendingRef.current?.();
    pendingRef.current = null;
  }, []);

  const onCancel = useCallback(() => {
    setShowDiscard(false);
    pendingRef.current = null;
  }, []);

  function DiscardModal() {
    return (
      <ConfirmModal
        isOpen={showDiscard}
        title="Unsaved Changes"
        message="You have unsaved changes. Discard them?"
        confirmLabel="Discard"
        variant="warning"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );
  }

  return { guard, DiscardModal };
}
