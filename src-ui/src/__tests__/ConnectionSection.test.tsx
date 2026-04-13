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
  test('hides the AWS region field outside bedrock-scoped settings', () => {
    render(<ConnectionSection {...baseProps} showRegion={false} />);

    expect(screen.queryByLabelText('AWS Region')).toBeNull();
    expect(
      screen.queryByText('Only used for Amazon Bedrock routing.'),
    ).toBeNull();
  });

  test('shows the AWS region field only when bedrock-specific routing is active', () => {
    render(<ConnectionSection {...baseProps} showRegion />);

    expect(screen.getByLabelText('AWS Region')).toBeTruthy();
    expect(
      screen.getByText('Only used for Amazon Bedrock routing.'),
    ).toBeTruthy();
  });
});
