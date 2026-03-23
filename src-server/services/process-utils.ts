import type { ChildProcess } from 'node:child_process';

/**
 * Send SIGTERM to a child process, then SIGKILL after 1 second if still alive.
 * Resolves when the process exits (or immediately if already dead).
 */
export function forceKillProcess(proc: ChildProcess): Promise<void> {
  return new Promise<void>((resolve) => {
    if (proc.exitCode !== null || proc.killed) {
      resolve();
      return;
    }

    if (!proc.pid) {
      resolve();
      return;
    }

    const pid = proc.pid;

    const timer = setTimeout(() => {
      try {
        process.kill(-pid, 'SIGKILL');
      } catch {
        /* already dead */
      }
      resolve();
    }, 1000);

    proc.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });

    try {
      process.kill(-pid, 'SIGTERM');
    } catch {
      clearTimeout(timer);
      resolve();
    }
  });
}
