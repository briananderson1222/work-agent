import { describe, expect, test } from 'vitest';
import { splitWorkingDirectoryPath } from '../components/chat-dock/chat-dock-utils';

describe('chat-dock-utils', () => {
  test('splitWorkingDirectoryPath trims trailing slashes and preserves parent paths', () => {
    expect(
      splitWorkingDirectoryPath('/Users/brian/dev/workspace/project/'),
    ).toEqual({
      parentPath: '/Users/brian/dev/workspace/',
      leafName: 'project',
      hasWorkingDirectory: true,
    });
  });

  test('splitWorkingDirectoryPath handles missing directories', () => {
    expect(splitWorkingDirectoryPath(null)).toEqual({
      parentPath: '',
      leafName: '',
      hasWorkingDirectory: false,
    });
  });
});
