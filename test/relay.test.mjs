import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { startServer } from '../server.mjs';

const connect = async app => {
  const ws = new WebSocket(`ws://127.0.0.1:${app.server.address().port}/relay`);
  await once(ws, 'open'); return ws;
};
const exchange = async (ws, data) => {
  const reply = once(ws, 'message'); ws.send(JSON.stringify(data));
  return JSON.parse((await reply)[0]);
};

test('relay rejects invalid capabilities and a third participant', async () => {
  const app = await startServer({ port: 0, deadline: Date.now() + 10000 });
  try {
    const a = await connect(app);
    const room = await exchange(a, { type: 'create' });
    const bad = await connect(app);
    assert.equal((await exchange(bad, { type: 'join', invitation: `${room.room}.${'0'.repeat(64)}` })).type, 'error');
    const b = await connect(app);
    const invitation = `${room.room}.${room.invite}`;
    assert.equal((await exchange(b, { type: 'join', invitation })).type, 'joined');
    const third = await connect(app);
    assert.equal((await exchange(third, { type: 'join', invitation })).type, 'error');
    const closed = once(a, 'close'); b.close(); await closed;
    assert.equal(app.rooms.size, 0);
  } finally { await app.close(); }
});

test('relay expires open rooms and rejects new connections after deadline', async () => {
  const app = await startServer({ port: 0, deadline: Date.now() + 500 });
  try {
    const a = await connect(app); await exchange(a, { type: 'create' });
    const expired = JSON.parse((await once(a, 'message'))[0]);
    assert.equal(expired.type, 'expired');
    assert.equal(app.rooms.size, 0);
    const late = new WebSocket(`ws://127.0.0.1:${app.server.address().port}/relay`);
    const [error] = await once(late, 'error');
    assert.match(error.message, /503/);
  } finally { await app.close(); }
});
