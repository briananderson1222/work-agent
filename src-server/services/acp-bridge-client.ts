import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import {
  type Client,
  type CreateTerminalRequest,
  type CreateTerminalResponse,
  type KillTerminalCommandRequest,
  type ReadTextFileRequest,
  type ReadTextFileResponse,
  type ReleaseTerminalRequest,
  type RequestPermissionRequest,
  type RequestPermissionResponse,
  type SessionNotification,
  type TerminalOutputRequest,
  type TerminalOutputResponse,
  type WaitForTerminalExitRequest,
  type WaitForTerminalExitResponse,
  type WriteTextFileRequest,
} from '@agentclientprotocol/sdk';
import type {
  ExtendedCreateTerminalRequest,
  ExtendedRequestPermissionRequest,
  ManagedTerminal,
} from './acp-bridge-types.js';
import { ApprovalRegistry } from './approval-registry.js';

type ACPStreamWriter = (chunk: any) => Promise<void>;

interface ACPBridgeClientContext {
  cwd: string;
  terminals: Map<string, ManagedTerminal>;
  approvalRegistry: ApprovalRegistry;
  getActiveWriter: () => ACPStreamWriter | null;
  nextTerminalId: () => string;
  onSessionUpdate: (params: SessionNotification) => Promise<void>;
  onExtNotification: (method: string, params: Record<string, unknown>) => void;
  onExtMethod: (
    method: string,
    params: Record<string, unknown>,
  ) => Record<string, unknown>;
}

export function createACPBridgeClient(context: ACPBridgeClientContext): Client {
  return {
    sessionUpdate: async (params: SessionNotification) => {
      await context.onSessionUpdate(params);
    },

    requestPermission: async (
      params: RequestPermissionRequest,
    ): Promise<RequestPermissionResponse> => {
      return handleACPBridgePermissionRequest(
        params as ExtendedRequestPermissionRequest,
        {
          approvalRegistry: context.approvalRegistry,
          getActiveWriter: context.getActiveWriter,
        },
      );
    },

    readTextFile: async (
      params: ReadTextFileRequest,
    ): Promise<ReadTextFileResponse> => {
      const content = await readFile(params.path, 'utf-8');
      return { content };
    },

    writeTextFile: async (params: WriteTextFileRequest) => {
      await writeFile(params.path, params.content);
      return {};
    },

    createTerminal: async (
      params: CreateTerminalRequest,
    ): Promise<CreateTerminalResponse> => {
      return handleACPBridgeCreateTerminal(
        params as ExtendedCreateTerminalRequest,
        {
          cwd: context.cwd,
          terminals: context.terminals,
          nextTerminalId: context.nextTerminalId,
        },
      );
    },

    terminalOutput: async (
      params: TerminalOutputRequest,
    ): Promise<TerminalOutputResponse> => {
      const term = context.terminals.get(params.terminalId);
      if (!term) return { output: '', truncated: false };
      return {
        output: term.output,
        truncated: false,
        exitStatus: term.exitCode !== null ? { exitCode: term.exitCode } : null,
      };
    },

    releaseTerminal: async (params: ReleaseTerminalRequest) => {
      const term = context.terminals.get(params.terminalId);
      if (term) {
        term.process.kill();
        context.terminals.delete(params.terminalId);
      }
    },

    waitForTerminalExit: async (
      params: WaitForTerminalExitRequest,
    ): Promise<WaitForTerminalExitResponse> => {
      const term = context.terminals.get(params.terminalId);
      if (!term) return { exitCode: -1 };
      if (term.exitCode !== null) return { exitCode: term.exitCode };
      return new Promise((resolve) => {
        term.process.on('exit', (code) => resolve({ exitCode: code ?? -1 }));
      });
    },

    killTerminal: async (params: KillTerminalCommandRequest) => {
      const term = context.terminals.get(params.terminalId);
      if (term) term.process.kill();
    },

    extNotification: async (
      method: string,
      params: Record<string, unknown>,
    ) => {
      context.onExtNotification(method, params);
    },

    extMethod: async (method: string, params: Record<string, unknown>) => {
      return context.onExtMethod(method, params);
    },
  };
}

interface ACPBridgePermissionContext {
  approvalRegistry: ApprovalRegistry;
  getActiveWriter: () => ACPStreamWriter | null;
}

export async function handleACPBridgePermissionRequest(
  params: ExtendedRequestPermissionRequest,
  context: ACPBridgePermissionContext,
): Promise<RequestPermissionResponse> {
  const approvalId = ApprovalRegistry.generateId('acp');
  const toolTitle = params.toolCall?.title || 'Unknown tool';
  const activeWriter = context.getActiveWriter();

  if (activeWriter) {
    await activeWriter({
      type: 'tool-approval-request',
      approvalId,
      toolName: toolTitle,
      server: '',
      tool: toolTitle,
      toolArgs: params.toolCall?.rawInput,
    });
  }

  const approved = await context.approvalRegistry.register(approvalId, {
    metadata: {
      source: 'acp',
      title: toolTitle,
      tool: toolTitle,
      toolName: toolTitle,
    },
  });
  const allowOption = params.options.find(
    (option) => option.kind === 'allow_once',
  );
  const rejectOption = params.options.find(
    (option) => option.kind === 'reject_once',
  );
  const selectedId = approved
    ? allowOption?.optionId || params.options[0]?.optionId || 'allow'
    : rejectOption?.optionId ||
      params.options[params.options.length - 1]?.optionId ||
      'reject';

  return { outcome: { outcome: 'selected', optionId: selectedId } };
}

interface ACPBridgeTerminalContext {
  cwd: string;
  terminals: Map<string, ManagedTerminal>;
  nextTerminalId: () => string;
}

export async function handleACPBridgeCreateTerminal(
  params: ExtendedCreateTerminalRequest,
  context: ACPBridgeTerminalContext,
): Promise<CreateTerminalResponse> {
  const id = context.nextTerminalId();
  const proc = spawn(params.command, params.args || [], {
    cwd: params.cwd || context.cwd,
    env: {
      ...process.env,
      ...(params.env
        ? Object.fromEntries(
            params.env.map((entry) => [entry.name, entry.value]),
          )
        : {}),
    },
    windowsHide: true,
  });

  const term: ManagedTerminal = { process: proc, output: '', exitCode: null };
  proc.stdout?.on('data', (data: Buffer) => {
    term.output += data.toString();
  });
  proc.stderr?.on('data', (data: Buffer) => {
    term.output += data.toString();
  });
  proc.on('exit', (code) => {
    term.exitCode = code;
  });

  context.terminals.set(id, term);
  return { terminalId: id };
}
