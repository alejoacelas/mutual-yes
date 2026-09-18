import { createHash, timingSafeEqual } from 'node:crypto';
import { get, put } from '@vercel/blob';
import { DEADLINE } from '../config.mjs';
const digest = s => createHash('sha256').update(s).digest('hex');
const equal = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const isHex = (value, size) => typeof value === 'string' && new RegExp(`^[a-f0-9]{${size}}$`).test(value);
export const blobStore = {
  async read(path) {
    const blob = await get(path, { access: 'private', useCache: false });
    if (!blob) return null;
    return { value: JSON.parse(await new Response(blob.stream).text()), etag: blob.blob.etag };
  },
  async write(path, value, etag) {
    await put(path, JSON.stringify(value), { access: 'private', addRandomSuffix: false, contentType: 'application/json',
      allowOverwrite: !!etag, ...(etag ? { ifMatch: etag } : {}) });
  },
};
export function createHandler(store, { deadline = DEADLINE, roomId = process.env.ROOM_ID } = {}) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    const reply = (status, data) => { res.statusCode = status; res.end(JSON.stringify(data)); };
    if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return; }
    if (req.method !== 'POST') return reply(405, { error: 'Use POST.' });
    try {
      let body = req.body;
      if (body === undefined) {
        let raw = ''; for await (const chunk of req) { raw += chunk; if (raw.length > 250000) return reply(413, { error: 'Request too large.' }); }
        body = JSON.parse(raw);
      } else if (typeof body === 'string') body = JSON.parse(body);
      if (JSON.stringify(body).length > 250000) return reply(413, { error: 'Request too large.' });
      const { room, auth, role, owner, update } = body;
      if (!roomId) return reply(503, { error: 'Storage is not configured.' });
      if (!isHex(room, 64) || !isHex(auth, 64) || !equal(room, roomId) || !equal(digest(auth), room) || ![0, 1].includes(role) || !isHex(owner, 64)) return reply(403, { error: 'Invalid private link.' });
      const paths = [0, 1].map(r => `async-v1/${room}/${r}.json`);
      const records = await Promise.all(paths.map(path => store.read(path)));
      const own = records[role]?.value;
      if (own && !equal(own.ownerHash, digest(owner))) return reply(403, { error: 'Use the browser you voted in, or your saved HTML file.' });
      if (update) {
        if (Date.now() >= deadline) return reply(410, { error: 'The deadline has passed.' });
        if (body.version !== (own?.version || 0)) return reply(409, { error: 'Progress changed. Checking again.' });
        const validCipher = value => typeof value === 'string' && /^[a-f0-9]+$/.test(value) && value.length >= 56 && value.length % 2 === 0;
        if (!validCipher(update.vault) || update.vault.length > 120000 || !Array.isArray(update.messages) || update.messages.length > 5 || update.messages.some(m => !validCipher(m) || m.length > 45000)) return reply(400, { error: 'Invalid encrypted progress.' });
        const oldMessages = own?.messages || [];
        if (oldMessages.some((m, i) => update.messages[i] !== m)) return reply(409, { error: 'Saved messages cannot be replaced.' });
        const value = { ownerHash: digest(owner), version: (own?.version || 0) + 1, vault: update.vault, messages: update.messages, updated: Date.now() };
        try { await store.write(paths[role], value, records[role]?.etag); }
        catch (error) {
          if (/precondition|already exists|conflict/i.test(error.message)) return reply(409, { error: 'Progress changed. Checking again.' });
          throw error;
        }
        return reply(200, { saved: true, version: value.version });
      }
      return reply(200, { version: own?.version || 0, vault: own?.vault || null, messages: records.map(r => r?.value.messages || []), deadline, serverTime: Date.now() });
    } catch { return reply(503, { error: 'Could not reach saved progress. Please try again.' }); }
  };
}
export default createHandler(blobStore);
