import { execSync } from 'node:child_process';
import type { IPtyAdapter, IPtyProcess } from '../domain/pty-adapter.js';
import type { ITerminalHistoryStore } from '../domain/terminal-history-store.js';
import type {
  TerminalEvent,
  TerminalOpenInput,
  TerminalSessionSnapshot,
  TerminalSessionState,
} from '../domain/terminal-types.js';
import { terminalOps } from '../telemetry/metrics.js';

const HISTORY_LINE_LIMIT = 5000;
const PERSIST_DEBOUNCE_MS = 40;

type SessionEntry = TerminalSessionState & {
  process: IPtyProcess | null;
  unsubData: (() => void) | null;
  unsubExit: (() => void) | null;
};

interface ShellCandidate {
  shell: string;
  args?: string[];
}

export class TerminalService {
  private sessions = new Map<string, SessionEntry>();
  private listeners = new Set<(event: TerminalEvent) => void>();
  private historyTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private subprocessInterval: ReturnType<typeof setInterval> | null = null;

  constructor(
    private pty: IPtyAdapter,
    private historyStore: ITerminalHistoryStore,
  ) {
    if (process.platform !== 'win32') {
      this.subprocessInterval = setInterval(
        () => this.pollSubprocesses(),
        1000,
      );
    }
  }

  async open(input: TerminalOpenInput): Promise<TerminalSessionSnapshot> {
    const sessionId = `${input.projectSlug}:${input.terminalId}`;
    const existing = this.sessions.get(sessionId);
    if (existing?.status === 'running') return this.snapshot(existing);
    terminalOps.add(1, { operation: 'open' });

    const history =
      existing?.history ?? (await this.historyStore.load(sessionId));

    const entry: SessionEntry = existing ?? {
      sessionId,
      projectSlug: input.projectSlug,
      terminalId: input.terminalId,
      cwd: input.cwd,
      status: 'starting',
      pid: null,
      history,
      exitCode: null,
      cols: input.cols,
      rows: input.rows,
      hasRunningSubprocess: false,
      process: null,
      unsubData: null,
      unsubExit: null,
    };

    entry.status = 'starting';
    entry.cols = input.cols;
    entry.rows = input.rows;
    this.sessions.set(sessionId, entry);

    const env = { ...process.env, ...input.env, TERM: 'xterm-256color' };
    const candidates = this.resolveShell();
    let proc: IPtyProcess | null = null;

    for (const candidate of candidates) {
      try {
        proc = await this.pty.spawn({
          shell: candidate.shell,
          args: candidate.args,
          cwd: input.cwd,
          cols: input.cols,
          rows: input.rows,
          env,
        });
        break;
      } catch {}
    }

    if (!proc) throw new Error('Failed to spawn PTY: no viable shell found');

    entry.process = proc;
    entry.pid = proc.pid;
    entry.status = 'running';

    entry.unsubData = proc.onData((data) => {
      entry.history = this.trimHistory(entry.history + data);
      this.emit({ type: 'data', sessionId, data });
      this.schedulePersist(sessionId);
    });

    entry.unsubExit = proc.onExit(({ exitCode, signal }) => {
      entry.status = 'exited';
      entry.exitCode = exitCode;
      entry.process = null;
      this.persistNow(sessionId);
      this.emit({ type: 'exited', sessionId, exitCode, signal });
    });

    this.emit({ type: 'started', sessionId, pid: proc.pid });
    return this.snapshot(entry);
  }

  write(sessionId: string, data: string): void {
    this.sessions.get(sessionId)?.process?.write(data);
  }

  resize(sessionId: string, cols: number, rows: number): void {
    const entry = this.sessions.get(sessionId);
    if (!entry) return;
    entry.cols = cols;
    entry.rows = rows;
    entry.process?.resize(cols, rows);
  }

  async close(sessionId: string): Promise<void> {
    const entry = this.sessions.get(sessionId);
    if (!entry) return;
    terminalOps.add(1, { operation: 'close' });
    entry.unsubData?.();
    entry.unsubExit?.();
    entry.process?.kill();
    entry.status = 'exited';
    await this.persistNow(sessionId);
    this.sessions.delete(sessionId);
  }

  async restart(sessionId: string): Promise<TerminalSessionSnapshot> {
    const entry = this.sessions.get(sessionId);
    if (!entry) throw new Error(`Session not found: ${sessionId}`);
    terminalOps.add(1, { operation: 'restart' });
    const input: TerminalOpenInput = {
      projectSlug: entry.projectSlug,
      terminalId: entry.terminalId,
      cwd: entry.cwd,
      cols: entry.cols,
      rows: entry.rows,
    };
    await this.close(sessionId);
    return this.open(input);
  }

  subscribe(cb: (event: TerminalEvent) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  async dispose(): Promise<void> {
    if (this.subprocessInterval) clearInterval(this.subprocessInterval);
    await Promise.all([...this.sessions.keys()].map((id) => this.close(id)));
  }

  private snapshot(entry: SessionEntry): TerminalSessionSnapshot {
    return {
      sessionId: entry.sessionId,
      status: entry.status,
      pid: entry.pid,
      history: entry.history,
      cols: entry.cols,
      rows: entry.rows,
    };
  }

  private emit(event: TerminalEvent): void {
    for (const cb of this.listeners) cb(event);
  }

  private trimHistory(history: string): string {
    const lines = history.split('\n');
    return lines.length > HISTORY_LINE_LIMIT
      ? lines.slice(-HISTORY_LINE_LIMIT).join('\n')
      : history;
  }

  private schedulePersist(sessionId: string): void {
    const existing = this.historyTimers.get(sessionId);
    if (existing) clearTimeout(existing);
    this.historyTimers.set(
      sessionId,
      setTimeout(() => this.persistNow(sessionId), PERSIST_DEBOUNCE_MS),
    );
  }

  private async persistNow(sessionId: string): Promise<void> {
    const timer = this.historyTimers.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this.historyTimers.delete(sessionId);
    }
    const entry = this.sessions.get(sessionId);
    if (entry) await this.historyStore.save(sessionId, entry.history);
  }

  private resolveShell(): ShellCandidate[] {
    const candidates: ShellCandidate[] = [];
    if (process.env.SHELL) candidates.push({ shell: process.env.SHELL });
    candidates.push(
      { shell: '/bin/zsh', args: ['-o', 'nopromptsp'] },
      { shell: '/bin/bash' },
      { shell: '/bin/sh' },
    );
    return candidates;
  }

  private pollSubprocesses(): void {
    for (const [sessionId, entry] of this.sessions) {
      if (entry.status !== 'running' || entry.pid == null) continue;
      try {
        execSync(`pgrep -P ${entry.pid}`, { stdio: 'ignore' });
        if (!entry.hasRunningSubprocess) {
          entry.hasRunningSubprocess = true;
          this.emit({
            type: 'activity',
            sessionId,
            hasRunningSubprocess: true,
          });
        }
      } catch {
        if (entry.hasRunningSubprocess) {
          entry.hasRunningSubprocess = false;
          this.emit({
            type: 'activity',
            sessionId,
            hasRunningSubprocess: false,
          });
        }
      }
    }
  }
}
