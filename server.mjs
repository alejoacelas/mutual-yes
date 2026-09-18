import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { DEADLINE } from './config.mjs';

export async function startServer({ port = Number(process.env.PORT || 8080), host = '0.0.0.0', deadline = DEADLINE } = {}) {
  const html = await readFile(new URL('./dist/index.html', import.meta.url));
  const sums = await readFile(new URL('./dist/SHA256SUMS', import.meta.url));
  // ponytail: one process, bounded rooms in memory; no persistence or multi-instance routing.
  const rooms = new Map();
  const server = createServer((req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
    if (req.url === '/health') { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('ok'); return; }
    if (req.url === '/SHA256SUMS') { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end(sums); return; }
    if (req.url !== '/' && req.url !== '/download') { res.writeHead(404); res.end('Not found'); return; }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    if (req.url === '/download') res.setHeader('Content-Disposition', 'attachment; filename="mutual-yes.html"');
    res.writeHead(200); res.end(req.method === 'HEAD' ? undefined : html);
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024, perMessageDeflate: false });
  const send = (ws, data) => { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data)); };
  const closeRoom = (room, expired = false) => {
    if (!room || room.closed) return;
    room.closed = true; rooms.delete(room.id);
    for (const ws of room.clients) {
      if (expired) send(ws, { type: 'expired' });
      ws?.close(1000, expired ? 'Deadline passed' : 'Session ended');
    }
  };
  server.on('upgrade', (req, socket, head) => {
    if (req.url !== '/relay' || wss.clients.size >= 100 || Date.now() >= deadline) {
      socket.end('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n'); return;
    }
    // file:// clients have Origin:null. Authentication is the invitation capability
    // plus peer key verification, not Origin; no cookies or ambient authority.
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws));
  });
  wss.on('connection', ws => {
    let room, role, bytes = 0, messages = 0, windowStart = Date.now();
    ws.alive = true; ws.on('pong', () => { ws.alive = true; });
    const registration = setTimeout(() => ws.close(1008, 'Join timeout'), 15000);
    function reject(message) { send(ws, { type: 'error', message }); ws.close(1008, 'Invalid request'); }
    ws.on('message', (data, binary) => {
      if (Date.now() >= deadline) { if (room) closeRoom(room, true); else { send(ws, { type: 'expired' }); ws.close(); } return; }
      bytes += data.length;
      if (Date.now() - windowStart > 1000) { windowStart = Date.now(); messages = 0; }
      if (++messages > 5000 || bytes > 128 * 1024 * 1024) { reject('Session traffic limit reached.'); return; }
      if (!room) {
        if (binary || data.length > 512) { reject('Invalid invitation.'); return; }
        let message;
        try { message = JSON.parse(data.toString()); } catch { reject('Invalid invitation.'); return; }
        if (message.type === 'create') {
          if (rooms.size >= 50) { reject('The relay is busy. Try again shortly.'); return; }
          const id = randomBytes(16).toString('hex'), token = randomBytes(32).toString('hex');
          room = { id, token, clients: [ws, null], closed: false }; role = 0;
          rooms.set(id, room);
          send(ws, { type: 'joined', room: id, role, invite: token });
        } else if (message.type === 'join' && typeof message.invitation === 'string' && /^[a-f0-9]{32}\.[a-f0-9]{64}$/.test(message.invitation)) {
          const [id, token] = message.invitation.split('.');
          const target = rooms.get(id);
          if (!target || target.closed || target.clients[1] || !timingSafeEqual(Buffer.from(token, 'hex'), Buffer.from(target.token, 'hex'))) {
            reject('This invitation is unavailable. Ask for a new check.'); return;
          }
          room = target; role = 1; room.clients[1] = ws;
          send(ws, { type: 'joined', room: id, role });
          for (const client of room.clients) send(client, { type: 'paired' });
        } else { reject('Invalid invitation.'); return; }
        clearTimeout(registration); return;
      }
      const peer = room.clients[1 - role];
      if (room.closed || !peer || peer.readyState !== WebSocket.OPEN) { reject('The other participant is not connected.'); return; }
      if (!binary) {
        if (data.length > 2048) { reject('Invalid connection message.'); return; }
        try {
          const message = JSON.parse(data.toString());
          if (!['commit', 'hello'].includes(message.type)) throw new Error();
        } catch { reject('Invalid connection message.'); return; }
      }
      if (peer.bufferedAmount > 4 * 1024 * 1024) { reject('The connection is too slow.'); return; }
      peer.send(data, { binary });
    });
    ws.on('error', () => closeRoom(room));
    ws.on('close', () => { clearTimeout(registration); closeRoom(room); });
  });
  const sweep = setInterval(() => {
    if (Date.now() >= deadline) for (const room of rooms.values()) closeRoom(room, true);
  }, 250);
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.alive) { ws.terminate(); continue; }
      ws.alive = false; ws.ping();
    }
  }, 20000);
  await new Promise(resolve => server.listen(port, host, resolve));
  return { server, rooms, close: async () => {
    clearInterval(sweep); clearInterval(heartbeat);
    for (const ws of wss.clients) ws.terminate();
    wss.close(); await new Promise(resolve => server.close(resolve));
  } };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const app = await startServer();
  console.log(`Mutual Yes listening on ${app.server.address().port}`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await app.close(); process.exit(0); });
}
