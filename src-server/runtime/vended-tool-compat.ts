import { Buffer } from 'node:buffer';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { RegistryItem } from '@stallion-ai/contracts/catalog';
import type { ToolDef } from '@stallion-ai/contracts/tool';
import type { ITool } from './types.js';

type BuiltinPolicyName =
  | 'stallion_bash'
  | 'stallion_file_editor'
  | 'stallion_http_request'
  | 'stallion_notebook';

type BuiltinRegistryEntry = {
  id: string;
  policyName: BuiltinPolicyName;
  toolName: string;
  displayName: string;
  description: string;
  tags: string[];
};

const BUILTIN_VENDED_TOOL_ENTRIES: BuiltinRegistryEntry[] = [
  {
    id: 'bash',
    policyName: 'stallion_bash',
    toolName: 'bash',
    displayName: 'Bash',
    description:
      'Persistent shell tool for running bash commands with session state across calls.',
    tags: ['builtin', 'shell'],
  },
  {
    id: 'file-editor',
    policyName: 'stallion_file_editor',
    toolName: 'fileEditor',
    displayName: 'File Editor',
    description:
      'File editing tool for viewing, creating, replacing, and inserting file content.',
    tags: ['builtin', 'filesystem'],
  },
  {
    id: 'http-request',
    policyName: 'stallion_http_request',
    toolName: 'http_request',
    displayName: 'HTTP Request',
    description:
      'HTTP client tool for GET, POST, PUT, DELETE, PATCH, HEAD, and OPTIONS requests.',
    tags: ['builtin', 'network'],
  },
  {
    id: 'notebook',
    policyName: 'stallion_notebook',
    toolName: 'notebook',
    displayName: 'Notebook',
    description:
      'Persistent notebook tool for plans, checklists, and working notes within an agent session.',
    tags: ['builtin', 'notes'],
  },
];

const builtinEntryById = new Map(
  BUILTIN_VENDED_TOOL_ENTRIES.map((entry) => [entry.id, entry]),
);
const builtinEntryByPolicy = new Map(
  BUILTIN_VENDED_TOOL_ENTRIES.map((entry) => [entry.policyName, entry]),
);

const bashSessions = new Map<string, BashSession>();
const notebookState = new Map<string, Record<string, string>>();
const activeBashSessions = new Set<BashSession>();

function cleanupAllBashSessions() {
  for (const session of activeBashSessions) {
    session.stop();
  }
  activeBashSessions.clear();
}

process.on('beforeExit', cleanupAllBashSessions);
process.on('exit', cleanupAllBashSessions);

function getBuiltinEntry(toolDef: ToolDef): BuiltinRegistryEntry | undefined {
  const policyName = toolDef.builtinPolicy?.name as
    | BuiltinPolicyName
    | undefined;
  if (policyName && builtinEntryByPolicy.has(policyName)) {
    return builtinEntryByPolicy.get(policyName);
  }
  return builtinEntryById.get(toolDef.id);
}

export function listBuiltinVendedRegistryItems(): RegistryItem[] {
  return BUILTIN_VENDED_TOOL_ENTRIES.map((entry) => ({
    id: entry.id,
    displayName: entry.displayName,
    description: entry.description,
    version: 'builtin',
    source: 'stallion builtin',
    installed: false,
    tags: entry.tags,
  }));
}

export function createBuiltinVendedToolDef(id: string): ToolDef | null {
  const entry = builtinEntryById.get(id);
  if (!entry) {
    return null;
  }

  return {
    id: entry.id,
    kind: 'builtin',
    displayName: entry.displayName,
    description: entry.description,
    builtinPolicy: {
      name: entry.policyName,
    },
    permissions:
      entry.policyName === 'stallion_http_request'
        ? { network: true }
        : entry.policyName === 'stallion_notebook'
          ? undefined
          : { filesystem: true },
  };
}

export function createBuiltinVendedTool(
  agentSlug: string,
  toolDef: ToolDef,
): ITool | null {
  const entry = getBuiltinEntry(toolDef);
  if (!entry) {
    return null;
  }

  switch (entry.policyName) {
    case 'stallion_bash':
      return createBashTool(agentSlug, toolDef, entry);
    case 'stallion_file_editor':
      return createFileEditorTool(toolDef, entry);
    case 'stallion_http_request':
      return createHttpRequestTool(toolDef, entry);
    case 'stallion_notebook':
      return createNotebookTool(agentSlug, toolDef, entry);
    default:
      return null;
  }
}

class BashSession {
  private processRef: ReturnType<typeof spawn> | null = null;
  private sentinel =
    `__STALLION_BASH_DONE_${Date.now()}_${Math.random().toString(36).slice(2)}__`;

  start() {
    if (this.processRef) {
      return;
    }

    this.processRef = spawn('bash', [], {
      cwd: process.cwd(),
      env: { ...process.env, PS1: '', PS2: '' },
    });

    if (
      !this.processRef.stdin ||
      !this.processRef.stdout ||
      !this.processRef.stderr
    ) {
      throw new Error('Failed to create bash process streams');
    }

    activeBashSessions.add(this);
    this.processRef.on('close', () => {
      this.processRef = null;
      activeBashSessions.delete(this);
    });
  }

  stop() {
    if (this.processRef) {
      this.processRef.kill();
      this.processRef = null;
    }
    activeBashSessions.delete(this);
  }

  async run(command: string, timeoutSeconds = 120) {
    this.start();

    const child = this.processRef;
    if (!child?.stdin || !child.stdout || !child.stderr) {
      throw new Error('Bash session is not available');
    }
    const stdin = child.stdin;
    const stdout = child.stdout;
    const stderr = child.stderr;

    let stdoutData = '';
    let stderrData = '';

    return new Promise<{ output: string; error: string }>((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        cleanup();
        this.stop();
        reject(new Error(`Command timed out after ${timeoutSeconds} seconds`));
      }, timeoutSeconds * 1000);

      const onStdout = (chunk: Buffer) => {
        stdoutData += Buffer.from(chunk).toString('utf-8');
        if (stdoutData.includes(this.sentinel)) {
          cleanup();
          resolve({
            output: stdoutData.replace(this.sentinel, '').trim(),
            error: stderrData.trim(),
          });
        }
      };

      const onStderr = (chunk: Buffer) => {
        stderrData += Buffer.from(chunk).toString('utf-8');
      };

      const onClose = (code: number | null) => {
        cleanup();
        reject(
          new Error(
            `Bash process exited unexpectedly with code ${code ?? 'unknown'}`,
          ),
        );
      };

      const onError = (error: Error) => {
        cleanup();
        this.stop();
        reject(error);
      };

      const cleanup = () => {
        clearTimeout(timeoutHandle);
        stdout.off('data', onStdout);
        stderr.off('data', onStderr);
        child.off('close', onClose);
        child.off('error', onError);
      };

      stdout.on('data', onStdout);
      stderr.on('data', onStderr);
      child.on('close', onClose);
      child.on('error', onError);
      stdin.write(`${command}\necho "${this.sentinel}"\n`);
    });
  }
}

function createBashTool(
  agentSlug: string,
  toolDef: ToolDef,
  entry: BuiltinRegistryEntry,
): ITool {
  return {
    id: toolDef.id,
    name: entry.toolName,
    description: entry.description,
    parameters: {
      type: 'object',
      properties: {
        mode: {
          type: 'string',
          enum: ['execute', 'restart'],
        },
        command: { type: 'string' },
        timeout: { type: 'number' },
      },
      required: ['mode'],
      additionalProperties: false,
    },
    execute: async (input: {
      mode: 'execute' | 'restart';
      command?: string;
      timeout?: number;
    }) => {
      if (input.mode === 'restart') {
        bashSessions.get(agentSlug)?.stop();
        bashSessions.set(agentSlug, new BashSession());
        return 'Bash session restarted';
      }

      if (!input.command) {
        throw new Error('command is required when mode is "execute"');
      }

      let session = bashSessions.get(agentSlug);
      if (!session) {
        session = new BashSession();
        bashSessions.set(agentSlug, session);
      }

      return session.run(
        input.command,
        input.timeout ?? toolDef.builtinPolicy?.timeout ?? 120,
      );
    },
  };
}

const FILE_SNIPPET_LINES = 4;
const DEFAULT_MAX_FILE_SIZE = 1_048_576;
const MAX_DIRECTORY_DEPTH = 2;

function createFileEditorTool(
  toolDef: ToolDef,
  entry: BuiltinRegistryEntry,
): ITool {
  return {
    id: toolDef.id,
    name: entry.toolName,
    description: entry.description,
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          enum: ['view', 'create', 'str_replace', 'insert'],
        },
        path: { type: 'string' },
        file_text: { type: 'string' },
        view_range: {
          type: 'array',
          items: { type: 'number' },
          minItems: 2,
          maxItems: 2,
        },
        old_str: { type: 'string' },
        new_str: { type: 'string' },
        insert_line: { type: 'number' },
      },
      required: ['command', 'path'],
      additionalProperties: false,
    },
    execute: async (input: {
      command: 'view' | 'create' | 'str_replace' | 'insert';
      path: string;
      file_text?: string;
      view_range?: [number, number];
      old_str?: string;
      new_str?: string;
      insert_line?: number;
    }) => {
      switch (input.command) {
        case 'view':
          return handleView(input.path, input.view_range);
        case 'create':
          return handleCreate(input.path, input.file_text);
        case 'str_replace':
          return handleStringReplace(input.path, input.old_str, input.new_str);
        case 'insert':
          return handleInsert(input.path, input.insert_line, input.new_str);
        default:
          throw new Error(`Unknown command: ${input.command}`);
      }
    },
  };
}

function createHttpRequestTool(
  toolDef: ToolDef,
  entry: BuiltinRegistryEntry,
): ITool {
  return {
    id: toolDef.id,
    name: entry.toolName,
    description: entry.description,
    parameters: {
      type: 'object',
      properties: {
        method: {
          type: 'string',
          enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'],
        },
        url: { type: 'string' },
        headers: {
          type: 'object',
          additionalProperties: { type: 'string' },
        },
        body: { type: 'string' },
        timeout: { type: 'number' },
      },
      required: ['method', 'url'],
      additionalProperties: false,
    },
    execute: async (input: {
      method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';
      url: string;
      headers?: Record<string, string>;
      body?: string;
      timeout?: number;
    }) => {
      const timeoutSignal = AbortSignal.timeout((input.timeout ?? 30) * 1000);
      const response = await fetch(input.url, {
        method: input.method,
        headers: input.headers,
        body: input.body,
        signal: timeoutSignal,
      });
      const body = await response.text();
      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headers[key] = value;
      });

      if (!response.ok) {
        throw new Error(
          `HTTP ${response.status} ${response.statusText}: ${input.method} ${input.url}`,
        );
      }

      return {
        status: response.status,
        statusText: response.statusText,
        headers,
        body,
      };
    },
  };
}

function createNotebookTool(
  agentSlug: string,
  toolDef: ToolDef,
  entry: BuiltinRegistryEntry,
): ITool {
  return {
    id: toolDef.id,
    name: entry.toolName,
    description: entry.description,
    parameters: {
      type: 'object',
      properties: {
        mode: {
          type: 'string',
          enum: ['create', 'list', 'read', 'write', 'clear'],
        },
        name: { type: 'string' },
        newStr: { type: 'string' },
        readRange: {
          type: 'array',
          items: { type: 'number' },
        },
        oldStr: { type: 'string' },
        insertLine: {
          oneOf: [{ type: 'string' }, { type: 'number' }],
        },
      },
      required: ['mode'],
      additionalProperties: false,
    },
    execute: async (input: {
      mode: 'create' | 'list' | 'read' | 'write' | 'clear';
      name?: string;
      newStr?: string;
      readRange?: number[];
      oldStr?: string;
      insertLine?: string | number;
    }) => {
      const notebooks = notebookState.get(agentSlug) ?? { default: '' };
      const name = input.name ?? 'default';

      let result: string;
      switch (input.mode) {
        case 'create':
          notebooks[name] = input.newStr ?? '';
          result = `Created notebook '${name}'`;
          break;
        case 'list':
          result = `Available notebooks:\n${Object.entries(notebooks)
            .map(([key, value]) => {
              const lineCount = value ? value.split('\n').length : 0;
              return `- ${key}: ${lineCount === 0 ? 'Empty' : `${lineCount} lines`}`;
            })
            .join('\n')}`;
          break;
        case 'read':
          result = handleNotebookRead(notebooks, name, input.readRange);
          break;
        case 'write':
          result = handleNotebookWrite(
            notebooks,
            name,
            input.oldStr,
            input.newStr,
            input.insertLine,
          );
          break;
        case 'clear':
          if (!(name in notebooks)) {
            throw new Error(`Notebook '${name}' not found`);
          }
          notebooks[name] = '';
          result = `Cleared notebook '${name}'`;
          break;
        default:
          throw new Error(`Unknown mode: ${input.mode}`);
      }

      notebookState.set(agentSlug, notebooks);
      return result;
    },
  };
}

function validateAbsolutePath(filePath: string) {
  if (!path.isAbsolute(filePath)) {
    throw new Error(
      `The path ${filePath} is not absolute. Use an absolute path starting with '/'.`,
    );
  }
}

async function exists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function isDirectory(filePath: string) {
  const stats = await fs.stat(filePath);
  return stats.isDirectory();
}

async function checkFileSize(filePath: string) {
  const stats = await fs.stat(filePath);
  if (stats.size > DEFAULT_MAX_FILE_SIZE) {
    throw new Error(
      `File size (${stats.size} bytes) exceeds maximum allowed size (${DEFAULT_MAX_FILE_SIZE} bytes)`,
    );
  }
}

function withLineNumbers(content: string, descriptor: string, startLine = 1) {
  const numbered = content
    .replace(/\t/g, '        ')
    .split('\n')
    .map(
      (line, index) => `${(index + startLine).toString().padStart(6)}  ${line}`,
    );
  return `Here's the result of running \`cat -n\` on ${descriptor}:\n${numbered.join('\n')}\n`;
}

async function listDirectory(dirPath: string) {
  const items: string[] = [];

  async function walk(currentPath: string, depth: number) {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const fullPath = path.join(currentPath, entry.name);
      items.push(path.relative(dirPath, fullPath) || entry.name);
      if (entry.isDirectory() && depth < MAX_DIRECTORY_DEPTH) {
        await walk(fullPath, depth + 1);
      }
    }
  }

  await walk(dirPath, 0);
  return `Here's the files and directories up to 2 levels deep in ${dirPath}, excluding hidden items:\n${items.sort().join('\n')}\n`;
}

async function handleView(
  filePath: string,
  viewRange?: [number, number],
): Promise<string> {
  validateAbsolutePath(filePath);
  if (!(await exists(filePath))) {
    throw new Error(`The path ${filePath} does not exist.`);
  }

  if (await isDirectory(filePath)) {
    if (viewRange) {
      throw new Error(
        'view_range is not allowed when path points to a directory',
      );
    }
    return listDirectory(filePath);
  }

  await checkFileSize(filePath);
  const content = await fs.readFile(filePath, 'utf-8');

  if (!viewRange) {
    return withLineNumbers(content, filePath);
  }

  const [start, end] = viewRange;
  const lines = content.split('\n');
  const slice =
    end === -1 ? lines.slice(start - 1) : lines.slice(start - 1, end);
  return withLineNumbers(slice.join('\n'), filePath, start);
}

async function handleCreate(
  filePath: string,
  fileText?: string,
): Promise<string> {
  if (fileText === undefined) {
    throw new Error('file_text is required for create');
  }
  validateAbsolutePath(filePath);
  if (await exists(filePath)) {
    throw new Error(`File already exists at ${filePath}`);
  }

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, fileText, 'utf-8');
  return `File created successfully at: ${filePath}`;
}

async function handleStringReplace(
  filePath: string,
  oldStr?: string,
  newStr?: string,
): Promise<string> {
  if (oldStr === undefined) {
    throw new Error('old_str is required for str_replace');
  }
  validateAbsolutePath(filePath);
  const content = await fs.readFile(filePath, 'utf-8');
  const occurrences = content.split(oldStr).length - 1;
  if (occurrences === 0) {
    throw new Error(
      `No replacement was performed, old_str \`${oldStr}\` was not found.`,
    );
  }
  if (occurrences > 1) {
    throw new Error(
      `Multiple occurrences of old_str \`${oldStr}\` were found.`,
    );
  }

  const next = content.replace(oldStr, newStr ?? '');
  await fs.writeFile(filePath, next, 'utf-8');

  const lineIndex = content
    .slice(0, content.indexOf(oldStr))
    .split('\n').length;
  const lines = next.split('\n');
  const start = Math.max(0, lineIndex - FILE_SNIPPET_LINES - 1);
  const end = Math.min(lines.length, lineIndex + FILE_SNIPPET_LINES);
  return `The file ${filePath} has been edited.\n${withLineNumbers(lines.slice(start, end).join('\n'), `a snippet of ${filePath}`, start + 1)}`;
}

async function handleInsert(
  filePath: string,
  insertLine?: number,
  newStr?: string,
): Promise<string> {
  if (insertLine === undefined || newStr === undefined) {
    throw new Error('insert_line and new_str are required for insert');
  }
  validateAbsolutePath(filePath);
  const content = await fs.readFile(filePath, 'utf-8');
  const lines = content.split('\n');
  if (insertLine < 0 || insertLine > lines.length) {
    throw new Error('insert_line is out of range');
  }
  lines.splice(insertLine, 0, newStr);
  await fs.writeFile(filePath, lines.join('\n'), 'utf-8');
  return `Inserted text at line ${insertLine + 1} in ${filePath}`;
}

function handleNotebookRead(
  notebooks: Record<string, string>,
  name: string,
  readRange?: number[],
): string {
  if (!(name in notebooks)) {
    throw new Error(`Notebook '${name}' not found`);
  }

  const content = notebooks[name];
  if (!readRange) {
    return content || `Notebook '${name}' is empty`;
  }

  const [start = 1, end = start] = readRange;
  const lines = content.split('\n');
  const selected: string[] = [];
  for (let lineNumber = start; lineNumber <= end; lineNumber += 1) {
    if (lineNumber >= 1 && lineNumber <= lines.length) {
      selected.push(`${lineNumber}: ${lines[lineNumber - 1]}`);
    }
  }
  return selected.join('\n');
}

function handleNotebookWrite(
  notebooks: Record<string, string>,
  name: string,
  oldStr?: string,
  newStr?: string,
  insertLine?: string | number,
): string {
  if (!(name in notebooks)) {
    throw new Error(`Notebook '${name}' not found`);
  }

  if (oldStr !== undefined && newStr !== undefined) {
    if (!notebooks[name].includes(oldStr)) {
      throw new Error(`String '${oldStr}' not found in notebook '${name}'`);
    }
    notebooks[name] = notebooks[name].replace(oldStr, newStr);
    return `Replaced text in notebook '${name}'`;
  }

  if (insertLine !== undefined && newStr !== undefined) {
    const lines = notebooks[name].split('\n');
    let lineIndex: number;
    if (typeof insertLine === 'string') {
      lineIndex = lines.findIndex((line) => line.includes(insertLine));
      if (lineIndex === -1) {
        throw new Error(`Text '${insertLine}' not found in notebook '${name}'`);
      }
    } else {
      lineIndex = Math.max(0, insertLine - 1);
    }
    lines.splice(lineIndex + 1, 0, newStr);
    notebooks[name] = lines.join('\n');
    return `Inserted text in notebook '${name}'`;
  }

  throw new Error(
    'Write operation requires either oldStr + newStr or insertLine + newStr',
  );
}
