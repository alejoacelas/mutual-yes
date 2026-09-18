// Run only against a deployment explicitly configured for this fresh test room.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const {seed}=JSON.parse(await readFile('.private-test.json','utf8'));
const origin=process.env.TEST_ORIGIN || 'https://mutual-yes-async-alejo.vercel.app';
const browser=await chromium.launch();
const contexts=await Promise.all([browser.newContext(),browser.newContext()]);
const urls=[0,1].map(r=>`${origin}/#${seed}.${r}`);
try {
  await mkdir('.test-output',{recursive:true});
  for(const role of [0,1]) {
    const p=await contexts[role].newPage(); await p.goto(urls[role]);
    await p.locator('#yes:enabled').waitFor();
    if(role===1){
      const download=p.waitForEvent('download');await p.locator('#download').click();
      const file=resolve('.test-output/async-live.html');await(await download).saveAs(file);
      urls[role]=pathToFileURL(file).href;await p.goto(urls[role]);await p.locator('#yes:enabled').waitFor();
    }
    await p.locator('#yes').click();
    await p.waitForFunction(()=>document.getElementById('status-title').textContent.startsWith('Saved.'),{timeout:60000});
    await p.close();
  }
  const done=[false,false];
  for(let round=0;round<5&&!done.every(Boolean);round++)for(const role of [0,1]){
    const p=await contexts[role].newPage();await p.goto(urls[role]);
    await p.waitForFunction(()=>!document.getElementById('status-title').textContent.includes('Opening'));
    assert.equal(await p.locator('#choices').isVisible(),false);
    const text=await p.locator('#status-title').innerText();
    assert(!text.includes('No further date'));
    done[role]=text==='You both said yes';
    await p.close();
  }
  assert.deepEqual(done,[true,true]); console.log('LIVE PASS: separate visits, downloaded client, both results.');
} finally {await browser.close();}
