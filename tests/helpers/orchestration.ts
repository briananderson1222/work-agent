import type { Page } from '@playwright/test';

export const STATUS_READY = JSON.stringify({
  ready: true,
  bedrock: { credentialsFound: false, verified: null, region: 'us-east-1' },
  acp: { connected: false, connections: [] },
  clis: {},
  prerequisites: [],
  providers: {
    configured: [
      {
        id: 'codex-runtime',
        type: 'codex',
        enabled: true,
        capabilities: ['llm'],
      },
    ],
    detected: { ollama: false, bedrock: false },
  },
  capabilities: {
    chat: {
      ready: true,
      source: 'codex-runtime',
    },
  },
});

export const TEST_PROJECTS = [
  {
    id: 'p1',
    slug: 'dev',
    name: 'Dev',
    icon: '💻',
    description: 'Dev project',
    hasWorkingDirectory: true,
    layoutCount: 1,
    hasKnowledge: false,
  },
];

export const DEV_LAYOUTS = [
  {
    id: 'l1',
    slug: 'code',
    projectSlug: 'dev',
    type: 'coding',
    name: 'Code',
    icon: '🖥️',
  },
];

export const DEV_CONFIG = {
  id: 'p1',
  slug: 'dev',
  name: 'Dev',
  icon: '💻',
  description: 'Dev project',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

export const CODING_LAYOUT = {
  id: 'l1',
  slug: 'code',
  projectSlug: 'dev',
  type: 'coding',
  name: 'Code',
  icon: '🖥️',
  config: { workingDirectory: '/tmp/test', tabs: [], globalPrompts: [] },
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

export const DEFAULT_PROVIDER_SUMMARIES = [
  { provider: 'bedrock', activeSessions: 0, prerequisites: [] },
  {
    provider: 'claude',
    activeSessions: 0,
    prerequisites: [{ name: 'ANTHROPIC_API_KEY', status: 'installed' }],
  },
  {
    provider: 'codex',
    activeSessions: 0,
    prerequisites: [{ name: 'OPENAI_API_KEY', status: 'installed' }],
  },
];

export const DEFAULT_CONVERSATIONS = [
  {
    id: 'conv-1',
    title: 'Dev Agent Chat',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    messageCount: 0,
  },
];

export const DEFAULT_CONVERSATION_LOOKUPS = {
  'conv-1': {
    id: 'conv-1',
    agentSlug: 'dev-agent',
    projectSlug: 'dev',
    title: 'Dev Agent Chat',
  },
} satisfies Record<
  string,
  {
    id: string;
    agentSlug: string;
    projectSlug?: string;
    title?: string;
  }
>;

type StoredChat = {
  sessionId: string;
  conversationId: string;
  agentSlug: string;
  model?: string;
  provider?: string;
  providerOptions?: Record<string, unknown>;
  orchestrationSessionStarted?: boolean;
  ephemeralMessages?: unknown[];
  inputHistory?: string[];
};

export async function seedActiveChats(
  page: Page,
  chats: StoredChat[],
): Promise<void> {
  await page.addInitScript((items) => {
    sessionStorage.setItem('activeChats', JSON.stringify(items));
  }, chats);
}

export async function installMockOrchestrationEventSource(
  page: Page,
): Promise<void> {
  await page.addInitScript(() => {
    class MockEventSource {
      static instances: MockEventSource[] = [];
      url: string;
      onerror: ((event: Event) => void) | null = null;
      private listeners = new Map<string, Set<(event: MessageEvent) => void>>();

      constructor(url: string) {
        this.url = url;
        MockEventSource.instances.push(this);
      }

      addEventListener(type: string, listener: (event: MessageEvent) => void) {
        if (!this.listeners.has(type)) {
          this.listeners.set(type, new Set());
        }
        this.listeners.get(type)!.add(listener);
      }

      removeEventListener(
        type: string,
        listener: (event: MessageEvent) => void,
      ) {
        this.listeners.get(type)?.delete(listener);
      }

      close() {
        MockEventSource.instances = MockEventSource.instances.filter(
          (instance) => instance !== this,
        );
      }

      dispatch(type: string, payload: unknown) {
        const event = new MessageEvent(type, {
          data: JSON.stringify(payload),
        });
        this.listeners.get(type)?.forEach((listener) => listener(event));
      }
    }

    (window as any).__mockOrchestrationSse = {
      emit(type: string, payload: unknown) {
        for (const instance of MockEventSource.instances) {
          instance.dispatch(type, payload);
        }
      },
      count() {
        return MockEventSource.instances.length;
      },
      hasUrl(fragment: string) {
        return MockEventSource.instances.some((instance) =>
          instance.url.includes(fragment),
        );
      },
    };

    (window as any).EventSource = MockEventSource;
  });
}

export async function waitForMockOrchestrationEventSource(
  page: Page,
): Promise<void> {
  await page.waitForFunction(
    () =>
      (window as any).__mockOrchestrationSse?.hasUrl?.(
        '/api/orchestration/events',
      ) === true,
  );
}

export async function emitMockOrchestrationEvent(
  page: Page,
  type: string,
  payload: unknown,
): Promise<void> {
  await page.evaluate(
    ([eventType, eventPayload]) => {
      (window as any).__mockOrchestrationSse.emit(eventType, eventPayload);
    },
    [type, payload],
  );
}

export async function seedOrchestrationRoutes(
  page: Page,
  options?: {
    providerSummaries?: Array<{
      provider: string;
      activeSessions: number;
      prerequisites: Array<{ name: string; status: string }>;
    }>;
    conversations?: Array<{
      id: string;
      title?: string;
      createdAt: string;
      updatedAt: string;
      messageCount?: number;
    }>;
    conversationLookups?: Record<
      string,
      {
        id: string;
        agentSlug: string;
        projectSlug?: string;
        title?: string;
      }
    >;
  },
): Promise<void> {
  const providerSummaries =
    options?.providerSummaries ?? DEFAULT_PROVIDER_SUMMARIES;
  const conversations = options?.conversations ?? DEFAULT_CONVERSATIONS;
  const conversationLookups =
    options?.conversationLookups ?? DEFAULT_CONVERSATION_LOOKUPS;

  await Promise.all([
    page.route('**/api/system/status', (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: STATUS_READY,
      }),
    ),
    page.route('**/api/projects', (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: TEST_PROJECTS }),
      }),
    ),
    page.route('**/api/projects/dev', (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: DEV_CONFIG }),
      }),
    ),
    page.route('**/api/projects/dev/layouts', (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: DEV_LAYOUTS }),
      }),
    ),
    page.route('**/api/projects/dev/layouts/code', (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: CODING_LAYOUT }),
      }),
    ),
    page.route('**/api/agents', (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [
            {
              slug: 'dev-agent',
              name: 'Dev Agent',
              description: 'Test agent',
              updatedAt: '2026-01-01T00:00:00Z',
            },
          ],
        }),
      }),
    ),
    page.route('**/agents/**/conversations', (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: conversations }),
      }),
    ),
    page.route('**/agents/**/conversations/**/messages', (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: [] }),
      }),
    ),
    page.route('**/api/conversations/*', (r) => {
      const url = new URL(r.request().url());
      const conversationId =
        url.pathname.split('/').filter(Boolean).pop() ?? '';
      const conversation = conversationLookups[conversationId];
      return r.fulfill({
        status: conversation ? 200 : 404,
        contentType: 'application/json',
        body: JSON.stringify(
          conversation
            ? { success: true, data: conversation }
            : { success: false, error: 'Conversation not found' },
        ),
      });
    }),
    page.route('**/api/feedback/ratings', (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: [] }),
      }),
    ),
    page.route('**/api/branding', (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: {} }),
      }),
    ),
    page.route('**/api/auth/status', (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ authenticated: true }),
      }),
    ),
    page.route('**/api/config/app', (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { defaultModel: 'claude-sonnet', region: 'us-east-1' },
        }),
      }),
    ),
    page.route('**/api/models/**', (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: [] }),
      }),
    ),
    page.route('**/api/orchestration/providers', (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: providerSummaries,
        }),
      }),
    ),
    page.route('**/api/events', (r) =>
      r.fulfill({
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
        body: 'data: {"event":"connected"}\n\n',
      }),
    ),
  ]);
}
