/**
 * Scheduler Service - wraps boo CLI for scheduled job management
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

export class SchedulerService {
  private booPath: string | null = null;
  private sseClients = new Set<(data: string) => void>();

  constructor(_logger: any) {}

  /** Subscribe to SSE events. Returns unsubscribe function. */
  subscribe(send: (data: string) => void): () => void {
    this.sseClients.add(send);
    return () => this.sseClients.delete(send);
  }

  /** Broadcast an event to all SSE clients */
  broadcast(event: Record<string, unknown>) {
    const data = JSON.stringify(event);
    for (const send of this.sseClients) {
      try {
        send(data);
      } catch {
        this.sseClients.delete(send);
      }
    }
  }

  private async resolveBoo(): Promise<string> {
    if (this.booPath) return this.booPath;
    if (process.env.BOO_PATH) {
      this.booPath = process.env.BOO_PATH;
      return this.booPath;
    }
    try {
      const { stdout } = await exec('which', ['boo']);
      const path = stdout.trim();
      if (path) {
        this.booPath = path;
        return path;
      }
    } catch {
      /* not on PATH */
    }
    throw new Error('boo binary not found. Set BOO_PATH or install boo.');
  }

  private async exec(args: string[], timeoutMs = 30_000): Promise<string> {
    const bin = await this.resolveBoo();
    const { stdout } = await exec(bin, args, { timeout: timeoutMs });
    return stdout;
  }

  private async execJson<T = any>(args: string[]): Promise<T> {
    const stdout = await this.exec(args);
    return JSON.parse(stdout);
  }

  async listJobs(): Promise<any[]> {
    return this.execJson(['list', '--format', 'json']);
  }

  async getStats(target?: string): Promise<any> {
    const args = ['stats', '--format', 'json'];
    if (target) args.splice(1, 0, target);
    return this.execJson(args);
  }

  async getStatus(): Promise<any> {
    return this.execJson(['status', '--format', 'json']);
  }

  async addJob(opts: {
    name: string;
    cron?: string;
    prompt: string;
    agent?: string;
    openArtifact?: string;
    notifyStart?: boolean;
  }): Promise<string> {
    const args = ['add', '--name', opts.name];
    if (opts.cron) args.push('--cron', opts.cron);
    args.push('--prompt', opts.prompt);
    if (opts.agent) args.push('--agent', opts.agent);
    if (opts.openArtifact) args.push('--open-artifact', opts.openArtifact);
    if (opts.notifyStart) args.push('--notify-start');
    return this.exec(args);
  }

  async getJobLogs(target: string, count = 20): Promise<any[]> {
    return this.execJson([
      'logs',
      target,
      '-c',
      String(count),
      '--format',
      'json',
    ]);
  }

  async getRunOutput(target: string): Promise<string> {
    const stdout = await this.exec(['logs', target, '-c', '1', '--output']);
    return stdout;
  }

  async readRunFile(outputPath: string): Promise<string> {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const os = await import('node:os');

    // Validate path is within ~/.boo/
    const resolvedPath = path.resolve(outputPath);
    const allowedPrefix = path.join(os.homedir(), '.boo');
    if (!resolvedPath.startsWith(allowedPrefix)) {
      throw new Error('Invalid output path: must be within ~/.boo/');
    }

    // Try .response first (clean, ANSI-stripped), fall back to .log
    const responsePath = outputPath.replace(/\.log$/, '.response');
    const resolvedResponsePath = path.resolve(responsePath);
    if (!resolvedResponsePath.startsWith(allowedPrefix)) {
      throw new Error('Invalid output path: must be within ~/.boo/');
    }

    try {
      return await fs.readFile(responsePath, 'utf-8');
    } catch {
      return fs.readFile(outputPath, 'utf-8');
    }
  }

  async runJob(target: string): Promise<string> {
    // Fire-and-forget: spawn boo run in background, don't wait
    const bin = await this.resolveBoo();
    const { spawn } = await import('node:child_process');
    const child = spawn(bin, ['run', target], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    return `Job '${target}' triggered`;
  }

  async enableJob(target: string): Promise<void> {
    await this.exec(['enable', target]);
  }

  async disableJob(target: string): Promise<void> {
    await this.exec(['disable', target]);
  }

  async removeJob(target: string): Promise<void> {
    await this.exec(['remove', target, '--keep-logs']);
  }

  async editJob(
    target: string,
    opts: Record<string, string | boolean>,
  ): Promise<string> {
    const args = ['edit', target];
    for (const [key, val] of Object.entries(opts)) {
      if (val === true) args.push(`--${key}`);
      else if (val !== false && val !== '') args.push(`--${key}`, String(val));
    }
    return this.exec(args);
  }

  async previewSchedule(cron: string, count = 5): Promise<string[]> {
    const stdout = await this.exec(['next', cron, '--count', String(count)]);
    // Parse plain text: "  1: 2026-03-02 15:00:00 UTC"
    return stdout
      .split('\n')
      .map((line) => line.match(/\d:\s+(.+)/)?.[1]?.trim())
      .filter((s): s is string => !!s);
  }
}
