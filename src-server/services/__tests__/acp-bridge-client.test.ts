import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ApprovalRegistry } from '../approval-registry.js';
import {
  createACPBridgeClient,
  handleACPBridgeCreateTerminal,
  handleACPBridgePermissionRequest,
} from '../acp-bridge-client.js';

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

describe('handleACPBridgePermissionRequest', () => {
  test('emits approval event and selects allow option when approved', async () => {
    const registry = new ApprovalRegistry(mockLogger);
    const writer = vi.fn(async () => {});
    vi.spyOn(ApprovalRegistry, 'generateId').mockReturnValue('acp-fixed');

    const pending = handleACPBridgePermissionRequest(
      {
        toolCall: {
          title: 'Edit file',
          rawInput: { path: 'README.md' },
        },
        options: [
          { kind: 'allow_once', optionId: 'allow-1' },
          { kind: 'reject_once', optionId: 'reject-1' },
        ],
      } as any,
      {
        approvalRegistry: registry,
        getActiveWriter: () => writer,
      },
    );

    expect(writer).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'tool-approval-request',
        approvalId: 'acp-fixed',
        toolName: 'Edit file',
      }),
    );

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(registry.has('acp-fixed')).toBe(true);
    registry.resolve('acp-fixed', true);

    await expect(pending).resolves.toEqual({
      outcome: { outcome: 'selected', optionId: 'allow-1' },
    });
  });
});

describe('handleACPBridgeCreateTerminal', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'acp-bridge-client-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test('creates and tracks a managed terminal', async () => {
    const terminals = new Map();
    const scriptPath = join(dir, 'echo.js');
    writeFileSync(scriptPath, "console.log('hello from acp');");

    const result = await handleACPBridgeCreateTerminal(
      {
        command: process.execPath,
        args: [scriptPath],
      } as any,
      {
        cwd: dir,
        terminals: terminals as any,
        nextTerminalId: () => 'term-1',
      },
    );

    expect(result).toEqual({ terminalId: 'term-1' });
    expect(terminals.has('term-1')).toBe(true);

    const terminal = terminals.get('term-1');
    terminal?.process.kill();
  });
});

describe('createACPBridgeClient', () => {
  test('delegates extension and session callbacks', async () => {
    const onSessionUpdate = vi.fn(async () => {});
    const onExtNotification = vi.fn();
    const onExtMethod = vi.fn(() => ({ ok: true }));

    const client = createACPBridgeClient({
      cwd: '/tmp',
      terminals: new Map(),
      approvalRegistry: new ApprovalRegistry(mockLogger),
      getActiveWriter: () => null,
      nextTerminalId: () => 'term-1',
      onSessionUpdate,
      onExtNotification,
      onExtMethod,
    });

    await client.sessionUpdate?.({ update: {} } as any);
    await client.extNotification?.('_kiro.dev/test', { x: 1 });
    await expect(client.extMethod?.('_kiro.dev/test', { x: 1 })).resolves.toEqual({
      ok: true,
    });

    expect(onSessionUpdate).toHaveBeenCalled();
    expect(onExtNotification).toHaveBeenCalledWith('_kiro.dev/test', { x: 1 });
    expect(onExtMethod).toHaveBeenCalledWith('_kiro.dev/test', { x: 1 });
  });
});
