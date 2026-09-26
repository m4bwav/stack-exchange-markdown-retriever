/*
The golden suite: the contract with the published 1.1.7. test/golden/1.1.7.json was captured from the published 1.1.7 by
capture-1.1.7.cjs in a scratch project, with codec.cjs, against fixture-server.cjs (which this suite starts too); never
regenerate it from this repository's code, and never loosen a comparison.

For every captured case, both builds must throw what 1.1.7 threw, or call the callback exactly once, asynchronously, with
1.1.7's markdown argument and an error where 1.1.7 had one, after the same requests (method, path and query). 1.1.7's plain
Error from the API's error_message becomes a StackExchangeError with the same message; its other errors (a TypeError reading
toString, a SyntaxError, a socket error) become the new errors their cause produces, which is the one general exception
("errors are typed", CHANGELOG: Changed). The cases 2.0.0 answers differently on purpose are the named exceptions below, one per
changelog line (plan D1 and D3, items 3 to 8 of "What the old version gets wrong"). The Promise form must give the same answer
as the callback form for every case with one callback.
*/
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import process from 'node:process';
import {
  after,
  before,
  describe,
  test,
} from 'node:test';
import {fileURLToPath} from 'node:url';
import {installFetch} from '../helpers/api.js';
import {builds} from '../helpers/builds.js';

const load = createRequire(import.meta.url);
const {decode, encode} = load('./codec.cjs');
const fixtures = load('./fixture-server.cjs');

const golden = JSON.parse(readFileSync(new URL('1.1.7.json', import.meta.url), 'utf8'));

// Long enough for a second callback or a late request to show up on the local loop.
const SETTLE_MS = 50;
const MAX_WAIT_MS = 10_000;

const TYPE_ERROR = 'TypeError';
const NO_REQUEST = [];

/*
Each exception names its changelog line and lists the cases it covers by the capture's own case names, then says what 2.0.0
does instead. `throws` means the call throws that error class and calls nothing back; `requests` replaces the request list;
`calls` replaces the callback calls; `promise` means the call returns a Promise instead of calling back; `child` runs the case
in its own process because its callback throws.
*/
const INVALID_ID = {throws: TYPE_ERROR, requests: NO_REQUEST};
const EXCEPTIONS = [
  {
    name: 'an entityId that is not a post id (or a ;-joined list of them) throws a TypeError before any request (CHANGELOG: Security)',
    cases: Object.fromEntries([
      'ids as an array',
      'entityId negative',
      'entityId a fraction',
      'entityId 1e21',
      'entityId Infinity',
      'entityId true',
      'entityId an object',
      'entityId letters',
      'entityId with a space',
      'entityId with surrounding spaces',
      'entityId with dot segments',
      'entityId with a slash',
      'entityId with a question mark',
      'entityId with a hash',
      'entityId with a percent sign',
      'entityId with a backslash',
      'entityId an emoji (request refuses the path, no request)',
    ].map(name => [name, INVALID_ID])),
  },
  {
    name: 'called without a callback, retrieveMarkdown returns a Promise (CHANGELOG: Added)',
    // 1.1.7 made the request, then crashed with "callback is not a function".
    cases: {'no callback': {promise: 'Question one.'}, 'callback null': {promise: 'Question one.'}},
  },
  {
    name: 'without a callback, an argument error rejects the returned Promise instead of throwing (CHANGELOG: Added, with the Promise form)',
    cases: {'no arguments': {rejects: TYPE_ERROR}},
  },
  {
    name: 'a callback that is not a function throws a TypeError before any request (CHANGELOG: Changed)',
    cases: {'callback a string': {throws: TYPE_ERROR, requests: NO_REQUEST}},
  },
  {
    name: 'the callback is called once, even when it throws; its exception is still uncaught (CHANGELOG: Fixed)',
    cases: {
      'callback that throws': {child: true, calls: [['Question one.', null]]},
      'callback that throws, on an API error': {child: true},
    },
  },
  {
    name: 'a response that is plain JSON (a proxy that decompressed it) is read (CHANGELOG: Fixed)',
    cases: {'plain JSON body, no Content-Encoding': {calls: [['plain', null]]}},
  },
];

const exceptionFor = entry => {
  for (const exception of EXCEPTIONS) {
    if (Object.hasOwn(exception.cases, entry.name)) {
      return exception.cases[entry.name];
    }
  }

  return undefined;
};

test('every exception names a captured case', () => {
  const names = new Set(golden.cases.map(entry => entry.name));
  for (const exception of EXCEPTIONS) {
    for (const name of Object.keys(exception.cases)) {
      assert.ok(names.has(name), `${exception.name}: no captured case "${name}"`);
    }
  }
});

const summariseBody = text => (typeof text === 'string' && text.length > 2000 ? {$long: text.length, start: text.slice(0, 80), end: text.slice(-80)} : text);
const describeError = error => (error instanceof Error ? {$error: error.name, message: error.message} : error);

// The request lines 1.1.7 sent, without the proxy's CONNECT.
const oldRequestLines = entry => entry.requests.filter(request => request.method !== 'CONNECT').map(request => `${request.method} ${request.path}`);

function assertError(actual, expected, label) {
  // 1.1.7's error from the API's error_message was a plain Error with that message; 2.0.0 keeps the message on a StackExchangeError.
  assert.ok(actual && typeof actual === 'object' && typeof actual.$error === 'string', `${label}: an error`);
  if (expected.$error === 'Error' && expected.code === undefined) {
    assert.equal(actual.$error, 'StackExchangeError', label);
    assert.equal(actual.message, expected.message, label);
  }
}

function assertCalls(actual, expected, label) {
  assert.equal(actual.length, expected.length, `${label}: number of callback calls`);
  for (const [index, call] of expected.entries()) {
    const [markdown, error] = Array.isArray(call) ? call : decode(call.args);
    const [actualMarkdown, actualError] = actual[index];
    assert.deepEqual(actualMarkdown, markdown, `${label}: markdown`);
    if (error === null || error === undefined) {
      assert.equal(actualError, null, `${label}: no error`);
    } else {
      assertError(actualError, error.$error ? error : call.args[1], label);
    }
  }
}

let server;
let api;

before(async () => {
  server = await fixtures.start();
  api = installFetch(server);
});

after(async () => {
  api.restore();
  await server.close();
});

const sleep = ms => new Promise(resolve => {
  setTimeout(resolve, ms);
});

const decodeArguments = entry => decode(entry.args);

async function runCallbackCase(lib, entry, change) {
  const record = {calls: [], threw: undefined};
  let returnedYet = false;
  let recording = true;
  const callback = (markdown, error) => {
    if (recording) {
      record.calls.push({sync: !returnedYet, value: [summariseBody(markdown), describeError(error)]});
    }
  };

  const args = decodeArguments(entry).map(value => (value && typeof value === 'object' && value.$callback === true ? callback : value));
  const hangs = entry.name.startsWith('server never answers');
  // The hanging request gets a server of its own on a new port, so fetch opens a new connection: in a full run a pooled one
  // to the shared server was closed under it ("other side closed") a second later instead of hanging.
  const target = hangs ? await fixtures.start() : server;
  api.server = target;
  const before = target.requests.length;
  const started = Date.now();
  try {
    lib.retrieveMarkdown(...args);
  } catch (error) {
    record.threw = error;
  }

  returnedYet = true;
  const maxWait = hangs ? 3000 : MAX_WAIT_MS;
  while (record.calls.length === 0 && !record.threw && Date.now() - started < maxWait) {
    await sleep(10);
  }

  await sleep(SETTLE_MS);
  recording = false;
  const requests = target.requests.slice(before).map(request => `${request.method} ${request.path}`);
  api.server = server;
  if (hangs) {
    await target.close();
  }

  server.dropConnections();
  // fetch can otherwise send the next case's request on a pooled socket that was just destroyed.
  await sleep(30);
  return {record, requests, change};
}

function runChild(buildName, options) {
  // --import takes a URL: a Windows path's drive letter would read as a scheme.
  const preload = new URL('../helpers/cli-preload.mjs', import.meta.url).href;
  const child = fileURLToPath(new URL('../helpers/child-case.mjs', import.meta.url));
  return new Promise((resolve, reject) => {
    execFile(process.execPath, ['--import', preload, child, buildName, JSON.stringify(options)], {env: {...process.env, FIXTURE_BASE: server.base}}, (error, stdout) => {
      if (error) {
        reject(error);
      } else {
        resolve(JSON.parse(stdout));
      }
    });
  });
}

for (const {name: buildName, lib} of builds) {
  describe(`golden 1.1.7 (${buildName})`, () => {
    for (const entry of golden.cases) {
      const change = exceptionFor(entry);
      test(entry.name, async () => {
        api.mode = entry.name.startsWith('proxy refuses') ? 'refuse' : (entry.name.startsWith('connection dropped') ? 'hangup' : 'tunnel');
        try {
          if (change?.child) {
            const [options] = decodeArguments(entry);
            const result = await runChild(buildName, options);
            assertCalls(result.calls, change.calls ?? entry.calls.map(call => call.args.map(value => (value && value.$error ? value : decode(value)))), entry.name);
            assert.deepEqual(result.uncaught, [{$throws: 'thrown by the callback', $error: 'Error'}], entry.name);
            server.dropConnections();
            await sleep(30);
            return;
          }

          if (change?.rejects) {
            const before = server.requests.length;
            const returned = lib.retrieveMarkdown(...decodeArguments(entry));
            assert.ok(returned instanceof Promise, 'returns a Promise');
            await assert.rejects(returned, {name: change.rejects, message: entry.threw.$throws});
            assert.deepEqual(server.requests.slice(before), []);
            return;
          }

          if (change?.promise !== undefined) {
            const before = server.requests.length;
            const [options] = decodeArguments(entry);
            const returned = lib.retrieveMarkdown(options, ...decodeArguments(entry).slice(1));
            assert.ok(returned instanceof Promise, 'returns a Promise');
            assert.equal(await returned, change.promise);
            assert.deepEqual(server.requests.slice(before).map(request => `${request.method} ${request.path}`), oldRequestLines(entry));
            return;
          }

          const {record, requests} = await runCallbackCase(lib, entry, change);
          const expectedRequests = change?.requests ?? oldRequestLines(entry);
          assert.deepEqual(requests, expectedRequests, 'requests');

          const expectedThrow = change?.throws ?? entry.threw?.$error;
          if (expectedThrow) {
            assert.ok(record.threw, `throws ${expectedThrow}`);
            assert.equal(record.threw.name, expectedThrow);
            if (!change?.throws) {
              assert.equal(record.threw.message, entry.threw.$throws);
            }

            assert.equal(record.calls.length, 0, 'no callback after a throw');
            return;
          }

          assert.equal(record.threw, undefined, `does not throw (${record.threw?.message})`);
          for (const call of record.calls) {
            assert.equal(call.sync, false, 'the callback runs after retrieveMarkdown returns');
          }

          const expectedCalls = change?.calls ?? entry.calls.map(call => call.args.map(value => (value && value.$error ? value : decode(value))));
          assertCalls(record.calls.map(call => call.value), expectedCalls, entry.name);
        } finally {
          api.mode = 'tunnel';
        }
      });
    }
  });

  describe(`golden 1.1.7, the Promise form (${buildName})`, () => {
    for (const entry of golden.cases) {
      const change = exceptionFor(entry);
      if (change || entry.threw || entry.calls.length !== 1 || entry.name.startsWith('server never answers')) {
        continue;
      }

      test(entry.name, async () => {
        api.mode = entry.name.startsWith('proxy refuses') ? 'refuse' : (entry.name.startsWith('connection dropped') ? 'hangup' : 'tunnel');
        try {
          const [options] = decodeArguments(entry);
          const [markdown, error] = entry.calls[0].args.map(value => (value && value.$error ? value : decode(value)));
          const before = server.requests.length;
          if (error) {
            await assert.rejects(lib.retrieveMarkdown(options), rejection => {
              assertError(describeError(rejection), error, entry.name);
              return true;
            });
          } else {
            const resolved = await lib.retrieveMarkdown(options);
            // The Promise form resolves a string or null: a missing or non-string body_markdown becomes null.
            const expected = typeof markdown === 'string' || (markdown && markdown.$long) ? markdown : null;
            assert.deepEqual(summariseBody(resolved), expected);
          }

          assert.deepEqual(server.requests.slice(before).map(request => `${request.method} ${request.path}`), oldRequestLines(entry));
        } finally {
          api.mode = 'tunnel';
          server.dropConnections();
          await sleep(30);
        }
      });
    }
  });
}

test('the golden file is the published 1.1.7 and the codec round-trips it', () => {
  assert.equal(golden.package, 'stack-exchange-markdown-retriever@1.1.7');
  assert.deepEqual(encode(decode(golden.cases[0].args)), golden.cases[0].args);
});
