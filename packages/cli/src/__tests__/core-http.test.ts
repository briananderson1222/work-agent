import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

type AgentRecord = { slug: string; name: string; prompt?: string };
type ProjectRecord = { slug: string; name: string };
type SkillRecord = { name: string; body: string };
type PlaybookRecord = {
  id: string;
  name: string;
  content: string;
  stats: { qualityScore: number | null };
};

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

describe('CLI core commands over HTTP', () => {
  let server: ReturnType<typeof createServer>;
  let apiBase = '';
  let stdoutWrite: ReturnType<typeof vi.spyOn>;
  let _consoleLog: ReturnType<typeof vi.spyOn>;

  const state: {
    agents: AgentRecord[];
    projects: ProjectRecord[];
    skills: SkillRecord[];
    playbooks: PlaybookRecord[];
  } = {
    agents: [{ slug: 'default', name: 'Default Agent', prompt: 'Be helpful.' }],
    projects: [],
    skills: [],
    playbooks: [],
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

      if (method === 'GET' && url.pathname === '/api/agents') {
        sendJson(200, { success: true, data: state.agents });
        return;
      }

      if (method === 'POST' && url.pathname === '/agents') {
        const nextAgent = {
          slug: body.slug || `agent-${state.agents.length + 1}`,
          name: body.name,
          prompt: body.prompt,
        };
        state.agents.push(nextAgent);
        sendJson(201, { success: true, data: nextAgent });
        return;
      }

      if (method === 'GET' && url.pathname === '/api/projects') {
        sendJson(200, { success: true, data: state.projects });
        return;
      }

      if (method === 'POST' && url.pathname === '/api/projects') {
        const nextProject = {
          slug: body.slug || `project-${state.projects.length + 1}`,
          name: body.name,
        };
        state.projects.push(nextProject);
        sendJson(201, { success: true, data: nextProject });
        return;
      }

      if (method === 'GET' && url.pathname === '/api/skills') {
        sendJson(200, { success: true, data: state.skills });
        return;
      }

      if (method === 'POST' && url.pathname === '/api/skills/local') {
        state.skills.push({ name: body.name, body: body.body });
        sendJson(201, {
          success: true,
          data: { success: true, message: 'Created' },
        });
        return;
      }

      if (method === 'GET' && url.pathname === '/api/playbooks') {
        sendJson(200, { success: true, data: state.playbooks });
        return;
      }

      if (method === 'POST' && url.pathname === '/api/playbooks') {
        const nextPlaybook = {
          id: `pb-${state.playbooks.length + 1}`,
          name: body.name,
          content: body.content,
          stats: { qualityScore: null },
        };
        state.playbooks.push(nextPlaybook);
        sendJson(201, { success: true, data: nextPlaybook });
        return;
      }

      const playbookOutcomeMatch = url.pathname.match(
        /^\/api\/playbooks\/([^/]+)\/outcome$/,
      );
      if (method === 'POST' && playbookOutcomeMatch) {
        const id = decodeURIComponent(playbookOutcomeMatch[1]);
        const playbook = state.playbooks.find((entry) => entry.id === id);
        if (!playbook) {
          sendJson(404, { success: false, error: 'Not found' });
          return;
        }
        playbook.stats.qualityScore = body.outcome === 'success' ? 100 : 0;
        sendJson(200, { success: true, data: playbook });
        return;
      }

      if (method === 'POST' && url.pathname === '/api/agents/default/chat') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.write(
          `data: ${JSON.stringify({
            type: 'conversation-started',
            conversationId: 'conv-http-test',
          })}\n\n`,
        );
        res.write(
          `data: ${JSON.stringify({ type: 'text-delta', text: 'Echo: ' })}\n\n`,
        );
        res.write(
          `data: ${JSON.stringify({
            type: 'text-delta',
            text: body.input,
          })}\n\n`,
        );
        res.write(
          `data: ${JSON.stringify({
            type: 'finish',
            finishReason: 'stop',
          })}\n\n`,
        );
        res.end('data: [DONE]\n\n');
        return;
      }

      sendJson(404, { success: false, error: 'Unhandled route' });
    });

    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    const address = server.address() as AddressInfo;
    apiBase = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    vi.restoreAllMocks();
    state.agents = [
      { slug: 'default', name: 'Default Agent', prompt: 'Be helpful.' },
    ];
    state.projects = [];
    state.skills = [];
    state.playbooks = [];
  });

  test('supports CRUD-style resource commands and chat through the shared CLI surface', async () => {
    const { runCli } = await import('../cli.js');

    await runCli([
      'agents',
      'create',
      `--api-base=${apiBase}`,
      '--data={"name":"Planner","slug":"planner","prompt":"Plan carefully."}',
    ]);
    await runCli([
      'projects',
      'create',
      `--api-base=${apiBase}`,
      '--data={"name":"Launchpad","slug":"launchpad"}',
    ]);
    await runCli([
      'skills',
      'create',
      `--api-base=${apiBase}`,
      '--data={"name":"ship-it","body":"Execute the task."}',
    ]);
    await runCli([
      'playbooks',
      'create',
      `--api-base=${apiBase}`,
      '--data={"name":"Triage","content":"Sort the work."}',
    ]);
    await runCli([
      'playbooks',
      'outcome',
      'pb-1',
      'success',
      `--api-base=${apiBase}`,
    ]);
    await runCli([
      'chat',
      'default',
      'hello http world',
      `--api-base=${apiBase}`,
    ]);

    expect(state.agents.map((agent) => agent.slug)).toContain('planner');
    expect(state.projects.map((project) => project.slug)).toContain(
      'launchpad',
    );
    expect(state.skills.map((skill) => skill.name)).toContain('ship-it');
    expect(state.playbooks[0]?.stats.qualityScore).toBe(100);
    expect(stdoutWrite).toHaveBeenCalledWith('Echo: ');
    expect(stdoutWrite).toHaveBeenCalledWith('hello http world');
  });
});
