/**
 * Scheduler Service - wraps boo CLI for scheduled job management
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

export class SchedulerService {
  private booPath: string | null = null;

  constructor(private logger: any) {}

  private async resolveBoo(): Promise<string> {
    if (this.booPath) return this.booPath;
    if (process.env.BOO_PATH) {
      this.booPath = process.env.BOO_PATH;
      return this.booPath;
    }
    try {
      const { stdout } = await exec('which', ['boo']);
      const path = stdout.trim();
      if (path) { this.booPath = path; return path; }
    } catch { /* not on PATH */ }
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

  async getJobLogs(target: string, count = 20): Promise<any[]> {
    return this.execJson(['logs', target, '-c', String(count), '--format', 'json']);
  }

  async getRunOutput(target: string): Promise<string> {
    const stdout = await this.exec(['logs', target, '-c', '1', '--output']);
    return stdout;
  }

  async readRunFile(outputPath: string): Promise<string> {
    const fs = await import('node:fs/promises');
    // Try .response first (clean, ANSI-stripped), fall back to .log
    const responsePath = outputPath.replace(/\.log$/, '.response');
    try {
      return await fs.readFile(responsePath, 'utf-8');
    } catch {
      return fs.readFile(outputPath, 'utf-8');
    }
  }

  async runJob(target: string): Promise<string> {
    return this.exec(['run', target, '--no-notify'], 600_000);
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
}
