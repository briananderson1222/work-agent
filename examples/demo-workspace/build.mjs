import { build } from 'esbuild';

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
  if (m === 'react' || m === 'react/jsx-runtime') return __shared['react'];
  if (m === '@work-agent/sdk') return __shared['@work-agent/sdk'];
  if (m === '@tanstack/react-query') return __shared['@tanstack/react-query'];
  throw new Error('Plugin requires unknown module: ' + m);
};
`,
  },
  define: {
    'process.env.NODE_ENV': '"production"',
  },
  plugins: [{
    name: 'externalize-shared',
    setup(build) {
      build.onResolve({ filter: /^react$|^react\/|^@work-agent\/sdk$|^@tanstack\/react-query$/ }, args => ({
        path: args.path,
        namespace: 'shared-external',
      }));
      build.onLoad({ filter: /.*/, namespace: 'shared-external' }, args => ({
        contents: `module.exports = __require('${args.path.startsWith('react') ? 'react' : args.path}')`,
        loader: 'js',
      }));
    },
  }],
  logLevel: 'info',
});