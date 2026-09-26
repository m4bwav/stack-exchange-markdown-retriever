/*
Argument checks: what throws (callback form) or rejects (Promise form), with which class and message, before any request.
*/
import assert from 'node:assert/strict';
import {after, before, test} from 'node:test';
import {builds} from '../helpers/builds.js';

let requests;
let original;

before(() => {
  original = fetch;
  globalThis.fetch = async url => {
    requests.push(url);
    return Response.json({items: [{body_markdown: 'ok'}]});
  };
});

after(() => {
  globalThis.fetch = original;
});

const callback = () => {};

for (const {name, lib} of builds) {
  test(`${name}: a missing id throws 1.1.7's Error, in both forms`, async () => {
    requests = [];
    for (const entityId of [undefined, null, 0, -0, '', NaN, false]) {
      assert.throws(() => {
        lib.retrieveMarkdown({entityId}, callback);
      }, {name: 'Error', message: 'Need an entity id to read'});
      await assert.rejects(lib.retrieveMarkdown({entityId}), {name: 'Error', message: 'Need an entity id to read'});
    }

    assert.deepEqual(requests, []);
  });

  test(`${name}: missing options is a TypeError, in both forms`, async () => {
    assert.throws(() => {
      lib.retrieveMarkdown(undefined, callback);
    }, TypeError);
    assert.throws(() => {
      lib.retrieveMarkdown(null, callback);
    }, TypeError);
    await assert.rejects(lib.retrieveMarkdown(), TypeError);
    await assert.rejects(lib.retrieveMarkdown(null), TypeError);
  });

  test(`${name}: an id that is not a post id is a TypeError naming it, before any request`, async () => {
    requests = [];
    for (const [entityId, shown] of [
      [-1, '-1'],
      [1.5, '1.5'],
      [1e21, '1e+21'],
      [Infinity, 'Infinity'],
      [true, 'true'],
      [{}, 'an object'],
      [[1, 2], 'an array'],
      ['abc', '"abc"'],
      ['1;', '"1;"'],
      [';1', '";1"'],
      ['1,2', '"1,2"'],
      [' 1', '" 1"'],
      ['../../users/1', '"../../users/1"'],
      ['1/answers', '"1/answers"'],
      ['１', '"１"'],
      [10n, '10'],
    ]) {
      const message = `entityId must be a post id (digits, or ids joined by ";"), not ${shown}`;
      assert.throws(() => {
        lib.retrieveMarkdown({entityId}, callback);
      }, {name: 'TypeError', message});
      await assert.rejects(lib.retrieveMarkdown({entityId}), {name: 'TypeError', message});
    }

    assert.deepEqual(requests, []);
  });

  test(`${name}: a callback that is not a function is a TypeError before any request`, () => {
    requests = [];
    for (const value of ['not a function', 1, {}, true]) {
      assert.throws(() => {
        lib.retrieveMarkdown({entityId: 1}, value);
      }, {name: 'TypeError', message: /^callback must be a function/u});
    }

    assert.deepEqual(requests, []);
  });

  test(`${name}: timeout and signal of the wrong type are TypeErrors`, async () => {
    for (const timeout of [-1, NaN, '100', null]) {
      await assert.rejects(lib.retrieveMarkdown({entityId: 1, timeout}), {name: 'TypeError', message: /^timeout must be a number/u});
    }

    for (const signal of [null, {}, 'abort', 1]) {
      await assert.rejects(lib.retrieveMarkdown({entityId: 1, signal}), {name: 'TypeError', message: 'signal must be an AbortSignal'});
    }
  });

  test(`${name}: a valid call with a callback returns undefined and calls back later`, async () => {
    let isCalled = false;
    const returned = lib.retrieveMarkdown({entityId: 1}, () => {
      isCalled = true;
    });
    assert.equal(returned, undefined);
    assert.equal(isCalled, false);
    await new Promise(resolve => {
      setTimeout(resolve, 50);
    });
    assert.equal(isCalled, true);
  });

  test(`${name}: the exports`, () => {
    const module_ = builds.find(build => build.name === name).lib;
    assert.equal(typeof module_.retrieveMarkdown, 'function');
    assert.equal(typeof module_.StackExchangeError, 'function');
    assert.equal(module_.default.retrieveMarkdown, module_.retrieveMarkdown);
    assert.equal(module_.default.StackExchangeError, module_.StackExchangeError);
    const error = new module_.StackExchangeError('m', {status: 400, errorId: 400, errorName: 'bad_parameter'});
    assert.ok(error instanceof Error);
    assert.equal(error.name, 'StackExchangeError');
    assert.deepEqual([error.status, error.errorId, error.errorName, 'cause' in error], [400, 400, 'bad_parameter', false]);
  });
}
