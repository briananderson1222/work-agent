import { type Client } from '@agentclientprotocol/sdk';
import type { ACPConnectionConfig } from '../domain/types.js';
import { ACPProcess } from './acp-process.js';

const noopClient: Client = {
  sessionUpdate: async () => {},
  requestPermission: async () =>
    ({ granted: false, outcome: { outcome: 'cancelled' } }) as any,
  readTextFile: async () => ({ content: '' }),
  writeTextFile: async () => ({}) as any,
  createTerminal: async () => ({ terminalId: '' }),
  terminalOutput: async () => ({}) as any,
  releaseTerminal: async () => {},
  waitForTerminalExit: async () => ({ exitCode: 0 }),
  killTerminal: async () => {},
  extNotification: async () => {},
  extMethod: async () => ({}),
};

export class ACPProbe {
  cachedModes: Array<{ id: string; name: string; description?: string }> = [];
  cachedConfigOptions: any[] = [];
  cachedCapabilities: any = null;
  lastProbeAt = 0;
  lastSuccess = false;

  constructor(
    private config: ACPConnectionConfig,
    private logger: any,
    private cwd: string,
  ) {}

  async probe(): Promise<boolean> {
    const process = new ACPProcess({
      command: this.config.command,
      args: this.config.args,
      cwd: this.config.cwd ?? this.cwd,
      createClient: () => noopClient,
      logger: this.logger,
    });

    try {
      const initResult = await process.start();
      const sessionResult = await process.newSession(this.cwd);

      this.cachedModes = sessionResult.modes?.availableModes ?? [];
      this.cachedConfigOptions = sessionResult.configOptions ?? [];
      this.cachedCapabilities =
        initResult.agentCapabilities?.promptCapabilities ?? null;
      this.lastSuccess = true;
    } catch (err) {
      if (this.lastSuccess) {
        this.logger.warn(
          { err, id: this.config.id },
          'ACPProbe failed; retaining stale cache',
        );
      } else {
        this.cachedModes = [];
        this.cachedConfigOptions = [];
        this.cachedCapabilities = null;
      }
      this.lastSuccess = false;
    } finally {
      this.lastProbeAt = Date.now();
      await process.destroy().catch(() => {});
    }

    return this.lastSuccess;
  }

  getModes() {
    return this.cachedModes;
  }
  getConfigOptions() {
    return this.cachedConfigOptions;
  }
  getCapabilities() {
    return this.cachedCapabilities;
  }
  isAvailable() {
    return this.lastSuccess;
  }
}
