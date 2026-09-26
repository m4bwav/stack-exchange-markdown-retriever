'use strict';
// Golden capture of the PUBLISHED stack-exchange-markdown-retriever 1.1.7 (package-modernize Phase 0), adapted from the
// skill's scripts/golden-capture-npm.template.cjs for an asynchronous, callback-style function that makes HTTPS requests to a
// fixed host.
//
// Run in a scratch project, never inside the repository, before any code change:
//   npm init -y && npm install stack-exchange-markdown-retriever@1.1.7
//   (codec.cjs and fixture-server.cjs next to this file; openssl on PATH, or its path in OPENSSL)
//   node capture-1.1.7.cjs > 1.1.7.json
//
// 1.1.7 always requests https://api.stackexchange.com/2.2/... . The script sets HTTPS_PROXY to fixture-server.cjs, which
// records each CONNECT and answers it itself over TLS with a throwaway self-signed certificate made here by openssl (so it
// also sets NODE_TLS_REJECT_UNAUTHORIZED=0, for this process and the CLI children only). No case reaches the internet: the
// proxy never forwards, and the script stops if a case's request did not arrive at the proxy.
//
// For each case the file records what the call returned or threw, every callback invocation (its arguments, errors as
// {$error, message, code}, and whether it ran before the call returned), any uncaught exception, and every request the
// fixture server received (the CONNECT, then method, path with the query, HTTP version and raw headers).

const {spawn, spawnSync} = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {encode, decode} = require('./codec.cjs');
const fixtures = require('./fixture-server.cjs');

const SETTLE_MS = 300;
const MAX_WAIT_MS = 10_000;

function makeCertificate() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'semr-capture-'));
  const key = path.join(dir, 'key.pem');
  const cert = path.join(dir, 'cert.pem');
  const result = spawnSync(process.env.OPENSSL || 'openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', cert, '-days', '2',
    '-subj', '/CN=api.stackexchange.com', '-addext', 'subjectAltName=DNS:api.stackexchange.com',
  ], {encoding: 'utf8'});
  if (result.status !== 0) {
    throw new Error(`openssl failed: ${result.stderr || result.error}`);
  }

  const tls = {key: fs.readFileSync(key), cert: fs.readFileSync(cert)};
  fs.rmSync(dir, {recursive: true, force: true});
  return tls;
}

let server;
let current;

process.on('uncaughtException', error => {
  if (current) {
    current.uncaught.push({$throws: error.message, $error: error.name, code: error.code});
  } else {
    throw error;
  }
});

// Errors in callback arguments: class, message and code (the codec would keep only own enumerable properties).
function encodeArgument(value) {
  if (value instanceof Error) {
    return {$error: value.name, message: value.message, code: value.code};
  }

  return encode(value);
}

const sleep = ms => new Promise(resolve => {
  setTimeout(resolve, ms);
});

const retriever = require('stack-exchange-markdown-retriever');
const packageVersion = require('stack-exchange-markdown-retriever/package.json').version;

async function runCase(name, args, options = {}) {
  const encoded = encode(args);
  const record = {name, args: encoded, returned: undefined, threw: undefined, calls: [], uncaught: [], requests: []};
  current = record;
  server.setConnectMode(options.connect ?? 'tunnel');
  const before = server.requests.length;
  let returnedYet = false;
  let recording = true;
  const callback = (...callbackArgs) => {
    if (!recording) {
      return;
    }

    record.calls.push({sync: !returnedYet, args: callbackArgs.map(value => encodeArgument(value))});
  };

  // {$callback: 'throws'}: records the call, then throws, to show what 1.1.7 does with an exception from the caller's callback.
  const throwing = (...callbackArgs) => {
    callback(...callbackArgs);
    throw new Error('thrown by the callback');
  };

  const realArgs = decode(encoded).map(value => {
    if (value && typeof value === 'object' && value.$callback === true) {
      return callback;
    }

    return value && typeof value === 'object' && value.$callback === 'throws' ? throwing : value;
  });
  const started = Date.now();
  try {
    record.returned = encode(retriever.retrieveMarkdown(...realArgs));
  } catch (error) {
    record.threw = {$throws: error.message, $error: error.name, code: error.code};
  }

  returnedYet = true;
  const maxWait = options.maxWait ?? MAX_WAIT_MS;
  while (record.calls.length === 0 && record.uncaught.length === 0 && !record.threw && Date.now() - started < maxWait) {
    // eslint-disable-next-line no-await-in-loop
    await sleep(10);
  }

  await sleep(SETTLE_MS);
  record.requests = server.requests.slice(before);
  // Closed before the connections are dropped: a hung request would otherwise call back with the capture's own hang-up.
  recording = false;
  if (record.returned && record.returned.$undefined) {
    delete record.returned;
  }

  for (const key of ['threw']) {
    if (!record[key]) {
      delete record[key];
    }
  }

  if (record.uncaught.length === 0) {
    delete record.uncaught;
  }

  current = undefined;
  server.dropConnections();
  // Sockets destroyed between cases: let the client see it before the next case pools a dead socket.
  await sleep(50);
  if (!record.threw && record.requests.length === 0 && options.expectRequest !== false) {
    throw new Error(`case "${name}" made no request through the fixture proxy; refusing to continue (would it have gone to the internet?)`);
  }

  return record;
}

const cb = {$callback: true};
const id = (entityId, extra = {}) => [{entityId, ...extra}, cb];

// [name, args, options]
const methodCases = [
  // Arguments that fail before any request.
  ['no arguments', [], {expectRequest: false}],
  ['options null', [null, cb], {expectRequest: false}],
  ['options empty object', [{}, cb], {expectRequest: false}],
  ['entityId undefined', id(undefined), {expectRequest: false}],
  ['entityId null', id(null), {expectRequest: false}],
  ['entityId 0', id(0), {expectRequest: false}],
  ['entityId empty string', id(''), {expectRequest: false}],
  ['entityId NaN', id(Number.NaN), {expectRequest: false}],
  ['entityId false', id(false), {expectRequest: false}],
  ['options a number', [127_968, cb], {expectRequest: false}],
  ['options a string', ['127968', cb], {expectRequest: false}],
  // The callback.
  ['no callback', [{entityId: 1}]],
  ['callback null', [{entityId: 1}, null]],
  ['callback a string', [{entityId: 1}, 'not a function']],
  ['callback that throws', [{entityId: 1}, {$callback: 'throws'}]],
  ['callback that throws, on an API error', [{entityId: 9001}, {$callback: 'throws'}]],
  // Ordinary use.
  ['question, default site', id(127_968)],
  ['question, site as a domain (the README example)', id(127_968, {site: 'scifi.stackexchange.com'})],
  ['question, site as a short name', id(127_968, {site: 'scifi'})],
  ['question id as a string', id('127968')],
  ['question id with a leading zero', id('0127968')],
  ['question 1', id(1)],
  ['answer', id(1010, {isForAnswer: true})],
  ['answer id asked as a question (not found)', id(1010)],
  ['question id asked as an answer (not found)', id(127_968, {isForAnswer: true})],
  ['isForAnswer 1 (truthy)', id(1010, {isForAnswer: 1})],
  ['isForAnswer "false" (a truthy string)', id(1010, {isForAnswer: 'false'})],
  ['isForAnswer false', id(1, {isForAnswer: false})],
  ['the CLI\'s option name, answer: true (ignored)', id(1010, {answer: true})],
  ['not found', id(404)],
  ['two ids joined by a semicolon', id('1;2')],
  ['two ids, second first', id('2;1')],
  ['ids as an array', id([1, 2])],
  ['apiKey', id(1, {apiKey: 'abc123'})],
  ['apiKey with characters to escape', id(1, {apiKey: 'k=y&z w/+'})],
  ['apiKey empty string (ignored)', id(1, {apiKey: ''})],
  ['apiKey 0 (ignored)', id(1, {apiKey: 0})],
  ['apiKey a number', id(1, {apiKey: 42})],
  ['apiKey and site together', id(1, {apiKey: 'abc', site: 'meta'})],
  ['site empty string (default)', id(1, {site: ''})],
  ['site with a space', id(1, {site: 'a b'})],
  ['site with an apostrophe', id(1, {site: 'it\'s'})],
  ['site with non-ASCII', id(1, {site: 'ру.stackoverflow'})],
  ['site a number', id(1, {site: 123})],
  ['site true', id(1, {site: true})],
  ['site an object', id(1, {site: {}})],
  ['site an array', id(1, {site: ['a', 'b']})],
  ['unknown option ignored', id(1, {foo: 'bar'})],
  // Odd ids: whatever the id is, it goes into the path.
  ['entityId negative', id(-1)],
  ['entityId a fraction', id(1.5)],
  ['entityId 2 ** 53', id(2 ** 53)],
  ['entityId 1e21', id(1e21)],
  ['entityId Infinity', id(Number.POSITIVE_INFINITY)],
  ['entityId true', id(true)],
  ['entityId an object', id({})],
  ['entityId a Number wrapper', id(new Number(1))],
  ['entityId a String wrapper', id(new String('1'))],
  ['entityId the string "0"', id('0')],
  ['entityId letters', id('abc')],
  ['entityId with a space', id('1 2')],
  ['entityId with surrounding spaces', id(' 1 ')],
  ['entityId with dot segments', id('../../users/1')],
  ['entityId with a slash', id('1/answers')],
  ['entityId with a question mark', id('1?site=evil')],
  ['entityId with a hash', id('1#frag')],
  ['entityId with a percent sign', id('1%2F2')],
  ['entityId with a backslash', id('1\\2')],
  ['entityId an emoji (request refuses the path, no request)', id('😀'), {expectRequest: false}],
  // What the server sends back.
  ['API error 400 (bad_parameter)', id(9001)],
  ['API error 502 (throttle_violation)', id(9002)],
  ['item without body_markdown', id(9003)],
  ['plain JSON body, no Content-Encoding', id(9004)],
  ['deflate body with Content-Encoding deflate', id(9005)],
  ['gzip body without Content-Encoding', id(9006)],
  ['HTML error page, status 500', id(9007)],
  ['truncated gzip body', id(9008)],
  ['gzip of text that is not JSON', id(9009)],
  ['204 No Content', id(9010)],
  ['empty body_markdown', id(9012)],
  ['items null', id(9013)],
  ['JSON literal null', id(9014)],
  ['200 000-character body_markdown', id(9015)],
  ['error_message beside items, status 200', id(9016)],
  ['body_markdown a number', id(9017)],
  ['302 redirect to question 1', id(9018)],
  ['error body without error_message, status 404', id(9019)],
  ['error_message on an answer route', id(9001, {isForAnswer: true})],
  // The connection.
  ['server never answers (no timeout: no callback within 3 s)', id(9011), {maxWait: 3000}],
  ['proxy refuses the tunnel (502 to CONNECT)', id(1), {connect: 'refuse'}],
  ['connection dropped during the tunnel', id(1), {connect: 'hangup'}],
];

function summariseBody(text) {
  // A 200 000-character line would swamp the file; keep its length and ends.
  return text.length > 2000 ? {$long: text.length, start: text.slice(0, 80), end: text.slice(-80)} : text;
}

function cliRecord(name, args, status, stdout, stderr) {
  const text = value => String(value).replaceAll('\r\n', '\n');
  const errorLine = text(stderr).split('\n').find(line => /^\w*Error\b/.test(line) || /^error:/.test(line));
  const stderrLines = text(stderr).split('\n').filter(line => line && !line.includes('NODE_TLS_REJECT_UNAUTHORIZED') && !line.includes('--trace-warnings'));
  return {name, args, status, stdout: summariseBody(text(stdout)), stderrError: errorLine ?? (stderrLines.length === 0 ? '' : '(stderr without an error line)')};
}

function runCliAsync(name, args, connect = 'tunnel') {
  server.setConnectMode(connect);
  const cli = path.join(path.dirname(require.resolve('stack-exchange-markdown-retriever/package.json')), 'cli.js');
  const before = server.requests.length;
  return new Promise(resolve => {
    const child = spawn(process.execPath, [cli, ...args], {env: {...process.env}});
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill(), 15_000);
    child.stdout.on('data', data => {
      stdout += data;
    });
    child.stderr.on('data', data => {
      stderr += data;
    });
    child.on('close', status => {
      clearTimeout(timer);
      const record = cliRecord(name, args, status, stdout, stderr);
      record.requests = server.requests.slice(before).map(request => `${request.method} ${request.path}`);
      resolve(record);
    });
  });
}

async function main() {
  const tls = makeCertificate();
  server = await fixtures.start({tls});
  process.env.HTTPS_PROXY = server.proxy;
  process.env.https_proxy = server.proxy;
  delete process.env.NO_PROXY;
  delete process.env.no_proxy;
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  process.removeAllListeners('warning');

  const cases = [];
  for (const [name, args, options] of methodCases) {
    // eslint-disable-next-line no-await-in-loop
    const record = await runCase(name, args, options);
    for (const call of record.calls) {
      call.args = call.args.map(value => (typeof value === 'string' ? summariseBody(value) : value));
    }

    cases.push(record);
  }

  const cliCases = [];
  for (const [name, args, connect] of [
    ['no arguments', []],
    ['--help', ['--help']],
    ['-h', ['-h']],
    ['--version', ['--version']],
    ['question id', ['127968']],
    ['-s site and question id (the README example)', ['-s', 'scifi.stackexchange.com', '127968']],
    ['--site=site', ['--site=scifi', '1']],
    ['-a answer id (the flag is ignored: fetches a question)', ['-a', '1010']],
    ['--answer answer id', ['--answer', '1010']],
    ['-k key', ['-k', 'abc123', '1']],
    ['--apiKey key', ['--apiKey', 'abc123', '1']],
    ['not found', ['404']],
    ['API error 400', ['9001']],
    ['plain JSON body (zlib error)', ['9004']],
    ['-s without a value, then the id (the id becomes the site)', ['-s', '1']],
    ['two ids (the first is used)', ['1', '2']],
    ['letters as the id', ['abc']],
    ['an unknown flag', ['--foo', '1']],
    ['id 0', ['0']],
    ['proxy refuses the tunnel', ['1'], 'refuse'],
  ]) {
    // eslint-disable-next-line no-await-in-loop
    cliCases.push(await runCliAsync(name, args, connect));
  }

  const quirks = {
    requireResultType: typeof retriever,
    ownKeys: Reflect.ownKeys(retriever).map(String),
    functionName: retriever.retrieveMarkdown.name,
    functionLength: retriever.retrieveMarkdown.length,
    transport: 'request 2.88.2 through HTTPS_PROXY (CONNECT api.stackexchange.com:443) to fixture-server.cjs; TLS verification off for the throwaway certificate',
    noTimeout: 'the "server never answers" case records no callback within 3 s; 1.1.7 has no timeout of its own (the capture then drops the connection and ignores what follows)',
  };

  const dependency = name => require(`${name}/package.json`).version;
  const header = {
    package: `stack-exchange-markdown-retriever@${packageVersion}`,
    dependencies: {commander: dependency('commander'), request: dependency('request')},
    node: process.version,
    captured: new Date().toISOString().slice(0, 10),
    note: 'Golden outputs of the published 1.1.7 against test/golden/fixture-server.cjs; see capture-1.1.7.cjs and codec.cjs for the format.',
    quirks,
  };
  await server.close();
  const lines = cases.map(entry => JSON.stringify(entry));
  const cliLines = cliCases.map(entry => JSON.stringify(entry));
  process.stdout.write(`${JSON.stringify(header, null, '\t').slice(0, -2)},\n\t"cases": [\n\t\t${lines.join(',\n\t\t')}\n\t],\n\t"cli": [\n\t\t${cliLines.join(',\n\t\t')}\n\t]\n}\n`);
  // The hanging case's socket and request's agent can keep the loop alive.
  process.exit(0);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
