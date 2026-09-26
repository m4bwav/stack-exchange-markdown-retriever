/*
The command line tool, run as a child process from dist/cli.mjs with fetch pointed at the local fixture server
(test/helpers/cli-preload.mjs). 1.1.7's cli.js was never installed as a command; test/golden/1.1.7.json records what
`node cli.js` printed, and every recorded run must print the same, except the named exceptions below (plan items 1 to 3, 5, 8).
*/
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import process from 'node:process';
import {after, before, test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {version} from '../helpers/builds.js';

const load = createRequire(import.meta.url);
const fixtures = load('../golden/fixture-server.cjs');
const golden = load('../golden/1.1.7.json');
const cli = fileURLToPath(new URL('../../dist/cli.mjs', import.meta.url));
// --import takes a URL: a Windows path's drive letter would read as a scheme.
const preload = new URL('../helpers/cli-preload.mjs', import.meta.url).href;

let server;

before(async () => {
  server = await fixtures.start();
});

after(async () => {
  await server.close();
});

function run(arguments_, mode = 'tunnel') {
  const seen = server.requests.length;
  return new Promise(resolve => {
    execFile(process.execPath, ['--import', preload, cli, ...arguments_], {encoding: 'utf8', env: {...process.env, FIXTURE_BASE: server.base, FIXTURE_MODE: mode}}, (error, stdout, stderr) => {
      const requests = server.requests.slice(seen).map(request => `${request.method} ${request.path}`);
      server.dropConnections();
      resolve({
        code: error ? error.code : 0, stdout: stdout.replaceAll('\r\n', '\n'), stderr: stderr.replaceAll('\r\n', '\n'), requests,
      });
    });
  });
}

// The fixture's answer holds CRLF; run() normalises line endings.
const ANSWER = 'The answer is [42](https://example.com/42).\n\n> quoted\n';
const FILTER = 'order=asc&filter=!L_(I6pMIzdXP-hC1clc9EY';

// Each: what 2.0.0 prints instead, with its changelog line.
const EXCEPTIONS = {
  // Changed: the help text is 2.0.0's own (1.1.7 printed commander's, naming the command "cli").
  '--help': {code: 0, stdout: /Usage\n {4}\$ stack-exchange-markdown-retriever/u, stderr: ''},
  '-h': {code: 0, stdout: /Usage\n {4}\$ stack-exchange-markdown-retriever/u, stderr: ''},
  // Added: --version (1.1.7: "error: unknown option").
  '--version': {code: 0, stdout: `${version}\n`, stderr: ''},
  // Fixed: -a/--answer fetches the answer (1.1.7 ignored the flag and fetched the question).
  '-a answer id (the flag is ignored: fetches a question)': {
    code: 0, stdout: ANSWER, stderr: '', requests: [`GET /2.2/answers/1010?${FILTER}&site=stackoverflow`],
  },
  '--answer answer id': {
    code: 0, stdout: ANSWER, stderr: '', requests: [`GET /2.2/answers/1010?${FILTER}&site=stackoverflow`],
  },
  // Changed: errors go to stderr with exit 1 (1.1.7 printed null and exited 0).
  'API error 400': {code: 1, stdout: '', stderr: 'StackExchangeError: ids\n'},
  'proxy refuses the tunnel': {
    code: 1, stdout: '', stderr: 'TypeError: fetch failed\n', requests: [],
  },
  // Fixed: a plain-JSON body is read (1.1.7: a TypeError reading toString, printed as null).
  'plain JSON body (zlib error)': {code: 0, stdout: 'plain\n', stderr: ''},
  // Security: an id that is not a post id is refused before any request (1.1.7 requested /2.2/questions/abc).
  'letters as the id': {
    code: 1, stdout: '', stderr: /^TypeError: entityId must be a post id/u, requests: [],
  },
  // Changed: parseArgs words the error its own way (same exit status as commander's).
  'an unknown flag': {
    code: 1, stdout: '', stderr: /^error: Unknown option '--foo'/u, requests: [],
  },
};

for (const entry of golden.cli) {
  test(`golden CLI run: ${entry.name}`, async () => {
    const mode = entry.name.startsWith('proxy refuses') ? 'refuse' : 'tunnel';
    const result = await run(entry.args, mode);
    const change = EXCEPTIONS[entry.name];
    const oldRequests = entry.requests.filter(line => !line.startsWith('CONNECT '));
    if (change) {
      assert.equal(result.code, change.code);
      for (const key of ['stdout', 'stderr']) {
        if (change[key] instanceof RegExp) {
          assert.match(result[key], change[key], key);
        } else {
          assert.equal(result[key], change[key], key);
        }
      }

      assert.deepEqual(result.requests, change.requests ?? oldRequests);
      return;
    }

    assert.equal(result.code, entry.status);
    assert.equal(result.stdout, entry.stdout);
    // 1.1.7 printed a stack after its error line; 2.0.0 prints the error line alone.
    assert.equal(result.stderr, entry.stderrError === '' ? '' : `${entry.stderrError}\n`);
    assert.deepEqual(result.requests, oldRequests);
  });
}

test('the first line of dist/cli.mjs is the shebang, with LF line endings', async () => {
  const text = await readFile(cli, 'utf8');
  assert.equal(text.split('\n', 1)[0], '#!/usr/bin/env node');
  assert.ok(!text.includes('\r'), 'no carriage returns');
});

test('-a with -s and -k builds the answer URL with the key and the site', async () => {
  const result = await run(['-a', '-s', 'scifi', '-k', 'abc', '1010']);
  assert.equal(result.code, 0);
  assert.equal(result.stdout, ANSWER);
  assert.deepEqual(result.requests, [`GET /2.2/answers/1010?${FILTER}&key=abc&site=scifi`]);
});

test('--timeout bounds the wait and a bad --timeout is refused', async () => {
  const started = Date.now();
  const slow = await run(['--timeout', '200', '9011']);
  assert.equal(slow.code, 1);
  assert.equal(slow.stdout, '');
  assert.match(slow.stderr, /^TimeoutError: /u);
  assert.ok(Date.now() - started < 5000);
  for (const bad of ['-1', 'soon', '']) {
    const refused = await run([`--timeout=${bad}`, '1']);
    assert.equal(refused.code, 1, bad);
    assert.match(refused.stderr, /^error: --timeout takes a number of milliseconds/u, bad);
    assert.deepEqual(refused.requests, [], bad);
  }
});

test('errors never print a stack trace or the API key', async () => {
  for (const arguments_ of [['-k', 'SECRETKEY', '9001'], ['-k', 'SECRETKEY', '9007'], ['-k', 'SECRETKEY', 'abc']]) {
    const result = await run(arguments_);
    assert.equal(result.code, 1, arguments_.join(' '));
    assert.ok(!result.stderr.includes('    at '), 'no stack trace');
    assert.doesNotMatch(result.stderr, /SECRETKEY/u);
  }
});

test('a post without body_markdown prints null (1.1.7 printed undefined), and -s or -k without a value is an error', async () => {
  const missing = await run(['9003']);
  assert.equal(missing.code, 0);
  assert.equal(missing.stdout, 'null\n');
  for (const flag of ['-s', '-k']) {
    const result = await run(['1', flag]);
    assert.equal(result.code, 1, flag);
    assert.match(result.stderr, /^error: Option '-[ks], --(?:site|apiKey) <value>' argument missing/u, flag);
    assert.deepEqual(result.requests, [], flag);
  }
});
