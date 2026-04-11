import { execSync, spawn, type ChildProcess } from 'node:child_process';
import { Readable, Writable } from 'node:stream';
import {
  ClientSideConnection,
  ndJsonStream,
  PROTOCOL_VERSION,
} from '@agentclientprotocol/sdk';
import type { ACPConnectionConfig } from '@stallion-ai/contracts/acp';
import type { Client } from '@agentclientprotocol/sdk';
import type {
  ACPMode,
  InitializeResult,
  SessionResult,
} from './acp-bridge-types.js';

interface ACPConnectionLifecycleLogger {
  info: (message: string, meta?: Record<string, unknown>) => void;
  debug: (message: string, meta?: Record<string, unknown>) => void;
}

interface InitializeACPConnectionProcessOptions {
  config: ACPConnectionConfig;
  cwd: string;
  prefix: string;
  logger: ACPConnectionLifecycleLogger;
  createClient: () => Client;
}

export interface ACPConnectionInitialization {
  proc: ChildProcess;
  connection: ClientSideConnection;
  sessionId: string;
  modes: ACPMode[];
  currentModeId: string | null;
  configOptions: any[];
  promptCapabilities: {
    image?: boolean;
    audio?: boolean;
    embeddedContext?: boolean;
  };
  detectedModel: string | null;
  protocolVersion: string | number;
  agentName?: string;
}

export async function findACPCommand(
  command: string,
  logger: ACPConnectionLifecycleLogger,
): Promise<string | null> {
  const lookupCommand =
    process.platform === 'win32' ? `where ${command}` : `which ${command}`;
  try {
    return execSync(lookupCommand, {
      encoding: 'utf-8',
      windowsHide: true,
    })
      .trim()
      .split('\n')[0];
  } catch (error) {
    logger.debug('Failed to find command on PATH', {
      command,
      error,
    });
    return null;
  }
}

export async function detectACPModelFromCli(
  command: string,
  prefix: string,
  logger: ACPConnectionLifecycleLogger,
): Promise<string | null> {
  try {
    const output = execSync(`${command} settings list`, {
      encoding: 'utf-8',
      timeout: 5000,
      windowsHide: true,
    });
    const match = output.match(/chat\.defaultModel\s*=\s*"([^"]+)"/);
    if (!match) {
      return null;
    }

    logger.debug(`[ACP:${prefix}] Detected model: ${match[1]}`);
    return match[1];
  } catch (error) {
    logger.debug('Failed to detect model from CLI settings', {
      error,
    });
    return null;
  }
}

export async function initializeACPConnectionProcess(
  options: InitializeACPConnectionProcessOptions,
): Promise<ACPConnectionInitialization | null> {
  const bin = await findACPCommand(options.config.command, options.logger);
  if (!bin) {
    return null;
  }

  const proc = spawn(bin, options.config.args || [], {
    stdio: ['pipe', 'pipe', 'inherit'],
    cwd: options.cwd,
    windowsHide: true,
    detached: true,
  });

  const input = Writable.toWeb(proc.stdin!);
  const output = Readable.toWeb(proc.stdout!) as ReadableStream<Uint8Array>;
  const acpStream = ndJsonStream(input, output);

  const connection = new ClientSideConnection(
    (_agent) => options.createClient(),
    acpStream,
  );

  const initResult = (await connection.initialize({
    protocolVersion: PROTOCOL_VERSION,
    clientCapabilities: {
      fs: { readTextFile: true, writeTextFile: true },
      terminal: true,
    },
    clientInfo: { name: 'stallion', version: '1.0.0' },
  })) as InitializeResult;

  const sessionResult = (await connection.newSession({
    cwd: options.cwd,
    mcpServers: [],
  })) as SessionResult;

  const modes = sessionResult.modes?.availableModes || [];
  const currentModeId =
    sessionResult.modes?.currentModeId || modes[0]?.id || null;
  const configOptions = sessionResult.configOptions || [];
  const detectedModel =
    configOptions.length === 0
      ? await detectACPModelFromCli(
          options.config.command,
          options.prefix,
          options.logger,
        )
      : null;

  return {
    proc,
    connection,
    sessionId: sessionResult.sessionId,
    modes,
    currentModeId,
    configOptions,
    promptCapabilities:
      initResult.agentCapabilities?.promptCapabilities || {},
    detectedModel,
    protocolVersion: initResult.protocolVersion,
    agentName: initResult.agentInfo?.name,
  };
}
