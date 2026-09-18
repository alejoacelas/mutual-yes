import BN from 'bn.js';
import smp from './vendor/smp-state.cjs';
import config from 'js-smp/lib/config.js';
import group from 'js-smp/lib/multiplicativeGroup.js';
import messages from 'js-smp/lib/msgs.js';
export const VERSION = 'mutual-yes-async-smp-v1';
export const hex = bytes => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
export const unhex = text => {
  if (typeof text !== 'string' || !/^(?:[0-9a-f]{2})+$/.test(text)) throw Error('Invalid encoding');
  return Uint8Array.from(text.match(/../g), b => parseInt(b, 16));
};
const enc = new TextEncoder(), dec = new TextDecoder();
export const random = () => hex(crypto.getRandomValues(new Uint8Array(32)));
export const digest = async text => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(text))));
export async function credentials(seed, vault) {
  if (!/^[a-f0-9]{64}$/.test(seed) || !/^[a-f0-9]{64}$/.test(vault)) throw Error('Invalid private link');
  const auth = await digest(`${VERSION}:access:${seed}`);
  return { room: await digest(auth), auth, owner: await digest(`${VERSION}:owner:${vault}`),
    transport: await digest(`${VERSION}:transport:${seed}`), vault };
}
async function key(secret) { return crypto.subtle.importKey('raw', unhex(secret), 'AES-GCM', false, ['encrypt', 'decrypt']); }
export async function seal(secret, value, context) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const json = enc.encode(JSON.stringify(value));
  const padded = new Uint8Array(context.includes(':vault:') ? 32768 : 16384);
  if (json.length > padded.length - 4) throw Error('Encrypted progress is too large');
  new DataView(padded.buffer).setUint32(0, json.length); padded.set(json, 4);
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(`${VERSION}:${context}`) }, await key(secret), padded);
  return hex(iv) + hex(new Uint8Array(data));
}
export async function open(secret, ciphertext, context) {
  const bytes = unhex(ciphertext);
  const data = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.subarray(0, 12), additionalData: enc.encode(`${VERSION}:${context}`) }, await key(secret), bytes.subarray(12));
  const bytesOut = new Uint8Array(data), length = new DataView(data).getUint32(0);
  if (length > bytesOut.length - 4) throw Error('Invalid padded message');
  return JSON.parse(dec.decode(bytesOut.subarray(4, 4 + length)));
}
export function snapshot(machine) {
  const fields = {};
  for (const [name, value] of Object.entries(machine.state)) {
    if (['config', 'q', 'g1'].includes(name)) continue;
    if (BN.isBN(value)) fields[name] = { bn: value.toString(16) };
    else if (value instanceof group.MultiplicativeGroup) fields[name] = { group: value.value.toString(16) };
    else throw Error('Unexpected protocol state');
  }
  const type = Object.keys(smp.states).find(name => Object.getPrototypeOf(machine.state) === smp.states[name].prototype);
  if (!type) throw Error('Unknown protocol state');
  return { type, fields };
}
export function restore(saved) {
  if (!Object.hasOwn(smp.states, saved.type)) throw Error('Unknown protocol state');
  const state = Object.create(smp.states[saved.type].prototype);
  Object.assign(state, { config: config.defaultConfig, q: config.defaultConfig.q, g1: config.defaultConfig.g });
  for (const [name, value] of Object.entries(saved.fields)) {
    if (!/^(x|s2|s3|g2L|g3L|g2R|g3R|g2|g3|pL|qL|pR|qR|rL|pa|qa|pb|qb|ra|rab)$/.test(name)) throw Error('Invalid state field');
    state[name] = value.bn !== undefined ? new BN(value.bn, 16) : new group.MultiplicativeGroup(config.defaultConfig.modulus, new BN(value.group, 16));
  }
  const machine = Object.create(smp.SMPStateMachine.prototype); machine.state = state; return machine;
}
export function begin(secret, initiator) {
  const machine = new smp.SMPStateMachine(unhex(secret));
  const reply = initiator ? machine.transit(null) : null;
  return { saved: snapshot(machine), reply: reply ? hex(reply.serialize()) : null, result: null };
}
export function advance(saved, incoming) {
  const machine = restore(saved);
  const bytes = unhex(incoming);
  if (bytes.length > 20000) throw Error('Protocol message too large');
  const message = messages.TLV.deserialize(bytes);
  if (hex(message.serialize()) !== incoming) throw Error('Noncanonical message');
  const reply = machine.transit(message);
  return { saved: snapshot(machine), reply: reply ? hex(reply.serialize()) : null, result: machine.isFinished() ? machine.getResult() : null };
}
