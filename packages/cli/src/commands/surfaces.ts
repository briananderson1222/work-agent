import {
  loadJsonPayload,
  type ParsedCoreArgs,
  parseCoreArgs,
  printJson,
  requestJson,
  requirePositional,
  resolveApiBase,
  streamSse,
} from './core-api.js';

function buildQuery(
  parsed: ParsedCoreArgs,
  mappings: Array<{ flag: string; param?: string; multi?: boolean }>,
) {
  const params = new URLSearchParams();
  for (const mapping of mappings) {
    const raw = parsed.flags[mapping.flag];
    if (typeof raw !== 'string' || raw.length === 0) {
      continue;
    }
    const param = mapping.param ?? mapping.flag;
    if (mapping.multi) {
      for (const entry of raw.split(',').map((item) => item.trim())) {
        if (entry) params.append(param, entry);
      }
      continue;
    }
    params.set(param, raw);
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}

async function requestAndPrint<T>(
  apiBase: string,
  path: string,
  init?: RequestInit,
) {
  const data = await requestJson<T>(apiBase, path, init);
  printJson(data);
}

async function requestRawAndPrint(
  apiBase: string,
  path: string,
  init?: RequestInit,
) {
  const response = await fetch(`${apiBase}${path}`, {
    method: init?.method || 'GET',
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers || {}),
    },
  });

  if (!response.ok) {
    throw new Error(`Request failed with HTTP ${response.status}`);
  }

  printJson(await response.json());
}

function getNamespaceBase(project: string, namespace?: string) {
  const encodedProject = encodeURIComponent(project);
  if (namespace && namespace.length > 0) {
    return `/api/projects/${encodedProject}/knowledge/ns/${encodeURIComponent(namespace)}`;
  }
  return `/api/projects/${encodedProject}/knowledge`;
}

async function runConnectionsCommand(args: string[]) {
  const parsed = parseCoreArgs(args);
  const apiBase = resolveApiBase(parsed);
  const action = requirePositional(parsed, 0, 'connections action');

  switch (action) {
    case 'list':
      await requestAndPrint(apiBase, '/api/connections');
      return;
    case 'models':
      await requestAndPrint(apiBase, '/api/connections/models');
      return;
    case 'runtimes':
      await requestAndPrint(apiBase, '/api/connections/runtimes');
      return;
    case 'get': {
      const id = requirePositional(parsed, 1, 'connection id');
      await requestAndPrint(
        apiBase,
        `/api/connections/${encodeURIComponent(id)}`,
      );
      return;
    }
    case 'create': {
      const body = await loadJsonPayload(parsed);
      await requestAndPrint(apiBase, '/api/connections', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      return;
    }
    case 'update': {
      const id = requirePositional(parsed, 1, 'connection id');
      const body = await loadJsonPayload(parsed);
      await requestAndPrint(
        apiBase,
        `/api/connections/${encodeURIComponent(id)}`,
        {
          method: 'PUT',
          body: JSON.stringify(body),
        },
      );
      return;
    }
    case 'delete': {
      const id = requirePositional(parsed, 1, 'connection id');
      await requestAndPrint(
        apiBase,
        `/api/connections/${encodeURIComponent(id)}`,
        {
          method: 'DELETE',
        },
      );
      return;
    }
    case 'test': {
      const id = requirePositional(parsed, 1, 'connection id');
      await requestAndPrint(
        apiBase,
        `/api/connections/${encodeURIComponent(id)}/test`,
        { method: 'POST' },
      );
      return;
    }
    default:
      throw new Error(
        "Unknown connections action. Use 'list', 'models', 'runtimes', 'get', 'create', 'update', 'delete', or 'test'.",
      );
  }
}

async function runToolsCommand(args: string[]) {
  const parsed = parseCoreArgs(args);
  const apiBase = resolveApiBase(parsed);
  const action = requirePositional(parsed, 0, 'tools action');

  switch (action) {
    case 'list':
      await requestAndPrint(apiBase, '/integrations');
      return;
    case 'get': {
      const id = requirePositional(parsed, 1, 'tool server id');
      await requestAndPrint(apiBase, `/integrations/${encodeURIComponent(id)}`);
      return;
    }
    case 'create': {
      const body = await loadJsonPayload(parsed);
      await requestAndPrint(apiBase, '/integrations', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      return;
    }
    case 'update': {
      const id = requirePositional(parsed, 1, 'tool server id');
      const body = await loadJsonPayload(parsed);
      await requestAndPrint(
        apiBase,
        `/integrations/${encodeURIComponent(id)}`,
        {
          method: 'PUT',
          body: JSON.stringify(body),
        },
      );
      return;
    }
    case 'delete': {
      const id = requirePositional(parsed, 1, 'tool server id');
      await requestAndPrint(
        apiBase,
        `/integrations/${encodeURIComponent(id)}`,
        {
          method: 'DELETE',
        },
      );
      return;
    }
    case 'reconnect': {
      const id = requirePositional(parsed, 1, 'tool server id');
      await requestAndPrint(
        apiBase,
        `/integrations/${encodeURIComponent(id)}/reconnect`,
        { method: 'POST' },
      );
      return;
    }
    default:
      throw new Error(
        "Unknown tools action. Use 'list', 'get', 'create', 'update', 'delete', or 'reconnect'.",
      );
  }
}

async function runNotificationsCommand(args: string[]) {
  const parsed = parseCoreArgs(args);
  const apiBase = resolveApiBase(parsed);
  const action = requirePositional(parsed, 0, 'notifications action');

  switch (action) {
    case 'list': {
      const query = buildQuery(parsed, [
        { flag: 'status', multi: true },
        { flag: 'category', multi: true },
      ]);
      await requestAndPrint(apiBase, `/notifications${query}`);
      return;
    }
    case 'create': {
      const body = await loadJsonPayload(parsed);
      await requestAndPrint(apiBase, '/notifications', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      return;
    }
    case 'delete':
    case 'dismiss': {
      const id = requirePositional(parsed, 1, 'notification id');
      await requestAndPrint(
        apiBase,
        `/notifications/${encodeURIComponent(id)}`,
        {
          method: 'DELETE',
        },
      );
      return;
    }
    case 'clear':
      await requestAndPrint(apiBase, '/notifications', { method: 'DELETE' });
      return;
    case 'providers':
      await requestAndPrint(apiBase, '/notifications/providers');
      return;
    case 'action': {
      const id = requirePositional(parsed, 1, 'notification id');
      const actionId = requirePositional(parsed, 2, 'action id');
      await requestAndPrint(
        apiBase,
        `/notifications/${encodeURIComponent(id)}/action/${encodeURIComponent(actionId)}`,
        { method: 'POST' },
      );
      return;
    }
    case 'snooze': {
      const id = requirePositional(parsed, 1, 'notification id');
      let until = parsed.flags.until;
      if (typeof until !== 'string') {
        const body = await loadJsonPayload(parsed);
        until = body.until as string | boolean | undefined;
      }
      if (typeof until !== 'string' || until.length === 0) {
        throw new Error(
          'Provide snooze time with --until=<iso> or JSON input.',
        );
      }
      await requestAndPrint(
        apiBase,
        `/notifications/${encodeURIComponent(id)}/snooze`,
        {
          method: 'POST',
          body: JSON.stringify({ until }),
        },
      );
      return;
    }
    default:
      throw new Error(
        "Unknown notifications action. Use 'list', 'create', 'delete', 'dismiss', 'clear', 'providers', 'action', or 'snooze'.",
      );
  }
}

async function runMonitoringCommand(args: string[]) {
  const parsed = parseCoreArgs(args);
  const apiBase = resolveApiBase(parsed);
  const action = requirePositional(parsed, 0, 'monitoring action');

  switch (action) {
    case 'stats':
      await requestAndPrint(apiBase, '/monitoring/stats');
      return;
    case 'metrics': {
      const query = buildQuery(parsed, [{ flag: 'range' }]);
      await requestAndPrint(apiBase, `/monitoring/metrics${query}`);
      return;
    }
    case 'events': {
      const query = buildQuery(parsed, [
        { flag: 'start' },
        { flag: 'end' },
        { flag: 'user-id', param: 'userId' },
      ]);
      if (query) {
        await requestAndPrint(apiBase, `/monitoring/events${query}`);
        return;
      }
      const response = await fetch(`${apiBase}/monitoring/events`);
      if (!response.ok) {
        throw new Error(
          `Monitoring stream failed with HTTP ${response.status}`,
        );
      }
      await streamSse(response, (event) => {
        console.log(JSON.stringify(event));
      });
      return;
    }
    default:
      throw new Error(
        "Unknown monitoring action. Use 'stats', 'metrics', or 'events'.",
      );
  }
}

async function runScheduleCommand(args: string[]) {
  const parsed = parseCoreArgs(args);
  const apiBase = resolveApiBase(parsed);
  const action = requirePositional(parsed, 0, 'schedule action');

  switch (action) {
    case 'list':
    case 'jobs':
      await requestAndPrint(apiBase, '/scheduler/jobs');
      return;
    case 'providers':
      await requestAndPrint(apiBase, '/scheduler/providers');
      return;
    case 'stats':
      await requestAndPrint(apiBase, '/scheduler/stats');
      return;
    case 'status':
      await requestAndPrint(apiBase, '/scheduler/status');
      return;
    case 'preview': {
      const cron = requirePositional(parsed, 1, 'cron');
      const count = parsed.positionals[2];
      const params = new URLSearchParams({ cron });
      if (count) params.set('count', count);
      await requestAndPrint(
        apiBase,
        `/scheduler/jobs/preview-schedule?${params.toString()}`,
      );
      return;
    }
    case 'logs': {
      const target = requirePositional(parsed, 1, 'job target');
      const count = parsed.positionals[2];
      const suffix = count ? `?count=${encodeURIComponent(count)}` : '';
      await requestAndPrint(
        apiBase,
        `/scheduler/jobs/${encodeURIComponent(target)}/logs${suffix}`,
      );
      return;
    }
    case 'create': {
      const body = await loadJsonPayload(parsed);
      await requestAndPrint(apiBase, '/scheduler/jobs', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      return;
    }
    case 'update': {
      const target = requirePositional(parsed, 1, 'job target');
      const body = await loadJsonPayload(parsed);
      await requestAndPrint(
        apiBase,
        `/scheduler/jobs/${encodeURIComponent(target)}`,
        {
          method: 'PUT',
          body: JSON.stringify(body),
        },
      );
      return;
    }
    case 'run': {
      const target = requirePositional(parsed, 1, 'job target');
      await requestAndPrint(
        apiBase,
        `/scheduler/jobs/${encodeURIComponent(target)}/run`,
        { method: 'POST' },
      );
      return;
    }
    case 'enable': {
      const target = requirePositional(parsed, 1, 'job target');
      await requestAndPrint(
        apiBase,
        `/scheduler/jobs/${encodeURIComponent(target)}/enable`,
        { method: 'PUT' },
      );
      return;
    }
    case 'disable': {
      const target = requirePositional(parsed, 1, 'job target');
      await requestAndPrint(
        apiBase,
        `/scheduler/jobs/${encodeURIComponent(target)}/disable`,
        { method: 'PUT' },
      );
      return;
    }
    case 'delete': {
      const target = requirePositional(parsed, 1, 'job target');
      await requestAndPrint(
        apiBase,
        `/scheduler/jobs/${encodeURIComponent(target)}`,
        { method: 'DELETE' },
      );
      return;
    }
    default:
      throw new Error(
        "Unknown schedule action. Use 'list', 'jobs', 'providers', 'stats', 'status', 'preview', 'logs', 'create', 'update', 'run', 'enable', 'disable', or 'delete'.",
      );
  }
}

async function runRunsCommand(args: string[]) {
  const parsed = parseCoreArgs(args);
  const apiBase = resolveApiBase(parsed);
  const action = requirePositional(parsed, 0, 'runs action');

  switch (action) {
    case 'list':
      await requestAndPrint(apiBase, '/api/runs');
      return;
    case 'read': {
      const runId = requirePositional(parsed, 1, 'run id');
      await requestAndPrint(apiBase, `/api/runs/${encodeURIComponent(runId)}`);
      return;
    }
    case 'output': {
      const body = await loadJsonPayload(parsed);
      await requestAndPrint(apiBase, '/api/runs/output', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      return;
    }
    default:
      throw new Error("Unknown runs action. Use 'list', 'read', or 'output'.");
  }
}

async function runKnowledgeCommand(args: string[]) {
  const parsed = parseCoreArgs(args);
  const apiBase = resolveApiBase(parsed);
  const action = requirePositional(parsed, 0, 'knowledge action');

  switch (action) {
    case 'status':
      await requestAndPrint(apiBase, '/api/knowledge/status');
      return;
    case 'search': {
      const body = await loadJsonPayload(parsed);
      await requestAndPrint(apiBase, '/api/knowledge/search', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      return;
    }
    case 'namespaces': {
      const subaction = requirePositional(parsed, 1, 'namespaces action');
      const project = requirePositional(parsed, 2, 'project slug');
      const base = `/api/projects/${encodeURIComponent(project)}/knowledge/namespaces`;
      if (subaction === 'list') {
        await requestAndPrint(apiBase, base);
        return;
      }
      if (subaction === 'create') {
        const body = await loadJsonPayload(parsed);
        await requestAndPrint(apiBase, base, {
          method: 'POST',
          body: JSON.stringify(body),
        });
        return;
      }
      if (subaction === 'update') {
        const nsId = requirePositional(parsed, 3, 'namespace id');
        const body = await loadJsonPayload(parsed);
        await requestAndPrint(apiBase, `${base}/${encodeURIComponent(nsId)}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        });
        return;
      }
      if (subaction === 'delete') {
        const nsId = requirePositional(parsed, 3, 'namespace id');
        await requestAndPrint(apiBase, `${base}/${encodeURIComponent(nsId)}`, {
          method: 'DELETE',
        });
        return;
      }
      throw new Error(
        "Unknown namespaces action. Use 'list', 'create', 'update', or 'delete'.",
      );
    }
    case 'docs':
    case 'documents': {
      const subaction = requirePositional(parsed, 1, 'documents action');
      const project = requirePositional(parsed, 2, 'project slug');
      const namespace =
        typeof parsed.flags.namespace === 'string'
          ? parsed.flags.namespace
          : undefined;
      const base = getNamespaceBase(project, namespace);

      if (subaction === 'list') {
        const query = buildQuery(parsed, [
          { flag: 'tags' },
          { flag: 'after' },
          { flag: 'before' },
          { flag: 'path-prefix', param: 'pathPrefix' },
          { flag: 'status' },
        ]);
        await requestAndPrint(apiBase, `${base}${query}`);
        return;
      }
      if (subaction === 'status') {
        await requestAndPrint(apiBase, `${base}/status`);
        return;
      }
      if (subaction === 'upload') {
        const body = await loadJsonPayload(parsed);
        await requestAndPrint(apiBase, `${base}/upload`, {
          method: 'POST',
          body: JSON.stringify(body),
        });
        return;
      }
      if (subaction === 'scan') {
        const body = await loadJsonPayload(parsed);
        await requestAndPrint(apiBase, `${base}/scan`, {
          method: 'POST',
          body: JSON.stringify(body),
        });
        return;
      }
      if (subaction === 'search') {
        const body = await loadJsonPayload(parsed);
        await requestAndPrint(apiBase, `${base}/search`, {
          method: 'POST',
          body: JSON.stringify(body),
        });
        return;
      }
      if (subaction === 'bulk-delete') {
        const body = await loadJsonPayload(parsed);
        await requestAndPrint(apiBase, `${base}/bulk-delete`, {
          method: 'POST',
          body: JSON.stringify(body),
        });
        return;
      }
      if (subaction === 'content') {
        const docId = requirePositional(parsed, 3, 'document id');
        await requestAndPrint(
          apiBase,
          `${base}/${encodeURIComponent(docId)}/content`,
        );
        return;
      }
      if (subaction === 'tree') {
        await requestAndPrint(apiBase, `${base}/tree`);
        return;
      }
      if (subaction === 'update') {
        const docId = requirePositional(parsed, 3, 'document id');
        const body = await loadJsonPayload(parsed);
        await requestAndPrint(apiBase, `${base}/${encodeURIComponent(docId)}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        });
        return;
      }
      if (subaction === 'delete') {
        const docId = requirePositional(parsed, 3, 'document id');
        await requestAndPrint(apiBase, `${base}/${encodeURIComponent(docId)}`, {
          method: 'DELETE',
        });
        return;
      }
      if (subaction === 'clear') {
        await requestAndPrint(apiBase, base, { method: 'DELETE' });
        return;
      }
      throw new Error(
        "Unknown documents action. Use 'list', 'status', 'upload', 'scan', 'search', 'bulk-delete', 'content', 'tree', 'update', 'delete', or 'clear'.",
      );
    }
    default:
      throw new Error(
        "Unknown knowledge action. Use 'status', 'search', 'namespaces', 'docs', or 'documents'.",
      );
  }
}

async function runAuthCommand(args: string[]) {
  const parsed = parseCoreArgs(args);
  const apiBase = resolveApiBase(parsed);
  const action = requirePositional(parsed, 0, 'auth action');

  switch (action) {
    case 'status':
      await requestRawAndPrint(apiBase, '/api/auth/status');
      return;
    case 'renew':
      await requestAndPrint(apiBase, '/api/auth/renew', { method: 'POST' });
      return;
    case 'terminal':
      await requestAndPrint(apiBase, '/api/auth/terminal', { method: 'POST' });
      return;
    case 'users': {
      const subaction = requirePositional(parsed, 1, 'users action');
      if (subaction === 'search') {
        const query = requirePositional(parsed, 2, 'query');
        await requestRawAndPrint(
          apiBase,
          `/api/users/search?q=${encodeURIComponent(query)}`,
        );
        return;
      }
      if (subaction === 'get') {
        const alias = requirePositional(parsed, 2, 'alias');
        await requestRawAndPrint(
          apiBase,
          `/api/users/${encodeURIComponent(alias)}`,
        );
        return;
      }
      throw new Error("Unknown auth users action. Use 'search' or 'get'.");
    }
    default:
      throw new Error(
        "Unknown auth action. Use 'status', 'renew', 'terminal', or 'users'.",
      );
  }
}

async function runBrandingCommand(args: string[]) {
  const parsed = parseCoreArgs(args);
  const apiBase = resolveApiBase(parsed);
  const action = requirePositional(parsed, 0, 'branding action');

  if (action !== 'get') {
    throw new Error("Unknown branding action. Use 'get'.");
  }
  await requestAndPrint(apiBase, '/api/branding');
}

async function runFeedbackCommand(args: string[]) {
  const parsed = parseCoreArgs(args);
  const apiBase = resolveApiBase(parsed);
  const action = requirePositional(parsed, 0, 'feedback action');

  switch (action) {
    case 'rate': {
      const body = await loadJsonPayload(parsed);
      await requestAndPrint(apiBase, '/api/feedback/rate', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      return;
    }
    case 'delete':
    case 'unrate': {
      const body = await loadJsonPayload(parsed);
      await requestAndPrint(apiBase, '/api/feedback/rate', {
        method: 'DELETE',
        body: JSON.stringify(body),
      });
      return;
    }
    case 'ratings':
      await requestAndPrint(apiBase, '/api/feedback/ratings');
      return;
    case 'guidelines':
      await requestAndPrint(apiBase, '/api/feedback/guidelines');
      return;
    case 'analyze': {
      const body =
        parsed.flags.data || parsed.flags.file || !process.stdin.isTTY
          ? await loadJsonPayload(parsed)
          : {};
      await requestAndPrint(apiBase, '/api/feedback/analyze', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      return;
    }
    case 'clear-analysis':
      await requestAndPrint(apiBase, '/api/feedback/clear-analysis', {
        method: 'POST',
      });
      return;
    case 'status':
      await requestAndPrint(apiBase, '/api/feedback/status');
      return;
    case 'test':
      await requestAndPrint(apiBase, '/api/feedback/test', {
        method: 'POST',
      });
      return;
    default:
      throw new Error(
        "Unknown feedback action. Use 'rate', 'delete', 'unrate', 'ratings', 'guidelines', 'analyze', 'clear-analysis', 'status', or 'test'.",
      );
  }
}

async function runInsightsCommand(args: string[]) {
  const parsed = parseCoreArgs(args);
  const apiBase = resolveApiBase(parsed);
  const action = requirePositional(parsed, 0, 'insights action');

  if (action !== 'get') {
    throw new Error("Unknown insights action. Use 'get'.");
  }
  const query = buildQuery(parsed, [{ flag: 'days' }]);
  await requestAndPrint(apiBase, `/api/insights/${query}`);
}

async function runAcpCommand(args: string[]) {
  const parsed = parseCoreArgs(args);
  const apiBase = resolveApiBase(parsed);
  const action = requirePositional(parsed, 0, 'acp action');

  switch (action) {
    case 'status':
      await requestAndPrint(apiBase, '/acp/status');
      return;
    case 'commands': {
      const slug = requirePositional(parsed, 1, 'agent slug');
      await requestAndPrint(
        apiBase,
        `/acp/commands/${encodeURIComponent(slug)}`,
      );
      return;
    }
    case 'command-options': {
      const slug = requirePositional(parsed, 1, 'agent slug');
      const q =
        typeof parsed.flags.q === 'string'
          ? `?q=${encodeURIComponent(parsed.flags.q)}`
          : '';
      await requestAndPrint(
        apiBase,
        `/acp/commands/${encodeURIComponent(slug)}/options${q}`,
      );
      return;
    }
    case 'connections': {
      const subaction = requirePositional(parsed, 1, 'connections action');
      if (subaction === 'list') {
        await requestAndPrint(apiBase, '/acp/connections');
        return;
      }
      if (subaction === 'create') {
        const body = await loadJsonPayload(parsed);
        await requestAndPrint(apiBase, '/acp/connections', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        return;
      }
      if (subaction === 'update') {
        const id = requirePositional(parsed, 2, 'connection id');
        const body = await loadJsonPayload(parsed);
        await requestAndPrint(
          apiBase,
          `/acp/connections/${encodeURIComponent(id)}`,
          {
            method: 'PUT',
            body: JSON.stringify(body),
          },
        );
        return;
      }
      if (subaction === 'delete') {
        const id = requirePositional(parsed, 2, 'connection id');
        await requestAndPrint(
          apiBase,
          `/acp/connections/${encodeURIComponent(id)}`,
          {
            method: 'DELETE',
          },
        );
        return;
      }
      if (subaction === 'reconnect') {
        const id = requirePositional(parsed, 2, 'connection id');
        await requestAndPrint(
          apiBase,
          `/acp/connections/${encodeURIComponent(id)}/reconnect`,
          { method: 'POST' },
        );
        return;
      }
      throw new Error(
        "Unknown acp connections action. Use 'list', 'create', 'update', 'delete', or 'reconnect'.",
      );
    }
    default:
      throw new Error(
        "Unknown acp action. Use 'status', 'commands', 'command-options', or 'connections'.",
      );
  }
}

async function runVoiceCommand(args: string[]) {
  const parsed = parseCoreArgs(args);
  const apiBase = resolveApiBase(parsed);
  const action = requirePositional(parsed, 0, 'voice action');

  switch (action) {
    case 'status':
      await requestAndPrint(apiBase, '/api/voice/status');
      return;
    case 'agent':
      await requestAndPrint(apiBase, '/api/voice/agent');
      return;
    case 'create-session': {
      const body =
        parsed.flags.data || parsed.flags.file || !process.stdin.isTTY
          ? await loadJsonPayload(parsed)
          : {};
      await requestAndPrint(apiBase, '/api/voice/sessions', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      return;
    }
    case 'delete-session': {
      const id = requirePositional(parsed, 1, 'session id');
      await requestAndPrint(
        apiBase,
        `/api/voice/sessions/${encodeURIComponent(id)}`,
        {
          method: 'DELETE',
        },
      );
      return;
    }
    default:
      throw new Error(
        "Unknown voice action. Use 'status', 'agent', 'create-session', or 'delete-session'.",
      );
  }
}

export async function runSurfaceCommand(
  command: string,
  args: string[],
): Promise<void> {
  switch (command) {
    case 'connections':
      await runConnectionsCommand(args);
      return;
    case 'tools':
      await runToolsCommand(args);
      return;
    case 'notifications':
      await runNotificationsCommand(args);
      return;
    case 'monitoring':
      await runMonitoringCommand(args);
      return;
    case 'schedule':
      await runScheduleCommand(args);
      return;
    case 'runs':
      await runRunsCommand(args);
      return;
    case 'knowledge':
      await runKnowledgeCommand(args);
      return;
    case 'auth':
      await runAuthCommand(args);
      return;
    case 'branding':
      await runBrandingCommand(args);
      return;
    case 'feedback':
      await runFeedbackCommand(args);
      return;
    case 'insights':
      await runInsightsCommand(args);
      return;
    case 'acp':
      await runAcpCommand(args);
      return;
    case 'voice':
      await runVoiceCommand(args);
      return;
    default:
      throw new Error(`Unknown surface command: ${command}`);
  }
}

export async function runRegistryCatalogCommand(args: string[]): Promise<void> {
  const parsed = parseCoreArgs(args);
  const apiBase = resolveApiBase(parsed);
  const tab = requirePositional(parsed, 0, 'registry catalog');
  const action = requirePositional(parsed, 1, 'registry action');

  if (!['agents', 'skills', 'integrations', 'plugins'].includes(tab)) {
    throw new Error(
      "Unknown registry catalog. Use 'agents', 'skills', 'integrations', or 'plugins'.",
    );
  }

  switch (action) {
    case 'list':
      await requestAndPrint(apiBase, `/api/registry/${tab}`);
      return;
    case 'installed':
      await requestAndPrint(apiBase, `/api/registry/${tab}/installed`);
      return;
    case 'install': {
      const id = requirePositional(parsed, 2, 'registry item id');
      await requestAndPrint(apiBase, `/api/registry/${tab}/install`, {
        method: 'POST',
        body: JSON.stringify({ id }),
      });
      return;
    }
    case 'delete':
    case 'remove':
    case 'uninstall': {
      const id = requirePositional(parsed, 2, 'registry item id');
      await requestAndPrint(
        apiBase,
        `/api/registry/${tab}/${encodeURIComponent(id)}`,
        {
          method: 'DELETE',
        },
      );
      return;
    }
    default:
      throw new Error(
        "Unknown registry action. Use 'list', 'installed', 'install', 'remove', 'uninstall', or 'delete'.",
      );
  }
}
