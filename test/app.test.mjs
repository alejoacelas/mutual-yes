import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { makeIdentity, makeChannel } from '../channel.js';
import { DEADLINE } from '../config.mjs';

const origin = process.env.TEST_ORIGIN || 'http://localhost:8080';
const output = resolve('.test-output');

test('channel authenticates peers and rejects tampering and replay', async () => {
  const identities = await Promise.all([0, 1].map(role => makeIdentity('a'.repeat(32), role)));
  const [a, b] = await Promise.all([makeChannel(identities[0], identities[1].hello), makeChannel(identities[1], identities[0].hello)]);
  assert.equal(a.fingerprint, b.fingerprint);
  const packet = await a.seal(Uint8Array.of(1, 2, 3));
  const bad = packet.slice(); bad[bad.length - 1] ^= 1;
  await assert.rejects(b.open(bad));
  assert.deepEqual(await b.open(packet), Uint8Array.of(1, 2, 3));
  await assert.rejects(b.open(packet));
  const reply = await b.seal(Uint8Array.of(7));
  await assert.rejects(b.open(reply));
  assert.deepEqual(await a.open(reply), Uint8Array.of(7));
  await assert.rejects(makeChannel(identities[0], { ...identities[1].hello, room: 'b'.repeat(32) }));
  await assert.rejects(makeChannel(identities[0], { ...identities[1].hello, role: 0 }));
});

test('hosted and downloaded browsers complete all four real MPC outcomes', { timeout: 180000 }, async () => {
  await mkdir(output, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    for (const [left, right] of [[0, 0], [0, 1], [1, 0], [1, 1]]) {
      const a = await browser.newPage(), b = await browser.newPage();
      await a.addInitScript(() => {
        const NativeSocket = window.WebSocket;
        window.WebSocket = class extends NativeSocket {
          constructor(...args) {
            super(...args);
            this.addEventListener('message', event => {
              if (!window.holdReceipts) return;
              event.stopImmediatePropagation();
              window.releaseReceipt = () => {
                window.holdReceipts = false;
                this.dispatchEvent(new MessageEvent('message', { data: event.data }));
              };
            });
          }
        };
      });
      const errors = [], requests = [];
      for (const page of [a, b]) {
        page.on('pageerror', e => errors.push(e.message));
        page.on('request', r => requests.push(r.url()));
      }
      await a.goto(origin);
      if (left === 0) {
        const downloadEvent = a.waitForEvent('download');
        await a.locator('#download').click();
        const download = await downloadEvent;
        const file = resolve(output, `host-${left}-${right}.html`);
        await download.saveAs(file);
        await a.goto(pathToFileURL(file).href);
        await a.locator('#local-start').click();
      } else await a.locator('#online').click();
      await a.locator('#invite-link').waitFor({ state: 'visible' });
      const invite = await a.locator('#invite-link').inputValue();
      await b.goto(invite);
      const downloadEvent = b.waitForEvent('download');
      await b.locator('#download').click();
      const download = await downloadEvent;
      const file = resolve(output, `guest-${left}-${right}.html`);
      await download.saveAs(file);
      const html = await readFile(file, 'utf8');
      assert(html.includes(invite.split('#')[1]), 'download preserves invitation');
      await b.goto(pathToFileURL(file).href);
      await b.locator('#local-start').click();
      for (const page of [a, b]) await page.locator('#fingerprint').waitFor({ state: 'visible' });
      assert.equal(await a.locator('#fingerprint').innerText(), await b.locator('#fingerprint').innerText());
      assert.equal(await a.locator('#vote').isVisible(), false);
      await a.locator('#verify').click();
      assert.equal(await a.locator('#vote').isVisible(), false);
      await b.locator('#verify').click();
      for (const [page, answer] of [[a, left], [b, right]]) {
        await page.locator('#vote').waitFor({ state: 'visible' });
        assert.equal(await page.locator('input[name=answer]:checked').count(), 0);
        await page.locator(`input[value="${answer}"]`).check();
        await page.locator('#understand').check();
        if (page === a) await a.evaluate(() => { window.holdReceipts = true; });
        await page.locator('#confirm').click();
        if (page === a) {
          await a.waitForFunction(() => typeof window.releaseReceipt === 'function');
          assert.match(await a.locator('#receipt').innerText(), /Waiting for an encrypted receipt/);
          assert.equal(await a.locator('#result').isVisible(), false);
          await a.evaluate(() => window.releaseReceipt());
          await a.waitForFunction(() => document.getElementById('receipt').textContent.startsWith('Confirmation received.'));
          assert.equal(await b.locator('input[name=answer]:checked').count(), 0, 'receipt does not require peer vote');
        }
      }
      for (const page of [a, b]) {
        await page.locator('#result').waitFor({ state: 'visible', timeout: 60000 });
        assert.match(await page.locator('#receipt').textContent(), /^Confirmation received\./);
        assert.equal(await page.locator('#result-title').innerText(), left && right ? 'You both said yes' : 'No mutual yes');
      }
      assert.deepEqual(errors, []);
      const external = requests.filter(url => !url.startsWith(origin) && !/^(file|blob|data):/.test(url));
      assert.deepEqual(external, [], 'no external code or analytics requests');
      await a.screenshot({ path: resolve(output, `result-${left}-${right}.png`), fullPage: true });
      await a.close(); await b.close();
    }
  } finally { await browser.close(); }
});

test('deadline, download copy, mobile layout and disconnect do not imply a submitted no', { timeout: 120000 }, async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const a = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await a.goto(origin);
    await a.screenshot({ path: resolve(output, 'mobile.png'), fullPage: true });
    assert.equal(await a.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const before = await a.locator('#countdown').innerText();
    await a.waitForTimeout(1100);
    assert.notEqual(await a.locator('#countdown').innerText(), before);
    await a.locator('#online').click();
    await a.locator('#invite-link').waitFor({ state: 'visible' });
    const invite = await a.locator('#invite-link').inputValue();
    const b = await browser.newPage(); await b.goto(invite); await b.locator('#online').click();
    await a.locator('#verification').waitFor({ state: 'visible' });
    await b.close();
    await a.locator('#restart').waitFor({ state: 'visible', timeout: 60000 });
    assert.equal(await a.locator('#result').isVisible(), false);
    assert.match(await a.locator('#notice').innerText(), /does not count as a no before the deadline/);
    await a.clock.setFixedTime(new Date(DEADLINE + 1));
    await a.locator('#result').waitFor({ state: 'visible' });
    assert.equal(await a.locator('#result-title').innerText(), 'No further date');
    assert.match(await a.locator('#result-description').innerText(), /unfinished check counts as a no/);
    assert.equal(await a.locator('#restart').isVisible(), false);
    const c = await browser.newPage(); await c.clock.setFixedTime(new Date(DEADLINE + 1)); await c.goto(origin);
    assert.equal(await c.locator('#entry').isVisible(), false);
    assert.equal(await c.locator('#result-title').innerText(), 'No further date');
  } finally { await browser.close(); }
});
