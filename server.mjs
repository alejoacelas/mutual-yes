import { createServer } from 'node:http';
import { readFile, open, mkdir, rename, stat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createHandler } from './api/mailbox.mjs';
import { DEADLINE } from './config.mjs';
// One process owns the persistent volume; writes are serialized and flushed before acknowledgement.
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
        const file = await open(tmp, 'w', 0o600);
        try { await file.writeFile(JSON.stringify({ value, etag: randomUUID() })); await file.sync(); }
        finally { await file.close(); }
        await rename(tmp, name(path));
        const dir = await open(directory, 'r');
        try { await dir.sync(); } finally { await dir.close(); }
      }); queue = task.catch(() => {}); return task;
    },
  };
}
export async function startServer({ port = Number(process.env.PORT || 8080), host = '127.0.0.1', deadline = DEADLINE, roomId = process.env.ROOM_ID, invitationSeed = process.env.PUBLIC_INVITATION_SEED, store = fileStore('.local-data') } = {}) {
  if (invitationSeed && !/^[a-f0-9]{64}$/.test(invitationSeed)) throw Error('Invalid public invitation seed.');
  const api = createHandler(store, { deadline, roomId });
  const server = createServer(async (req, res) => {
    if (req.url === '/api/mailbox') return api(req, res);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (!['/', '/boy', '/girl', '/download', '/SHA256SUMS', '/health'].includes(req.url)) { res.writeHead(404); res.end(); return; }
    if (req.url === '/health') { res.end('ok'); return; }
    res.setHeader('Content-Type', req.url === '/SHA256SUMS' ? 'text/plain' : 'text/html');
    if (req.url === '/download') res.setHeader('Content-Disposition', 'attachment; filename="mutual-yes.html"');
    try {
      let body = await readFile(`dist/${req.url === '/SHA256SUMS' ? 'SHA256SUMS' : 'index.html'}`, 'utf8');
      if (invitationSeed && ['/boy', '/girl'].includes(req.url)) body = body.replace('<meta name="invitation" content="">', `<meta name="invitation" content="${invitationSeed}.${req.url === '/boy' ? 0 : 1}">`);
      res.end(req.method === 'HEAD' ? undefined : body);
    }
    catch { res.writeHead(503); res.end('Build the page first.'); }
  });
  await new Promise(resolve => server.listen(port, host, resolve));
  return { server, close: () => new Promise(resolve => server.close(resolve)) };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!process.env.ROOM_ID) throw Error('Set ROOM_ID to the room hash for your test invitation.');
  const directory = process.env.DATA_DIR || '.local-data';
  if (process.env.NODE_ENV === 'production') {
    if (!process.env.DATA_DIR || !(await stat(directory)).isDirectory()) throw Error('Persistent DATA_DIR must be mounted.');
  }
  const app = await startServer({ host: process.env.HOST || '127.0.0.1', store: fileStore(directory) }); console.log(`Mutual Yes on ${app.server.address().port}`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await app.close(); process.exit(0); });
}
