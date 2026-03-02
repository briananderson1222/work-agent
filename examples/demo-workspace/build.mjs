import { build } from 'esbuild';

const sharedModules = [
  'react', 'react/jsx-runtime', 'react/jsx-dev-runtime',
  '@stallion-ai/sdk', '@stallion-ai/components',
  '@tanstack/react-query',
  'dompurify', 'debug', 'zod',
];

await build({
  entryPoints: ['src/index.tsx'],
  bundle: true,
  format: 'esm',
  outfile: 'dist/bundle.js',
  jsx: 'automatic',
  external: [],
  banner: {
    js: `
const __shared = window.__work_agent_shared || {};
const __require = (m) => {
  if (__shared[m]) return __shared[m];
  if (m.startsWith('react')) return __shared['react'];
  console.warn('[Plugin] Unknown shared module:', m);
  return {};
};
`,
  },
  define: {
    'process.env.NODE_ENV': '"production"',
  },
  plugins: [{
    name: 'externalize-shared',
    setup(build) {
      const filter = new RegExp(`^(${sharedModules.map(m => m.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&')).join('|')})$`);
      build.onResolve({ filter }, args => ({
        path: args.path,
        namespace: 'shared-external',
      }));
      build.onLoad({ filter: /.*/, namespace: 'shared-external' }, args => ({
        contents: `module.exports = __require('${args.path}')`,
        loader: 'js',
      }));
    },
  }],
  logLevel: 'info',
});
