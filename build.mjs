import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const origin = process.env.PUBLIC_ORIGIN || 'http://localhost:8080';
const url = new URL(origin);
if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)) throw Error('HTTPS required');
const result = await build({
  entryPoints: ['client.js'], bundle: true, write: false, minify: true,
  format: 'iife', platform: 'browser', target: 'es2022', legalComments: 'inline',
  define: { PUBLIC_ORIGIN: JSON.stringify(url.origin) },
  plugins: [{ name: 'webcrypto-random', setup(builder) {
    builder.onResolve({ filter: /^crypto$/ }, () => ({ path: 'crypto', namespace: 'webcrypto' }));
    builder.onLoad({ filter: /.*/, namespace: 'webcrypto' }, () => ({ contents: `export function randomBytes(size) { const bytes=crypto.getRandomValues(new Uint8Array(size)); return { toString(encoding) { if(encoding!=='hex')throw Error('Unsupported encoding'); return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join(''); } }; }` }));
  } }],
});
const licenses = await Promise.all(['js-smp', 'bn.js', 'js-sha256'].map(async name => `${name}:\n${await readFile(`node_modules/${name}/${name === 'js-sha256' ? 'LICENSE.txt' : 'LICENSE'}`, 'utf8')}`));
const script = (`/*!\n${licenses.join('\n')}\n*/\n` + result.outputFiles[0].text).replace(/<\/script/gi, '<\\/script');
const hash = createHash('sha256').update(script).digest('base64');
const csp = `default-src 'none'; script-src 'sha256-${hash}'; style-src 'unsafe-inline'; connect-src ${url.origin}; img-src data:; base-uri 'none'; form-action 'none'`;
const html = (await readFile('page.html', 'utf8')).replace('@@CSP@@', csp).replace('@@SCRIPT@@', script);
await mkdir('dist', { recursive: true }); await writeFile('dist/index.html', html);
await writeFile('dist/SHA256SUMS', `${createHash('sha256').update(html).digest('hex')}  mutual-yes.html\n`);
console.log(`Built self-contained HTML: ${Math.ceil(Buffer.byteLength(html) / 1024)} KB`);
