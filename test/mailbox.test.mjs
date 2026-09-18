import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { startServer, fileStore } from '../server.mjs';
import { credentials, random, seal } from '../crypto.js';

test('mailbox persists, binds owners, rejects concurrent updates and freezes at deadline', async()=>{
  const keys=await credentials(random(),random());
  const directory=await mkdtemp(`${tmpdir()}/mutual-mailbox-`), store=fileStore(directory);
  let app=await startServer({port:0,roomId:keys.room,store,deadline:Date.now()+60000});
  const request=async(body={})=>fetch(`http://localhost:${app.server.address().port}/api/mailbox`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({room:keys.room,auth:keys.auth,owner:keys.owner,role:0,...body})});
  try {
    const ciphertext=await seal(keys.vault,{secret:'test'},'test');
    const update={vault:ciphertext,messages:[ciphertext]};
    assert.equal((await request({auth:random()})).status,403);
    const results=await Promise.all([request({version:0,update}),request({version:0,update})]);
    assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
    assert.equal((await request({owner:random()})).status,403);
    assert.equal((await request({version:1,update:{vault:ciphertext,messages:[]}})).status,409);
    await app.close();
    app=await startServer({port:0,roomId:keys.room,store:fileStore(directory),deadline:Date.now()-1});
    const restored=await (await request()).json(); assert.equal(restored.version,1); assert.equal(restored.vault,ciphertext);
    assert.equal((await request({version:1,update})).status,410);
  }finally{await app.close();}
});
