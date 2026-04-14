/**
 * @vitest-environment jsdom
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, test } from 'vitest';
import { useUnsavedGuard } from '../hooks/useUnsavedGuard';

function Harness() {
  const [dirty, setDirty] = useState(true);
  const { guard, DiscardModal } = useUnsavedGuard(dirty);

  return (
    <>
      <button type="button" onClick={() => guard(() => undefined)}>
        Trigger Guard
      </button>
      <button type="button" onClick={() => setDirty(false)}>
        Mark Clean
      </button>
      <DiscardModal />
    </>
  );
}

describe('useUnsavedGuard', () => {
  test('dismisses the discard modal when the form becomes clean', () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole('button', { name: 'Trigger Guard' }));
    expect(screen.getByRole('dialog')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Mark Clean' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
