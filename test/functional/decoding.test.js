/*
Response bodies the fixture server does not serve, answered by a fetch that returns the given bytes with no Content-Encoding
header (so the library's own sniffing decodes them, as 1.1.7's zlib.unzip did). The Phase 3 review found the trailing-bytes
case: zlib.unzip ignored some bytes after the compressed data, and DecompressionStream did not.
*/
import assert from 'node:assert/strict';
import {Buffer} from 'node:buffer';
import zlib from 'node:zlib';
import {after, before, test} from 'node:test';
import {builds} from '../helpers/builds.js';

let body;
let original;

before(() => {
  original = fetch;
  globalThis.fetch = async () => new Response(body, {status: 200});
});

after(() => {
  globalThis.fetch = original;
});

const json = markdown => JSON.stringify({items: [{body_markdown: markdown}]});

async function answer(lib, bytes) {
  body = bytes;
  try {
    return await lib.retrieveMarkdown({entityId: 1});
  } catch {
    return 'error';
  }
}

for (const {name, lib} of builds) {
  test(`${name}: compressed bodies decode as 1.1.7 decoded them, trailing bytes included`, async () => {
    // What 1.1.7's zlib.unzip answered for these bytes on Node 24.18.0 (checked 2026-09-26). Two cases are left out because
    // DecompressionStream answers them differently on different Node lines, so no build can promise one answer: gzip followed
    // by other bytes (zlib fails; Node 24.18 fails, Node 26 ignores them) and two gzip members (zlib reads both; Node 24.18
    // reads both, Node 24.21 and 26 stop after the first). The API sends one gzip member with nothing after it.
    const markdown = 'héllo 😀';
    const text = json(markdown);
    const gzip = zlib.gzipSync(text);
    const deflate = zlib.deflateSync(text);
    for (const [label, bytes, expected] of [
      ['gzip', gzip, markdown],
      ['gzip followed by zero bytes', Buffer.concat([gzip, Buffer.alloc(10)]), markdown],
      ['zlib', deflate, markdown],
      ['zlib followed by junk', Buffer.concat([deflate, Buffer.from('zz')]), markdown],
      ['gzip cut short', gzip.subarray(0, -12), 'error'],
      ['zlib cut short', deflate.subarray(0, 12), 'error'],
    ]) {
      assert.equal(await answer(lib, bytes), expected, label);
    }
  });

  test(`${name}: a body that fails to decompress says so`, async () => {
    const gzip = zlib.gzipSync(json('x'));
    body = gzip.subarray(0, 20);
    await assert.rejects(lib.retrieveMarkdown({entityId: 1}), {name: 'StackExchangeError', message: 'The response could not be decompressed (gzip)'});
  });

  test(`${name}: a compressed body that expands past 64 MiB is refused`, async () => {
    body = zlib.gzipSync(Buffer.alloc((64 * 1024 * 1024) + 1));
    await assert.rejects(lib.retrieveMarkdown({entityId: 1}), {name: 'StackExchangeError', message: 'The decompressed response is larger than 67108864 bytes'});
  });
}
