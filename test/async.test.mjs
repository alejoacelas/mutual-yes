import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { random, credentials, digest, begin, advance, seal, open } from '../crypto.js';
import { startServer, fileStore } from '../server.mjs';
import { DEADLINE } from '../config.mjs';

const output = resolve('.test-output');
test('private comparison restores every round and rejects tampering', async () => {
  for (const [x,y] of [[0,0],[0,1],[1,0],[1,1]]) {
    const yes = await digest('yes');
    let a=begin(x?yes:random(),true), b=begin(y?yes:random(),false);
    const modified = a.reply.slice(0,-2)+(a.reply.endsWith('00')?'01':'00');
    assert.throws(()=>advance(b.saved,modified));
    b=advance(JSON.parse(JSON.stringify(b.saved)),a.reply);
    a=advance(JSON.parse(JSON.stringify(a.saved)),b.reply);
    b=advance(JSON.parse(JSON.stringify(b.saved)),a.reply);
    a=advance(JSON.parse(JSON.stringify(a.saved)),b.reply);
    assert.equal(a.result,!!(x&&y)); assert.equal(b.result,a.result);
  }
  const k=random(), ciphertext=await seal(k,{vote:1},'state:0');
  await assert.rejects(open(k,ciphertext,'state:1'));
  await assert.rejects(open(random(),ciphertext,'state:0'));
});

test('all outcomes finish over separate visits, including downloaded HTML', {timeout:180000}, async()=>{
  await mkdir(output,{recursive:true});
  const browser=await chromium.launch();
  try {
    for (const [x,y] of [[0,0],[0,1],[1,0],[1,1]]) {
      const seed=random(), keys=await credentials(seed,random());
      const dir=await mkdtemp(`${tmpdir()}/mutual-async-`);
      let app=await startServer({port:8080,roomId:keys.room,store:fileStore(dir)});
      const origin='http://localhost:8080';
      const contexts=await Promise.all([browser.newContext(),browser.newContext()]);
      const errors=[]; contexts.forEach(c=>c.on('page',p=>p.on('pageerror',e=>errors.push(e.message))));
      const urls=[`${origin}/#${seed}.0`,`${origin}/#${seed}.1`];
      try {
        // Vote in reverse order too: either participant may arrive first.
        for (const role of x===0?[1,0]:[0,1]) {
          let p=await contexts[role].newPage(); await p.goto(urls[role]);
          await p.locator('#yes:enabled').waitFor();
          assert.match(await p.locator('#status-title').innerText(), /Would you like/);
          if(role===1) {
            const download=p.waitForEvent('download'); await p.locator('#download').click();
            const file=resolve(output,`async-${x}-${y}.html`); await (await download).saveAs(file);
            assert((await readFile(file,'utf8')).includes(`${seed}.1.`));
            urls[role]=pathToFileURL(file).href; await p.close();
            // A completely fresh browser context resumes from the personal download.
            await contexts[role].close(); contexts[role]=await browser.newContext();
            p=await contexts[role].newPage(); await p.goto(urls[role]); await p.locator('#yes:enabled').waitFor();
          }
          await p.locator([x,y][role]?'#yes':'#no').click();
          await p.waitForFunction(()=>document.getElementById('status-title').textContent.startsWith('Saved.'));
          assert.match(await p.locator('#next').innerText(), /few short visits/);
          await p.close();
        }
        // Recreate the server: progress survives process restarts as well as closed tabs.
        await app.close(); app=await startServer({port:8080,roomId:keys.room,store:fileStore(dir)});
        const done=[false,false];
        for(let round=0;round<4 && !done.every(Boolean);round++) for(const role of [0,1]) {
          const p=await contexts[role].newPage(); await p.goto(urls[role]);
          await p.waitForFunction(()=> !document.getElementById('status-title').textContent.includes('Opening'));
          assert.equal(await p.locator('#choices').isVisible(),false,'never asks to vote again');
          const text=await p.locator('#status-title').innerText();
          if(['You both said yes','No further date'].includes(text)) {
            assert.equal(text,x&&y?'You both said yes':'No further date'); done[role]=true;
          }
          await p.close();
        }
        assert.deepEqual(done,[true,true]); assert.deepEqual(errors,[]);
      } finally { for(const c of contexts)await c.close(); await app.close(); }
    }
  } finally {await browser.close();}
});


test('saving failures remain explicit; returning after expiry shows rejection; mobile fits', {timeout:60000}, async()=>{
  const seed=random(), keys=await credentials(seed,random());
  const directory=await mkdtemp(`${tmpdir()}/mutual-ui-`);
  const app=await startServer({port:8080,roomId:keys.room,store:fileStore(directory)});
  const browser=await chromium.launch();
  try {
    const page=await browser.newPage({viewport:{width:390,height:844}});
    let failWrite=true;
    await page.route('**/api/mailbox',async route=>{
      if(failWrite && route.request().postDataJSON().update){failWrite=false; await route.abort();}
      else await route.continue();
    });
    await page.goto(`http://localhost:8080/#${seed}.0`); await page.locator('#yes:enabled').waitFor();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.screenshot({path:resolve(output,'async-mobile.png'),fullPage:true});
    await page.locator('#yes').click();
    await page.waitForFunction(()=>document.getElementById('status-title').textContent==='Saving is not confirmed');
    assert.match(await page.locator('#error').innerText(),/Do not close/);
    await page.locator('#check').click();
    await page.waitForFunction(()=>document.getElementById('status-title').textContent.startsWith('Saved.'));
    await page.screenshot({path:resolve(output,'async-saved.png'),fullPage:true});
    await page.close();
    const expired=await browser.newPage();
    await expired.route('**/api/mailbox',async route=>{
      const response=await route.fetch(); const json=await response.json(); json.serverTime=DEADLINE+10000;
      await route.fulfill({response,json});
    });
    await expired.goto(`http://localhost:8080/#${seed}.1`);
    await expired.waitForFunction(()=>document.getElementById('status-title').textContent==='No further date');
    assert.equal(await expired.locator('#choices').isVisible(),false);
  }finally{await browser.close();await app.close();}
});
