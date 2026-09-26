/*
Both call forms against the local fixture server: decoding, typed errors, timeout, signal, the callback's contract, and a
one-call process that exits at once. Never the real API.
*/
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {createRequire} from 'node:module';
import process from 'node:process';
import {after, before, test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {installFetch} from '../helpers/api.js';
import {builds} from '../helpers/builds.js';

const fixtures = createRequire(import.meta.url)('../golden/fixture-server.cjs');
const preload = new URL('../helpers/cli-preload.mjs', import.meta.url).href;
const childCase = fileURLToPath(new URL('../helpers/child-case.mjs', import.meta.url));

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

async function fresh() {
  server.dropConnections();
  await sleep(30);
}

function callbackForm(lib, options) {
  return new Promise(resolve => {
    const calls = [];
    lib.retrieveMarkdown(options, (...arguments_) => {
      calls.push(arguments_);
      setTimeout(() => {
        resolve(calls);
      }, 50);
    });
  });
}

for (const {name, lib} of builds) {
  test(`${name}: bodies: gzip and deflate by header, gzip without the header, plain JSON`, async () => {
    for (const [entityId, expected] of [[127_968, /^Why is the \*\*question\*\*/u], [9005, /^deflated$/u], [9006, /^gzip without the header$/u], [9004, /^plain$/u]]) {
      await fresh();
      assert.match(await lib.retrieveMarkdown({entityId}), expected);
    }
  });

  test(`${name}: API errors are StackExchangeError with the API's fields, in both forms`, async () => {
    await fresh();
    await assert.rejects(lib.retrieveMarkdown({entityId: 9001}), error => {
      assert.ok(error instanceof lib.StackExchangeError);
      assert.deepEqual([error.name, error.message, error.status, error.errorId, error.errorName], ['StackExchangeError', 'ids', 400, 400, 'bad_parameter']);
      return true;
    });
    await fresh();
    const [[markdown, error]] = await callbackForm(lib, {entityId: 9002});
    assert.equal(markdown, null);
    assert.deepEqual([error.name, error.status, error.errorName], ['StackExchangeError', 502, 'throttle_violation']);
  });

  test(`${name}: bodies that are not the API's JSON are StackExchangeError with a cause`, async () => {
    for (const [entityId, message, status] of [
      [9007, 'The response is not JSON', 500],
      [9009, 'The response is not JSON', 200],
      [9010, 'The response is not JSON', 204],
      [9008, 'The response is not JSON', 200],
    ]) {
      await fresh();
      await assert.rejects(lib.retrieveMarkdown({entityId}), error => {
        assert.equal(error.name, 'StackExchangeError', String(entityId));
        assert.equal(error.message, message, String(entityId));
        assert.equal(error.status, status, String(entityId));
        assert.ok(error.cause instanceof Error, String(entityId));
        return true;
      });
    }
  });

  test(`${name}: the Promise form resolves a string or null`, async () => {
    for (const [entityId, expected] of [[404, null], [9003, null], [9012, ''], [9013, null], [9014, null], [9017, null], [9019, null], ['2;1', 'Question two.']]) {
      await fresh();
      assert.equal(await lib.retrieveMarkdown({entityId}), expected, String(entityId));
    }

    await fresh();
    const large = await lib.retrieveMarkdown({entityId: 9015});
    assert.equal(large.length, 200_000);
  });

  test(`${name}: the callback gets exactly two arguments, once`, async () => {
    await fresh();
    const calls = await callbackForm(lib, {entityId: 1});
    assert.deepEqual(calls, [['Question one.', null]]);
  });

  test(`${name}: timeout gives a TimeoutError, and 0 means no timeout`, async () => {
    await fresh();
    const started = Date.now();
    await assert.rejects(lib.retrieveMarkdown({entityId: 9011, timeout: 150}), {name: 'TimeoutError'});
    assert.ok(Date.now() - started < 3000);
    await fresh();
    const [[markdown, error]] = await callbackForm(lib, {entityId: 9011, timeout: 150});
    assert.equal(markdown, null);
    assert.equal(error.name, 'TimeoutError');
    await fresh();
    // A timeout above setTimeout's limit is clamped, not fired at once.
    assert.equal(await lib.retrieveMarkdown({entityId: 1, timeout: 1e12}), 'Question one.');
    await fresh();
    assert.equal(await lib.retrieveMarkdown({entityId: 1, timeout: 0}), 'Question one.');
  });

  test(`${name}: signal aborts with its reason, before or during the request, and its listener is removed`, async () => {
    await fresh();
    const early = new AbortController();
    early.abort(new Error('stop early'));
    await assert.rejects(lib.retrieveMarkdown({entityId: 1, signal: early.signal}), {message: 'stop early'});
    await fresh();
    const late = new AbortController();
    const pending = lib.retrieveMarkdown({entityId: 9011, signal: late.signal});
    setTimeout(() => {
      late.abort(new Error('stop late'));
    }, 100);
    await assert.rejects(pending, {message: 'stop late'});
    await fresh();
    // One signal shared by many calls: each call removes its listener when it settles.
    const shared = new AbortController();
    let added = 0;
    let removed = 0;
    const add = shared.signal.addEventListener.bind(shared.signal);
    const remove = shared.signal.removeEventListener.bind(shared.signal);
    shared.signal.addEventListener = (...arguments_) => {
      added++;
      add(...arguments_);
    };

    shared.signal.removeEventListener = (...arguments_) => {
      removed++;
      remove(...arguments_);
    };

    for (let index = 0; index < 5; index++) {
      await lib.retrieveMarkdown({entityId: 1, signal: shared.signal});
    }

    assert.deepEqual([added, removed], [5, 5]);
  });

  test(`${name}: network failures arrive as the platform's error`, async () => {
    api.mode = 'refuse';
    try {
      await assert.rejects(lib.retrieveMarkdown({entityId: 1}), {name: 'TypeError', message: 'fetch failed'});
    } finally {
      api.mode = 'tunnel';
    }
  });

  test(`${name}: the API key never appears in an error message`, async () => {
    for (const entityId of [9001, 9007, 9008]) {
      await fresh();
      await assert.rejects(lib.retrieveMarkdown({entityId, apiKey: 'SECRETKEY'}), error => {
        assert.doesNotMatch(`${error.message} ${error.cause?.message ?? ''}`, /SECRETKEY/u);
        return true;
      });
    }
  });
}

function runChild(buildName, options) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    execFile(process.execPath, ['--import', preload, childCase, buildName, JSON.stringify(options)], {env: {...process.env, FIXTURE_BASE: server.base}}, (error, stdout) => {
      if (error) {
        reject(error);
      } else {
        resolve({...JSON.parse(stdout), ms: Date.now() - started});
      }
    });
  });
}

for (const {name} of builds) {
  test(`${name}: a callback that throws is called once and its exception is uncaught; the process exits at once`, async () => {
    for (const [options, markdown] of [[{entityId: 1}, 'Question one.'], [{entityId: 404}, null]]) {
      await fresh();
      const result = await runChild(name, options);
      assert.deepEqual(result.calls, [[markdown, null]]);
      assert.deepEqual(result.uncaught, [{$throws: 'thrown by the callback', $error: 'Error'}]);
      // The child waits 500 ms before printing; a leftover 30 s timer would keep it alive far longer.
      assert.ok(result.ms < 10_000, `took ${result.ms} ms`);
    }
  });
}
