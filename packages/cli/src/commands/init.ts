import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CWD } from './helpers.js';

export function init(name = 'my-workspace'): void {
  const dir = join(CWD, name);
  if (existsSync(dir)) {
    console.error(`Directory ${name} already exists`);
    process.exit(1);
  }
  mkdirSync(join(dir, 'src'), { recursive: true });
  mkdirSync(join(dir, 'agents/assistant'), { recursive: true });
  writeFileSync(
    join(dir, 'plugin.json'),
    `${JSON.stringify(
      {
        name,
        version: '1.0.0',
        sdkVersion: '^0.4.0',
        displayName: name
          .split('-')
          .map((w) => w[0].toUpperCase() + w.slice(1))
          .join(' '),
        description: 'A Stallion plugin',
        entrypoint: 'src/index.tsx',
        capabilities: ['chat', 'navigation'],
        permissions: ['navigation.dock'],
        agents: [
          { slug: 'assistant', source: './agents/assistant/agent.json' },
        ],
        workspace: { slug: name, source: './workspace.json' },
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(
    join(dir, 'workspace.json'),
    `${JSON.stringify(
      {
        name: name
          .split('-')
          .map((w) => w[0].toUpperCase() + w.slice(1))
          .join(' '),
        slug: name,
        icon: '🚀',
        description: 'My workspace',
        availableAgents: [`${name}:assistant`],
        defaultAgent: `${name}:assistant`,
        tabs: [{ id: 'main', label: 'Main', component: `${name}-main` }],
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(
    join(dir, 'agents/assistant/agent.json'),
    `${JSON.stringify(
      {
        name: 'Assistant',
        prompt: 'You are a helpful assistant.',
        guardrails: { maxTokens: 4096, temperature: 0.7 },
        tools: { mcpServers: [], available: [], autoApprove: [] },
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(
    join(dir, 'src/index.tsx'),
    `import { useAuth, type WorkspaceComponentProps } from '@stallion-ai/sdk';\n\nfunction Main({ onShowChat }: WorkspaceComponentProps) {\n  const { user } = useAuth();\n  return (\n    <div style={{ padding: '2rem' }}>\n      <h1>Hello{user?.name ? \`, \${user.name}\` : ''}!</h1>\n      <button onClick={() => onShowChat?.()}>Open Chat</button>\n    </div>\n  );\n}\n\nexport const components = { '${name}-main': Main };\nexport default Main;\n`,
  );
  writeFileSync(
    join(dir, 'package.json'),
    `${JSON.stringify(
      {
        name,
        version: '1.0.0',
        type: 'module',
        scripts: { build: 'stallion build', dev: 'stallion dev' },
        peerDependencies: {
          '@stallion-ai/sdk': '^0.3.0',
          react: '^18.0.0 || ^19.0.0',
        },
      },
      null,
      2,
    )}\n`,
  );
  console.log(
    `\n✅ Created plugin: ${name}/\n\n   cd ${name}\n   stallion build\n   stallion dev\n`,
  );
}
