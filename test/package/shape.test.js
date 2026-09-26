/*
The package-shape suite. Every assertion here guards a promise the plan made: what ships, that the builds are portable, and
that require() returns an object holding retrieveMarkdown, as 1.1.7's did (plan D2), while import sees a default and the named exports.
*/
import assert from 'node:assert/strict';
import {exec} from 'node:child_process';
import {access, readFile} from 'node:fs/promises';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const root = fileURLToPath(new URL('../..', import.meta.url));
const read = file => readFile(new URL(`../../${file}`, import.meta.url), 'utf8');
const packageJson = JSON.parse(await read('package.json'));

// Exactly what `npm pack` may contain: the CLI ships without its map (`files` excludes it).
const PUBLISHED_FILES = [
  'CHANGELOG.md',
  'LICENSE',
  'README.md',
  'dist/cli.mjs',
  'dist/index.cjs',
  'dist/index.cjs.map',
  'dist/index.d.cts',
  'dist/index.d.mts',
  'dist/index.mjs',
  'dist/index.mjs.map',
  'package.json',
];

// Set from the first build and written in the plan; the two source maps are usually most of it.
const TARBALL_BUDGET = 25_000;

test('the tarball holds exactly the built files and the docs, and stays under the size budget', async () => {
  // --ignore-scripts: prepack would rebuild dist/ while the other test files are reading it.
  const stdout = await new Promise((resolve, reject) => {
    exec('npm pack --dry-run --json --ignore-scripts', {cwd: root, encoding: 'utf8'}, (error, output) => {
      if (error) {
        reject(error);
      } else {
        resolve(output);
      }
    });
  });
  const [packed] = JSON.parse(stdout);
  assert.deepEqual(new Set(packed.files.map(file => file.path)), new Set(PUBLISHED_FILES));
  assert.ok(packed.size < TARBALL_BUDGET, `the tarball is ${packed.size} bytes`);
});

test('package.json: entry points exist, no runtime dependencies, the Node floor', async () => {
  assert.equal(packageJson.type, 'module');
  assert.deepEqual(packageJson.exports, {
    '.': {import: './dist/index.mjs', require: './dist/index.cjs'},
    './package.json': './package.json',
  });
  assert.equal(packageJson.main, './dist/index.cjs');
  assert.equal(packageJson.module, './dist/index.mjs');
  assert.equal(packageJson.types, './dist/index.d.cts');
  assert.deepEqual(packageJson.bin, {'stack-exchange-markdown-retriever': './dist/cli.mjs'});
  for (const file of ['dist/index.mjs', 'dist/index.cjs', 'dist/index.d.mts', 'dist/index.d.cts', 'dist/cli.mjs']) {
    await access(new URL(`../../${file}`, import.meta.url));
  }

  // A runtime dependency needs a decision entry; the default is none.
  assert.deepEqual(packageJson.dependencies ?? {}, {});
  assert.equal(packageJson.engines.node, '>=20');
  assert.equal(packageJson.sideEffects, false);
  // Trusted publishing matches this URL exactly.
  assert.equal(packageJson.repository.url, 'git+https://github.com/m4bwav/stack-exchange-markdown-retriever.git');
});

test('the builds use nothing Node-specific or browser-specific, so they run in browsers, Deno, Bun and workers', async () => {
  for (const file of ['dist/index.mjs', 'dist/index.cjs']) {
    const code = await read(file);
    assert.doesNotMatch(code, /\bnode:/u, `${file} imports a node: module`);
    assert.doesNotMatch(code, /\brequire\(/u, `${file} calls require()`);
    assert.doesNotMatch(code, /\bprocess\./u, `${file} uses process`);
    assert.doesNotMatch(code, /\bBuffer\b/u, `${file} uses Buffer`);
    assert.doesNotMatch(code, /\b__(?:dirname|filename)\b/u, `${file} uses __dirname or __filename`);
    assert.doesNotMatch(code, /\b(?:window|document)\b/u, `${file} uses a browser global`);
  }
});

test('the CommonJS build runs in a bare ECMAScript context given only the web platform globals it names', async () => {
  const requested = [];
  const fakeFetch = async url => {
    requested.push(url);
    return Response.json({items: [{body_markdown: 'hello'}]}, {status: 200});
  };

  const context = vm.createContext({
    module: {exports: {}},
    fetch: fakeFetch,
    AbortController,
    Blob,
    DecompressionStream,
    DOMException,
    Response,
    TextDecoder,
    setTimeout,
    clearTimeout,
    queueMicrotask,
  });
  context.exports = context.module.exports;
  vm.runInContext(await read('dist/index.cjs'), context);
  const library = context.module.exports;
  assert.equal(typeof library.retrieveMarkdown, 'function');
  assert.equal(library.default.retrieveMarkdown, library.retrieveMarkdown);
  assert.equal(await library.retrieveMarkdown({entityId: 1}), 'hello');
  assert.deepEqual(requested, ['https://api.stackexchange.com/2.2/questions/1?order=asc&filter=!L_(I6pMIzdXP-hC1clc9EY&site=stackoverflow']);
  assert.deepEqual(await new Promise(resolve => {
    library.retrieveMarkdown({entityId: 2, isForAnswer: true}, (...arguments_) => {
      resolve(arguments_);
    });
  }), ['hello', null]);
});

test('the declaration files need no Node types', async () => {
  for (const file of ['dist/index.d.mts', 'dist/index.d.cts']) {
    const types = await read(file);
    assert.doesNotMatch(types, /\bNodeJS\.|\bBuffer\b|node:|reference types=/u, file);
    assert.doesNotMatch(types, /sourceMappingURL/u, `${file} points at a declaration map that is not published`);
  }
});

test('the declaration files describe both call forms and the exports', async () => {
  const [esm, cjs] = await Promise.all([read('dist/index.d.mts'), read('dist/index.d.cts')]);
  for (const types of [esm, cjs]) {
    assert.ok(types.includes('export declare function retrieveMarkdown(options: RetrieveMarkdownOptions, callback: RetrieveMarkdownCallback): void;'), types);
    assert.ok(types.includes('export declare function retrieveMarkdown(options: RetrieveMarkdownOptions): Promise<string | null>;'), types);
    assert.match(types, /export declare class StackExchangeError extends Error/u);
    assert.match(types, /stackExchangeMarkdownRetriever as default/u);
  }
});
