#!/usr/bin/env tsx

/**
 * @work-agent/cli — Unified CLI for Work Agent
 *
 * Plugin Management:
 *   wa install <source>     Install from git URL or local path
 *   wa list                 List installed plugins
 *   wa remove <name>        Remove a plugin
 *   wa info <name>          Show plugin details
 *   wa update <name>        Update a plugin (git only)
 *
 * Plugin Development:
 *   wa init [name]          Scaffold a new plugin
 *   wa build                Build plugin bundle
 *   wa dev [port] [flags]   Dev preview server (default: 4200)
 *     --no-mcp              Disable MCP tool connections
 *     --tools-dir=<path>    Tool configs directory
 */

import { execSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  watch as fsWatch,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { homedir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import {
  type PluginManifest,
  readPluginManifest,
  resolvePluginTools,
  type ToolCallResponse,
  type WorkspaceConfig,
} from '@work-agent/shared';
import { MCPManager } from '@work-agent/shared/mcp';

const HOME_WA = join(homedir(), '.work-agent');
const PLUGINS_DIR = join(HOME_WA, 'plugins');
const AGENTS_DIR = join(HOME_WA, 'agents');
const WORKSPACES_DIR = join(HOME_WA, 'workspaces');
const CWD = process.cwd();

// ── Shared helpers ─────────────────────────────────────

function readManifest(dir = CWD): PluginManifest {
  return readPluginManifest(dir);
}

function isGitUrl(source: string): boolean {
  return (
    source.startsWith('git@') ||
    source.endsWith('.git') ||
    (source.startsWith('https://') &&
      (source.includes('.git') ||
        source.includes('gitlab') ||
        source.includes('github')))
  );
}

function parseGitSource(source: string): { url: string; branch: string } {
  const [url, branch] = source.split('#');
  return { url, branch: branch || 'main' };
}

function extractPluginName(source: string): string {
  if (isGitUrl(source)) {
    const { url } = parseGitSource(source);
    const match = url.match(/\/([^/]+?)(?:\.git)?$/);
    return match ? match[1] : url.split('/').pop()!.replace('.git', '');
  }
  return source.split('/').pop()!;
}

// ── Plugin Management ──────────────────────────────────

function install(source: string): void {
  console.log(`📦 Installing plugin from ${source}...`);
  const pluginName = extractPluginName(source);
  const pluginDir = join(PLUGINS_DIR, pluginName);

  if (existsSync(pluginDir)) rmSync(pluginDir, { recursive: true });

  if (isGitUrl(source)) {
    const { url, branch } = parseGitSource(source);
    mkdirSync(pluginDir, { recursive: true });
    try {
      execSync(`git clone --depth 1 --branch ${branch} ${url} ${pluginDir}`, {
        stdio: 'inherit',
      });
    } catch {
      rmSync(pluginDir, { recursive: true, force: true });
      mkdirSync(pluginDir, { recursive: true });
      execSync(`git clone --depth 1 ${url} ${pluginDir}`, { stdio: 'inherit' });
    }
  } else {
    const sourcePath = resolve(source);
    if (!existsSync(sourcePath))
      throw new Error(`Source path does not exist: ${sourcePath}`);
    mkdirSync(pluginDir, { recursive: true });
    cpSync(sourcePath, pluginDir, { recursive: true });
  }

  if (existsSync(join(pluginDir, 'package.json'))) {
    try {
      execSync('npm install --production --ignore-scripts', {
        cwd: pluginDir,
        stdio: 'pipe',
      });
    } catch {}
  }

  const manifest = readManifest(pluginDir);

  if (manifest.agents) {
    mkdirSync(AGENTS_DIR, { recursive: true });
    for (const agent of manifest.agents) {
      const agentSlug = `${manifest.name}:${agent.slug}`;
      const sourceDir = join(pluginDir, 'agents', agent.slug);
      const targetDir = join(AGENTS_DIR, agentSlug);
      if (existsSync(sourceDir)) {
        cpSync(sourceDir, targetDir, { recursive: true });
        console.log(`  ✓ Agent: ${agentSlug}`);
      }
    }
  }

  if (manifest.workspace) {
    mkdirSync(WORKSPACES_DIR, { recursive: true });
    const sourcePath = join(pluginDir, manifest.workspace.source);
    const targetDir = join(WORKSPACES_DIR, manifest.workspace.slug);
    if (existsSync(sourcePath)) {
      mkdirSync(targetDir, { recursive: true });
      const wsConfig = JSON.parse(readFileSync(sourcePath, 'utf-8'));
      wsConfig.plugin = manifest.name;
      writeFileSync(join(targetDir, 'workspace.json'), JSON.stringify(wsConfig, null, 2));
      console.log(`  ✓ Workspace: ${manifest.workspace.slug}`);
    }
  }

  console.log(
    `\n✅ Installed ${manifest.displayName} (${manifest.name}@${manifest.version})`,
  );
  if (manifest.providers?.length) {
    console.log(
      `   Providers: ${manifest.providers.map((p) => p.type).join(', ')}`,
    );
  }
}

function list(): void {
  if (!existsSync(PLUGINS_DIR)) {
    console.log('No plugins installed');
    return;
  }
  const plugins = readdirSync(PLUGINS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => {
      try {
        return readManifest(join(PLUGINS_DIR, d.name));
      } catch {
        return null;
      }
    })
    .filter((m): m is PluginManifest => m !== null);

  if (!plugins.length) {
    console.log('No plugins installed');
    return;
  }
  console.log('\nInstalled Plugins:\n');
  for (const m of plugins) {
    console.log(`  ${m.displayName} (${m.name}@${m.version})`);
    console.log(
      `    Agents: ${m.agents?.length || 0} | Workspace: ${m.workspace ? '✓' : '✗'}`,
    );
  }
}

function remove(name: string): void {
  const pluginDir = join(PLUGINS_DIR, name);
  if (!existsSync(pluginDir)) {
    console.error(`Plugin ${name} not found`);
    process.exit(1);
  }
  const manifest = readManifest(pluginDir);
  if (manifest.agents) {
    for (const agent of manifest.agents) {
      const agentJson = join(AGENTS_DIR, `${name}:${agent.slug}`, 'agent.json');
      if (existsSync(agentJson)) rmSync(agentJson);
    }
  }
  if (manifest.workspace) {
    const wsDir = join(WORKSPACES_DIR, manifest.workspace.slug);
    if (existsSync(wsDir)) rmSync(wsDir, { recursive: true });
  }
  rmSync(pluginDir, { recursive: true });
  console.log(`✅ Removed ${manifest.displayName}`);
}

function info(name: string): void {
  const pluginDir = join(PLUGINS_DIR, name);
  if (!existsSync(pluginDir)) {
    console.error(`Plugin ${name} not found`);
    process.exit(1);
  }
  const m = readManifest(pluginDir);
  console.log(`\n${m.displayName} (${m.name}@${m.version})`);
  if (m.agents) {
    console.log(`Agents (${m.agents.length}):`);
    m.agents.forEach((a) => console.log(`  - ${m.name}:${a.slug}`));
  }
  if (m.workspace) console.log(`Workspace: ${m.workspace.slug}`);
}

function update(name: string): void {
  const pluginDir = join(PLUGINS_DIR, name);
  if (!existsSync(pluginDir)) {
    console.error(`Plugin ${name} not found`);
    process.exit(1);
  }
  if (!existsSync(join(pluginDir, '.git'))) {
    console.error('Not a git install. Remove and re-install.');
    process.exit(1);
  }
  execSync('git pull --ff-only', { cwd: pluginDir, stdio: 'inherit' });
  console.log(`✅ Updated ${readManifest(pluginDir).displayName}`);
}

// ── Plugin Development ─────────────────────────────────

function findEsbuild(): string | null {
  for (const p of [
    join(CWD, 'node_modules/.bin/esbuild'),
    join(CWD, '../../node_modules/.bin/esbuild'),
  ]) {
    if (existsSync(p)) return p;
  }
  try {
    execSync('esbuild --version', { stdio: 'pipe' });
    return 'esbuild';
  } catch {}
  return null;
}

const SHARED_EXTERNALS = [
  'react',
  'react/jsx-runtime',
  'react/jsx-dev-runtime',
  '@work-agent/sdk',
  '@work-agent/components',
  '@tanstack/react-query',
  'dompurify',
  'debug',
  'zod',
];

function ensureShim(): void {
  const shimPath = join(CWD, 'shim.js');
  if (!existsSync(shimPath)) {
    writeFileSync(
      shimPath,
      `var __shared = (typeof window !== 'undefined' && window.__work_agent_shared) || {};\nvar require = globalThis.require = function(m) {\n  if (__shared[m]) return __shared[m];\n  if (m === 'react' || m === 'react/jsx-runtime' || m === 'react/jsx-dev-runtime') return __shared['react'];\n  console.warn('[Plugin] Unknown shared module:', m);\n  return {};\n};\n`,
    );
  }
}

function build(mode: 'production' | 'dev' = 'production'): void {
  const esbuild = findEsbuild();
  if (!esbuild) {
    console.error('esbuild not found. Install it: npm install -D esbuild');
    process.exit(1);
  }
  const manifest = readManifest();
  const entry = manifest.entrypoint || 'src/index.tsx';
  const name = manifest.name || 'plugin';
  mkdirSync(join(CWD, 'dist'), { recursive: true });

  const isDev = mode === 'dev';
  // Production: externalize shared deps (core provides them)
  // Dev: bundle everything, only externalize SDK (we mock it)
  const externals = isDev
    ? [
        '@work-agent/sdk',
        '@work-agent/components',
        'react',
        'react-dom',
        'react/jsx-runtime',
        'react/jsx-dev-runtime',
        '@tanstack/react-query',
      ].flatMap((e) => [`--external:${e}`])
    : SHARED_EXTERNALS.flatMap((e) => [`--external:${e}`]);

  // Production needs the shim for require() resolution
  // Dev needs a minimal shim that maps SDK to the window mock
  if (!isDev) ensureShim();
  const _inject = !isDev ? '--inject:shim.js' : '';
  let devShimFile = '';
  if (isDev) {
    devShimFile = join(CWD, 'dist/.dev-shim.cjs');
    writeFileSync(
      devShimFile,
      `${[
        `var require = globalThis.require = function(m) {`,
        `  if (m === 'react') return window.React;`,
        `  if (m === 'react/jsx-runtime') return window.__jsx;`,
        `  if (m === 'react/jsx-dev-runtime') return window.__jsxDev;`,
        `  if (m === 'react-dom' || m === 'react-dom/client') return window.ReactDOM;`,
        `  if (m === '@tanstack/react-query') return window.__work_agent_rq;`,
        `  var s = window.__work_agent_sdk_mock;`,
        `  if (m === '@work-agent/sdk') return Object.assign({}, s, {default:s, __esModule:true});`,
        `  if (m === '@work-agent/components') return new Proxy({}, {get: function() { return function() { return null; }; }});`,
        `  throw new Error('Unknown external: ' + m);`,
        `};`,
      ].join('\n')}\n`,
    );

    // Build react + react-query from plugin's own node_modules
    const reactBundle = join(CWD, 'dist/.react-dev.js');
    if (!existsSync(reactBundle)) {
      const reactEntry = join(CWD, 'dist/.react-entry.mjs');
      writeFileSync(
        reactEntry,
        [
          `import React from 'react';`,
          `import ReactDOM from 'react-dom';`,
          `import * as C from 'react-dom/client';`,
          `import * as JSX from 'react/jsx-runtime';`,
          `import * as JSXD from 'react/jsx-dev-runtime';`,
          `import * as RQ from '@tanstack/react-query';`,
          `window.React = React;`,
          `window.ReactDOM = {...ReactDOM, ...C};`,
          `window.__jsx = JSX;`,
          `window.__jsxDev = JSXD;`,
          `window.__work_agent_rq = RQ;`,
        ].join('\n'),
      );
      try {
        execSync(
          `${esbuild} ${reactEntry} --bundle --format=iife --outfile=${reactBundle} --define:process.env.NODE_ENV=\\"development\\"`,
          { stdio: 'pipe', cwd: CWD },
        );
      } catch (e: any) {
        console.warn('  ⚠ Could not build react bundle:', e.message);
      } finally {
        try {
          rmSync(reactEntry);
        } catch {}
      }
    }
  }

  console.log(
    `📦 Building ${manifest.displayName || name}${isDev ? ' (dev)' : ''}...`,
  );
  execSync(
    [
      esbuild,
      join(CWD, entry),
      '--bundle',
      '--format=iife',
      '--global-name=__plugin',
      `--outfile=${join(CWD, `dist/bundle${isDev ? '-dev' : ''}.js`)}`,
      '--jsx=automatic',
      `--define:process.env.NODE_ENV=\\"${isDev ? 'development' : 'production'}\\"`,
      isDev && devShimFile
        ? `--inject:${devShimFile}`
        : !isDev
          ? '--inject:shim.js'
          : '',
      ...externals,
      '--log-level=info',
    ]
      .filter(Boolean)
      .join(' '),
    { stdio: 'inherit', cwd: CWD },
  );

  const outFile = `dist/bundle${isDev ? '-dev' : ''}.js`;
  const bundle = join(CWD, outFile);
  const reg = `\n;(function(){window.__work_agent_plugins=window.__work_agent_plugins||{};window.__work_agent_plugins["${name}"]=__plugin;})();\n`;
  writeFileSync(bundle, readFileSync(bundle, 'utf-8') + reg);
  const size = readFileSync(bundle).length;
  const cssPath = join(CWD, `dist/bundle${isDev ? '-dev' : ''}.css`);
  const cssSize = existsSync(cssPath) ? readFileSync(cssPath).length : 0;
  console.log(
    `✅ ${outFile} (${(size / 1024).toFixed(1)}KB)${cssSize ? ` + css (${(cssSize / 1024).toFixed(1)}KB)` : ''}`,
  );
}

function init(name = 'my-workspace'): void {
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
        type: 'workspace',
        sdkVersion: '^0.4.0',
        displayName: name
          .split('-')
          .map((w) => w[0].toUpperCase() + w.slice(1))
          .join(' '),
        description: 'A Work Agent workspace plugin',
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
    `import { useAuth, type WorkspaceComponentProps } from '@work-agent/sdk';\n\nfunction Main({ onShowChat }: WorkspaceComponentProps) {\n  const { user } = useAuth();\n  return (\n    <div style={{ padding: '2rem' }}>\n      <h1>Hello{user?.name ? \`, \${user.name}\` : ''}!</h1>\n      <button onClick={() => onShowChat?.()}>Open Chat</button>\n    </div>\n  );\n}\n\nexport const components = { '${name}-main': Main };\nexport default Main;\n`,
  );
  writeFileSync(
    join(dir, 'package.json'),
    `${JSON.stringify(
      {
        name,
        version: '1.0.0',
        type: 'module',
        scripts: { build: 'wa build', dev: 'wa dev' },
        peerDependencies: {
          '@work-agent/sdk': '^0.3.0',
          react: '^18.0.0 || ^19.0.0',
        },
      },
      null,
      2,
    )}\n`,
  );
  console.log(
    `\n✅ Created plugin: ${name}/\n\n   cd ${name}\n   wa build\n   wa dev\n`,
  );
}

// ── Dev Server ─────────────────────────────────────────

interface DevFlags {
  mcp?: boolean;
  toolsDir?: string;
}

function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk: string) => (data += chunk));
    req.on('end', () => {
      try {
        resolve(JSON.parse(data));
      } catch {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

function dev(port = 4200, flags: DevFlags = {}): void {
  build('dev');

  const manifest = readManifest();
  const name = manifest.displayName || manifest.name;
  const pluginName = manifest.name;
  const bundleJs = join(CWD, 'dist/bundle-dev.js');
  const bundleCss = join(CWD, 'dist/bundle-dev.css');
  const bundleCssFallback = join(CWD, 'dist/bundle.css');

  const wsPath = manifest.workspace?.source
    ? join(CWD, manifest.workspace.source)
    : null;
  const workspace: WorkspaceConfig | null =
    wsPath && existsSync(wsPath)
      ? JSON.parse(readFileSync(wsPath, 'utf-8'))
      : null;
  const tabs = workspace?.tabs || [];
  const tabsJson = JSON.stringify(tabs);

  // Read agent info for dev header
  const agents = (manifest.agents || []).map((a) => {
    try {
      const _spec = readPluginManifest(CWD); // just for the agent ref
      const agentPath = join(CWD, a.source);
      if (!existsSync(agentPath)) return { slug: a.slug, name: a.slug };
      const agentSpec = JSON.parse(readFileSync(agentPath, 'utf-8'));
      return { slug: a.slug, name: agentSpec.name, model: agentSpec.model };
    } catch {
      return { slug: a.slug, name: a.slug };
    }
  });
  const agentInfo = agents
    .map(
      (a) =>
        `${a.name}${a.model ? ` (${a.model.split(':')[0].split('.').pop()})` : ''}`,
    )
    .join(', ');

  const html = devHTML(name!, pluginName!, tabsJson, agentInfo);

  // ── MCP setup ──
  let mcpManager: MCPManager | null = null;
  const useMCP = flags.mcp !== false;
  const toolsDir = flags.toolsDir || join(CWD, '..', '.work-agent', 'tools');

  if (useMCP && manifest.agents?.length) {
    (async () => {
      try {
        const toolDefs = resolvePluginTools(CWD, toolsDir);
        if (toolDefs.size > 0) {
          mcpManager = new MCPManager({
            onStatus: (id, status, err) => {
              console.log(
                status === 'connected'
                  ? `   ✓ MCP: ${id}`
                  : `   ✗ MCP: ${id} — ${err}`,
              );
            },
          });
          await mcpManager.connectAll(Array.from(toolDefs.values()));
          console.log(
            `   🔌 ${mcpManager.listTools().length} tools from ${toolDefs.size} MCP servers`,
          );
        }
      } catch (err: any) {
        console.warn(`   ⚠ MCP setup failed: ${err.message}`);
      }
    })();
  }

  // ── Hot reload ──
  const reloadClients = new Set<ServerResponse>();
  let rebuildTimer: ReturnType<typeof setTimeout> | null = null;

  const srcDir = join(CWD, 'src');
  if (existsSync(srcDir)) {
    fsWatch(srcDir, { recursive: true }, (_event, filename) => {
      if (!filename || filename.startsWith('.')) return;
      if (!['.ts', '.tsx', '.js', '.jsx', '.css'].includes(extname(filename)))
        return;
      if (rebuildTimer) clearTimeout(rebuildTimer);
      rebuildTimer = setTimeout(() => {
        try {
          console.log(`\n♻️  ${filename} changed — rebuilding...`);
          build('dev');
          for (const res of reloadClients) res.write('data: reload\n\n');
        } catch (err: any) {
          console.error(`   Build failed: ${err.message}`);
        }
      }, 200);
    });
  }

  // ── HTTP Server ──
  const server = createServer(async (req, res) => {
    const url = (req.url || '/').split('?')[0];

    // SSE reload
    if (url === '/api/reload') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      res.write('data: connected\n\n');
      reloadClients.add(res);
      req.on('close', () => reloadClients.delete(res));
      return;
    }

    // Tool list — matches core: GET /agents/:slug/tools
    if (/^\/agents\/[^/]+\/tools$/.test(url) && req.method === 'GET') {
      const tools =
        mcpManager?.listTools().map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        })) || [];
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(tools));
      return;
    }

    // Tool call — matches core: POST /agents/:slug/tools/:toolName
    const toolMatch = url.match(/^\/agents\/[^/]+\/tools\/(.+)$/);
    if (toolMatch && req.method === 'POST') {
      const toolName = decodeURIComponent(toolMatch[1]);
      const toolArgs = await readBody(req);
      res.setHeader('Content-Type', 'application/json');

      if (!mcpManager) {
        res.writeHead(503);
        res.end(
          JSON.stringify({
            success: false,
            error: 'MCP not connected',
          } satisfies ToolCallResponse),
        );
        return;
      }

      try {
        const raw = await mcpManager.callTool(
          toolName,
          toolArgs as Record<string, unknown>,
        );
        // Unwrap MCP content envelope — same logic as core server
        let response: unknown = raw;
        if (raw?.content?.[0]?.text) {
          try {
            const parsed = JSON.parse(raw.content[0].text);
            response = parsed?.content?.[0]?.text
              ? JSON.parse(parsed.content[0].text)
              : parsed;
          } catch {
            response = raw.content[0].text;
          }
        }
        res.writeHead(200);
        res.end(
          JSON.stringify({
            success: true,
            response,
          } satisfies ToolCallResponse),
        );
      } catch (err: any) {
        res.writeHead(400);
        res.end(
          JSON.stringify({
            success: false,
            error: err.message,
          } satisfies ToolCallResponse),
        );
      }
      return;
    }

    // CORS preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
      res.end();
      return;
    }

    // Server-side fetch proxy for plugins (mirrors /api/plugins/fetch in core)
    if (url === '/api/plugins/fetch' && req.method === 'POST') {
      const body = await readBody(req);
      const targetUrl = body.url as string;
      if (!targetUrl) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'url is required' }));
        return;
      }
      try {
        const resp = await globalThis.fetch(targetUrl, {
          method: (body.method as string) || 'GET',
          headers: (body.headers as Record<string, string>) || {},
          ...(body.body
            ? {
                body:
                  typeof body.body === 'string'
                    ? body.body
                    : JSON.stringify(body.body),
              }
            : {}),
        });
        const text = await resp.text();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            success: true,
            status: resp.status,
            contentType: resp.headers.get('content-type') || '',
            body: text,
          }),
        );
      } catch (e: any) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
      return;
    }

    // Static files
    const reactDev = join(CWD, 'dist/.react-dev.js');
    if (url === '/react-dev.js' && existsSync(reactDev)) {
      res.writeHead(200, {
        'Content-Type': 'application/javascript',
        'Cache-Control': 'public, max-age=3600',
      });
      res.end(readFileSync(reactDev));
      return;
    }
    if (url === '/bundle.js' && existsSync(bundleJs)) {
      res.writeHead(200, {
        'Content-Type': 'application/javascript',
        'Cache-Control': 'no-cache',
      });
      res.end(readFileSync(bundleJs));
    } else if (
      (url === '/bundle.css' || url === '/bundle-dev.css') &&
      (existsSync(bundleCss) || existsSync(bundleCssFallback))
    ) {
      res.writeHead(200, {
        'Content-Type': 'text/css',
        'Cache-Control': 'no-cache',
      });
      res.end(
        readFileSync(existsSync(bundleCss) ? bundleCss : bundleCssFallback),
      );
    } else {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(html);
    }
  });

  server.listen(port, () => {
    console.log(`\n🔧 Plugin dev server running at http://localhost:${port}`);
    console.log(`   Plugin: ${name}`);
    console.log(`   Tabs: ${tabs.map((t) => t.label).join(', ') || 'none'}`);
    console.log(
      useMCP && manifest.agents?.length
        ? '   MCP: connecting...'
        : '   MCP: off',
    );
    console.log(`   Run 'wa build' to rebuild after changes\n`);
  });

  const cleanup = async () => {
    if (mcpManager) await mcpManager.closeAll();
    process.exit(0);
  };
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}

// ── Dev HTML template (browser JS) ─────────────────────

function devHTML(
  name: string,
  pluginName: string,
  tabsJson: string,
  agentInfo: string,
): string {
  // Self-contained: plugin bundle includes React, react-query, etc.
  // Only @work-agent/sdk is external (mocked below).
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${name} — Dev Preview</title>
<link rel="stylesheet" href="/bundle.css">
<style>
body{margin:0;font-family:system-ui;background:var(--bg-primary);color:var(--text-primary)}
:root,[data-theme="dark"]{--bg-primary:#1a1a1a;--bg-secondary:#242424;--bg-tertiary:#2a2a2a;--bg-elevated:#333;--bg-hover:#2a2a2a;--bg-highlight:#1e3a5f;--bg-modal:#242424;--bg-input:#1a1a1a;--text-primary:#e0e0e0;--text-secondary:#d0d0d0;--text-muted:#999;--text-tertiary:#9c9c9c;--border-primary:#333;--border-dashed:#444;--accent-primary:#4a9eff;--accent-acp:#22c55e;--color-bg:var(--bg-primary);--color-bg-secondary:var(--bg-secondary);--color-border:var(--border-primary);--color-text:var(--text-primary);--color-text-secondary:var(--text-secondary);--color-primary:var(--accent-primary);--color-bg-hover:var(--bg-hover)}
[data-theme="light"]{--bg-primary:#fff;--bg-secondary:#f5f5f5;--bg-tertiary:#eee;--bg-elevated:#fafafa;--bg-hover:#f0f0f0;--bg-highlight:#e8f0fe;--bg-modal:#fff;--bg-input:#fff;--text-primary:#1a1a1a;--text-secondary:#333;--text-muted:#999;--text-tertiary:#666;--border-primary:#e0e0e0;--border-dashed:#d0d0d0;--accent-primary:#0066cc;--accent-acp:#16a34a;--color-bg:var(--bg-primary);--color-bg-secondary:var(--bg-secondary);--color-border:var(--border-primary);--color-text:var(--text-primary);--color-text-secondary:var(--text-secondary);--color-primary:var(--accent-primary);--color-bg-hover:var(--bg-hover)}
.dev-banner{background:var(--bg-secondary);border-bottom:1px solid var(--accent-primary);padding:8px 16px;font-size:13px;color:var(--accent-primary);display:flex;align-items:center;justify-content:space-between}
.dev-tabs{display:flex;background:var(--bg-secondary);border-bottom:1px solid var(--border-primary)}
.dev-tab{padding:10px 20px;cursor:pointer;border:none;background:none;color:var(--text-muted);font-size:14px;border-bottom:2px solid transparent;font-family:inherit}
.dev-tab:hover{color:var(--text-primary);background:var(--bg-hover)}
.dev-tab.active{color:var(--accent-primary);border-bottom-color:var(--accent-primary)}
.dev-tab-content{min-height:calc(100vh - 80px)}
.dev-error{padding:2rem;color:#ef4444}
.dev-theme-btn{background:none;border:1px solid var(--border-primary);border-radius:4px;padding:2px 8px;cursor:pointer;font-size:14px}
.dev-toast-container{position:fixed;top:48px;right:16px;z-index:9999;display:flex;flex-direction:column;gap:8px;pointer-events:none}
.dev-toast{background:var(--bg-elevated);border:1px solid var(--accent-primary);border-radius:6px;padding:8px 12px;font-size:12px;color:var(--accent-primary);max-width:400px;word-break:break-all;animation:toast-in .3s ease}
@keyframes toast-in{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:none}}
</style>
<script>document.documentElement.setAttribute('data-theme',localStorage.getItem('theme')||'dark');</script>
</head><body>
<div class="dev-banner">
  <span>🔧 <strong>${name}</strong> — Dev Preview${agentInfo ? ` · <span style="opacity:0.7">🤖 ${agentInfo}</span>` : ''}</span>
  <button class="dev-theme-btn" onclick="var t=document.documentElement.getAttribute('data-theme')==='light'?'dark':'light';document.documentElement.setAttribute('data-theme',t);localStorage.setItem('theme',t);this.textContent=t==='dark'?'☀️':'🌙'">☀️</button>
</div>
<div id="root"></div>
<script>
// Toast overlay
var noop=function(){};
(function(){var c=document.createElement('div');c.className='dev-toast-container';document.body.appendChild(c);window.__devToast=function(msg){var el=document.createElement('div');el.className='dev-toast';el.textContent=msg;c.appendChild(el);setTimeout(function(){el.remove()},4000)};})();

// Provider registry — plugin's own code registers here
var __p={},__pc={};

// SDK mock — ONLY what needs core server
window.__work_agent_sdk_mock={
  useAgents:function(){return[]},
  useAuth:function(){return{status:'valid',provider:'none',user:{alias:'dev-user',name:'Dev User'}}},
  useNavigation:function(){return{setDockState:noop,navigate:noop,setWorkspaceTab:noop}},
  useToast:function(){return{showToast:noop}},
  useWorkspaceQuery:function(){return{data:undefined}},
  useWorkspaceNavigation:function(){var ws='stallion';return{navigateToTab:noop,currentTab:null,getTabState:function(t){return sessionStorage.getItem('ws-'+ws+'-'+t)||''},setTabState:function(t,s){sessionStorage.setItem('ws-'+ws+'-'+t,s);window.location.hash=s},clearTabState:function(t){sessionStorage.removeItem('ws-'+ws+'-'+t)}}},
  useSendToChat:function(slug){return function(msg){window.__devToast&&window.__devToast('→ chat('+slug+'): '+(typeof msg==='string'?msg:JSON.stringify(msg).slice(0,120)))}},
  useNotifications:function(){return{notifications:[],dismiss:noop}},
  useOpenConversation:function(){return noop},
  useApiBase:function(){return''},
  registerProvider:function(id,meta,factory){__p[id]={meta:meta,factory:factory,instance:null}},
  configureProvider:function(ws,type,pid){__pc[ws+'/'+type]=pid},
  hasProvider:function(ws,type){var pid=__pc[ws+'/'+type];return !!pid&&!!__p[pid]},
  getProvider:function(ws,type){var pid=__pc[ws+'/'+type];if(!pid||!__p[pid])return null;var e=__p[pid];if(!e.instance)e.instance=typeof e.factory==='function'?e.factory():e.factory;return e.instance},
  getActiveProviderId:function(ws,type){return __pc[ws+'/'+type]||null},
  callTool:function(slug,tool,args){return fetch('/agents/'+encodeURIComponent(slug)+'/tools/'+encodeURIComponent(tool),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(args||{})}).then(function(r){return r.json()}).then(function(d){if(!d.success){console.warn('[dev] tool error:',d.error);return null}return d.response}).catch(function(e){console.warn('[dev] callTool failed:',e);return null})},
  invokeAgent:function(slug,prompt){window.__devToast&&window.__devToast('→ agent('+slug+'): '+prompt.slice(0,100));return Promise.resolve({text:'[mock]',toolCalls:[]})},
  invoke:function(opts){window.__devToast&&window.__devToast('invoke: '+JSON.stringify(opts).slice(0,120));return Promise.resolve({})},
  createWorkspaceContext:function(opts){var init=(opts&&opts.initialState)||{};var R=window.React;var Ctx=R.createContext({state:init,setState:noop});return{Provider:function(p){return R.createElement(Ctx.Provider,{value:{state:init,setState:noop}},p.children)},useWorkspaceContext:function(){return R.useContext(Ctx)}}},
  useServerFetch:function(){return function(url,opts){return fetch('/api/plugins/fetch',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:url,method:opts&&opts.method,headers:opts&&opts.headers,body:opts&&opts.body})}).then(function(r){return r.json()}).then(function(d){if(!d.success)throw new Error(d.error);return d})}},
};
</script>
<script src="/react-dev.js"></script>
<script src="/bundle.js"></script>
<script>
(function(){
  var plugin=window.__work_agent_plugins&&window.__work_agent_plugins['${pluginName}'];
  if(!plugin){document.getElementById('root').innerHTML='<div class="dev-error">Plugin failed to load. Check console.</div>';return}
  var React=window.React,ReactDOM=window.ReactDOM;
  var RQ=window.__work_agent_rq;
  var tabs=${tabsJson};
  function DevShell(){
    var ref=React.useState(tabs[0]?tabs[0].id:null),activeTab=ref[0],setActiveTab=ref[1];
    var comps=plugin.components||{};
    var td=tabs.find(function(t){return t.id===activeTab});
    var C=td?comps[td.component]:null;
    var inner=React.createElement(React.Fragment,null,
      React.createElement('div',{className:'dev-tabs'},tabs.map(function(t){return React.createElement('button',{key:t.id,className:'dev-tab'+(activeTab===t.id?' active':''),onClick:function(){setActiveTab(t.id)}},t.label)})),
      React.createElement('div',{className:'dev-tab-content'},C?React.createElement(EB,{key:activeTab},React.createElement(C,{onShowChat:noop})):React.createElement('div',{style:{padding:'2rem',color:'var(--text-muted)'}},'No component: '+(td?td.component:activeTab)))
    );
    return RQ&&RQ.QueryClientProvider?React.createElement(RQ.QueryClientProvider,{client:window.__devQC||(window.__devQC=new RQ.QueryClient())},inner):inner;
  }
  class EB extends React.Component{constructor(p){super(p);this.state={e:null}}static getDerivedStateFromError(e){return{e:e}}render(){return this.state.e?React.createElement('div',{className:'dev-error'},React.createElement('strong',null,'Error: '),this.state.e.message,React.createElement('pre',{style:{fontSize:12,marginTop:8,color:'var(--text-muted)'}},this.state.e.stack)):this.props.children}}
  ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(DevShell));
})();
</script>
<script>(function(){var es=new EventSource('/api/reload');es.onmessage=function(e){if(e.data==='reload')location.reload()}})()</script>
</body></html>`;
}

// ── CLI entry point ────────────────────────────────────

const [, , command, ...args] = process.argv;

try {
  switch (command) {
    case 'install':
      install(args[0]);
      break;
    case 'list':
      list();
      break;
    case 'remove':
      remove(args[0]);
      break;
    case 'info':
      info(args[0]);
      break;
    case 'update':
      update(args[0]);
      break;
    case 'init':
      init(args[0]);
      break;
    case 'build':
      build();
      break;
    case 'dev': {
      const flags: DevFlags = {};
      let devPort = 4200;
      for (const arg of args) {
        if (arg === '--no-mcp') flags.mcp = false;
        else if (arg === '--mcp') flags.mcp = true;
        else if (arg.startsWith('--tools-dir='))
          flags.toolsDir = arg.split('=')[1];
        else if (/^\d+$/.test(arg)) devPort = parseInt(arg, 10);
      }
      dev(devPort, flags);
      break;
    }
    default:
      console.log(`
Work Agent CLI (@work-agent/cli)

Plugin Management:
  wa install <source>     Install from git URL or local path
  wa list                 List installed plugins
  wa remove <name>        Remove a plugin
  wa info <name>          Show plugin details
  wa update <name>        Update a plugin (git only)

Plugin Development:
  wa init [name]          Scaffold a new plugin
  wa build                Build plugin bundle
  wa dev [port] [flags]   Dev preview server (default: 4200)
    --no-mcp              Disable MCP tool connections
    --tools-dir=<path>    Tool configs directory (default: ../.work-agent/tools)
`);
  }
} catch (err: any) {
  console.error('Error:', err.message);
  process.exit(1);
}
