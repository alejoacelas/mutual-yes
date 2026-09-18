import { secureMPC, BufferedIO } from 'emp-wasm';
import { DEADLINE, CIRCUIT } from './config.mjs';
import { makeIdentity, makeChannel, commitment } from './channel.js';

const $ = id => document.getElementById(id);
const local = location.protocol === 'file:';
const origin = PUBLIC_ORIGIN;
const tokenPattern = /^[a-f0-9]{32}\.[a-f0-9]{64}$/;
let invitation = '';
let sock, role, room, identity, peerCommit, channel, io;
let outgoing = Promise.resolve(), incoming = Promise.resolve();
let localVerified = false, peerVerified = false, localReady = false, peerReady = false;
let started = false, ended = false, resultShown = false, answer, timer;

function notice(text, error = false) {
  $('notice').textContent = text;
  $('notice').classList.toggle('error', error);
  $('notice').hidden = !text;
}
function describe(title, text) { $('session-title').textContent = title; $('session-description').textContent = text; }
function stop() {
  ended = true; clearTimeout(timer);
  io?.close();
  if (sock && sock.readyState < 2) sock.close();
  answer = undefined; identity = undefined; channel = undefined;
}
function fail(message = 'The connection was interrupted. No result was reached.') {
  if (ended || resultShown) return;
  if (Date.now() >= DEADLINE) { expire(); return; }
  stop();
  $('session').hidden = true;
  notice(`${message} This does not count as a no before the deadline.`, true);
  $('restart').hidden = false;
}
function expire() {
  if (resultShown) return;
  stop(); resultShown = true;
  $('entry').hidden = true; $('session').hidden = true; $('restart').hidden = true;
  notice(''); $('result').hidden = false;
  $('result-title').textContent = 'No further date';
  $('result-description').textContent = 'The deadline passed. An unfinished check counts as a no, as agreed. This does not reveal anyone’s submitted answer.';
}
function tick() {
  const remaining = Math.max(0, Math.ceil((DEADLINE - Date.now()) / 1000));
  const days = Math.floor(remaining / 86400), hours = Math.floor(remaining / 3600) % 24, minutes = Math.floor(remaining / 60) % 60, seconds = remaining % 60;
  $('countdown').textContent = remaining ? `${days}d ${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s` : 'Deadline passed';
  if (!remaining) expire();
}
function parseInvite(value) {
  value = value.trim();
  if (value.includes('#')) value = value.slice(value.indexOf('#') + 1);
  if (!tokenPattern.test(value)) throw new Error('Use the complete invitation link or code.');
  return value;
}
function setInvitation(value) {
  invitation = parseInvite(value);
  $('invite-notice').hidden = false;
  $('entry-title').textContent = 'Join your private check';
  $('local-start').textContent = 'Join private check';
}

function sendPlain(value) {
  if (ended || sock?.readyState !== WebSocket.OPEN) throw new Error('Disconnected');
  sock.send(JSON.stringify(value));
}
function sendEncrypted(bytes) {
  // Web Crypto is asynchronous: serialize encryption and sending to retain order.
  outgoing = outgoing.then(async () => {
    if (ended || !channel) throw new Error('Disconnected');
    const packet = await channel.seal(bytes);
    if (ended || sock.readyState !== WebSocket.OPEN) throw new Error('Disconnected');
    sock.send(packet);
  });
  outgoing.catch(() => fail('The encrypted connection failed.'));
  return outgoing;
}
function maybeVote() {
  if (localVerified && peerVerified && !localReady && !ended) {
    clearTimeout(timer);
    $('verification').hidden = true; $('vote').hidden = false;
    describe('Your choice', 'Take your time. Keep both pages open until the result appears.');
  }
}
async function maybeCompute() {
  if (!localReady || !peerReady || started || ended) return;
  started = true;
  describe('Checking for a mutual yes…', 'Your browsers are calculating the result privately.');
  timer = setTimeout(() => fail('The private calculation timed out.'), 120000);
  try {
    const bits = await secureMPC({ party: role, size: 2, circuit: CIRCUIT, inputBits: Uint8Array.of(answer), inputBitsPerParty: [1, 1], io, mode: 'mpc' });
    answer = undefined;
    if (ended) return;
    if (Date.now() >= DEADLINE) { expire(); return; }
    if (bits.length !== 1 || (bits[0] !== 0 && bits[0] !== 1)) throw new Error('Invalid result');
    // Flush final EMP messages before showing the result; do not transmit a plaintext result.
    await outgoing;
    clearTimeout(timer); resultShown = true;
    $('session').hidden = true; $('result').hidden = false; notice('');
    $('result-title').textContent = bits[0] ? 'You both said yes' : 'No mutual yes';
    $('result-description').textContent = bits[0] ? 'You both chose another date. The next step is yours.' : 'There won’t be another date. No individual answer is displayed.';
    // Leave the socket open so the other browser can finish; page close ends it.
  } catch { fail('The private calculation could not be verified.'); }
}

async function receive(event) {
  if (ended) return;
  if (event.data instanceof ArrayBuffer) {
    if (!channel) throw new Error('Encrypted message before handshake');
    const bytes = await channel.open(new Uint8Array(event.data));
    if (bytes[0] === 1 && bytes.length === 1 && !peerVerified) {
      peerVerified = true; maybeVote();
    } else if (bytes[0] === 2 && bytes.length === 1 && peerVerified && !peerReady) {
      peerReady = true; void maybeCompute();
    } else if ((bytes[0] === 97 || bytes[0] === 98) && peerReady && localReady && io) {
      io.accept(bytes[0] === 97 ? 'a' : 'b', bytes.subarray(1));
    } else throw new Error('Invalid protocol state');
    return;
  }
  const message = JSON.parse(event.data);
  if (message.type === 'error') { fail(message.message || 'The session is unavailable.'); return; }
  if (message.type === 'expired') {
    if (Date.now() >= DEADLINE) expire();
    else fail('The relay ended this session early.');
    return;
  }
  if (message.type === 'joined') {
    if (identity || ![0, 1].includes(message.role) || !/^[a-f0-9]{32}$/.test(message.room)) throw new Error('Invalid session');
    role = message.role; room = message.room;
    identity = await makeIdentity(room, role);
    if (role === 0) {
      if (!/^[a-f0-9]{64}$/.test(message.invite)) throw new Error('Invalid invitation');
      $('invite-link').value = `${origin}/#${room}.${message.invite}`;
      $('share').hidden = false;
      describe('Invite the other person', 'Your check is ready. Send the link and keep this page open.');
    } else describe('Joining your check…', 'Keep this page open.');
  } else if (message.type === 'paired') {
    if (!identity || peerCommit) throw new Error('Invalid session state');
    $('share').hidden = true;
    describe('Securing your connection…', 'Your browsers are exchanging one-time keys.');
    sendPlain({ type: 'commit', value: identity.commitment });
    timer = setTimeout(() => fail('The connection setup timed out.'), 60000);
  } else if (message.type === 'commit') {
    if (!identity || peerCommit || !/^[a-f0-9]{64}$/.test(message.value)) throw new Error('Invalid commitment');
    peerCommit = message.value;
    sendPlain({ type: 'hello', value: identity.hello });
  } else if (message.type === 'hello') {
    if (!peerCommit || channel || await commitment(message.value) !== peerCommit) throw new Error('Connection verification failed');
    channel = await makeChannel(identity, message.value);
    identity = undefined;
    io = new BufferedIO(1 - role, (to, name, data) => {
      if (to !== 1 - role || !['a', 'b'].includes(name)) { fail('Invalid cryptographic channel.'); return; }
      // Keep relay packets bounded even when EMP emits a large block.
      for (let offset = 0; offset < data.length; offset += 65536) {
        const chunk = data.subarray(offset, offset + 65536);
        const packet = new Uint8Array(chunk.length + 1); packet[0] = name.charCodeAt(0); packet.set(chunk, 1);
        void sendEncrypted(packet);
      }
    });
    clearTimeout(timer);
    $('fingerprint').textContent = channel.fingerprint;
    $('verification').hidden = false;
    describe('Check your connection', 'You should both see exactly the same code.');
  } else throw new Error('Unexpected relay message');
}

async function connect() {
  if (Date.now() >= DEADLINE) { expire(); return; }
  if (!crypto.subtle || typeof Worker === 'undefined') { notice('Use a current desktop browser that supports Web Crypto and Web Workers.', true); return; }
  $('entry').hidden = true; $('session').hidden = false; notice('');
  try {
    sock = new WebSocket(`${RELAY_ORIGIN.replace(/^http/, 'ws')}/relay`);
    sock.binaryType = 'arraybuffer';
    describe('Connecting…', 'The relay may take a minute to wake up. Keep this page open.');
    timer = setTimeout(() => fail('The relay could not be reached.'), 90000);
    sock.onopen = () => {
      clearTimeout(timer);
      sendPlain(invitation ? { type: 'join', invitation } : { type: 'create' });
    };
    sock.onmessage = event => { incoming = incoming.then(() => receive(event)).catch(() => fail('The connection could not be verified.')); };
    sock.onerror = () => fail('The relay could not be reached.');
    sock.onclose = () => fail();
  } catch { fail('The relay could not be reached.'); }
}

$('online').onclick = connect;
$('local-start').onclick = connect;
$('load-invite').onclick = () => {
  try { setInvitation($('invite-input').value); notice('Invitation loaded. Choose download or continue above.'); }
  catch (error) { notice(error.message, true); }
};
$('copy-invite').onclick = async () => {
  try { await navigator.clipboard.writeText($('invite-link').value); $('copy-invite').textContent = 'Copied'; }
  catch { $('invite-link').select(); notice('Copy the selected link and send it privately.'); }
};
$('download').onclick = async () => {
  $('download').disabled = true;
  try {
    const response = await fetch(`${origin}/download`, { cache: 'no-store', credentials: 'omit' });
    if (!response.ok) throw new Error();
    let html = await response.text();
    if (invitation) html = html.replace('<meta name="invitation" content="">', `<meta name="invitation" content="${invitation}">`);
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    const a = document.createElement('a'); a.href = url; a.download = 'mutual-yes.html'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    notice('Downloaded. Open mutual-yes.html in a desktop browser. No installation needed.');
  } catch { notice('The download failed. Please try again.', true); }
  finally { $('download').disabled = false; }
};
$('verify').onclick = async () => {
  if (!channel || localVerified || ended) return;
  localVerified = true; $('verify').disabled = true; $('verify').textContent = 'Waiting for their confirmation…';
  try { await sendEncrypted(Uint8Array.of(1)); maybeVote(); } catch { fail(); }
};
$('vote').onsubmit = async event => {
  event.preventDefault();
  if (!localVerified || !peerVerified || localReady || ended) return;
  if (!$('vote').reportValidity()) return;
  answer = Number(new FormData($('vote')).get('answer'));
  if (answer !== 0 && answer !== 1) return;
  localReady = true; $('vote').hidden = true;
  describe('Your answer is locked', 'Waiting for the other person. Keep this page open.');
  try { await sendEncrypted(Uint8Array.of(2)); void maybeCompute(); } catch { fail(); }
};
$('restart-button').onclick = () => { location.hash = ''; location.reload(); };
window.addEventListener('beforeunload', event => { if (sock?.readyState === WebSocket.OPEN && !resultShown && !ended) { event.preventDefault(); event.returnValue = ''; } });
$('hosted-options').hidden = local; $('local-options').hidden = !local;
if (local) { $('mode').textContent = 'Downloaded copy'; $('entry-title').textContent = 'Start your private check'; }
try {
  const supplied = location.hash.slice(1) || document.querySelector('meta[name="invitation"]').content;
  if (supplied) setInvitation(supplied);
} catch (error) { notice(error.message, true); }
tick(); setInterval(tick, 1000);
