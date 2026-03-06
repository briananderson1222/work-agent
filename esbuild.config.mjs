import * as esbuild from 'esbuild';

await esbuild.build({
  entryPoints: ['./src-server/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  outfile: 'dist-server/index.js',
  sourcemap: true,
  external: ['fsevents', 'esbuild'],
  banner: {
    js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);"
  }
});
