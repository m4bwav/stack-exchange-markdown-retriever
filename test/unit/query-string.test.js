/*
The URL 2.0.0 builds, checked through the public function with a fetch that answers at once and records the URL, against the
rules 1.1.7 followed: Node's querystring.stringify (through url.format), then url.parse escaping the apostrophe. The golden
suite pins the recorded cases; this suite covers the rest of the value space.
*/
import assert from 'node:assert/strict';
import querystring from 'node:querystring';
import {after, before, test} from 'node:test';
import {builds} from '../helpers/builds.js';

const BASE = 'https://api.stackexchange.com/2.2';
const FILTER = 'order=asc&filter=!L_(I6pMIzdXP-hC1clc9EY';
let urls;
let original;

before(() => {
  original = fetch;
  urls = [];
  globalThis.fetch = async url => {
    urls.push(url);
    return Response.json({items: []});
  };
});

after(() => {
  globalThis.fetch = original;
});

// What 1.1.7 sent for these query values.
const legacy = pairs => querystring.stringify(pairs).replaceAll('\'', '%27');

for (const {name, lib} of builds) {
  test(`${name}: site and apiKey values of every type are written as 1.1.7 wrote them`, async () => {
    const values = [
      'scifi',
      'a b',
      'it\'s',
      'ру.stackoverflow',
      '!*()~-._',
      '#?&=/+%',
      'tab\there',
      '"<>{}|\\^`',
      '😀',
      123,
      0.5,
      -0,
      1n,
      true,
      false,
      NaN,
      Infinity,
      {},
      new String('x'),
      ['a', 'b'],
      [1, true, null, {}],
      [],
    ];
    for (const value of values) {
      urls.length = 0;
      await lib.retrieveMarkdown({entityId: 1, site: value, apiKey: value});
      // Falsy values are left out (apiKey) or replaced by the default (site), as in 1.1.7.
      const pairs = {
        order: 'asc', filter: '!L_(I6pMIzdXP-hC1clc9EY', ...((value) && {key: value}), site: value || 'stackoverflow',
      };

      assert.equal(urls[0], `${BASE}/questions/1?${legacy(pairs)}`, String(value));
    }
  });

  test(`${name}: every Basic Multilingual Plane character in site is escaped as 1.1.7 escaped it`, async () => {
    let site = '';
    for (let code = 0; code < 0x1_00_00; code++) {
      if (code < 0xD8_00 || code > 0xDF_FF) {
        site += String.fromCodePoint(code);
      }
    }

    urls.length = 0;
    await lib.retrieveMarkdown({entityId: 1, site});
    assert.equal(urls[0], `${BASE}/questions/1?${FILTER}&${legacy({site})}`);
  });

  test(`${name}: a lone surrogate throws URIError synchronously, as 1.1.7 did`, () => {
    assert.throws(() => {
      lib.retrieveMarkdown({entityId: 1, site: '\u{D800}'}, () => {});
    }, {name: 'URIError'});
  });

  test(`${name}: ids that are post ids, and the path they build`, async () => {
    for (const [entityId, path] of [
      [1, '1'],
      ['1', '1'],
      ['0', '0'],
      ['0127968', '0127968'],
      ['1;2;3', '1;2;3'],
      [2 ** 53, '9007199254740992'],
      [new Number(5), '5'],
      [new String('6;7'), '6;7'],
    ]) {
      urls.length = 0;
      await lib.retrieveMarkdown({entityId, isForAnswer: true});
      assert.equal(urls[0], `${BASE}/answers/${path}?${FILTER}&site=stackoverflow`, String(entityId));
    }
  });
}
