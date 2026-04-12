import type { SessionNotification } from '@agentclientprotocol/sdk';
import type {
  ACPSlashCommand,
  ConfigOption,
  ExtNotificationParams,
  MessagePart,
  SessionUpdate,
} from './acp-bridge-types.js';

type ACPStreamWriter = (chunk: any) => Promise<void>;

export interface ACPBridgeEventState {
  activeWriter: ACPStreamWriter | null;
  responseAccumulator: string;
  responseParts: MessagePart[];
  currentModeId: string | null;
  configOptions: ConfigOption[];
  slashCommands: ACPSlashCommand[];
  mcpServers: string[];
}

interface ACPBridgeLogger {
  info: (message: string, meta?: Record<string, unknown>) => void;
  debug: (message: string, meta?: Record<string, unknown>) => void;
  error?: (message: string, meta?: Record<string, unknown>) => void;
}

interface ACPBridgeEventContext {
  logger: ACPBridgeLogger;
  state: ACPBridgeEventState;
  flushTextPart: () => void;
  updateToolResult: (
    toolCallId: string,
    result: string | undefined,
    isError?: boolean,
  ) => void;
}

export async function handleACPBridgeSessionUpdate(
  params: SessionNotification,
  context: ACPBridgeEventContext,
): Promise<void> {
  const update = params.update as SessionUpdate;
  const { logger, state } = context;

  switch (update.sessionUpdate) {
    case 'agent_message_chunk':
      if (!state.activeWriter) break;
      if (!Array.isArray(update.content) && update.content?.type === 'text') {
        state.responseAccumulator += update.content.text || '';
        await state.activeWriter({
          type: 'text-delta',
          text: update.content.text || '',
        });
      } else if (
        !Array.isArray(update.content) &&
        update.content?.type === 'image'
      ) {
        await state.activeWriter({
          type: 'text-delta',
          text: `\n![image](${update.content.url || update.content.data || ''})\n`,
        });
      } else if (
        !Array.isArray(update.content) &&
        update.content?.type === 'resource'
      ) {
        const text =
          update.content.resource?.text ||
          update.content.resource?.uri ||
          '[resource]';
        await state.activeWriter({
          type: 'text-delta',
          text: `\n\`\`\`\n${text}\n\`\`\`\n`,
        });
      }
      break;

    case 'agent_thought_chunk':
      if (!state.activeWriter) break;
      if (!Array.isArray(update.content) && update.content?.type === 'text') {
        await state.activeWriter({
          type: 'reasoning-delta',
          id: '0',
          text: update.content.text || '',
        });
      }
      break;

    case 'tool_call':
      if (!state.activeWriter) break;
      context.flushTextPart();
      state.responseParts.push({
        type: 'tool-invocation',
        toolCallId: update.toolCallId,
        toolName: update.title || 'unknown',
        args: update.rawInput,
        state: 'call',
      });
      await state.activeWriter({
        type: 'tool-call',
        toolCallId: update.toolCallId,
        toolName: update.title || 'unknown',
        input: update.rawInput,
        server: '',
        tool: update.title,
      });
      break;

    case 'tool_call_update': {
      if (!state.activeWriter) break;
      if (Array.isArray(update.content)) {
        const diffContent = update.content.find(
          (content) => content.type === 'diff',
        );
        if (diffContent) {
          const output = formatDiff(
            diffContent.path || '',
            diffContent.oldText ?? null,
            diffContent.newText || '',
          );
          context.updateToolResult(update.toolCallId || '', output);
          await state.activeWriter({
            type: 'tool-result',
            toolCallId: update.toolCallId,
            output,
            result: output,
          });
          break;
        }
      }

      if (update.status === 'completed' || update.status === 'failed') {
        let textContent = '';
        if (Array.isArray(update.content)) {
          textContent = update.content
            .filter((content) => {
              return (
                content.type === 'content' && content.content?.type === 'text'
              );
            })
            .map((content) => content.content?.text || '')
            .join('\n');
        }
        context.updateToolResult(
          update.toolCallId || '',
          textContent,
          update.status === 'failed',
        );
        await state.activeWriter({
          type: 'tool-result',
          toolCallId: update.toolCallId,
          ...(update.status === 'failed'
            ? { error: textContent || 'Tool call failed' }
            : { output: textContent, result: textContent }),
        });
      }
      break;
    }

    case 'plan':
      if (!state.activeWriter) break;
      if (update.entries?.length) {
        await state.activeWriter({ type: 'reasoning-start', id: '0' });
        const planText = update.entries
          .map((entry) => {
            const icon =
              entry.status === 'completed'
                ? '✅'
                : entry.status === 'in_progress'
                  ? '🔄'
                  : '⬜';
            return `${icon} ${entry.content}`;
          })
          .join('\n');
        await state.activeWriter({
          type: 'reasoning-delta',
          id: '0',
          text: planText,
        });
        await state.activeWriter({ type: 'reasoning-end', id: '0' });
      }
      break;

    case 'current_mode_update':
      state.currentModeId = update.modeId || null;
      break;

    case 'config_options_update':
      state.configOptions = update.configOptions || [];
      break;

    case 'available_commands_update':
      state.slashCommands = ((update as any).availableCommands || []).map(
        (command: any) => ({
          name: command.name.startsWith('/')
            ? command.name
            : `/${command.name}`,
          description: command.description || '',
          hint: command.input?.hint,
        }),
      );
      logger.info('[ACPBridge] Commands updated (standard ACP)', {
        count: state.slashCommands.length,
      });
      break;

    default:
      if (
        state.activeWriter &&
        update.sessionUpdate?.startsWith('_kiro.dev/')
      ) {
        const message =
          (update as any).message ||
          (update as any).status ||
          (update as any).text;
        if (message && typeof message === 'string') {
          state.responseAccumulator += `${message}\n`;
          await state.activeWriter({
            type: 'text-delta',
            text: `${message}\n`,
          });
        }
        logger.info('[ACPBridge] Kiro extension session update', {
          type: update.sessionUpdate,
          update,
        });
      } else {
        logger.debug('[ACPBridge] Unhandled session update', {
          type: update.sessionUpdate,
        });
      }
      break;
  }
}

export function handleACPBridgeExtensionNotification(
  method: string,
  params: Record<string, unknown>,
  context: Pick<ACPBridgeEventContext, 'logger' | 'state'>,
): void {
  const { logger, state } = context;

  switch (method) {
    case '_kiro.dev/commands/available': {
      const notificationParams = params as ExtNotificationParams;
      const commands = notificationParams.commands || [];
      state.slashCommands = commands.map((command) => ({
        name: command.name,
        description: command.description || '',
        hint: command.input?.hint,
      }));
      logger.info('[ACPBridge] Slash commands received', {
        count: state.slashCommands.length,
      });
      break;
    }
    case '_kiro.dev/mcp/server_initialized': {
      const notificationParams = params as ExtNotificationParams;
      const serverName = notificationParams.serverName;
      if (serverName && !state.mcpServers.includes(serverName)) {
        state.mcpServers.push(serverName);
      }
      logger.debug('[ACPBridge] MCP server initialized', { serverName });
      break;
    }
    case '_kiro.dev/mcp/oauth_request': {
      const notificationParams = params as ExtNotificationParams;
      const url = notificationParams.url;
      logger.info('[ACPBridge] MCP OAuth requested', { url });
      if (state.activeWriter && url) {
        state
          .activeWriter({
            type: 'text-delta',
            text: `\n\n🔐 **Authentication required** — An MCP server needs you to sign in:\n[Open authentication page](${url})\n\n`,
          })
          .catch((error) => logger.error?.('[acp] cleanup failed:', { error }));
      }
      break;
    }
    case '_kiro.dev/compaction/status':
    case '_kiro.dev/clear/status': {
      const status = (params as any).status || 'done';
      const message =
        (params as any).message ||
        (method.includes('compaction')
          ? 'Context compacted.'
          : 'History cleared.');
      if (state.activeWriter) {
        state
          .activeWriter({ type: 'text-delta', text: `${message}\n` })
          .catch(() => {});
        state.responseAccumulator += `${message}\n`;
      }
      logger.info('[ACPBridge] Session maintenance', { method, status });
      break;
    }
    default: {
      if (state.activeWriter && params) {
        const text =
          (params as any).message ||
          (params as any).text ||
          (params as any).status;
        if (text && typeof text === 'string') {
          state
            .activeWriter({ type: 'text-delta', text: `${text}\n` })
            .catch(() => {});
          state.responseAccumulator += `${text}\n`;
        }
      }
      logger.debug('[ACPBridge] Extension notification', {
        method,
        params,
      });
      break;
    }
  }
}

export function handleACPBridgeExtensionMethod(
  method: string,
  params: Record<string, unknown>,
  context: Pick<ACPBridgeEventContext, 'logger' | 'state'>,
): Record<string, unknown> {
  const { logger, state } = context;

  switch (method) {
    case '_kiro.dev/metadata':
      if (
        Array.isArray((params as any).configOptions) &&
        (params as any).configOptions.length > 0
      ) {
        state.configOptions = (params as any).configOptions;
        logger.info('[ACPBridge] Config options updated from metadata', {
          count: state.configOptions.length,
        });
      }
      return {};
    case '_kiro.dev/commands/execute':
      logger.debug('[ACPBridge] Command execute request', { params });
      return {};
    case '_kiro.dev/commands/options':
      return { options: [] };
    default:
      logger.debug('[ACPBridge] Unknown extension method', { method });
      return {};
  }
}

function formatDiff(
  path: string,
  oldText: string | null,
  newText: string,
): string {
  if (!oldText) return `**New file:** \`${path}\`\n\`\`\`\n${newText}\n\`\`\``;
  return `**Modified:** \`${path}\`\n\`\`\`diff\n${simpleDiff(oldText, newText)}\n\`\`\``;
}

function simpleDiff(oldText: string, newText: string): string {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const lines: string[] = [];
  const max = Math.max(oldLines.length, newLines.length);
  for (let index = 0; index < max; index++) {
    if (index >= oldLines.length) {
      lines.push(`+ ${newLines[index]}`);
    } else if (index >= newLines.length) {
      lines.push(`- ${oldLines[index]}`);
    } else if (oldLines[index] !== newLines[index]) {
      lines.push(`- ${oldLines[index]}`);
      lines.push(`+ ${newLines[index]}`);
    } else {
      lines.push(`  ${oldLines[index]}`);
    }
  }
  return lines.join('\n');
}
