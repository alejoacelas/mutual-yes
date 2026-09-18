import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import workerCode from './node_modules/emp-wasm/dist/src/ts/workerCode.js';

const origin = process.env.PUBLIC_ORIGIN || process.env.RENDER_EXTERNAL_URL || 'http://localhost:8080';
const url = new URL(origin);
const relay = new URL(process.env.RELAY_ORIGIN || origin);
if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('HTTPS required');
if (relay.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(relay.hostname)) throw new Error('HTTPS relay required');
const result = await build({
  entryPoints: ['client.js'], bundle: true, write: false, minify: true,
  format: 'iife', platform: 'browser', target: 'es2022', legalComments: 'inline',
  define: { PUBLIC_ORIGIN: JSON.stringify(url.origin), RELAY_ORIGIN: JSON.stringify(relay.origin) },
  plugins: [{
    name: 'browser-only-emp', setup(builder) {
      builder.onLoad({ filter: /[/\\]workerCode\.js$/ }, () => {
        if (!workerCode.includes('export default createModule;')) throw new Error('EMP worker format changed');
        return { contents: `export default ${JSON.stringify(workerCode.replace('export default createModule;', ''))}`, loader: 'js' };
      });
      builder.onLoad({ filter: /[/\\]secureMPC\.js$/ }, async args => ({
        // EMP's bundled worker needs no module imports or exports. Classic Blob workers also
        // run from file:// in Chromium; module Blob workers do not.
        contents: (await readFile(args.path, 'utf8')).replace("{ type: 'module' }", "{ type: 'classic' }"),
        loader: 'js',
      }));
      builder.onResolve({ filter: /nodeSecureMPC\.js$/ }, () => ({ path: 'node-only', namespace: 'stub' }));
      builder.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export default function(){throw new Error("A browser with Web Workers is required");}' }));
    },
  }],
});
const script = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const scriptHash = createHash('sha256').update(script).digest('base64');
const wsOrigin = relay.origin.replace(/^http/, 'ws');
const csp = `default-src 'none'; script-src 'sha256-${scriptHash}' 'wasm-unsafe-eval'; style-src 'unsafe-inline'; worker-src blob:; connect-src ${url.origin} ${wsOrigin}; img-src data:; base-uri 'none'; form-action 'none'`;
const html = (await readFile('page.html', 'utf8')).replace('@@CSP@@', csp).replace('@@SCRIPT@@', script);
await mkdir('dist', { recursive: true });
await writeFile('dist/index.html', html);
await writeFile('dist/SHA256SUMS', `${createHash('sha256').update(html).digest('hex')}  mutual-yes.html\n`);
console.log(`Built self-contained HTML: ${(Buffer.byteLength(html) / 1024 / 1024).toFixed(2)} MB; relay ${wsOrigin}`);
