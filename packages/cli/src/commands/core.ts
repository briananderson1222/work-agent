import {
  loadJsonPayload,
  loadTextInput,
  type ParsedCoreArgs,
  parseCoreArgs,
  printJson,
  requestJson,
  requirePositional,
  resolveApiBase,
  streamSse,
} from './core-api.js';

interface ResourceSpec {
  collectionPath: string;
  createPath?: string;
  deletePath?: (id: string) => string;
  getPath?: (id: string) => string;
  updatePath?: (id: string) => string;
  customActions?: Record<
    string,
    (apiBase: string, parsed: ParsedCoreArgs) => Promise<void>
  >;
}

const resourceSpecs: Record<string, ResourceSpec> = {
  agents: {
    collectionPath: '/api/agents',
    createPath: '/agents',
    getPath: (slug) => `/api/agents/${encodeURIComponent(slug)}`,
    updatePath: (slug) => `/agents/${encodeURIComponent(slug)}`,
    deletePath: (slug) => `/agents/${encodeURIComponent(slug)}`,
    customActions: {
      chat: async (apiBase, parsed) => {
        await runChat(parsed, apiBase);
      },
      conversations: async (apiBase, parsed) => {
        const slug = requirePositional(parsed, 1, 'agent');
        const data = await requestJson(
          apiBase,
          `/agents/${encodeURIComponent(slug)}/conversations`,
        );
        printJson(data);
      },
      messages: async (apiBase, parsed) => {
        const slug = requirePositional(parsed, 1, 'agent');
        const conversationId = requirePositional(parsed, 2, 'conversationId');
        const data = await requestJson(
          apiBase,
          `/agents/${encodeURIComponent(slug)}/conversations/${encodeURIComponent(conversationId)}/messages`,
        );
        printJson(data);
      },
      workflows: async (apiBase, parsed) => {
        await runAgentWorkflowCommand(apiBase, parsed);
      },
    },
  },
  projects: {
    collectionPath: '/api/projects',
    createPath: '/api/projects',
    getPath: (slug) => `/api/projects/${encodeURIComponent(slug)}`,
    updatePath: (slug) => `/api/projects/${encodeURIComponent(slug)}`,
    deletePath: (slug) => `/api/projects/${encodeURIComponent(slug)}`,
    customActions: {
      layouts: async (apiBase, parsed) => {
        await runProjectLayoutCommand(apiBase, parsed);
      },
    },
  },
  skills: {
    collectionPath: '/api/skills',
    getPath: (name) => `/api/skills/${encodeURIComponent(name)}`,
    updatePath: (name) => `/api/skills/${encodeURIComponent(name)}`,
    deletePath: (name) => `/api/skills/${encodeURIComponent(name)}`,
    customActions: {
      create: async (apiBase, parsed) => {
        const body = await loadJsonPayload(parsed);
        const data = await requestJson(apiBase, '/api/skills/local', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        printJson(data);
      },
      install: async (apiBase, parsed) => {
        const name = requirePositional(parsed, 1, 'skill name');
        const data = await requestJson(apiBase, '/api/skills', {
          method: 'POST',
          body: JSON.stringify({ name }),
        });
        printJson(data);
      },
    },
  },
  playbooks: {
    collectionPath: '/api/playbooks',
    createPath: '/api/playbooks',
    getPath: (id) => `/api/playbooks/${encodeURIComponent(id)}`,
    updatePath: (id) => `/api/playbooks/${encodeURIComponent(id)}`,
    deletePath: (id) => `/api/playbooks/${encodeURIComponent(id)}`,
    customActions: {
      run: async (apiBase, parsed) => {
        const id = requirePositional(parsed, 1, 'playbook id');
        const data = await requestJson(
          apiBase,
          `/api/playbooks/${encodeURIComponent(id)}/run`,
          { method: 'POST' },
        );
        printJson(data);
      },
      outcome: async (apiBase, parsed) => {
        const id = requirePositional(parsed, 1, 'playbook id');
        const outcome = requirePositional(parsed, 2, 'outcome');
        const data = await requestJson(
          apiBase,
          `/api/playbooks/${encodeURIComponent(id)}/outcome`,
          {
            method: 'POST',
            body: JSON.stringify({ outcome }),
          },
        );
        printJson(data);
      },
    },
  },
};

function resolveResourceName(command: string): string {
  if (command === 'prompts') {
    return 'playbooks';
  }
  return command;
}

async function runStandardCrud(
  apiBase: string,
  parsed: ParsedCoreArgs,
  spec: ResourceSpec,
): Promise<boolean> {
  const action = parsed.positionals[0];
  switch (action) {
    case 'list': {
      const data = await requestJson(apiBase, spec.collectionPath);
      printJson(data);
      return true;
    }
    case 'get': {
      if (!spec.getPath) {
        throw new Error('Get is not supported for this resource.');
      }
      const id = requirePositional(parsed, 1, 'id');
      const data = await requestJson(apiBase, spec.getPath(id));
      printJson(data);
      return true;
    }
    case 'create': {
      if (!spec.createPath) {
        throw new Error('Create is not supported for this resource.');
      }
      const body = await loadJsonPayload(parsed);
      const data = await requestJson(apiBase, spec.createPath, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      printJson(data);
      return true;
    }
    case 'update': {
      if (!spec.updatePath) {
        throw new Error('Update is not supported for this resource.');
      }
      const id = requirePositional(parsed, 1, 'id');
      const body = await loadJsonPayload(parsed);
      const data = await requestJson(apiBase, spec.updatePath(id), {
        method: 'PUT',
        body: JSON.stringify(body),
      });
      printJson(data);
      return true;
    }
    case 'delete': {
      if (!spec.deletePath) {
        throw new Error('Delete is not supported for this resource.');
      }
      const id = requirePositional(parsed, 1, 'id');
      const data = await requestJson(apiBase, spec.deletePath(id), {
        method: 'DELETE',
      });
      printJson(data);
      return true;
    }
    default:
      return false;
  }
}

async function runAgentWorkflowCommand(
  apiBase: string,
  parsed: ParsedCoreArgs,
): Promise<void> {
  const action = requirePositional(parsed, 1, 'workflow action');

  if (action === 'list') {
    const slug = requirePositional(parsed, 2, 'agent');
    const data = await requestJson(
      apiBase,
      `/agents/${encodeURIComponent(slug)}/workflows/files`,
    );
    printJson(data);
    return;
  }

  if (action === 'get') {
    const slug = requirePositional(parsed, 2, 'agent');
    const workflowId = requirePositional(parsed, 3, 'workflowId');
    const data = await requestJson(
      apiBase,
      `/agents/${encodeURIComponent(slug)}/workflows/${encodeURIComponent(workflowId)}`,
    );
    printJson(data);
    return;
  }

  if (action === 'create') {
    const slug = requirePositional(parsed, 2, 'agent');
    const body = await loadJsonPayload(parsed);
    const data = await requestJson(
      apiBase,
      `/agents/${encodeURIComponent(slug)}/workflows`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
    );
    printJson(data);
    return;
  }

  if (action === 'update') {
    const slug = requirePositional(parsed, 2, 'agent');
    const workflowId = requirePositional(parsed, 3, 'workflowId');
    const body = await loadJsonPayload(parsed);
    const data = await requestJson(
      apiBase,
      `/agents/${encodeURIComponent(slug)}/workflows/${encodeURIComponent(workflowId)}`,
      {
        method: 'PUT',
        body: JSON.stringify(body),
      },
    );
    printJson(data);
    return;
  }

  if (action === 'delete') {
    const slug = requirePositional(parsed, 2, 'agent');
    const workflowId = requirePositional(parsed, 3, 'workflowId');
    const data = await requestJson(
      apiBase,
      `/agents/${encodeURIComponent(slug)}/workflows/${encodeURIComponent(workflowId)}`,
      {
        method: 'DELETE',
      },
    );
    printJson(data);
    return;
  }

  throw new Error(
    "Unknown workflow action. Use 'list', 'get', 'create', 'update', or 'delete'.",
  );
}

async function runProjectLayoutCommand(
  apiBase: string,
  parsed: ParsedCoreArgs,
): Promise<void> {
  const action = requirePositional(parsed, 1, 'layout action');

  if (action === 'available') {
    const data = await requestJson(apiBase, '/api/projects/layouts/available');
    printJson(data);
    return;
  }

  if (action === 'list') {
    const project = requirePositional(parsed, 2, 'project');
    const data = await requestJson(
      apiBase,
      `/api/projects/${encodeURIComponent(project)}/layouts`,
    );
    printJson(data);
    return;
  }

  if (action === 'get') {
    const project = requirePositional(parsed, 2, 'project');
    const layout = requirePositional(parsed, 3, 'layout');
    const data = await requestJson(
      apiBase,
      `/api/projects/${encodeURIComponent(project)}/layouts/${encodeURIComponent(layout)}`,
    );
    printJson(data);
    return;
  }

  if (action === 'create') {
    const project = requirePositional(parsed, 2, 'project');
    const body = await loadJsonPayload(parsed);
    const data = await requestJson(
      apiBase,
      `/api/projects/${encodeURIComponent(project)}/layouts`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
    );
    printJson(data);
    return;
  }

  if (action === 'update') {
    const project = requirePositional(parsed, 2, 'project');
    const layout = requirePositional(parsed, 3, 'layout');
    const body = await loadJsonPayload(parsed);
    const data = await requestJson(
      apiBase,
      `/api/projects/${encodeURIComponent(project)}/layouts/${encodeURIComponent(layout)}`,
      {
        method: 'PUT',
        body: JSON.stringify(body),
      },
    );
    printJson(data);
    return;
  }

  if (action === 'delete') {
    const project = requirePositional(parsed, 2, 'project');
    const layout = requirePositional(parsed, 3, 'layout');
    const data = await requestJson(
      apiBase,
      `/api/projects/${encodeURIComponent(project)}/layouts/${encodeURIComponent(layout)}`,
      {
        method: 'DELETE',
      },
    );
    printJson(data);
    return;
  }

  if (action === 'from-plugin') {
    const project = requirePositional(parsed, 2, 'project');
    const plugin = requirePositional(parsed, 3, 'plugin');
    const data = await requestJson(
      apiBase,
      `/api/projects/${encodeURIComponent(project)}/layouts/from-plugin`,
      {
        method: 'POST',
        body: JSON.stringify({ plugin }),
      },
    );
    printJson(data);
    return;
  }

  throw new Error(
    "Unknown layout action. Use 'available', 'list', 'get', 'create', 'update', 'delete', or 'from-plugin'.",
  );
}

async function runChat(parsed: ParsedCoreArgs, apiBase: string): Promise<void> {
  const agentSlug = requirePositional(parsed, 0, 'agent');
  const content = await loadTextInput(parsed, 1);

  const conversationId = parsed.flags.conversation;
  const projectSlug = parsed.flags.project;
  const model = parsed.flags.model;
  const title = parsed.flags.title;
  const jsonMode = parsed.flags.json === true;

  const payload = {
    input: content,
    options: {
      ...(typeof conversationId === 'string' ? { conversationId } : {}),
      ...(typeof model === 'string' ? { model } : {}),
      ...(typeof title === 'string' ? { title } : {}),
    },
    ...(typeof projectSlug === 'string' ? { projectSlug } : {}),
  };

  const response = await fetch(
    `${apiBase}/api/agents/${encodeURIComponent(agentSlug)}/chat`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );

  if (!response.ok) {
    let errorText = `Chat request failed with HTTP ${response.status}`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) {
        errorText = body.error;
      }
    } catch {}
    throw new Error(errorText);
  }

  let startedConversationId =
    typeof conversationId === 'string' ? conversationId : undefined;
  let finishReason: string | undefined;
  let accumulatedText = '';

  await streamSse(response, (event) => {
    if (
      (event.type === 'conversation-started' ||
        event.type === 'conversation') &&
      typeof event.conversationId === 'string'
    ) {
      startedConversationId = event.conversationId;
      return;
    }

    if (event.type === 'error') {
      throw new Error(
        typeof event.errorText === 'string'
          ? event.errorText
          : 'Chat stream failed',
      );
    }

    if (event.type === 'finish' && typeof event.finishReason === 'string') {
      finishReason = event.finishReason;
      return;
    }

    if (event.type !== 'text-delta') {
      return;
    }

    const delta =
      typeof event.text === 'string'
        ? event.text
        : typeof event.delta === 'string'
          ? event.delta
          : typeof event.textDelta === 'string'
            ? event.textDelta
            : '';

    if (!delta) {
      return;
    }

    accumulatedText += delta;
    if (!jsonMode) {
      process.stdout.write(delta);
    }
  });

  if (jsonMode) {
    printJson({
      agent: agentSlug,
      conversationId: startedConversationId,
      finishReason,
      text: accumulatedText,
    });
    return;
  }

  if (accumulatedText.length > 0) {
    process.stdout.write('\n');
  }
}

export async function runCoreCommand(
  command: string,
  args: string[],
): Promise<void> {
  if (command === 'chat') {
    const parsed = parseCoreArgs(args);
    const apiBase = resolveApiBase(parsed);
    await runChat(parsed, apiBase);
    return;
  }

  const resourceName = resolveResourceName(command);
  const spec = resourceSpecs[resourceName];
  if (!spec) {
    throw new Error(`Unknown core command: ${command}`);
  }

  const parsed = parseCoreArgs(args);
  const apiBase = resolveApiBase(parsed);
  const action = parsed.positionals[0];
  if (!action) {
    throw new Error(`Missing action for ${command}`);
  }

  if (spec.customActions?.[action]) {
    await spec.customActions[action](apiBase, parsed);
    return;
  }

  const handled = await runStandardCrud(apiBase, parsed, spec);
  if (handled) {
    return;
  }

  throw new Error(`Unknown ${command} action: ${action}`);
}
