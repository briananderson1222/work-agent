import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

function readBody(req: Parameters<typeof createServer>[0]): Promise<any> {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      if (!raw) {
        resolve(undefined);
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

describe('CLI surface commands over HTTP', () => {
  let server: ReturnType<typeof createServer>;
  let apiBase = '';
  let stdoutWrite: ReturnType<typeof vi.spyOn>;
  let _consoleLog: ReturnType<typeof vi.spyOn>;

  const state = {
    connections: [] as any[],
    tools: [] as any[],
    notifications: [] as any[],
    runs: [
      {
        runId: 'run-1',
        source: 'schedule',
        status: 'completed',
      },
    ] as any[],
    scheduleJobs: [] as any[],
    monitoringEvents: [{ type: 'event', value: 'historical' }],
    notificationActionCalls: [] as Array<{ id: string; actionId: string }>,
    registry: {
      agents: [{ id: 'registry-agent', displayName: 'Registry Agent' }],
      skills: [{ id: 'registry-skill', displayName: 'Registry Skill' }],
      integrations: [
        { id: 'registry-integration', displayName: 'Registry Integration' },
      ],
      plugins: [{ id: 'registry-plugin', displayName: 'Registry Plugin' }],
    },
    registryInstalls: [] as Array<{ tab: string; id: string }>,
    feedbackRatings: [] as any[],
    acpConnections: [] as any[],
    voiceSessions: [] as any[],
    knowledgeNamespaces: [
      { id: 'default', name: 'Default', description: 'default namespace' },
    ],
    knowledgeDocs: [{ id: 'doc-1', filename: 'README.md', chunkCount: 1 }],
  };

  beforeEach(async () => {
    stdoutWrite = vi.spyOn(process.stdout, 'write');
    stdoutWrite.mockImplementation(() => true);
    _consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});

    server = createServer(async (req, res) => {
      const method = req.method || 'GET';
      const url = new URL(req.url || '/', 'http://127.0.0.1');
      const body =
        method === 'POST' || method === 'PUT' || method === 'PATCH'
          ? await readBody(req)
          : undefined;

      const sendJson = (status: number, payload: unknown) => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(payload));
      };

      if (method === 'GET' && url.pathname === '/api/connections') {
        sendJson(200, { success: true, data: state.connections });
        return;
      }
      if (method === 'GET' && url.pathname === '/api/connections/models') {
        sendJson(200, {
          success: true,
          data: state.connections.filter((entry) => entry.kind === 'model'),
        });
        return;
      }
      if (method === 'GET' && url.pathname === '/api/connections/runtimes') {
        sendJson(200, {
          success: true,
          data: state.connections.filter((entry) => entry.kind === 'runtime'),
        });
        return;
      }
      if (method === 'POST' && url.pathname === '/api/connections') {
        state.connections.push(body);
        sendJson(201, { success: true, data: body });
        return;
      }
      if (
        method === 'POST' &&
        url.pathname.match(/^\/api\/connections\/[^/]+\/test$/)
      ) {
        sendJson(200, {
          success: true,
          data: { healthy: true, status: 'ready' },
        });
        return;
      }

      if (method === 'GET' && url.pathname === '/integrations') {
        sendJson(200, { success: true, data: state.tools });
        return;
      }
      if (method === 'POST' && url.pathname === '/integrations') {
        state.tools.push(body);
        sendJson(200, { success: true });
        return;
      }
      if (
        method === 'POST' &&
        url.pathname.match(/^\/integrations\/[^/]+\/reconnect$/)
      ) {
        sendJson(200, { success: true });
        return;
      }
      if (
        method === 'DELETE' &&
        url.pathname.match(/^\/integrations\/[^/]+$/)
      ) {
        const id = decodeURIComponent(url.pathname.split('/').pop() || '');
        state.tools = state.tools.filter((entry) => entry.id !== id);
        sendJson(200, { success: true });
        return;
      }

      if (method === 'GET' && url.pathname === '/notifications') {
        sendJson(200, { success: true, data: state.notifications });
        return;
      }
      if (method === 'POST' && url.pathname === '/notifications') {
        const next = { id: `notif-${state.notifications.length + 1}`, ...body };
        state.notifications.push(next);
        sendJson(201, { success: true, data: next });
        return;
      }
      if (
        method === 'POST' &&
        url.pathname.match(/^\/notifications\/[^/]+\/action\/[^/]+$/)
      ) {
        const [, , id, , actionId] = url.pathname.split('/');
        state.notificationActionCalls.push({ id, actionId });
        sendJson(200, { success: true });
        return;
      }
      if (method === 'DELETE' && url.pathname === '/notifications') {
        state.notifications = [];
        sendJson(200, { success: true });
        return;
      }
      if (method === 'GET' && url.pathname === '/notifications/providers') {
        sendJson(200, { success: true, data: [{ id: 'builtin' }] });
        return;
      }

      if (method === 'GET' && url.pathname === '/monitoring/stats') {
        sendJson(200, {
          success: true,
          data: { agents: [], summary: { totalAgents: 0 } },
        });
        return;
      }
      if (method === 'GET' && url.pathname === '/monitoring/metrics') {
        sendJson(200, { success: true, data: { range: 'today', metrics: [] } });
        return;
      }
      if (method === 'GET' && url.pathname === '/monitoring/events') {
        sendJson(200, { success: true, data: state.monitoringEvents });
        return;
      }

      if (method === 'GET' && url.pathname === '/scheduler/jobs') {
        sendJson(200, { success: true, data: state.scheduleJobs });
        return;
      }
      if (method === 'GET' && url.pathname === '/api/runs') {
        sendJson(200, { success: true, data: state.runs });
        return;
      }
      if (method === 'GET' && url.pathname === '/api/runs/run-1') {
        sendJson(200, { success: true, data: state.runs[0] });
        return;
      }
      if (method === 'POST' && url.pathname === '/api/runs/output') {
        sendJson(200, { success: true, data: { content: 'run output' } });
        return;
      }
      if (method === 'GET' && url.pathname === '/scheduler/providers') {
        sendJson(200, { success: true, data: [{ id: 'builtin' }] });
        return;
      }
      if (method === 'GET' && url.pathname === '/scheduler/stats') {
        sendJson(200, { success: true, data: { summary: { totalJobs: 0 } } });
        return;
      }
      if (method === 'GET' && url.pathname === '/scheduler/status') {
        sendJson(200, { success: true, data: { providers: {} } });
        return;
      }
      if (
        method === 'GET' &&
        url.pathname === '/scheduler/jobs/preview-schedule'
      ) {
        sendJson(200, { success: true, data: ['2026-04-19T00:00:00Z'] });
        return;
      }
      if (method === 'POST' && url.pathname === '/scheduler/jobs') {
        state.scheduleJobs.push(body);
        sendJson(200, { success: true, data: { output: 'created' } });
        return;
      }
      if (
        method === 'POST' &&
        url.pathname.match(/^\/scheduler\/jobs\/[^/]+\/run$/)
      ) {
        sendJson(200, { success: true, data: { output: 'started' } });
        return;
      }

      if (method === 'GET' && url.pathname === '/api/knowledge/status') {
        sendJson(200, {
          success: true,
          data: {
            vectorDb: null,
            embedding: null,
            stats: { totalDocuments: 1, totalChunks: 1, projectCount: 1 },
          },
        });
        return;
      }
      if (method === 'POST' && url.pathname === '/api/knowledge/search') {
        sendJson(200, {
          success: true,
          data: [{ projectSlug: 'demo', results: [{ id: 'doc-1' }] }],
        });
        return;
      }
      if (
        method === 'GET' &&
        url.pathname === '/api/projects/demo/knowledge/namespaces'
      ) {
        sendJson(200, { success: true, data: state.knowledgeNamespaces });
        return;
      }
      if (method === 'GET' && url.pathname === '/api/projects/demo/knowledge') {
        sendJson(200, { success: true, data: state.knowledgeDocs });
        return;
      }
      if (method === 'GET' && url.pathname === '/api/auth/status') {
        sendJson(200, {
          authenticated: true,
          method: 'sso',
          user: { alias: 'testuser', name: 'Test User' },
        });
        return;
      }
      if (
        method === 'POST' &&
        (url.pathname === '/api/auth/renew' ||
          url.pathname === '/api/auth/terminal')
      ) {
        sendJson(200, { success: true, message: 'Renewed' });
        return;
      }
      if (method === 'GET' && url.pathname === '/api/users/search') {
        const q = url.searchParams.get('q') || '';
        sendJson(200, [{ alias: q, name: q }]);
        return;
      }
      if (method === 'GET' && url.pathname === '/api/users/testuser') {
        sendJson(200, { alias: 'testuser', name: 'testuser' });
        return;
      }
      if (method === 'GET' && url.pathname === '/api/branding') {
        sendJson(200, {
          success: true,
          data: {
            name: 'Stallion AI',
            logo: null,
            theme: { primary: '#000' },
            welcomeMessage: 'Hello!',
          },
        });
        return;
      }
      if (method === 'POST' && url.pathname === '/api/feedback/rate') {
        const next = {
          id: `rating-${state.feedbackRatings.length + 1}`,
          ...body,
        };
        state.feedbackRatings.push(next);
        sendJson(200, { success: true, data: next });
        return;
      }
      if (method === 'DELETE' && url.pathname === '/api/feedback/rate') {
        state.feedbackRatings = state.feedbackRatings.filter(
          (entry) =>
            !(
              entry.conversationId === body.conversationId &&
              entry.messageIndex === body.messageIndex
            ),
        );
        sendJson(200, { success: true, removed: true });
        return;
      }
      if (method === 'GET' && url.pathname === '/api/feedback/ratings') {
        sendJson(200, { success: true, data: state.feedbackRatings });
        return;
      }
      if (method === 'GET' && url.pathname === '/api/feedback/guidelines') {
        sendJson(200, {
          success: true,
          data: { guidelines: '', summary: {} },
        });
        return;
      }
      if (method === 'POST' && url.pathname === '/api/feedback/analyze') {
        sendJson(200, { success: true, data: { analyzed: true } });
        return;
      }
      if (
        method === 'POST' &&
        url.pathname === '/api/feedback/clear-analysis'
      ) {
        sendJson(200, { success: true });
        return;
      }
      if (method === 'GET' && url.pathname === '/api/feedback/status') {
        sendJson(200, {
          success: true,
          data: { totalRatings: state.feedbackRatings.length },
        });
        return;
      }
      if (method === 'POST' && url.pathname === '/api/feedback/test') {
        sendJson(200, { success: true, data: { ok: true } });
        return;
      }
      if (method === 'GET' && url.pathname === '/api/insights/') {
        sendJson(200, {
          success: true,
          data: {
            toolUsage: {},
            hourlyActivity: new Array(24).fill(0),
            agentUsage: {},
            modelUsage: {},
            totalChats: 0,
            totalToolCalls: 0,
            totalErrors: 0,
            days: Number(url.searchParams.get('days') || 14),
          },
        });
        return;
      }
      if (method === 'GET' && url.pathname === '/acp/status') {
        sendJson(200, {
          success: true,
          data: { connected: false, connections: [] },
        });
        return;
      }
      if (method === 'GET' && url.pathname === '/acp/commands/kiro') {
        sendJson(200, { success: true, data: [] });
        return;
      }
      if (method === 'GET' && url.pathname === '/acp/commands/kiro/options') {
        sendJson(200, { success: true, data: [] });
        return;
      }
      if (method === 'GET' && url.pathname === '/acp/connections') {
        sendJson(200, { success: true, data: state.acpConnections });
        return;
      }
      if (method === 'POST' && url.pathname === '/acp/connections') {
        state.acpConnections.push(body);
        sendJson(200, { success: true, data: body });
        return;
      }
      if (method === 'PUT' && url.pathname === '/acp/connections/demo-acp') {
        state.acpConnections = state.acpConnections.map((entry) =>
          entry.id === 'demo-acp' ? { ...entry, ...body } : entry,
        );
        sendJson(200, {
          success: true,
          data: state.acpConnections.find((entry) => entry.id === 'demo-acp'),
        });
        return;
      }
      if (
        method === 'POST' &&
        url.pathname === '/acp/connections/demo-acp/reconnect'
      ) {
        sendJson(200, { success: true });
        return;
      }
      if (method === 'DELETE' && url.pathname === '/acp/connections/demo-acp') {
        state.acpConnections = state.acpConnections.filter(
          (entry) => entry.id !== 'demo-acp',
        );
        sendJson(200, { success: true });
        return;
      }
      if (method === 'GET' && url.pathname === '/api/voice/status') {
        sendJson(200, {
          success: true,
          data: { activeSessions: state.voiceSessions.length },
        });
        return;
      }
      if (method === 'GET' && url.pathname === '/api/voice/agent') {
        sendJson(200, {
          success: true,
          data: {
            slug: 'stallion-voice',
            activeSessions: state.voiceSessions.length,
          },
        });
        return;
      }
      if (method === 'POST' && url.pathname === '/api/voice/sessions') {
        const next = {
          sessionId: `voice-${state.voiceSessions.length + 1}`,
          agentSlug: body?.agentSlug || 'stallion-voice',
        };
        state.voiceSessions.push(next);
        sendJson(200, { success: true, data: next });
        return;
      }
      if (
        method === 'DELETE' &&
        url.pathname === '/api/voice/sessions/voice-1'
      ) {
        state.voiceSessions = state.voiceSessions.filter(
          (entry) => entry.sessionId !== 'voice-1',
        );
        sendJson(200, { success: true });
        return;
      }
      const registryListMatch = url.pathname.match(
        /^\/api\/registry\/(agents|skills|integrations|plugins)(?:\/installed)?$/,
      );
      if (method === 'GET' && registryListMatch) {
        const tab = registryListMatch[1] as keyof typeof state.registry;
        sendJson(200, { success: true, data: state.registry[tab] });
        return;
      }
      const registryInstallMatch = url.pathname.match(
        /^\/api\/registry\/(agents|skills|integrations|plugins)\/install$/,
      );
      if (method === 'POST' && registryInstallMatch) {
        state.registryInstalls.push({
          tab: registryInstallMatch[1],
          id: body.id,
        });
        sendJson(200, { success: true, data: { success: true } });
        return;
      }
      const registryDeleteMatch = url.pathname.match(
        /^\/api\/registry\/(agents|skills|integrations|plugins)\/([^/]+)$/,
      );
      if (method === 'DELETE' && registryDeleteMatch) {
        sendJson(200, { success: true, data: { success: true } });
        return;
      }

      sendJson(404, { success: false, error: 'Unhandled route' });
    });

    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    apiBase = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
    vi.restoreAllMocks();
    state.connections = [];
    state.tools = [];
    state.notifications = [];
    state.runs = [
      {
        runId: 'run-1',
        source: 'schedule',
        status: 'completed',
      },
    ];
    state.scheduleJobs = [];
    state.monitoringEvents = [{ type: 'event', value: 'historical' }];
    state.notificationActionCalls = [];
    state.registryInstalls = [];
    state.feedbackRatings = [];
    state.acpConnections = [];
    state.voiceSessions = [];
  });

  test('supports connections, tools, notifications, monitoring, schedule, runs, and knowledge surfaces', async () => {
    const { runCli } = await import('../cli.js');

    await runCli([
      'connections',
      'create',
      `--api-base=${apiBase}`,
      '--data={"id":"ollama-local","kind":"model","type":"ollama","name":"Ollama","enabled":true,"capabilities":["llm"],"config":{}}',
    ]);
    await runCli(['connections', 'models', `--api-base=${apiBase}`]);
    await runCli([
      'connections',
      'test',
      'ollama-local',
      `--api-base=${apiBase}`,
    ]);

    await runCli([
      'tools',
      'create',
      `--api-base=${apiBase}`,
      '--data={"id":"filesystem-tools","kind":"mcp","transport":"stdio","command":"npx","args":["-y","demo"],"displayName":"Filesystem Tools","description":"Local helpers"}',
    ]);
    await runCli([
      'tools',
      'reconnect',
      'filesystem-tools',
      `--api-base=${apiBase}`,
    ]);
    await runCli([
      'tools',
      'delete',
      'filesystem-tools',
      `--api-base=${apiBase}`,
    ]);

    await runCli([
      'notifications',
      'create',
      `--api-base=${apiBase}`,
      '--data={"title":"Approval needed","body":"Review this","category":"approval-request"}',
    ]);
    await runCli(['notifications', 'list', `--api-base=${apiBase}`]);
    await runCli([
      'notifications',
      'action',
      'notif-1',
      'accept',
      `--api-base=${apiBase}`,
    ]);
    await runCli(['notifications', 'providers', `--api-base=${apiBase}`]);
    await runCli(['notifications', 'clear', `--api-base=${apiBase}`]);

    await runCli(['monitoring', 'stats', `--api-base=${apiBase}`]);
    await runCli([
      'monitoring',
      'metrics',
      '--range=today',
      `--api-base=${apiBase}`,
    ]);
    await runCli([
      'monitoring',
      'events',
      '--start=2026-01-01',
      '--end=2026-12-31',
      `--api-base=${apiBase}`,
    ]);

    await runCli(['schedule', 'providers', `--api-base=${apiBase}`]);
    await runCli([
      'schedule',
      'create',
      `--api-base=${apiBase}`,
      '--data={"name":"daily-report","prompt":"Generate report"}',
    ]);
    await runCli(['schedule', 'run', 'daily-report', `--api-base=${apiBase}`]);
    await runCli([
      'schedule',
      'preview',
      '0 9 * * *',
      '1',
      `--api-base=${apiBase}`,
    ]);
    await runCli(['runs', 'list', `--api-base=${apiBase}`]);
    await runCli(['runs', 'read', 'run-1', `--api-base=${apiBase}`]);
    await runCli([
      'runs',
      'output',
      `--api-base=${apiBase}`,
      '--data={"source":"schedule","providerId":"built-in","runId":"run-1","artifactId":"log-1","kind":"text"}',
    ]);

    await runCli(['knowledge', 'status', `--api-base=${apiBase}`]);
    await runCli([
      'knowledge',
      'search',
      `--api-base=${apiBase}`,
      '--data={"query":"README","topK":5}',
    ]);
    await runCli([
      'knowledge',
      'namespaces',
      'list',
      'demo',
      `--api-base=${apiBase}`,
    ]);
    await runCli([
      'knowledge',
      'docs',
      'list',
      'demo',
      `--api-base=${apiBase}`,
    ]);
    await runCli([
      'plugin',
      'registry',
      'agents',
      'list',
      `--api-base=${apiBase}`,
    ]);
    await runCli([
      'plugin',
      'registry',
      'skills',
      'install',
      'registry-skill',
      `--api-base=${apiBase}`,
    ]);
    await runCli(['auth', 'status', `--api-base=${apiBase}`]);
    await runCli(['auth', 'renew', `--api-base=${apiBase}`]);
    await runCli(['auth', 'users', 'search', 'test', `--api-base=${apiBase}`]);
    await runCli(['branding', 'get', `--api-base=${apiBase}`]);
    await runCli([
      'feedback',
      'rate',
      `--api-base=${apiBase}`,
      '--data={"conversationId":"conv-1","messageIndex":0,"messagePreview":"hi","rating":"thumbs_up"}',
    ]);
    await runCli(['feedback', 'ratings', `--api-base=${apiBase}`]);
    await runCli(['feedback', 'guidelines', `--api-base=${apiBase}`]);
    await runCli(['feedback', 'status', `--api-base=${apiBase}`]);
    await runCli(['feedback', 'test', `--api-base=${apiBase}`]);
    await runCli(['insights', 'get', '--days=7', `--api-base=${apiBase}`]);
    await runCli(['acp', 'status', `--api-base=${apiBase}`]);
    await runCli(['acp', 'commands', 'kiro', `--api-base=${apiBase}`]);
    await runCli([
      'acp',
      'connections',
      'create',
      `--api-base=${apiBase}`,
      '--data={"id":"demo-acp","command":"kiro-cli","name":"Demo ACP"}',
    ]);
    await runCli([
      'acp',
      'connections',
      'reconnect',
      'demo-acp',
      `--api-base=${apiBase}`,
    ]);
    await runCli(['voice', 'status', `--api-base=${apiBase}`]);
    await runCli([
      'voice',
      'create-session',
      `--api-base=${apiBase}`,
      '--data={"agentSlug":"stallion-voice"}',
    ]);
    await runCli([
      'voice',
      'delete-session',
      'voice-1',
      `--api-base=${apiBase}`,
    ]);

    expect(state.connections.map((entry) => entry.id)).toContain(
      'ollama-local',
    );
    expect(state.tools).toHaveLength(0);
    expect(state.notifications).toHaveLength(0);
    expect(state.notificationActionCalls).toEqual([
      { id: 'notif-1', actionId: 'accept' },
    ]);
    expect(state.registryInstalls).toEqual([
      { tab: 'skills', id: 'registry-skill' },
    ]);
    expect(state.feedbackRatings).toHaveLength(1);
    expect(state.acpConnections).toHaveLength(1);
    expect(state.voiceSessions).toHaveLength(0);
    expect(state.scheduleJobs).toHaveLength(1);
  });
});
