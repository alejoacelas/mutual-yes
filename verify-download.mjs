import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
if (!process.argv[2]) throw new Error('Usage: node verify-download.mjs /path/to/mutual-yes.html');
const canonical = await readFile('dist/index.html', 'utf8');
const downloaded = (await readFile(process.argv[2], 'utf8')).replace(/<meta name="invitation" content="(?:[a-f0-9]{32}\.[a-f0-9]{64})?">/, '<meta name="invitation" content="">');
assert.equal(createHash('sha256').update(downloaded).digest('hex'), createHash('sha256').update(canonical).digest('hex'), 'Downloaded file does not match this build');
console.log('The complete downloaded file matches this build, excluding its invitation.');
