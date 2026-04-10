import * as esbuild from 'esbuild';

const shared = {
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  sourcemap: true,
  external: ['fsevents', 'esbuild', 'node-pty', '@anthropic-ai/claude-agent-sdk'],
  banner: {
    js: "import { createRequire as __stallionCreateRequire } from 'node:module'; const require = __stallionCreateRequire(import.meta.url);",
  },
};

await Promise.all([
  esbuild.build({
    ...shared,
    entryPoints: ['./src-server/index.ts'],
    outfile: 'dist-server/index.js',
  }),
  esbuild.build({
    ...shared,
    entryPoints: ['./src-server/tools/stallion-control-server.ts'],
    outfile: 'dist-server/stallion-control.js',
  }),
]);
