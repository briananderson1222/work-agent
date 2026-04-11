export interface WorkingDirectoryParts {
  parentPath: string;
  leafName: string;
  hasWorkingDirectory: boolean;
}

export function splitWorkingDirectoryPath(
  workingDirectory: string | null | undefined,
): WorkingDirectoryParts {
  if (!workingDirectory) {
    return {
      parentPath: '',
      leafName: '',
      hasWorkingDirectory: false,
    };
  }

  const parts = workingDirectory.replace(/\/+$/, '').split('/');
  const leafName = parts.pop() || '';
  const parentPath = parts.length ? `${parts.join('/')}/` : '';

  return {
    parentPath,
    leafName,
    hasWorkingDirectory: true,
  };
}
