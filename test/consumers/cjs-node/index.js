// A consumer written in CommonJS: require() of the installed package, used exactly as 1.1.7's README showed it (plan D2).
// Its argument is the base URL of the fixture server the runner started; fetch is replaced with one that sends the package's
// https://api.stackexchange.com requests there.
'use strict';

const assert = require('node:assert/strict');
const process = require('node:process');
const stackExchangeMarkdownRetriever = require('stack-exchange-markdown-retriever');
// Destructuring, the named-import habit in CommonJS.
const {retrieveMarkdown, StackExchangeError} = require('stack-exchange-markdown-retriever');

const base = process.argv[2];
const realFetch = fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(String(input));
  assert.equal(url.origin, 'https://api.stackexchange.com');
  return realFetch(`${base}${url.pathname}${url.search}`, init);
};

assert.match(require.resolve('stack-exchange-markdown-retriever'), /[/\\]dist[/\\]index\.cjs$/u, 'require resolves to the CommonJS build');
assert.equal(typeof stackExchangeMarkdownRetriever.retrieveMarkdown, 'function');
assert.equal(stackExchangeMarkdownRetriever.default.retrieveMarkdown, retrieveMarkdown);
assert.equal(typeof StackExchangeError, 'function');

assert.throws(() => {
  retrieveMarkdown({site: 'scifi.stackexchange.com'}, () => {});
}, {message: 'Need an entity id to read'});

// The old README's call.
const options = {
  site: 'scifi.stackexchange.com',
  entityId: 127_968,
};

stackExchangeMarkdownRetriever.retrieveMarkdown(options, (markdown, error) => {
  assert.equal(error, null);
  assert.match(markdown, /^Why is the \*\*question\*\*/u);
  stackExchangeMarkdownRetriever.retrieveMarkdown({entityId: 9001}, (missing, apiError) => {
    assert.equal(missing, null);
    assert.ok(apiError instanceof StackExchangeError);
    console.log('cjs-node ok');
  });
});
