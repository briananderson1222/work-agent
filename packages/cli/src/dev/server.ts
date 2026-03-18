import { execSync } from 'node:child_process';
import {
  existsSync,
  watch as fsWatch,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { extname, join } from 'node:path';
import {
  buildPlugin,
  resolvePluginIntegrations,
  type StandaloneLayoutConfig,
  type ToolCallResponse,
} from '@stallion-ai/shared';
import { MCPManager } from '@stallion-ai/shared/mcp';
import {
  CWD,
  lookupDepInRegistries,
  PLUGINS_DIR,
  readManifest,
} from '../commands/helpers.js';
import { install } from '../commands/install.js';
import { serializeSDKMock } from './sdk-mock.js';
import { generateDevHTML } from './template.js';

export interface DevFlags {
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

export async function startDevServer(
  port: number,
  flags: DevFlags = {},
): Promise<void> {
  await buildPlugin(CWD, 'dev');

  const manifest = readManifest();

  // Resolve dependencies (install if missing, same as `stallion install`)
  if (manifest.dependencies?.length) {
    for (const dep of manifest.dependencies) {
      if (existsSync(join(PLUGINS_DIR, dep.id, 'plugin.json'))) continue;
      const depSource = dep.source || lookupDepInRegistries(dep.id);
      if (depSource) {
        console.log(`📦 Installing dependency: ${dep.id}...`);
        try {
          install(depSource, []);
        } catch (e: any) {
          console.warn(`  ⚠ Dep ${dep.id} failed: ${e.message}`);
        }
      }
    }
  }

  const name = manifest.displayName || manifest.name;
  const pluginName = manifest.name;
  const bundleJs = join(CWD, 'dist/bundle-dev.js');
  const bundleCss = join(CWD, 'dist/bundle-dev.css');
  const bundleCssFallback = join(CWD, 'dist/bundle.css');

  const layoutPath = manifest.layout?.source
    ? join(CWD, manifest.layout.source)
    : null;

  // Build react + react-query from plugin's own node_modules
  const reactBundle = join(CWD, 'dist/.react-dev.js');
  const pkgMtime = existsSync(join(CWD, 'package.json'))
    ? statSync(join(CWD, 'package.json')).mtimeMs
    : 0;
  const bundleMtime = existsSync(reactBundle)
    ? statSync(reactBundle).mtimeMs
    : 0;
  const esbuildBin = existsSync(join(CWD, 'node_modules/.bin/esbuild'))
    ? join(CWD, 'node_modules/.bin/esbuild')
    : existsSync(join(CWD, '../../node_modules/.bin/esbuild'))
      ? join(CWD, '../../node_modules/.bin/esbuild')
      : 'esbuild';

  if (!existsSync(reactBundle) || pkgMtime > bundleMtime) {
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
        `import * as Zod from 'zod';`,
        `window.React = React;`,
        `window.ReactDOM = {...ReactDOM, ...C};`,
        `window.__jsx = JSX;`,
        `window.__jsxDev = JSXD;`,
        `window.__stallion_ai_rq = RQ;`,
        `window.__stallion_ai_zod = Zod;`,
      ].join('\n'),
    );
    try {
      execSync(
        `${esbuildBin} ${reactEntry} --bundle --format=iife --outfile=${reactBundle} --loader:.tsx=tsx --jsx=automatic --define:process.env.NODE_ENV=\\"development\\"`,
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

  // Build SDK components bundle (externalizes React — uses the one from react-dev.js)
  const sdkBundle = join(CWD, 'dist/.sdk-dev.js');
  const sdkEntry = join(CWD, 'dist/.sdk-entry.mjs');
  if (!existsSync(sdkBundle) || pkgMtime > bundleMtime) {
    writeFileSync(sdkEntry, `import { SDKProvider, LayoutHeader, AuthStatusBadge, ActionButton } from '@stallion-ai/sdk';\nwindow.__stallion_sdk = { SDKProvider, LayoutHeader, AuthStatusBadge, ActionButton };\n`);
    try {
      execSync(
        `${esbuildBin} ${sdkEntry} --bundle --format=iife --outfile=${sdkBundle} --loader:.tsx=tsx --jsx=automatic --external:react --external:react-dom --external:react/jsx-runtime --define:process.env.NODE_ENV=\\"development\\" --global-name=__sdkTmp`,
        { stdio: 'pipe', cwd: CWD },
      );
    } catch (e: any) {
      console.warn('  ⚠ Could not build SDK bundle:', e.message);
    } finally {
      try { rmSync(sdkEntry); } catch {}
    }
  }

  // ── Config-driven HTML generation (re-run on config file changes) ──
  function regenerateHTML(): { html: string; layout: StandaloneLayoutConfig | null; layoutSlug: string } {
    const layout: StandaloneLayoutConfig | null =
      layoutPath && existsSync(layoutPath)
        ? JSON.parse(readFileSync(layoutPath, 'utf-8'))
        : null;
    const tabs = layout?.tabs || [];
    const tabsJson = JSON.stringify(tabs);

    const agents = (manifest.agents || []).map((a: any) => {
      try {
        const agentPath = join(CWD, a.source);
        if (!existsSync(agentPath)) return { slug: a.slug, name: a.slug };
        const agentSpec = JSON.parse(readFileSync(agentPath, 'utf-8'));
        return {
          slug: a.slug,
          name: agentSpec.name,
          model: agentSpec.model,
          prompt: agentSpec.prompt,
          mcpServers: agentSpec.tools?.mcpServers || [],
          guardrails: agentSpec.guardrails,
          _source: a.source,
        };
      } catch {
        return { slug: a.slug, name: a.slug };
      }
    });

    const layoutSlug = layout?.slug || pluginName!;

    const promptsSource = manifest.prompts?.source;
    let promptEntries: Array<{id: string; name: string; icon?: string; requires?: string[]}> = [];
    if (promptsSource) {
      const promptsDir = join(CWD, promptsSource);
      if (existsSync(promptsDir)) {
        promptEntries = readdirSync(promptsDir).filter((f: string) => f.endsWith('.md')).map((f: string) => {
          const raw = readFileSync(join(promptsDir, f), 'utf-8');
          const match = raw.match(/^---\n([\s\S]*?)\n---/);
          const meta: Record<string, any> = {};
          if (match) {
            let curKey: string | null = null;
            for (const line of match[1].split('\n')) {
              const colon = line.indexOf(':');
              if (colon > 0 && !line.match(/^\s*-/)) {
                const k = line.slice(0, colon).trim();
                const v = line.slice(colon + 1).trim();
                if (v) meta[k] = v.replace(/['"]/g, '');
                else curKey = k;
              } else if (curKey && line.trim().startsWith('- ')) {
                if (!Array.isArray(meta[curKey])) meta[curKey] = [];
                meta[curKey].push(line.trim().slice(2).replace(/['"]/g, ''));
              }
            }
          }
          const bodyMatch = raw.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
          const content = bodyMatch ? bodyMatch[1].trim() : raw.trim();
          return { id: meta.id || f.replace('.md', ''), name: meta.label || meta.id || f.replace('.md', ''), icon: meta.icon, requires: meta.requires, content, _source: `${manifest.prompts!.source}/${f}` };
        });
      }
    }

    const integrationsDir = join(CWD, 'integrations');
    const integrations: Array<Record<string, any>> = [];
    if (existsSync(integrationsDir)) {
      for (const dir of readdirSync(integrationsDir)) {
        const cfgPath = join(integrationsDir, dir, 'integration.json');
        if (existsSync(cfgPath)) {
          try {
            const cfg = JSON.parse(readFileSync(cfgPath, 'utf-8'));
            cfg._source = `integrations/${dir}/integration.json`;
            integrations.push(cfg);
          } catch {}
        }
      }
    }

    // Scan dependency plugins for their registries
    const depRegistries: Record<string, any> = {};
    for (const dep of manifest.dependencies || []) {
      const depDir = join(PLUGINS_DIR, dep.id);
      const depManifestPath = join(depDir, 'plugin.json');
      if (!existsSync(depManifestPath)) continue;
      try {
        const depManifest = JSON.parse(readFileSync(depManifestPath, 'utf-8'));
        const depAgents = (depManifest.agents || []).map((a: any) => {
          try {
            const ap = join(depDir, a.source);
            if (!existsSync(ap)) return { slug: a.slug, name: a.slug };
            const spec = JSON.parse(readFileSync(ap, 'utf-8'));
            return { slug: a.slug, name: spec.name, model: spec.model, prompt: spec.prompt, mcpServers: spec.tools?.mcpServers || [], guardrails: spec.guardrails, _source: join(depDir, a.source) };
          } catch { return { slug: a.slug, name: a.slug }; }
        });
        const depIntDir = join(depDir, 'integrations');
        const depIntegrations: Array<Record<string, any>> = [];
        if (existsSync(depIntDir)) {
          for (const d of readdirSync(depIntDir)) {
            const cp = join(depIntDir, d, 'integration.json');
            if (existsSync(cp)) { try { const c = JSON.parse(readFileSync(cp, 'utf-8')); c._source = cp; depIntegrations.push(c); } catch {} }
          }
        }
        let depPrompts: any[] = [];
        if (depManifest.prompts?.source) {
          const dpDir = join(depDir, depManifest.prompts.source);
          if (existsSync(dpDir)) {
            depPrompts = readdirSync(dpDir).filter((f: string) => f.endsWith('.md')).map((f: string) => {
              const raw = readFileSync(join(dpDir, f), 'utf-8');
              const m = raw.match(/^---\n([\s\S]*?)\n---/);
              const meta: Record<string, any> = {};
              if (m) { for (const line of m[1].split('\n')) { const c = line.indexOf(':'); if (c > 0 && !line.match(/^\s*-/)) { const k = line.slice(0, c).trim(); const v = line.slice(c + 1).trim(); if (v) meta[k] = v.replace(/['"]/g, ''); } } }
              const bm = raw.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
              return { id: meta.id || f.replace('.md', ''), name: meta.label || meta.id || f.replace('.md', ''), icon: meta.icon, requires: meta.requires, content: bm ? bm[1].trim() : raw.trim(), _source: join(dpDir, f) };
            });
          }
        }
        const depLayoutPath = depManifest.layout?.source ? join(depDir, depManifest.layout.source) : null;
        const depLayout = depLayoutPath && existsSync(depLayoutPath) ? JSON.parse(readFileSync(depLayoutPath, 'utf-8')) : null;
        depRegistries[dep.id] = {
          name: depManifest.displayName || depManifest.name,
          _dir: depDir,
          agents: depAgents,
          integrations: depIntegrations,
          prompts: depPrompts,
          actions: depLayout?.actions || [],
          layouts: depLayout ? [{ slug: depLayout.slug, name: depLayout.name, icon: depLayout.icon, tabs: depLayout.tabs || [], _source: depLayoutPath }] : [],
          dependencies: depManifest.dependencies || [],
          providers: (depManifest.providers || []).map((p: any) => ({ type: p.type, module: p.module, _source: join(depDir, p.module) })),
        };
      } catch {}
    }

    const registryJson = JSON.stringify({
      agents,
      prompts: promptEntries,
      actions: (layout as any)?.actions || [],
      integrations,
      dependencies: manifest.dependencies || [],
      depRegistries,
      layouts: layout ? [{ slug: layout.slug, name: layout.name, icon: layout.icon, tabs: tabs, _source: manifest.layout?.source }] : [],
      _actionSource: manifest.layout?.source,
      _cwd: CWD,
    });

    const html = generateDevHTML({
      name: name!,
      pluginName: pluginName!,
      tabsJson,
      registryJson,
      layoutSlug,
      sdkMockJs: serializeSDKMock({ layoutSlug }),
    });

    return { html, layout, layoutSlug };
  }

  let { html, layout } = regenerateHTML();

  // ── MCP setup ──
  let mcpManager: MCPManager | null = null;
  const useMCP = flags.mcp !== false;
  const toolsDir = flags.toolsDir || join(CWD, 'integrations');

  if (useMCP && manifest.agents?.length) {
    (async () => {
      try {
        const toolDefs = resolvePluginIntegrations(CWD, toolsDir);
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
      rebuildTimer = setTimeout(async () => {
        try {
          console.log(`\n♻️  ${filename} changed — rebuilding...`);
          await buildPlugin(CWD, 'dev');
          for (const res of reloadClients) res.write('data: reload\n\n');
        } catch (err: any) {
          console.error(`   Build failed: ${err.message}`);
        }
      }, 200);
    });
  }

  // Watch config files (layout, prompts, agents) — regenerate HTML + reload
  let configTimer: ReturnType<typeof setTimeout> | null = null;
  const configDirs: string[] = [];
  if (layoutPath) configDirs.push(layoutPath);
  if (manifest.prompts?.source) {
    const pd = join(CWD, manifest.prompts.source);
    if (existsSync(pd)) configDirs.push(pd);
  }
  for (const a of manifest.agents || []) {
    const ap = join(CWD, a.source);
    if (existsSync(ap)) configDirs.push(ap);
  }
  for (const target of configDirs) {
    const isDir = existsSync(target) && statSync(target).isDirectory();
    fsWatch(target, isDir ? { recursive: true } : {}, (_event, filename) => {
      if (configTimer) clearTimeout(configTimer);
      configTimer = setTimeout(() => {
        try {
          const label = filename || target.replace(`${CWD}/`, '');
          console.log(`\n♻️  ${label} changed — regenerating config...`);
          ({ html, layout } = regenerateHTML());
          for (const res of reloadClients) res.write('data: reload\n\n');
        } catch (err: any) {
          console.error(`   Config reload failed: ${err.message}`);
        }
      }, 200);
    });
  }

  // ── HTTP Server ──
  const server = createServer(async (req, res) => {
    const url = (req.url || '/').split('?')[0];

    // Serve source files for dev inspection
    if (req.url?.startsWith('/api/open-file?')) {
      const params = new URLSearchParams(req.url.split('?')[1]);
      const relPath = params.get('path');
      if (relPath) {
        const absPath = relPath.startsWith('/') ? relPath : join(CWD, relPath);
        const allowed = absPath.startsWith(CWD) || absPath.startsWith(join(PLUGINS_DIR, ''));
        if (allowed && existsSync(absPath)) {
          const content = readFileSync(absPath, 'utf-8');
          const ext = relPath.split('.').pop() || '';
          const mime: Record<string, string> = { json: 'application/json', md: 'text/markdown', ts: 'text/plain', tsx: 'text/plain', js: 'text/plain' };
          res.writeHead(200, { 'Content-Type': mime[ext] || 'text/plain', 'Cache-Control': 'no-cache' });
          res.end(content);
          return;
        }
      }
      res.writeHead(404);
      res.end('Not found');
      return;
    }

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
        'Cache-Control': 'no-cache',
      });
      res.end(readFileSync(reactDev));
      return;
    }
    if (url === '/sdk-dev.js' && existsSync(sdkBundle)) {
      res.writeHead(200, {
        'Content-Type': 'application/javascript',
        'Cache-Control': 'no-cache',
      });
      res.end(readFileSync(sdkBundle));
      return;
    }
    const sdkCss = join(CWD, 'dist/.sdk-dev.css');
    if (url === '/sdk-dev.css' && existsSync(sdkCss)) {
      res.writeHead(200, {
        'Content-Type': 'text/css',
        'Cache-Control': 'no-cache',
      });
      res.end(readFileSync(sdkCss));
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
    const tabs = layout?.tabs || [];
    console.log(`\n🔧 Plugin dev server running at http://localhost:${port}`);
    console.log(`   Plugin: ${name}`);
    console.log(`   Tabs: ${tabs.map((t) => t.label).join(', ') || 'none'}`);
    console.log(
      useMCP && manifest.agents?.length
        ? '   MCP: connecting...'
        : '   MCP: off',
    );
    if (configDirs.length > 0) {
      console.log(`   Watching: src/ + ${configDirs.map(d => d.replace(`${CWD}/`, '')).join(', ')}`);
    }
    console.log('');
  });

  const cleanup = async () => {
    if (mcpManager) await mcpManager.closeAll();
    process.exit(0);
  };
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}
