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
    acp: {
      connected: false,
      connections: [],
    },
    providers: {
      configuredChatReady: false,
      configured: [],
      detected: {
        ollama: false,
        bedrock: false,
      },
    },
    clis: {},
    recommendation: {
      code: 'unconfigured',
      type: 'connections',
      actionLabel: 'Open Connections',
      title: 'No usable AI path is configured yet',
      detail:
        'Start Ollama locally or add a provider/runtime connection to make Stallion ready for first-run chat.',
    },
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
        configuredChatReady: false,
        configured: [],
        detected: {
          ollama: true,
          bedrock: false,
        },
      },
      recommendation: {
        code: 'detected-provider',
        type: 'providers',
        actionLabel: 'Add Ollama connection',
        title: 'Ollama is available',
        detail:
          'Create a model connection for the detected local Ollama server to make first-run chat explicit.',
        detectedProviderType: 'ollama',
        detectedProviderLabel: 'Ollama',
      },
    });

    rerender(
      <OnboardingGate>
        <div>App</div>
      </OnboardingGate>,
    );

    expect(screen.getByTestId('setup-launcher')).toBeTruthy();
    expect(screen.getByText('Ollama is available')).toBeTruthy();
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

  test('routes runtime-only setup actions to runtime connections', () => {
    currentStatus = createStatus({
      recommendation: {
        code: 'runtime-only',
        type: 'runtimes',
        actionLabel: 'Review runtimes',
        title: 'A runtime is available before chat is configured',
        detail:
          'Connected runtimes are detectable, but there is still no explicit chat-capable model connection configured.',
      },
      clis: {
        codex: true,
      },
    });

    render(
      <OnboardingGate>
        <div>App</div>
      </OnboardingGate>,
    );

    fireEvent.click(screen.getByText('Review Runtimes'));

    expect(navigate).toHaveBeenCalledWith('/connections/runtimes');
  });
});
