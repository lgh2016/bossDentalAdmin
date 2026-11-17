// Test-only dependency: npm install --prefix node_modules/.cache/budget-tests --no-save --package-lock=false react-test-renderer@19.2.7
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'node_modules/.cache/budget-tests/quotation-test.mjs');
await build({
  entryPoints: [path.join(root, 'tests/quotation-editor.test.jsx')], outfile: output,
  bundle: true, platform: 'node', format: 'esm', jsx: 'automatic',
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  plugins: [{ name: 'component-test-boundaries', setup(builder) {
    builder.onResolve({ filter: /^react(?:\/.*)?$/ }, args => ({ path: require.resolve(args.path) }));
    builder.onResolve({ filter: /^react-test-renderer$/ }, () => ({ path: path.join(root, 'node_modules/.cache/budget-tests/node_modules/react-test-renderer/index.js') }));
    builder.onResolve({ filter: /^@\/services\/patientsApi$/ }, () => ({ path: 'api', namespace: 'fixture' }));
    builder.onResolve({ filter: /^@\/components\/ui\// }, () => ({ path: 'ui', namespace: 'fixture' }));
    builder.onResolve({ filter: /^sonner$/ }, () => ({ path: 'toast', namespace: 'fixture' }));
    builder.onResolve({ filter: /^@\// }, args => ({ path: require.resolve(path.join(root, 'src', args.path.slice(2))) }));
    builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => {
      if (args.path === 'api') return { contents: 'export const patientsApi = new Proxy({}, {get: (_, key) => (...args) => globalThis.budgetApi[key](...args)});' };
      if (args.path === 'toast') return { contents: 'export const toast = {success() {}, error(message) { throw new Error(message); }};' };
      const names = 'Button Input Textarea Label Select SelectTrigger SelectValue SelectContent SelectItem SelectGroup SelectLabel Dialog DialogContent DialogHeader DialogTitle DialogFooter DialogDescription'.split(' ');
      return { resolveDir: root, contents: `import React from 'react'; ${names.map(name => `export const ${name} = ({children, ...props}) => React.createElement('${name === 'Input' ? 'input' : name === 'Textarea' ? 'textarea' : name === 'Button' ? 'button' : 'div'}', props, children);`).join('\n')}` };
    });
  } }],
});
await import(pathToFileURL(output).href);
// React's test scheduler may keep a MessagePort alive after all roots unmount.
process.exit(0);
