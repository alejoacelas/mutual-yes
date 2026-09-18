import { PROTOCOL } from './config.mjs';

const enc = new TextEncoder();
export const hex = bytes => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
export const unhex = s => {
  if (typeof s !== 'string' || !/^(?:[a-f0-9]{2})+$/.test(s)) throw new Error('Invalid encoding');
  return Uint8Array.from(s.match(/../g), b => parseInt(b, 16));
};
const hash = async data => new Uint8Array(await crypto.subtle.digest('SHA-256', data));
export const commitment = async value => hex(await hash(enc.encode(JSON.stringify(value))));

export async function makeIdentity(room, role) {
  const keys = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
  const hello = {
    protocol: PROTOCOL, room, role,
    key: hex(new Uint8Array(await crypto.subtle.exportKey('raw', keys.publicKey))),
    nonce: hex(crypto.getRandomValues(new Uint8Array(32))),
  };
  return { keys, hello, commitment: await commitment(hello) };
}

export async function makeChannel(identity, peer) {
  const own = identity.hello;
  if (peer.protocol !== PROTOCOL || peer.room !== own.room || peer.role !== 1 - own.role ||
      !/^[a-f0-9]{130}$/.test(peer.key) || !/^[a-f0-9]{64}$/.test(peer.nonce)) throw new Error('Connection identity mismatch');
  const transcript = own.role === 0 ? [own, peer] : [peer, own];
  const salt = await hash(enc.encode(JSON.stringify(transcript)));
  const peerKey = await crypto.subtle.importKey('raw', unhex(peer.key), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = await crypto.subtle.deriveBits({ name: 'ECDH', public: peerKey }, identity.keys.privateKey, 256);
  const material = await crypto.subtle.importKey('raw', shared, 'HKDF', false, ['deriveKey', 'deriveBits']);
  const derive = info => ({ name: 'HKDF', hash: 'SHA-256', salt, info: enc.encode(`${PROTOCOL}:${info}`) });
  const keys = await Promise.all([0, 1].map(role => crypto.subtle.deriveKey(derive(`sender-${role}`), material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])));
  // Commit/reveal stops a relay choosing its last key after seeing both peers' keys.
  // A 96-bit comparison code authenticates the transcript AND the derived secret.
  const fingerprint = hex(new Uint8Array(await crypto.subtle.deriveBits(derive('verification'), material, 96))).match(/.{4}/g).join(' ');
  let tx = 0, rx = 0;
  const nonce = count => { const bytes = new Uint8Array(12); new DataView(bytes.buffer).setBigUint64(4, BigInt(count)); return bytes; };
  return {
    fingerprint,
    async seal(bytes) {
      if (tx >= 1_000_000) throw new Error('Message limit exceeded');
      const iv = nonce(tx++);
      const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: salt }, keys[own.role], bytes);
      const packet = new Uint8Array(12 + ciphertext.byteLength);
      packet.set(iv); packet.set(new Uint8Array(ciphertext), 12);
      return packet;
    },
    async open(packet) {
      if (packet.length < 29 || packet.length > 1024 * 1024 || hex(packet.subarray(0, 12)) !== hex(nonce(rx))) throw new Error('Unexpected or repeated message');
      const result = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: packet.subarray(0, 12), additionalData: salt }, keys[peer.role], packet.subarray(12));
      rx++;
      return new Uint8Array(result);
    },
  };
}
