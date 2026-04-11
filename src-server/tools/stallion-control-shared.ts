export function resolveControlApiBase(
  env: NodeJS.ProcessEnv = process.env,
) {
  return env.STALLION_API_BASE || `http://127.0.0.1:${env.STALLION_PORT || 3141}`;
}

export const API = resolveControlApiBase();

export async function api(path: string, opts?: RequestInit) {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...opts?.headers },
  });
  return res.json() as Promise<any>;
}

export function jsonToolResult(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}

export function buildAnalyticsUsagePath(from?: string, to?: string) {
  const params = new URLSearchParams();
  if (from) {
    params.set('from', from);
  }
  if (to) {
    params.set('to', to);
  }
  const query = params.toString();
  return `/api/analytics/usage${query ? `?${query}` : ''}`;
}

export function buildChatRequest(message: string, conversationId: string) {
  return {
    input: message,
    options: { conversationId },
  };
}

export function createConversationId(agent: string, conversationId?: string) {
  return conversationId || `${agent}:${Date.now()}`;
}

export function buildSentMessageResult(agent: string, conversationId: string) {
  return jsonToolResult({
    success: true,
    conversationId,
    agent,
    message: 'Message sent (non-blocking)',
  });
}

export async function dispatchAgentMessage(
  agent: string,
  message: string,
  conversationId: string,
) {
  fetch(`${API}/api/agents/${agent}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildChatRequest(message, conversationId)),
  }).catch(() => {});
  await new Promise((resolve) => setTimeout(resolve, 500));
}

export async function navigateTo(path: string) {
  return api('/api/ui', {
    method: 'POST',
    body: JSON.stringify({ command: 'navigate', payload: { path } }),
  });
}
