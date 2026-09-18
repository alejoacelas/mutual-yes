import { VERSION, begin, advance, digest, random, seal, open } from './crypto.js';
export const emptyState = () => ({ version: VERSION, secret: null, machine: null, seen: 0, result: null, receipt: false, readySeen: false });
export async function processVisit(state, vote, messages, keys, role) {
  if (state.version !== VERSION) throw Error('This saved file uses a different version.');
  const next = structuredClone(state), outgoing = [...messages[role]];
  let changed = false;
  const append = async value => {
    outgoing.push(await seal(keys.transport, value, `${keys.room}:${role}:${outgoing.length}`)); changed = true;
  };
  if (vote !== null && !next.secret) {
    if (![0, 1].includes(vote)) throw Error('Choose yes or no.');
    next.secret = vote ? await digest(`${VERSION}:yes:${keys.room}`) : random();
    const start = begin(next.secret, role === 0); next.machine = start.saved;
    await append({ type: 'ready' });
    if (start.reply) await append({ type: 'smp', data: start.reply });
    changed = true;
  }
  const peer = messages[1 - role];
  for (; next.seen < peer.length; next.seen++) {
    const message = await open(keys.transport, peer[next.seen], `${keys.room}:${1 - role}:${next.seen}`);
    if (message.type === 'ready' && !next.readySeen) {
      next.readySeen = true; await append({ type: 'receipt' });
    } else if (message.type === 'receipt' && next.secret && !next.receipt) next.receipt = true;
    else if (message.type === 'smp') {
      if (!next.secret) break;
      if (next.result !== null || typeof message.data !== 'string') throw Error('Unexpected private message.');
      const result = advance(next.machine, message.data);
      next.machine = result.saved; next.result = result.result;
      if (result.reply) await append({ type: 'smp', data: result.reply });
    } else throw Error('The private exchange could not be verified.');
    changed = true;
  }
  return { state: next, messages: outgoing, changed };
}
