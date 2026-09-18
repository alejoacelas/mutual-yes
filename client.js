import { credentials, random, seal, open } from './crypto.js';
import { emptyState, processVisit } from './progress.js';
import { DEADLINE } from './config.mjs';
const $ = id => document.getElementById(id);
const local = location.protocol === 'file:';
let keys, role, seed, vault, state = emptyState(), busy = false, pendingVote = null, clockOffset = 0, finalized = false;
const origin = PUBLIC_ORIGIN;
const storageKey = () => `mutual-yes-async:${seed}:${role}`;
function heading(title, text) { $('status-title').textContent = title; $('status-text').textContent = text; }
function error(text) { $('error').textContent = text; $('error').hidden = !text; }
function showResult(value, expired = false) {
  finalized = true;
  $('choices').hidden = true; $('receipt').hidden = true; $('check').hidden = true;
  heading(value ? 'You both said yes' : 'No further date', expired ? 'The deadline passed before the private check finished. As agreed, that counts as a no. It does not identify anyone’s answer.' : value ? 'You both chose another date.' : 'There was no mutual yes. No individual answer is shown.');
  $('next').hidden = true;
}
function render() {
  $('choices').hidden = !!state.secret;
  $('check').hidden = !state.secret;
  $('download').textContent = state.secret ? 'Save personal HTML' : 'Download HTML instead';
  $('next').hidden = false;
  if (state.result !== null) { showResult(state.result); return; }
  if (state.secret) {
    heading('Saved. You can close this page.', 'Your answer is locked and saved privately. You will not need to vote again.');
    $('next').textContent = 'Reopen this same link in this browser later today, and again before Sunday’s deadline. Each visit automatically advances the private check. It may take a few short visits from each of you; you don’t need to be online together.';
    $('receipt').hidden = false;
    $('receipt').textContent = state.receipt ? 'Encrypted receipt: the other browser received your confirmation.' : 'Saved on the server. The other browser will acknowledge your confirmation when it next visits.';
  } else {
    heading('Would you like another date?', 'Tap Yes or No once. Your answer locks when it is saved.');
    $('next').textContent = 'After “Saved” appears, you can close this page. Come back later to continue the private check and see the result.';
  }
}
async function request(extra = {}) {
  const response = await fetch(`${origin}/api/mailbox`, { method: 'POST', cache: 'no-store', credentials: 'omit', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ room: keys.room, auth: keys.auth, owner: keys.owner, role, ...extra }), signal: AbortSignal.timeout(30000) });
  const data = await response.json();
  if (!response.ok) { const e = Error(data.error || 'Could not save progress.'); e.status = response.status; throw e; }
  return data;
}
function checkpoint(version, ciphertext) {
  localStorage.setItem(storageKey(), JSON.stringify({ vault, version, ciphertext }));

}
async function sync(vote = null) {
  if (busy || !keys) return;
  if (vote !== null) pendingVote = vote;
  busy = true; error('');
  for (const button of [$('yes'), $('no'), $('check')]) button.disabled = true;
  if (pendingVote !== null) heading('Saving your answer…', 'Keep this page open until “Saved” appears.');
  try {
    for (let attempt = 0; attempt < 4; attempt++) {
      const saved = await request();
      clockOffset = saved.serverTime - Date.now();
      const localVersion = JSON.parse(localStorage.getItem(storageKey()) || '{}').version || 0;
      if (saved.version < localVersion) throw Error('Saved progress is older than this browser remembers. Please try again later.');
      state = saved.vault ? await open(vault, saved.vault, `${keys.room}:vault:${role}:${saved.version}`) : emptyState();
      if (state.secret) pendingVote = null;
      const expired = Date.now() + clockOffset >= DEADLINE;
      const progress = await processVisit(state, expired ? null : pendingVote, saved.messages, keys, role);
      if (expired) {
        // A final message saved before closure can be read later without another write.
        const result = progress.messages.length === saved.messages[role].length ? progress.state.result : state.result;
        showResult(result === true, result === null); break;
      }
      if (progress.changed) {
        const version = saved.version + 1;
        const encrypted = await seal(vault, progress.state, `${keys.room}:vault:${role}:${version}`);
        try { await request({ version: saved.version, update: { vault: encrypted, messages: progress.messages } }); }
        catch (e) { if (e.status === 409 && attempt < 3) continue; throw e; }
        state = progress.state; checkpoint(version, encrypted); pendingVote = null;
      } else if (saved.version) checkpoint(saved.version, saved.vault);
      render(); break;
    }
  } catch (e) {
    if (Date.now() + clockOffset >= DEADLINE) { showResult(state.result === true, state.result === null); return; }
    if (e.status === 403) { $('choices').hidden = true; $('download-section').hidden = true; heading('Open your saved copy', 'Use the browser you previously used, or your personal HTML download.'); }
    error(e.status === 403 ? e.message : `Could not confirm saved progress. ${state.secret ? 'Your saved answer has not been changed.' : 'Do not close until saving is confirmed.'} Press Check again.`);
    $('check').hidden = false;
    if (pendingVote !== null) heading('Saving is not confirmed', 'Your choice is still here. Press Check again to retry.');
  } finally {
    busy = false;
    for (const button of [$('yes'), $('no'), $('check')]) button.disabled = false;
  }
}
function tick() {
  const n = Math.max(0, Math.ceil((DEADLINE - Date.now() - clockOffset) / 1000));
  if (!n && keys && !busy && !finalized) void sync();
  $('countdown').textContent = n ? `${Math.floor(n / 86400)}d ${String(Math.floor(n / 3600) % 24).padStart(2, '0')}h ${String(Math.floor(n / 60) % 60).padStart(2, '0')}m ${String(n % 60).padStart(2, '0')}s` : 'Deadline passed';
}
$('yes').onclick = () => sync(1); $('no').onclick = () => sync(0); $('check').onclick = () => sync();
$('download').onclick = async () => {
  $('download').disabled = true;
  try {
    const response = await fetch(`${origin}/download`, { credentials: 'omit', cache: 'no-store' });
    if (!response.ok) throw Error('Download failed.');
    let html = await response.text();
    html = html.replace('<meta name="invitation" content="">', `<meta name="invitation" content="${seed}.${role}.${vault}">`);
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    const link = document.createElement('a'); link.href = url; link.download = 'mutual-yes.html'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    $('download-note').textContent = 'Downloaded. Open mutual-yes.html in a desktop browser. This personal file can also reopen your saved progress; keep it private.';
  } catch { error('Download failed. Please try again.'); }
  finally { $('download').disabled = false; }
};
async function start() {
  tick(); setInterval(tick, 1000);
  try {
    const invitation = location.hash.slice(1) || document.querySelector('meta[name=invitation]').content;
    const match = /^([a-f0-9]{64})\.([01])(?:\.([a-f0-9]{64}))?$/.exec(invitation);
    if (!match) {
      heading('Open your personal link', 'Use the private link you were given. It takes you straight to Yes or No, and brings you back to your saved progress.');
      $('choices').hidden = true; $('download-section').hidden = true; $('next').hidden = true; return;
    }
    seed = match[1]; role = Number(match[2]);
    const stored = JSON.parse(localStorage.getItem(storageKey()) || '{}');
    vault = match[3] || stored.vault || random();
    if (stored.vault && stored.vault !== vault && stored.version > 0) throw Error('This file belongs to a different saved visit. Open it in another browser.');
    localStorage.setItem(storageKey(), JSON.stringify({ vault, version: stored.version || 0, ciphertext: stored.ciphertext }));
    if (!local && location.hash) history.replaceState(null, '', role === 0 ? '/boy' : '/girl');
    keys = await credentials(seed, vault);
    if (stored.ciphertext) state = await open(vault, stored.ciphertext, `${keys.room}:vault:${role}:${stored.version}`);
    $('download').hidden = local;
    $('download-note').textContent = local ? 'This is your saved HTML copy. It still needs the internet to load and save encrypted progress.' : 'Optional: a saved HTML file keeps a fixed copy of the code. It still needs the internet. Downloading does not prove the original code is safe.';
    await sync();
    setInterval(() => { if (!document.hidden && !finalized) void sync(); }, 15000);
    window.addEventListener('focus', () => { if (!finalized) void sync(); });
  } catch (e) {
    heading('Could not open your private check', 'Allow this browser to save site data, then reload. Use the browser you previously voted in, or your personal HTML download.');
    $('choices').hidden = true; error(e.message);
  }
}
window.addEventListener('beforeunload', event => {
  if (busy && pendingVote !== null) { event.preventDefault(); event.returnValue = ''; }
});
void start();
