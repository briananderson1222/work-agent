/**
 * @vitest-environment jsdom
 */

import type { SystemStatus } from '@stallion-ai/sdk';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';

let currentStatus: SystemStatus | null = null;
const navigate = vi.fn();

vi.mock('../hooks/useSystemStatus', () => ({
  useSystemStatus: () => ({
    data: currentStatus,
    isLoading: false,
    isError: false,
  }),
}));

vi.mock('../lib/serverHealth', () => ({
  checkServerHealth: vi.fn(),
}));

vi.mock('@stallion-ai/connect', () => ({
  useConnections: () => ({
    apiBase: 'http://localhost:3242',
    activeConnection: { name: 'Local server' },
  }),
  ConnectionManagerModal: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div>Connection manager</div> : null,
}));

vi.mock('../contexts/NavigationContext', () => ({
  useNavigation: () => ({
    navigate,
  }),
}));

vi.mock('@stallion-ai/sdk', () => ({
  FullScreenLoader: ({ label }: { label: string }) => <div>{label}</div>,
  FullScreenError: ({
    title,
    description,
  }: {
    title: string;
    description: string;
  }) => (
    <div>
      <div>{title}</div>
      <div>{description}</div>
    </div>
  ),
}));

import { OnboardingGate } from '../components/OnboardingGate';

function createStatus(overrides: Partial<SystemStatus> = {}): SystemStatus {
  return {
    prerequisites: [],
    bedrock: {
      credentialsFound: false,
      verified: null,
      region: null,
    },
    acp: {
      connected: false,
      connections: [],
    },
    providers: {
      configured: [],
      detected: {
        ollama: false,
        bedrock: false,
      },
    },
    clis: {},
    ready: false,
    ...overrides,
  };
}

describe('OnboardingGate', () => {
  beforeEach(() => {
    currentStatus = createStatus();
    navigate.mockReset();
  });

  test('re-shows the setup banner when status becomes more actionable after dismissal', () => {
    const { rerender } = render(
      <OnboardingGate>
        <div>App</div>
      </OnboardingGate>,
    );

    expect(screen.getByTestId('setup-launcher')).toBeTruthy();
    expect(screen.getByText('No AI connection configured yet')).toBeTruthy();

    fireEvent.click(screen.getByLabelText('Dismiss setup launcher'));
    expect(screen.queryByTestId('setup-launcher')).toBeNull();

    currentStatus = createStatus({
      providers: {
        configured: [],
        detected: {
          ollama: true,
          bedrock: false,
        },
      },
    });

    rerender(
      <OnboardingGate>
        <div>App</div>
      </OnboardingGate>,
    );

    expect(screen.getByTestId('setup-launcher')).toBeTruthy();
    expect(screen.getByText('Ollama detected locally')).toBeTruthy();
  });

  test('routes setup actions to provider setup instead of the server connection modal', () => {
    render(
      <OnboardingGate>
        <div>App</div>
      </OnboardingGate>,
    );

    fireEvent.click(screen.getByText('Manage Connections'));

    expect(navigate).toHaveBeenCalledWith('/connections/providers');
    expect(screen.queryByText('Connection manager')).toBeNull();
  });
});
