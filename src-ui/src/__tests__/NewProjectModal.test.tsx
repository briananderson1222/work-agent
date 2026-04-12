/**
 * @vitest-environment jsdom
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';

const createProjectMock = vi.fn();
const createProjectLayoutMock = vi.fn();
const validateDirectoryMock = vi.fn();
const setProjectMock = vi.fn();
const onCloseMock = vi.fn();

vi.mock('@stallion-ai/sdk', () => ({
  useCreateProjectMutation: () => ({
    isPending: false,
    mutateAsync: createProjectMock,
  }),
  useCreateProjectLayoutMutation: () => ({
    isPending: false,
    mutateAsync: createProjectLayoutMock,
  }),
  useFileSystemBrowseQuery: () => ({
    refetch: validateDirectoryMock,
  }),
  useTemplatesQuery: () => ({
    data: [],
  }),
}));

vi.mock('../contexts/ApiBaseContext', () => ({
  useApiBase: () => ({
    apiBase: 'http://localhost:3000',
  }),
}));

vi.mock('../contexts/NavigationContext', () => ({
  useNavigation: () => ({
    setProject: setProjectMock,
  }),
}));

vi.mock('../components/PathAutocomplete', () => ({
  PathAutocomplete: ({
    value,
    onChange,
    placeholder,
  }: {
    value: string;
    onChange: (value: string) => void;
    placeholder: string;
  }) => (
    <input
      aria-label="Working Directory"
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));

import { NewProjectModal } from '../components/NewProjectModal';

describe('NewProjectModal', () => {
  test('creates the built-in coding layout with the canonical slug', async () => {
    createProjectMock.mockResolvedValue({ slug: 'my-project' });
    createProjectLayoutMock.mockResolvedValue({});
    validateDirectoryMock.mockResolvedValue({ error: null });

    render(<NewProjectModal isOpen onClose={onCloseMock} />);

    fireEvent.change(screen.getByPlaceholderText('My Project'), {
      target: { value: 'My Project' },
    });
    fireEvent.change(screen.getByLabelText('Working Directory'), {
      target: { value: '/tmp/my-project' },
    });
    fireEvent.click(screen.getByLabelText('Add Coding Layout'));
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(createProjectMock).toHaveBeenCalledWith({
        name: 'My Project',
        slug: 'my-project',
        icon: undefined,
        description: undefined,
        workingDirectory: '/tmp/my-project',
      });
    });

    expect(createProjectLayoutMock).toHaveBeenCalledWith({
      projectSlug: 'my-project',
      type: 'coding',
      name: 'Coding',
      slug: 'coding',
      icon: '🔧',
      config: { workingDirectory: '/tmp/my-project' },
    });
    expect(setProjectMock).toHaveBeenCalledWith('my-project');
    expect(onCloseMock).toHaveBeenCalled();
  });
});
