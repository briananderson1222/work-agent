import type { S2SToolDefinition } from './s2s-types.js';
import type { VoiceToolExecutor } from './voice-session.js';

/**
 * Built-in voice tools that work with any Stallion instance (no plugin-specific refs).
 * Plugins add their own domain-specific tools via VoiceSessionOptions.
 */
export const BUILTIN_VOICE_TOOLS: S2SToolDefinition[] = [
  {
    name: 'navigate_to_view',
    description: 'Switch the main app view',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'App path to navigate to, e.g. /layouts/my-layout' },
      },
      required: ['path'],
    },
  },
  {
    name: 'send_to_chat',
    description: 'Send a message to the text chat agent for complex tasks',
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        agent: { type: 'string', description: 'Agent slug (defaults to "default")' },
      },
      required: ['message'],
    },
  },
];

/**
 * Create a tool executor for the built-in tools.
 * Plugins can wrap this to add their own tools.
 */
export function createBuiltinToolExecutor(apiBase: string): VoiceToolExecutor {
  const post = (path: string, body: unknown) =>
    fetch(`${apiBase}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then((r) => r.json());

  return async (toolName, params) => {
    switch (toolName) {
      case 'navigate_to_view': {
        await post('/api/ui', { command: 'navigate', payload: { path: params.path } });
        return `Navigated to ${params.path}.`;
      }
      case 'send_to_chat': {
        const agent = (params.agent as string) ?? 'default';
        await post(`/api/agents/${agent}/chat`, {
          input: params.message,
          options: { conversationId: `voice:${Date.now()}` },
        });
        return `Message sent to ${agent}.`;
      }
      default:
        return `Unknown tool: ${toolName}`;
    }
  };
}
