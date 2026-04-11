import { existsSync, readFileSync } from 'node:fs';
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import { join } from 'node:path';
import type { ToolCallResponse } from '@stallion-ai/contracts/runtime';
import type { MCPManager } from '@stallion-ai/shared/mcp';

interface DevHttpContext {
  cwd: string;
  pluginsDir: string;
  bundleJs: string;
  bundleCss: string;
  bundleCssFallback: string;
  reactBundle: string;
  sdkBundle: string;
  getHtml: () => string;
  getMcpManager: () => MCPManager | null;
}

export function getOpenFileMime(relPath: string) {
  const ext = relPath.split('.').pop() || '';
  const mime: Record<string, string> = {
    json: 'application/json',
    md: 'text/markdown',
    ts: 'text/plain',
    tsx: 'text/plain',
    js: 'text/plain',
  };
  return mime[ext] || 'text/plain';
}

export function isAllowedOpenFilePath(
  absPath: string,
  cwd: string,
  pluginsDir: string,
) {
  return absPath.startsWith(cwd) || absPath.startsWith(join(pluginsDir, ''));
}

export function parseToolCallResponse(raw: any) {
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
  return response;
}

export function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk: string) => {
      data += chunk;
    });
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

export function createDevHttpServer({
  cwd,
  pluginsDir,
  bundleJs,
  bundleCss,
  bundleCssFallback,
  reactBundle,
  sdkBundle,
  getHtml,
  getMcpManager,
}: DevHttpContext): {
  reloadClients: Set<ServerResponse>;
  server: Server;
} {
  const reloadClients = new Set<ServerResponse>();

  const server = createServer(async (req, res) => {
    const url = (req.url || '/').split('?')[0];
    const mcpManager = getMcpManager();

    if (req.url?.startsWith('/api/open-file?')) {
      const params = new URLSearchParams(req.url.split('?')[1]);
      const relPath = params.get('path');
      if (relPath) {
        const absPath = relPath.startsWith('/') ? relPath : join(cwd, relPath);
        if (isAllowedOpenFilePath(absPath, cwd, pluginsDir) && existsSync(absPath)) {
          res.writeHead(200, {
            'Content-Type': getOpenFileMime(relPath),
            'Cache-Control': 'no-cache',
          });
          res.end(readFileSync(absPath, 'utf-8'));
          return;
        }
      }
      res.writeHead(404);
      res.end('Not found');
      return;
    }

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

    if (/^\/agents\/[^/]+\/tools$/.test(url) && req.method === 'GET') {
      const tools =
        mcpManager?.listTools().map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
        })) || [];
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(tools));
      return;
    }

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
        res.writeHead(200);
        res.end(
          JSON.stringify({
            success: true,
            response: parseToolCallResponse(raw),
          } satisfies ToolCallResponse),
        );
      } catch (error: any) {
        res.writeHead(400);
        res.end(
          JSON.stringify({
            success: false,
            error: error.message,
          } satisfies ToolCallResponse),
        );
      }
      return;
    }

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
      res.end();
      return;
    }

    if (url === '/api/plugins/fetch' && req.method === 'POST') {
      const body = await readBody(req);
      const targetUrl = body.url as string;
      if (!targetUrl) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'url is required' }));
        return;
      }
      try {
        const response = await globalThis.fetch(targetUrl, {
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
        const text = await response.text();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            success: true,
            status: response.status,
            contentType: response.headers.get('content-type') || '',
            body: text,
          }),
        );
      } catch (error: any) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
      return;
    }

    if (url === '/react-dev.js' && existsSync(reactBundle)) {
      res.writeHead(200, {
        'Content-Type': 'application/javascript',
        'Cache-Control': 'no-cache',
      });
      res.end(readFileSync(reactBundle));
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

    const sdkCss = join(cwd, 'dist/.sdk-dev.css');
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
      return;
    }
    if (
      (url === '/bundle.css' || url === '/bundle-dev.css') &&
      (existsSync(bundleCss) || existsSync(bundleCssFallback))
    ) {
      res.writeHead(200, {
        'Content-Type': 'text/css',
        'Cache-Control': 'no-cache',
      });
      res.end(readFileSync(existsSync(bundleCss) ? bundleCss : bundleCssFallback));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(getHtml());
  });

  return { reloadClients, server };
}
