// A consumer written as an ES module: default and named imports of the installed package. Runs under Node, Bun and Deno.
// Its argument is the base URL of the fixture server the runner started (test/golden/fixture-server.cjs); fetch is replaced
// with one that sends the package's https://api.stackexchange.com requests there, through this runtime's own fetch.
import assert from 'node:assert/strict';
import process from 'node:process';
import retriever, {retrieveMarkdown, StackExchangeError} from 'stack-exchange-markdown-retriever';

const base = process.argv[2];
const realFetch = fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(String(input));
  assert.equal(url.origin, 'https://api.stackexchange.com');
  return realFetch(`${base}${url.pathname}${url.search}`, init);
};

assert.equal(typeof retrieveMarkdown, 'function');
assert.equal(retriever.retrieveMarkdown, retrieveMarkdown, 'the default export holds the named export');
if (typeof import.meta.resolve === 'function') {
  assert.match(import.meta.resolve('stack-exchange-markdown-retriever'), /\/dist\/index\.mjs$/u, 'import resolves to the ESM build');
}

assert.equal(await retrieveMarkdown({entityId: 1}), 'Question one.');
assert.match(await retrieveMarkdown({entityId: 1010, isForAnswer: true, site: 'scifi'}), /^The answer is \[42\]/u);
assert.equal(await retrieveMarkdown({entityId: 404}), null);
assert.equal(await retrieveMarkdown({entityId: 9006}), 'gzip without the header');
await assert.rejects(retrieveMarkdown({entityId: 9001}), StackExchangeError);
await assert.rejects(retrieveMarkdown({entityId: 9011, timeout: 200}), {name: 'TimeoutError'});
await assert.rejects(retrieveMarkdown({entityId: 'abc'}), TypeError);

// The callback form: (markdown, err), always asynchronous.
let isReturned = false;
const [markdown, error] = await new Promise(resolve => {
  retriever.retrieveMarkdown({entityId: 2}, (...arguments_) => {
    assert.ok(isReturned, 'the callback runs after retrieveMarkdown returns');
    resolve(arguments_);
  });
  isReturned = true;
});
assert.equal(markdown, 'Question two.');
assert.equal(error, null);

console.log('esm-node ok');
