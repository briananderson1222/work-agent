// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { ConnectionSection } from '../views/settings/ConnectionSection';

const baseProps = {
  currentApiBase: 'http://localhost:3141',
  isCustom: false,
  apiBaseError: null,
  testStatus: 'idle' as const,
  region: 'us-east-1',
  regionError: undefined,
  onApiBaseChange: vi.fn(),
  onResetApiBase: vi.fn(),
  onTestConnection: vi.fn(),
  onRegionChange: vi.fn(),
};

describe('ConnectionSection', () => {
  test('hides the region field when disabled', () => {
    render(<ConnectionSection {...baseProps} showRegion={false} />);

    expect(screen.queryByLabelText('Default Region')).toBeNull();
    expect(
      screen.queryByText(
        'Used when a configured connection requires regional routing, such as built-in cloud providers.',
      ),
    ).toBeNull();
  });

  test('shows the region field when enabled', () => {
    render(<ConnectionSection {...baseProps} showRegion />);

    expect(screen.getByLabelText('Default Region')).toBeTruthy();
    expect(
      screen.getByText(
        'Used when a configured connection requires regional routing, such as built-in cloud providers.',
      ),
    ).toBeTruthy();
  });
});
