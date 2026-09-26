/*
Live smoke test against the real Stack Exchange API: two requests (the question and the answer 1.x's own tests used). Opt-in:
it runs under `npm run test:live` or with LIVE_TESTS=1, never in `npm test`, because the API's anonymous quota is 300
requests a day per IP address and a post can be edited or deleted. live.yml runs it weekly.
*/
import assert from 'node:assert/strict';
import process from 'node:process';
import {test} from 'node:test';
import {retrieveMarkdown} from '../../dist/index.mjs';

const isEnabled = process.env.LIVE_TESTS === '1' || process.env.npm_lifecycle_event === 'test:live';
const skip = isEnabled ? false : 'live tests are opt-in: npm run test:live, or LIVE_TESTS=1';

test('live: a question on scifi.stackexchange.com has markdown', {skip}, async () => {
  const markdown = await retrieveMarkdown({site: 'scifi.stackexchange.com', entityId: 127_968, timeout: 20_000});
  assert.equal(typeof markdown, 'string');
  assert.ok(markdown.length > 0);
});

test('live: an answer on scifi.stackexchange.com has markdown', {skip}, async () => {
  const markdown = await retrieveMarkdown({
    site: 'scifi.stackexchange.com', entityId: 1010, isForAnswer: true, timeout: 20_000,
  });
  assert.equal(typeof markdown, 'string');
  assert.ok(markdown.length > 0);
});
