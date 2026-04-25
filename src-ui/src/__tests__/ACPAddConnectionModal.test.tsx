/**
 * @vitest-environment jsdom
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { ACPAddConnectionModal } from '../components/acp-connections/ACPAddConnectionModal';

describe('ACPAddConnectionModal', () => {
  test('installs registry entries through the registry callback', () => {
    const onInstallRegistryEntry = vi.fn();
    render(
      <ACPAddConnectionModal
        registryEntries={[
          {
            id: 'kiro',
            name: 'Kiro CLI',
            command: 'kiro-cli',
            args: ['acp'],
            description: 'Connect Kiro CLI through ACP',
          },
        ]}
        onAdd={vi.fn()}
        onInstallRegistryEntry={onInstallRegistryEntry}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Kiro CLI/i }));

    expect(onInstallRegistryEntry).toHaveBeenCalledWith('kiro');
  });

  test('does not offer installed registry entries as installable', () => {
    const onInstallRegistryEntry = vi.fn();
    render(
      <ACPAddConnectionModal
        registryEntries={[
          {
            id: 'kiro',
            name: 'Kiro CLI',
            command: 'kiro-cli',
            installed: true,
          },
        ]}
        onAdd={vi.fn()}
        onInstallRegistryEntry={onInstallRegistryEntry}
        onCancel={vi.fn()}
      />,
    );

    const kiroButton = screen.getByRole('button', { name: /Kiro CLI/i });
    expect(kiroButton).toHaveProperty('disabled', true);
    expect(screen.getByText('Configured')).toBeTruthy();
  });

  test('keeps custom ACP connection creation available', () => {
    const onAdd = vi.fn();
    render(
      <ACPAddConnectionModal
        registryEntries={[
          {
            id: 'kiro',
            name: 'Kiro CLI',
            command: 'kiro-cli',
            args: ['acp'],
          },
        ]}
        onAdd={onAdd}
        onInstallRegistryEntry={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', { name: /Custom ACP connection/i }),
    );
    const geminiInputs = screen.getAllByPlaceholderText('gemini');
    fireEvent.change(geminiInputs[0], {
      target: { value: 'gemini' },
    });
    fireEvent.change(screen.getByPlaceholderText('Gemini CLI'), {
      target: { value: 'Gemini CLI' },
    });
    fireEvent.change(geminiInputs[1], {
      target: { value: 'gemini' },
    });
    fireEvent.change(screen.getByPlaceholderText('--acp'), {
      target: { value: '--acp' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add Connection' }));

    expect(onAdd).toHaveBeenCalledWith({
      id: 'gemini',
      name: 'Gemini CLI',
      command: 'gemini',
      args: '--acp',
      icon: '',
      cwd: '',
    });
  });

  test('switches from custom mode when registry entries arrive after opening', () => {
    const { rerender } = render(
      <ACPAddConnectionModal
        registryEntries={[]}
        onAdd={vi.fn()}
        onInstallRegistryEntry={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText('Custom ACP Connection')).toBeTruthy();

    rerender(
      <ACPAddConnectionModal
        registryEntries={[
          {
            id: 'kiro',
            name: 'Kiro CLI',
            command: 'kiro-cli',
            args: ['acp'],
          },
        ]}
        onAdd={vi.fn()}
        onInstallRegistryEntry={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText('Add ACP Connection')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Kiro CLI/i })).toBeTruthy();
  });

  test('keeps custom mode if the user edits before registry entries arrive', () => {
    const { rerender } = render(
      <ACPAddConnectionModal
        registryEntries={[]}
        onAdd={vi.fn()}
        onInstallRegistryEntry={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    fireEvent.change(screen.getAllByPlaceholderText('gemini')[0], {
      target: { value: 'custom-acp' },
    });

    rerender(
      <ACPAddConnectionModal
        registryEntries={[
          {
            id: 'kiro',
            name: 'Kiro CLI',
            command: 'kiro-cli',
          },
        ]}
        onAdd={vi.fn()}
        onInstallRegistryEntry={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByText('Custom ACP Connection')).toBeTruthy();
    expect(screen.getByDisplayValue('custom-acp')).toBeTruthy();
  });
});
