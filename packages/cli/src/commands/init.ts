import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CWD } from './helpers.js';

export type PluginTemplate = 'full' | 'layout' | 'provider';

interface CreatePluginOptions {
  cwd?: string;
  template?: PluginTemplate;
}

const SDK_VERSION = '^0.4.0';

export function createPlugin(
  name = 'my-plugin',
  options: CreatePluginOptions = {},
): void {
  const template = options.template || 'full';
  const dir = join(options.cwd || CWD, name);
  if (existsSync(dir)) {
    console.error(`Directory ${name} already exists`);
    process.exit(1);
  }

  mkdirSync(dir, { recursive: true });
  mkdirSync(join(dir, 'src'), { recursive: true });

  writeJson(dir, 'plugin.json', buildPluginManifest(name, template));
  writeJson(dir, 'package.json', buildPackageJson(name, template));
  writeJson(dir, 'tsconfig.json', buildTsConfig(template));
  writeText(dir, 'README.md', buildReadme(name, template));

  if (template !== 'provider') {
    writeJson(dir, 'layout.json', buildLayoutDefinition(name, template));
    writeText(dir, 'src/index.tsx', buildEntryPoint(name, template));
  }

  if (template === 'full') {
    mkdirSync(join(dir, 'agents', 'assistant'), { recursive: true });
    writeJson(
      dir,
      'agents/assistant/agent.json',
      buildAgentDefinition('Assistant'),
    );
  }

  if (template === 'provider') {
    mkdirSync(join(dir, 'providers'), { recursive: true });
    writeText(dir, 'providers/branding.js', providerTemplate());
    writeText(dir, 'plugin.mjs', serverModuleTemplate());
  }

  console.log(
    `\n✅ Created ${template} plugin: ${name}/\n\n   cd ${name}\n${buildNextSteps(template)}`,
  );
}

export function init(name = 'my-plugin'): void {
  createPlugin(name, { template: 'full' });
}

function displayName(name: string): string {
  return name
    .split('-')
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(' ');
}

function writeJson(dir: string, relativePath: string, value: unknown): void {
  writeFileSync(join(dir, relativePath), `${JSON.stringify(value, null, 2)}\n`);
}

function writeText(dir: string, relativePath: string, value: string): void {
  writeFileSync(join(dir, relativePath), value);
}

function buildPluginManifest(name: string, template: PluginTemplate) {
  const base = {
    name,
    version: '1.0.0',
    sdkVersion: SDK_VERSION,
    displayName: displayName(name),
    description: `A ${template} Stallion plugin`,
  };

  if (template === 'provider') {
    return {
      ...base,
      serverModule: 'plugin.mjs',
      providers: [{ type: 'branding', module: './providers/branding.js' }],
      settings: [
        {
          key: 'accentColor',
          label: 'Accent Color',
          type: 'string',
          default: '#1d4ed8',
        },
      ],
    };
  }

  const layout = { slug: name, source: './layout.json' };
  if (template === 'layout') {
    return {
      ...base,
      entrypoint: 'src/index.tsx',
      capabilities: ['navigation'],
      permissions: ['navigation.dock'],
      layout,
    };
  }

  return {
    ...base,
    entrypoint: 'src/index.tsx',
    capabilities: ['chat', 'navigation'],
    permissions: ['navigation.dock'],
    agents: [{ slug: 'assistant', source: './agents/assistant/agent.json' }],
    layout,
  };
}

function buildLayoutDefinition(name: string, template: PluginTemplate) {
  const tabs =
    template === 'full'
      ? [
          { id: 'home', label: 'Home', component: `${name}-home` },
          { id: 'notes', label: 'Notes', component: `${name}-notes` },
        ]
      : [{ id: 'home', label: 'Home', component: `${name}-home` }];

  const definition: Record<string, unknown> = {
    name: displayName(name),
    slug: name,
    icon: template === 'layout' ? '🧩' : '🚀',
    description:
      template === 'layout'
        ? 'A layout-focused plugin scaffold'
        : 'A full-featured plugin scaffold',
    tabs,
  };

  if (template === 'full') {
    definition.availableAgents = [`${name}:assistant`];
    definition.defaultAgent = `${name}:assistant`;
  }

  return definition;
}

function buildAgentDefinition(agentName: string) {
  return {
    name: agentName,
    prompt: 'You are a helpful assistant for this plugin.',
    guardrails: { maxTokens: 4096, temperature: 0.7 },
    tools: { mcpServers: [], available: [], autoApprove: [] },
  };
}

function buildPackageJson(name: string, template: PluginTemplate) {
  const scripts: Record<string, string> = {};
  if (template !== 'provider') {
    scripts.build = 'stallion build';
    scripts.dev = 'stallion dev';
  }

  return {
    name,
    version: '1.0.0',
    type: 'module',
    scripts,
    peerDependencies:
      template === 'provider'
        ? undefined
        : {
            '@stallion-ai/sdk': SDK_VERSION,
            react: '^18.0.0 || ^19.0.0',
          },
  };
}

function buildTsConfig(template: PluginTemplate) {
  if (template === 'provider') {
    return {
      compilerOptions: {
        module: 'ESNext',
        moduleResolution: 'Bundler',
        target: 'ES2022',
      },
    };
  }

  return {
    compilerOptions: {
      jsx: 'react-jsx',
      module: 'ESNext',
      moduleResolution: 'Bundler',
      strict: true,
      target: 'ES2022',
      types: ['react'],
    },
    include: ['src'],
  };
}

function buildEntryPoint(name: string, template: PluginTemplate): string {
  const imports =
    template === 'full'
      ? "import { useState } from 'react';\nimport { type LayoutComponentProps, useNavigation } from '@stallion-ai/sdk';"
      : "import { type LayoutComponentProps, useNavigation } from '@stallion-ai/sdk';";

  const notesComponent =
    template === 'full'
      ? `
function Notes() {
  const [value, setValue] = useState('');
  return (
    <section style={{ padding: '1.5rem' }}>
      <h2>Scratchpad</h2>
      <textarea
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="Keep notes for this layout..."
        style={{ minHeight: 220, width: '100%' }}
      />
    </section>
  );
}
`
      : '';

  const components =
    template === 'full'
      ? `export const components = {\n  '${name}-home': Home,\n  '${name}-notes': Notes,\n};`
      : `export const components = {\n  '${name}-home': Home,\n};`;

  return `${imports}

function Home({ onShowChat }: LayoutComponentProps) {
  const { setDockState } = useNavigation();

  return (
    <section style={{ padding: '1.5rem', display: 'grid', gap: '1rem' }}>
      <h1>${displayName(name)}</h1>
      <p>
        This scaffold is ready for you to replace with real UI, queries, and plugin-specific actions.
      </p>
      <button
        type="button"
        onClick={() => {
          setDockState(true);
          onShowChat?.();
        }}
      >
        Open Chat
      </button>
    </section>
  );
}
${notesComponent}
${components}

export default Home;
`;
}

function providerTemplate(): string {
  return `export default function createBrandingProvider(settings = {}) {
  return {
    async getAppName() {
      return 'Stallion';
    },
    async getTheme() {
      return {
        '--accent-primary': settings.accentColor || '#1d4ed8',
      };
    },
  };
}
`;
}

function serverModuleTemplate(): string {
  return `export const hooks = {
  onRequest(context) {
    console.log('[plugin request:start]', context.pluginName, context.correlationId);
  },
  onResponse(context) {
    console.log('[plugin request:end]', context.pluginName, context.correlationId, context.status);
  },
};

export default function register(app, { config }) {
  app.get('/ping', (c) =>
    c.json({
      ok: true,
      accentColor: config.get('accentColor'),
    }),
  );
}
`;
}

function buildReadme(name: string, template: PluginTemplate): string {
  const createCommand =
    template === 'provider'
      ? `./stallion create-plugin ${name} --template=provider`
      : template === 'layout'
        ? `./stallion create-plugin ${name} --template=layout`
        : `./stallion create-plugin ${name}`;

  const usage =
    template === 'provider'
      ? `Install the plugin, then call \`/api/plugins/${name}/ping\` to verify the server module and settings wiring.`
      : `Install the plugin and add its layout to a project from the Plugins screen.`;

  return `# ${displayName(name)}

Created with:

\`\`\`bash
${createCommand}
\`\`\`

## Template

- \`${template}\`

## Next Steps

- Replace the scaffolded files with your real plugin behavior.
- ${usage}
- Update \`plugin.json\` metadata before publishing.
`;
}

function buildNextSteps(template: PluginTemplate): string {
  if (template === 'provider') {
    return '   ./stallion install .\n   curl http://localhost:3141/api/plugins/<your-plugin>/ping\n';
  }
  return '   ./stallion build\n   ./stallion dev\n';
}
