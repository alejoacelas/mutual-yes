import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createHandler } from './api/mailbox.mjs';
import { DEADLINE } from './config.mjs';
// Local development uses serialized file writes. Production uses Blob conditional writes.
export function fileStore(directory) {
  let queue = Promise.resolve();
  const name = path => `${directory}/${path.replaceAll('/', '_')}`;
  return {
    async read(path) { try { return JSON.parse(await readFile(name(path), 'utf8')); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } },
    async write(path, value, etag) {
      const task = queue.then(async () => {
        const current = await this.read(path);
        if (current?.etag !== etag) throw Error('Precondition failed');
        await mkdir(directory, { recursive: true });
        const tmp = `${name(path)}.tmp`;
        await writeFile(tmp, JSON.stringify({ value, etag: randomUUID() }), { mode: 0o600 });
        await rename(tmp, name(path));
      }); queue = task.catch(() => {}); return task;
    },
  };
}
export async function startServer({ port = Number(process.env.PORT || 8080), host = '127.0.0.1', deadline = DEADLINE, roomId = process.env.ROOM_ID, store = fileStore('.local-data') } = {}) {
  const api = createHandler(store, { deadline, roomId });
  const server = createServer(async (req, res) => {
    if (req.url === '/api/mailbox') return api(req, res);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (!['/', '/download', '/SHA256SUMS', '/health'].includes(req.url)) { res.writeHead(404); res.end(); return; }
    if (req.url === '/health') { res.end('ok'); return; }
    res.setHeader('Content-Type', req.url === '/SHA256SUMS' ? 'text/plain' : 'text/html');
    if (req.url === '/download') res.setHeader('Content-Disposition', 'attachment; filename="mutual-yes.html"');
    try { const body = await readFile(`dist/${req.url === '/SHA256SUMS' ? 'SHA256SUMS' : 'index.html'}`); res.end(req.method === 'HEAD' ? undefined : body); }
    catch { res.writeHead(503); res.end('Build the page first.'); }
  });
  await new Promise(resolve => server.listen(port, host, resolve));
  return { server, close: () => new Promise(resolve => server.close(resolve)) };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!process.env.ROOM_ID) throw Error('Set ROOM_ID to the room hash for your test invitation.');
  const app = await startServer(); console.log(`Mutual Yes on ${app.server.address().port}`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await app.close(); process.exit(0); });
}
