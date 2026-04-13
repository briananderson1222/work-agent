/**
 * @vitest-environment jsdom
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { ImportPromptsModal } from '../components/ImportPromptsModal';

describe('ImportPromptsModal', () => {
  test('imports skill-like markdown frontmatter into playbook payloads', async () => {
    const onImport = vi.fn();

    render(
      <ImportPromptsModal isOpen onImport={onImport} onCancel={vi.fn()} />,
    );

    const fileInput = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;

    const file = new File(
      [
        `---\nname: deploy-plan\ndescription: Reusable deploy workflow\ncategory: Operations\ntags:\n  - ops\n  - release\nagent: deployer\nglobal: true\nassetType: playbook\nruntimeMode: slash-command\n---\n\nMain prompt body here.`,
      ],
      'deploy-plan.md',
      { type: 'text/markdown' },
    );
    Object.defineProperty(file, 'text', {
      value: async () =>
        `---\nname: deploy-plan\ndescription: Reusable deploy workflow\ncategory: Operations\ntags:\n  - ops\n  - release\nagent: deployer\nglobal: true\nassetType: playbook\nruntimeMode: slash-command\n---\n\nMain prompt body here.`,
    });

    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByDisplayValue('deploy-plan')).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: /Import 1/i }));

    expect(onImport).toHaveBeenCalledWith([
      {
        name: 'deploy-plan',
        content: 'Main prompt body here.',
        description: 'Reusable deploy workflow',
        category: 'Operations',
        tags: ['ops', 'release'],
        agent: 'deployer',
        global: true,
        storageMode: 'markdown-file',
      },
    ]);
  });
});
