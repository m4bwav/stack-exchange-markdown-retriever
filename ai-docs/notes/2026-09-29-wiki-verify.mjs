// wiki-verify for stack-exchange-markdown-retriever@2.0.0: runs every example on the wiki against the
// PUBLISHED package, never the working tree. Kept in the repository as ai-docs/notes/2026-09-29-wiki-verify.mjs
// (with 2026-09-29-host-fixture.mjs beside it) so the next release can run it again.
//
// Run it from a scratch folder outside the repository (Node 24, openssl 3 on PATH, BASH=<Git Bash's bash.exe> on Windows):
//   npm init -y
//   npm install stack-exchange-markdown-retriever@2.0.0 undici@7
//   copy host-fixture.mjs (ai-docs/notes/2026-09-29-host-fixture.mjs) beside this file
//   old versions and runtimes, each in its own folder beside this one:
//     ../old117: npm init -y && npm install stack-exchange-markdown-retriever@1.1.7
//     ../rt:     npm init -y && npm install deno bun
//   GOLDEN=<the clone's test/golden> OLD=../old117 RT=../rt OLDEST_NODE=20 node wiki-verify.mjs > wiki-verify.out.txt
//
// Network: nothing the package, its CLI, 1.1.7, Deno or Bun requests leaves 127.0.0.1. host-fixture.mjs serves
// api.stackexchange.com through a stand-in proxy with a throwaway CA, and a guard preloaded in every Node child
// (and in this process) refuses any socket to another host; it is tested first (the "guard" sections). Deno and
// Bun do not load the guard, so each of them first fetches https://probe.invalid/ through the proxy, and their
// example runs only when that answered 204 from the fixture. Only the installs (npm, pnpm, yarn, bun, npx, the
// TypeScript compiler, Node 20 for OLDEST_NODE) reach a registry, before the fixture's variables are set.
//
// The fixture's posts are SAMPLE CONTENT made up for the wiki, not the real posts: the pages say so beside
// every output that shows one. Every case prints "## <label>" and then its output.

import http from 'node:http';
import zlib from 'node:zlib';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import path from 'node:path';
import util from 'node:util';
import {copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

process.chdir(path.dirname(fileURLToPath(import.meta.url)));

const PACKAGE = 'stack-exchange-markdown-retriever';
const VERSION = '2.0.0';
const require = createRequire(import.meta.url);
const WIN = process.platform === 'win32';
const BASH = process.env.BASH || 'bash';

function show(label, value) {
	console.log(`## ${label}`);
	console.log(typeof value === 'string' ? value : inspect(value));
	console.log();
}

function inspect(value) {
	return JSON.stringify(value, (key, v) => {
		if (v === undefined) {
			return '<undefined>';
		}

		if (v instanceof Error) {
			return {name: v.name, message: v.message, ...v};
		}

		if (typeof v === 'number' && !Number.isFinite(v)) {
			return String(v);
		}

		return v;
	}, 2);
}

// Runs a page's example in this process and prints exactly what its console.log calls print.
async function example(label, fn) {
	const lines = [];
	const original = console.log;
	console.log = (...args) => lines.push(util.format(...args));
	try {
		await fn();
	} catch (error) {
		lines.push(`${error?.name}: ${error?.message}`);
	} finally {
		console.log = original;
	}

	show(label, lines.join('\n'));
}

function run(file, args, {cwd = process.cwd(), env = {}, shell = false, input = ''} = {}) {
	return new Promise(resolve => {
		const child = spawn(file, args, {cwd, env: {...process.env, ...env}, shell});
		child.stdin.end(input);
		let stdout = '';
		let stderr = '';
		child.stdout.on('data', chunk => {
			stdout += chunk;
		});
		child.stderr.on('data', chunk => {
			stderr += chunk;
		});
		child.on('error', error => {
			resolve({code: -1, stdout, stderr: String(error)});
		});
		child.on('close', code => {
			resolve({code, stdout: stdout.replaceAll('\r\n', '\n'), stderr: stderr.replaceAll('\r\n', '\n')});
		});
	});
}

function shell(script, options = {}) {
	return run(BASH, ['-c', `echo "shell node: $(node --version)"; ${script}`], options);
}

async function capture(label, fn) {
	try {
		show(label, await fn());
	} catch (error) {
		show(`${label} (threw)`, `${error?.name}: ${error?.message}`);
	}
}

// stdout as printed; stderr and the exit code only when there are any.
function printed(r) {
	let text = r.stdout.replace(/\n$/, '');
	if (r.stderr.trim()) {
		text += `${text ? '\n' : ''}--- stderr\n${r.stderr.replace(/\n$/, '')}`;
	}

	if (r.code !== 0) {
		text += `\nexit ${r.code}`;
	}

	return text;
}

// A terminal transcript as the Commands page shows it: the command, what it printed, then `echo $?`.
function transcript(command, r) {
	return `$ ${command}\n${r.stdout}${r.stderr}$ echo $?\n${r.code}`;
}

// ----- the installed package: version, both module systems, the bin -----
const pkgDir = path.join(process.cwd(), 'node_modules', PACKAGE);
const pkg = JSON.parse(readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
if (pkg.version !== VERSION) {
	throw new Error(`installed ${pkg.version}, expected ${VERSION}`);
}

show('installed', `${PACKAGE}@${pkg.version} on Node ${process.version}`);
const esm = await import(PACKAGE);
const cjs = require(PACKAGE);
show('esm exports', Object.keys(esm).sort());
show('cjs exports', Object.keys(cjs).sort());
show('default export keys (esm)', Object.keys(esm.default).sort());
show('api: retrieveMarkdown.length', String(esm.retrieveMarkdown.length));
show('api: the same function in both builds', `esm.retrieveMarkdown === esm.default.retrieveMarkdown: ${esm.retrieveMarkdown === esm.default.retrieveMarkdown}\ncjs.retrieveMarkdown === esm.retrieveMarkdown: ${cjs.retrieveMarkdown === esm.retrieveMarkdown}`);
show('package.json engines, bin, exports', {engines: pkg.engines, bin: pkg.bin, exports: pkg.exports, dependencies: pkg.dependencies ?? 'none'});
const binEntry = Object.values(pkg.bin)[0];

// ----- the fixture: api.stackexchange.com under its real name, SAMPLE posts -----
const JSON_GZIP = {'content-type': 'application/json; charset=utf-8', 'content-encoding': 'gzip'};
const gzip = value => zlib.gzipSync(Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)));
const wrapper = items => ({items, has_more: false, quota_max: 300, quota_remaining: 299});
// Sample content, made up for the wiki (not the real posts).
const POSTS = {
	scifi: {
		questions: {127968: 'Sample question body, made up for this wiki (not the real post).\n\nIt keeps HTML entities: &quot;quoted&quot; &amp; more.\n\n    an indented code line'},
	},
	stackoverflow: {
		questions: {
			1: 'Sample question one.',
			2: 'Sample question two.',
			11227809: 'Sample Stack Overflow question, made up for this wiki.',
		},
		answers: {1010: 'Sample answer, made up for this wiki, with a [link](https://example.com/).'},
	},
};
const SITES = {scifi: 'scifi', 'scifi.stackexchange.com': 'scifi', stackoverflow: 'stackoverflow', 'stackoverflow.com': 'stackoverflow'};
let bomb;
const SPECIAL = {
	9001: () => [400, JSON_GZIP, gzip({error_id: 400, error_message: 'ids', error_name: 'bad_parameter'})],
	9002: () => [502, JSON_GZIP, gzip({error_id: 502, error_message: 'too many requests from this IP, more requests available in 3600 seconds', error_name: 'throttle_violation'})],
	9003: () => [200, JSON_GZIP, gzip(wrapper([{question_id: 9003}]))],
	9004: () => [200, {'content-type': 'application/json; charset=utf-8'}, JSON.stringify(wrapper([{question_id: 9004, body_markdown: 'Sample plain JSON body.'}]))],
	9005: () => [200, {'content-type': 'application/json; charset=utf-8', 'content-encoding': 'deflate'}, zlib.deflateSync(JSON.stringify(wrapper([{question_id: 9005, body_markdown: 'Sample deflate body.'}])))],
	9006: () => [200, {'content-type': 'application/json; charset=utf-8'}, gzip(wrapper([{question_id: 9006, body_markdown: 'Sample gzip body without the header.'}]))],
	9007: () => [500, {'content-type': 'text/html'}, '<html><body>Internal Server Error</body></html>'],
	9008: () => [200, JSON_GZIP, gzip(wrapper([{question_id: 9008, body_markdown: 'cut'}])).subarray(0, 20)],
	9010: () => [204, {}, ''],
	9011: 'never',
	9012: () => [200, JSON_GZIP, gzip(wrapper([{question_id: 9012, body_markdown: ''}]))],
	9014: () => [200, JSON_GZIP, gzip('null')],
	9016: () => [200, JSON_GZIP, gzip({items: [{question_id: 9016, body_markdown: 'Sample body beside an error.'}], error_message: 'odd'})],
	9017: () => [200, JSON_GZIP, gzip(wrapper([{question_id: 9017, body_markdown: 42}]))],
	9018: () => [302, {location: '/2.2/questions/1?order=asc&site=stackoverflow'}, ''],
	9019: () => [404, JSON_GZIP, gzip({error_id: 404, error_name: 'no_method'})],
	9020: 'drop',
	// 65 MiB of zeros, gzip-compressed (about 64 KB): without a Content-Encoding header the package inflates it itself.
	9021: () => [200, {'content-type': 'application/json'}, (bomb ??= zlib.gzipSync(Buffer.alloc(65 * 1024 * 1024)))],
	// The same bytes with Content-Encoding: gzip, which fetch inflates before the package sees them.
	9022: () => [200, {'content-type': 'application/json', 'content-encoding': 'gzip'}, (bomb ??= zlib.gzipSync(Buffer.alloc(65 * 1024 * 1024)))],
	// Valid API JSON whose body_markdown is 65 MiB long, gzip with Content-Encoding (as the API sends its answers).
	9023: () => [200, JSON_GZIP, gzip(wrapper([{question_id: 9023, body_markdown: 'x'.repeat(65 * 1024 * 1024)}]))],
};
const hanging = [];

function api(url, request, response) {
	const send = (status, headers, body) => {
		response.writeHead(status, headers);
		response.end(body);
	};

	const match = /^\/2\.2\/(questions|answers)\/([^/]+)$/.exec(url.pathname);
	if (url.hostname !== 'api.stackexchange.com' || !match) {
		send(404, JSON_GZIP, gzip({error_id: 404, error_message: 'no method found with this name', error_name: 'no_method'}));
		return;
	}

	const [, kind, ids] = match;
	const special = SPECIAL[ids];
	if (special === 'never') {
		hanging.push(response);
		return;
	}

	if (special === 'drop') {
		request.socket.destroy();
		return;
	}

	if (special) {
		send(...special());
		return;
	}

	const site = SITES[url.searchParams.get('site')];
	const idKey = kind === 'questions' ? 'question_id' : 'answer_id';
	const items = decodeURIComponent(ids).split(';')
		.map(id => POSTS[site]?.[kind]?.[id] === undefined ? undefined : {[idKey]: Number(id), body_markdown: POSTS[site][kind][id]})
		.filter(Boolean);
	send(200, JSON_GZIP, gzip(wrapper(items)));
}

const {startHostFixture, preload} = await import('./host-fixture.mjs');
const fx = await startHostFixture({hosts: ['api.stackexchange.com', 'probe.invalid'], handle: api});
show('guard', fx.guardCheck);
// The guard's own words, from a Node child with only the guard preloaded (no proxy variables), before any case runs.
show('guard: .invalid hosts with the guard alone', printed(await run(process.execPath, [path.join('tls', 'guard-test.mjs')], {env: {NODE_OPTIONS: preload(fx.guardFile), HTTP_PROXY: '', HTTPS_PROXY: '', http_proxy: '', https_proxy: '', NODE_USE_ENV_PROXY: ''}})));
show('lookups reach the fixture through', fx.route);
const closers = [fx];
if (process.env.GUARD_ONLY) {
	await fx.close();
	process.stdout.write('', () => process.exit(0));
	await new Promise(() => {});
}

// This process: the guard and a proxy agent that trusts the CA.
await fx.routeThisProcess();
const {retrieveMarkdown, StackExchangeError} = esm;
const seenFrom = () => fx.seen.length;
const requestsSince = start => fx.seen.slice(start).join('\n');

// A page's program as a file in `cwd`, run as a child with the fixture's environment.
async function program(label, file, code, {cmd = process.execPath, args = [], cwd = process.cwd(), env = fx.env, shell: useShell = false} = {}) {
	writeFileSync(path.join(cwd, file), code);
	const start = seenFrom();
	const r = await run(cmd, [...args, file], {cwd, env, shell: useShell});
	show(label, printed(r));
	return {r, requests: requestsSince(start)};
}

function cli(args, {env = fx.env} = {}) {
	return run(process.execPath, [path.join(pkgDir, binEntry), ...args], {env});
}

async function command(label, args, {env, display} = {}) {
	const start = seenFrom();
	const r = await cli(args, {env});
	show(label, transcript(display ?? [PACKAGE, ...args].join(' '), r));
	return requestsSince(start);
}

const PROBE = "console.log(await fetch('https://probe.invalid/').then(r => String(r.status), e => 'failed: ' + (e.cause?.message ?? e.message)));\n";

// ================= Home and Getting started =================
const README_ESM = `import {retrieveMarkdown} from 'stack-exchange-markdown-retriever';

const markdown = await retrieveMarkdown({site: 'scifi', entityId: 127968});
console.log(markdown);
`;
const README_CJS = `const stackExchangeMarkdownRetriever = require('stack-exchange-markdown-retriever');

stackExchangeMarkdownRetriever.retrieveMarkdown({site: 'scifi.stackexchange.com', entityId: 127968}, (markdown, error) => {
  if (error) {
    console.error(error.message);
    return;
  }

  console.log(markdown);
});
`;
{
	const {requests} = await program('home: the ESM example (sample content)', 'example.mjs', README_ESM);
	show('home: the request it made', requests);
	await program('getting-started: CommonJS with a callback (sample content)', 'example.cjs', README_CJS);
	await program('getting-started: default export (sample content)', 'default.mjs', `import retriever from 'stack-exchange-markdown-retriever';

const markdown = await retriever.retrieveMarkdown({entityId: 11227809});
console.log(markdown);
`);
}

// TypeScript: the types, compiled against the installed declarations.
{
	writeFileSync('types.mts', `import {retrieveMarkdown} from 'stack-exchange-markdown-retriever';

const markdown = await retrieveMarkdown({entityId: 127968, site: 'scifi'});
console.log(markdown.length);
`);
	const r = await run('npx', ['-y', '-p', 'typescript@6', 'tsc', '--noEmit', '--pretty', 'false', '--strict', '--module', 'nodenext', '--moduleResolution', 'nodenext', '--target', 'es2022', 'types.mts'], {shell: WIN, env: {NODE_OPTIONS: ''}});
	show('getting-started: tsc on types.mts', printed(r));
	const v = await run('npx', ['-y', '-p', 'typescript@6', 'tsc', '--version'], {shell: WIN, env: {NODE_OPTIONS: ''}});
	show('getting-started: typescript version', v.stdout.trim());
}

// Other package managers and runtimes. Installs reach the npm registry with a plain environment; the runs get the fixture's.
const {RT} = process.env;
const scratch = name => {
	const dir = path.resolve('..', `${name}${process.env.WIKI_VERIFY_CHILD ? '-child' : ''}`);
	rmSync(dir, {recursive: true, force: true});
	mkdirSync(dir, {recursive: true});
	return dir;
};

const plainEnv = {NODE_OPTIONS: '', COREPACK_ENABLE_DOWNLOAD_PROMPT: '0'};
{
	const dir = scratch('pnpm');
	writeFileSync(path.join(dir, 'package.json'), '{"name": "pnpm-example", "private": true, "type": "module"}\n');
	const add = await run('corepack', ['pnpm@10', 'add', `${PACKAGE}@${VERSION}`], {cwd: dir, shell: WIN, env: plainEnv});
	show('getting-started: pnpm add', `exit ${add.code}; pnpm ${(await run('corepack', ['pnpm@10', '--version'], {cwd: dir, shell: WIN, env: plainEnv})).stdout.trim()}`);
	await program('getting-started: pnpm, node example.mjs (sample content)', 'example.mjs', README_ESM, {cwd: dir});
}

{
	const dir = scratch('yarn');
	writeFileSync(path.join(dir, 'package.json'), '{"name": "yarn-example", "private": true, "type": "module", "packageManager": "yarn@4.18.1"}\n');
	const yarnEnv = {...plainEnv, YARN_ENABLE_TELEMETRY: '0'};
	const add = await run('corepack', ['yarn', 'add', `${PACKAGE}@${VERSION}`], {cwd: dir, shell: WIN, env: yarnEnv});
	show('getting-started: yarn add', `exit ${add.code}; yarn ${(await run('corepack', ['yarn', '--version'], {cwd: dir, shell: WIN, env: yarnEnv})).stdout.trim()}; node_modules: ${existsSync(path.join(dir, 'node_modules', PACKAGE)) ? 'yes' : 'no'}`);
	const env = {...fx.env, YARN_ENABLE_TELEMETRY: '0', COREPACK_ENABLE_NETWORK: '0'};
	{
		// Plain node under Plug'n'Play: the error line only, with the project folder as <project>.
		writeFileSync(path.join(dir, 'example.mjs'), README_ESM);
		const r = await run(process.execPath, ['example.mjs'], {cwd: dir, env: fx.env});
		const line = r.stderr.split('\n').find(each => each.startsWith('Error ')) ?? '(no error line)';
		show('getting-started: yarn 4, node example.mjs', `${line.replace(dir, '<project>').replaceAll('\\', '/')}\nexit ${r.code}`);
	}
	const probe = await program('getting-started: yarn node, probe', 'probe.mjs', PROBE, {cmd: 'corepack', args: ['yarn', 'node'], cwd: dir, env, shell: WIN});
	if (probe.r.stdout.trim() === '204') {
		await program('getting-started: yarn 4, yarn node example.mjs (sample content)', 'example.mjs', README_ESM, {cmd: 'corepack', args: ['yarn', 'node'], cwd: dir, env, shell: WIN});
	}
}

if (RT) {
	const bin = name => path.resolve(RT, 'node_modules', '.bin', `${name}${WIN ? '.cmd' : ''}`);
	// Bun: installs from npm itself.
	const dir = scratch('bun');
	writeFileSync(path.join(dir, 'package.json'), '{"name": "bun-example", "private": true, "type": "module"}\n');
	const add = await run(bin('bun'), ['add', `${PACKAGE}@${VERSION}`], {cwd: dir, shell: WIN, env: plainEnv});
	show('getting-started: bun add', `exit ${add.code}; bun ${(await run(bin('bun'), ['--version'], {shell: WIN, env: plainEnv})).stdout.trim()}`);
	// Deno 2.9.6 runs the --require preloads in NODE_OPTIONS (on the Node 20 rerun it loaded the undici route and
	// failed on env permission), so Deno and Bun get the proxy variables without NODE_OPTIONS; the probe checks the route.
	const runtimeEnv = {...fx.env, NODE_OPTIONS: ''};
	const bunProbe = await program('getting-started: bun, probe', 'probe.mjs', PROBE, {cmd: bin('bun'), cwd: dir, env: runtimeEnv, shell: WIN});
	if (bunProbe.r.stdout.trim() === '204') {
		const {requests} = await program('getting-started: bun example.mjs (sample content)', 'example.mjs', README_ESM, {cmd: bin('bun'), cwd: dir, env: runtimeEnv, shell: WIN});
		show('getting-started: bun, the request it made', requests);
	}

	// Deno: the npm: specifier, run in this folder, where the package is installed (references/npm.md).
	const deno = bin('deno');
	const denoEnv = {...runtimeEnv, NO_COLOR: '1'};
	show('getting-started: deno version', (await run(deno, ['--version'], {shell: WIN, env: plainEnv})).stdout.split('\n')[0]);
	const DENO_EXAMPLE = `import {retrieveMarkdown} from 'npm:stack-exchange-markdown-retriever@2.0.0';

const markdown = await retrieveMarkdown({site: 'scifi', entityId: 127968});
console.log(markdown);
`;
	writeFileSync('deno-warm.mjs', "import {retrieveMarkdown} from 'npm:stack-exchange-markdown-retriever@2.0.0';\nconsole.log(typeof retrieveMarkdown);\n");
	show('getting-started: deno, resolve the package (no request)', printed(await run(deno, ['run', 'deno-warm.mjs'], {shell: WIN, env: plainEnv})));
	const denoProbe = await program('getting-started: deno, probe', 'probe.mjs', PROBE, {cmd: deno, args: ['run', '--allow-net'], env: denoEnv, shell: WIN});
	if (denoProbe.r.stdout.trim() === '204') {
		const {requests} = await program('getting-started: deno run --allow-net (sample content)', 'deno-example.mjs', DENO_EXAMPLE, {cmd: deno, args: ['run', '--allow-net'], env: denoEnv, shell: WIN});
		show('getting-started: deno, the request it made', requests);
		await program('getting-started: deno run without --allow-net', 'deno-example.mjs', DENO_EXAMPLE, {cmd: deno, args: ['run'], env: denoEnv, shell: WIN});
	}
}

// Run from npm without installing: npx. The package is fetched once with a plain environment; the runs are --offline,
// so npm itself makes no request while the guard is on.
{
	const dir = scratch('npxhome');
	const warm = await run('npx', ['-y', `${PACKAGE}@${VERSION}`, '--version'], {cwd: dir, shell: WIN, env: plainEnv});
	show('getting-started: npx, first run', printed(warm));
	for (const args of [['-s', 'scifi', '127968'], ['-a', '1010'], ['11227809']]) {
		const r = await run('npx', ['--offline', '-y', `${PACKAGE}@${VERSION}`, ...args], {cwd: dir, shell: WIN, env: fx.env});
		show(`getting-started: npx ${args.join(' ')} (sample content)`, transcript(`npx ${PACKAGE}@${VERSION} ${args.join(' ')}`, r));
	}
}

// ================= API reference =================
await capture('api: StackExchangeError from an API error (fixture error body)', async () => {
	try {
		await retrieveMarkdown({entityId: 9001});
	} catch (error) {
		return {name: error.name, message: error.message, status: error.status, errorId: error.errorId, errorName: error.errorName, instanceofStackExchangeError: error instanceof StackExchangeError, instanceofError: error instanceof Error, cause: error.cause};
	}
});
await capture('api: StackExchangeError for an HTML page, with its cause', async () => {
	try {
		await retrieveMarkdown({entityId: 9007});
	} catch (error) {
		return {name: error.name, message: error.message, status: error.status, errorId: error.errorId, errorName: error.errorName, cause: `${error.cause?.name}: ${error.cause?.message}`};
	}
});
await example('api: new StackExchangeError', async () => {
	const error = new StackExchangeError('Something failed', {status: 503});
	console.log(error.name, error.message, error.status, error.errorId);
});
await example('api: callback null returns a Promise', async () => {
	const result = retrieveMarkdown({entityId: 1}, null);
	console.log(result instanceof Promise, await result);
});
await example('api: the callback form returns undefined', async () => {
	const returned = retrieveMarkdown({entityId: 1}, () => {});
	console.log(returned);
	await new Promise(resolve => {
		setTimeout(resolve, 200);
	});
});
for (const [label, call] of [
	['api: no options, callback form', () => retrieveMarkdown(undefined, () => {})],
	['api: no entityId, callback form', () => retrieveMarkdown({}, () => {})],
	['api: callback a string', () => retrieveMarkdown({entityId: 1}, 'callback')],
	['api: timeout a string', () => retrieveMarkdown({entityId: 1, timeout: '5000'}, () => {})],
	['api: timeout negative', () => retrieveMarkdown({entityId: 1, timeout: -1}, () => {})],
	['api: signal not a signal', () => retrieveMarkdown({entityId: 1, signal: {}}, () => {})],
	['api: entityId letters', () => retrieveMarkdown({entityId: 'abc'}, () => {})],
	['api: entityId an array', () => retrieveMarkdown({entityId: [1, 2]}, () => {})],
	['api: entityId negative', () => retrieveMarkdown({entityId: -1}, () => {})],
]) {
	const start = seenFrom();
	await capture(label, async () => {
		try {
			call();
			return 'did not throw';
		} catch (error) {
			return `${error.name}: ${error.message}`;
		}
	});
	show(`${label}: requests`, requestsSince(start) || '(none)');
}

await capture('api: no options, Promise form rejects', async () => retrieveMarkdown().then(() => 'resolved', error => `rejected: ${error.name}: ${error.message}`));
await capture('api: no entityId, Promise form rejects', async () => retrieveMarkdown({}).then(() => 'resolved', error => `rejected: ${error.name}: ${error.message}`));

// ================= How markdown is retrieved (the behaviour page) =================
for (const [label, options] of [
	['question, default site', {entityId: 11227809}],
	['question, short site name', {entityId: 127968, site: 'scifi'}],
	['question, site as a domain', {entityId: 127968, site: 'scifi.stackexchange.com'}],
	['answer', {entityId: 1010, isForAnswer: true}],
	['ids joined by a semicolon', {entityId: '2;1'}],
	['id as a string with a leading zero', {entityId: '011227809'}],
	['apiKey', {entityId: 1, apiKey: 'abc123'}],
	['apiKey with characters to escape', {entityId: 1, apiKey: 'k=y&z w/+'}],
	['apiKey empty (left out)', {entityId: 1, apiKey: ''}],
	['site empty (the default)', {entityId: 1, site: ''}],
	['site with an apostrophe', {entityId: 1, site: 'it\'s'}],
	['site a number', {entityId: 1, site: 123}],
	['site an object', {entityId: 1, site: {}}],
	['2 ** 53 as the id', {entityId: 2 ** 53}],
]) {
	const start = seenFrom();
	let answer;
	try {
		answer = inspect(await retrieveMarkdown(options));
	} catch (error) {
		answer = `${error.name}: ${error.message}`;
	}

	show(`behaviour: ${label}`, `${requestsSince(start)}\n=> ${answer}`);
}

await program('behaviour: the timing program (sample content)', 'timing.mjs', `import {retrieveMarkdown} from 'stack-exchange-markdown-retriever';

retrieveMarkdown({entityId: 1}, (markdown, error) => {
  console.log('callback:', markdown, error);
});
console.log('retrieveMarkdown returned');
`);
await example('behaviour: callback runs after the call returns', async () => {
	await new Promise(resolve => {
		retrieveMarkdown({entityId: 1}, (markdown, error) => {
			console.log('callback:', markdown, error);
			resolve();
		});
		console.log('retrieveMarkdown returned');
	});
});

for (const [label, id] of [
	['no such post', 404],
	['a post without body_markdown', 9003],
	['an empty body_markdown', 9012],
	['body_markdown a number', 9017],
	['the JSON literal null', 9014],
	['an error body without error_message, status 404', 9019],
	['plain JSON, no Content-Encoding', 9004],
	['deflate with its header', 9005],
	['gzip bytes without a Content-Encoding header', 9006],
	['a 302 redirect to question 1', 9018],
	['error_message beside items, status 200', 9016],
	['API error 400', 9001],
	['throttled, 502', 9002],
	['HTML error page, 500', 9007],
	['cut-off gzip', 9008],
	['204 No Content', 9010],
	['decompresses past 64 MiB (no Content-Encoding)', 9021],
	['decompresses past 64 MiB (Content-Encoding: gzip)', 9022],
	['connection dropped', 9020],
]) {
	const start = seenFrom();
	const viaCallback = await new Promise(resolve => {
		retrieveMarkdown({entityId: id}, (markdown, error) => {
			resolve(error ? `callback: (${inspect(markdown)}, ${error.name}: ${error.message})` : `callback: (${inspect(markdown)}, null)`);
		});
	});
	let viaPromise;
	try {
		viaPromise = `promise: resolves ${inspect(await retrieveMarkdown({entityId: id}))}`;
	} catch (error) {
		viaPromise = `promise: rejects ${error.name}: ${error.message}${error.cause ? ` (cause: ${error.cause.name}: ${error.cause.message})` : ''}${error.status === undefined ? '' : ` status ${error.status}`}`;
	}

	// NUL characters (the 65 MiB of zeros) are printed as <NUL>.
	show(`edge: ${label}`, `${viaCallback}\n${viaPromise}\nrequests: ${fx.seen.length - start}`.replaceAll('\0', '<NUL>'));
}

await capture('edge: 65 MiB of valid JSON with Content-Encoding: gzip (the cap does not apply)', async () => `resolves a string of ${(await retrieveMarkdown({entityId: 9023})).length} characters`);

// Both builds hold their own copy of the class (a dual package), so instanceof across builds is false.
await capture('api: instanceof across the two builds', async () => {
	try {
		await cjs.retrieveMarkdown({entityId: 9001});
	} catch (error) {
		return `error from the CommonJS build: instanceof cjs.StackExchangeError ${error instanceof cjs.StackExchangeError}, instanceof esm.StackExchangeError ${error instanceof esm.StackExchangeError}, name ${error.name}`;
	}
});

// A proxy that hangs up on every CONNECT (its own server, never forwarding): Node's fetch tries again at once, so the
// call fails only at its timeout. The child uses this Node's route: NODE_USE_ENV_PROXY=1, or undici on Node 20.
{
	const port = 47_000 + Math.floor(Math.random() * 1000);
	const proxyEnv = {HTTPS_PROXY: `http://127.0.0.1:${port}`, NO_PROXY: 'localhost', PROXY_PORT: String(port), NODE_OPTIONS: preload(fx.guardFile)};
	const env = fx.route.startsWith('NODE_USE_ENV_PROXY') ? {...proxyEnv, NODE_USE_ENV_PROXY: '1', ROUTE: 'builtin'} : {...proxyEnv, ROUTE: 'undici'};
	writeFileSync('hangup.mjs', `import http from 'node:http';

const connects = [];
const proxy = http.createServer();
proxy.on('connect', (request, socket) => {
	connects.push(request.url);
	socket.destroy();
});
await new Promise(resolve => {
	proxy.listen(Number(process.env.PROXY_PORT), '127.0.0.1', resolve);
});
if (process.env.ROUTE === 'undici') {
	const {setGlobalDispatcher, EnvHttpProxyAgent} = await import('undici');
	setGlobalDispatcher(new EnvHttpProxyAgent());
}

const {retrieveMarkdown} = await import('stack-exchange-markdown-retriever');
try {
	await retrieveMarkdown({entityId: 1, timeout: 2000});
	console.log('resolved');
} catch (error) {
	console.log(error.name + ': ' + error.message);
}

console.log('CONNECTs to ' + [...new Set(connects)].join(', ') + ': ' + (connects.length > 100 ? 'more than 100' : connects.length));
process.exit(0);
`);
	show(`edge: a proxy that hangs up on every CONNECT, timeout 2000 (${env.ROUTE === 'builtin' ? 'NODE_USE_ENV_PROXY=1' : 'undici EnvHttpProxyAgent'})`, printed(await run(process.execPath, ['hangup.mjs'], {env})));
}

// Timeouts and aborts.
await capture('edge: timeout 300 on a server that never answers', async () => {
	const started = Date.now();
	try {
		await retrieveMarkdown({entityId: 9011, timeout: 300});
		return 'resolved';
	} catch (error) {
		return `${error.name}: ${error.message} (instanceof DOMException: ${error instanceof DOMException}; after ${Date.now() - started >= 300 ? '300 ms or more' : 'less than 300 ms'})`;
	}
});
await capture('edge: an AbortSignal aborted during the request', async () => {
	const controller = new AbortController();
	setTimeout(() => controller.abort(), 200);
	try {
		await retrieveMarkdown({entityId: 9011, signal: controller.signal});
		return 'resolved';
	} catch (error) {
		return `${error.name}: ${error.message}`;
	}
});
await capture('edge: an AbortSignal aborted with a reason', async () => {
	const controller = new AbortController();
	setTimeout(() => controller.abort(new Error('stopped by the caller')), 200);
	try {
		await retrieveMarkdown({entityId: 9011, signal: controller.signal});
		return 'resolved';
	} catch (error) {
		return `${error.name}: ${error.message}`;
	}
});
await capture('edge: a signal aborted before the call', async () => {
	const start = seenFrom();
	try {
		await retrieveMarkdown({entityId: 1, signal: AbortSignal.abort()});
		return 'resolved';
	} catch (error) {
		return `${error.name}: ${error.message}; requests: ${fx.seen.length - start}`;
	}
});
await capture('recipes: AbortSignal.timeout', async () => {
	try {
		await retrieveMarkdown({entityId: 9011, signal: AbortSignal.timeout(300)});
		return 'resolved';
	} catch (error) {
		return `${error.name}: ${error.message}`;
	}
});
await capture('edge: timeout larger than setTimeout allows', async () => retrieveMarkdown({entityId: 1, timeout: 1e12}));
await capture('edge: timeout Infinity', async () => retrieveMarkdown({entityId: 1, timeout: Number.POSITIVE_INFINITY}));
for (const response of hanging.splice(0)) {
	response.destroy();
}

// Ids at the edge (README table).
for (const [label, entityId] of [
	['0', 0], ['empty string', ''], ['NaN', Number.NaN], ['false', false], ['string "0"', '0'], ['1.5', 1.5], ['"../x"', '../x'], ['" 1 "', ' 1 '], ['1e21', 1e21], ['a Number object', new Number(1)], ['"1;;2"', '1;;2'],
]) {
	const start = seenFrom();
	await capture(`edge: entityId ${label}`, async () => {
		try {
			const result = await retrieveMarkdown({entityId});
			return `resolves ${inspect(result)}; request ${requestsSince(start)}`;
		} catch (error) {
			return `rejects ${error.name}: ${error.message}; requests ${fx.seen.length - start}`;
		}
	});
}

// A callback that throws: its own process, since the exception is uncaught.
{
	const THROWS = `import {retrieveMarkdown} from 'stack-exchange-markdown-retriever';

let calls = 0;
retrieveMarkdown({entityId: 1}, markdown => {
  calls += 1;
  console.log('call', calls, markdown);
  throw new Error('thrown by the callback');
});
`;
	writeFileSync('throws.mjs', THROWS);
	const r = await run(process.execPath, ['throws.mjs'], {env: fx.env});
	show('edge: a callback that throws (sample content)', `${r.stdout.trim()}\nstderr: ${r.stderr.split('\n').find(line => line.startsWith('Error:'))}\nexit ${r.code}`);
}

// ================= Commands =================
await command('commands: --help', ['--help']);
await command('commands: --version', ['--version']);
await command('commands: -v', ['-v']);
show('commands: request for -s scifi 127968', await command('commands: -s scifi 127968 (sample content)', ['-s', 'scifi', '127968']));
await command('commands: -s scifi.stackexchange.com 127968 (sample content)', ['-s', 'scifi.stackexchange.com', '127968']);
show('commands: request for -a 1010', await command('commands: -a 1010 (sample content)', ['-a', '1010']));
await command('commands: 11227809 (sample content)', ['11227809']);
show('commands: request for -k', await command('commands: -k abc123 1 (sample content)', ['-k', 'abc123', '1']));
await command('commands: not found', ['404']);
await command('commands: no body_markdown', ['9003']);
await command('commands: API error', ['9001']);
await command('commands: throttled', ['9002']);
await command('commands: HTML page', ['9007']);
await command('commands: connection dropped', ['9020']);
await command('commands: --timeout 300 on a server that never answers', ['--timeout', '300', '9011']);
await command('commands: --timeout abc', ['--timeout', 'abc', '1']);
await command('commands: --timeout 0 (no timeout), found', ['--timeout', '0', '1']);
await command('commands: no id', []);
await command('commands: letters as the id', ['abc']);
await command('commands: -s without a value', ['-s']);
await command('commands: -k without a value', ['-k']);
await command('commands: -s followed by the id only', ['-s', '1']);
await command('commands: an unknown flag', ['--foo', '1']);
await command('commands: two ids (the second is ignored)', ['1', '2']);
await command('commands: id 0', ['0']);
await command('commands: ids joined by a semicolon', ['2;1'], {display: `${PACKAGE} '2;1'`});
for (const response of hanging.splice(0)) {
	response.destroy();
}

// The bin through a shell, with the scratch project's .bin first on PATH, as after an install.
const binPath = `${path.resolve('node_modules', '.bin')}${path.delimiter}${process.env.PATH}`;
{
	const r = await shell(`stack-exchange-markdown-retriever 404; echo "exit $?"; stack-exchange-markdown-retriever abc 2>&1; echo "exit $?"`, {env: {...fx.env, PATH: binPath}});
	show('commands: through a shell', printed(r));
}

{
	const dir = scratch('shellloop');
	const r = await shell(`for id in 1 2; do stack-exchange-markdown-retriever "$id" > "question-$id.md"; done; head question-1.md question-2.md`, {cwd: dir, env: {...fx.env, PATH: binPath}});
	show('recipes: a shell loop saving files (sample content)', printed(r));
}

// ================= Recipes =================
{
	await program('recipes: save to a file (sample content)', 'save.mjs', `import {writeFile, readFile} from 'node:fs/promises';
import {retrieveMarkdown} from 'stack-exchange-markdown-retriever';

const markdown = await retrieveMarkdown({site: 'scifi', entityId: 127968});
if (markdown === null) {
  console.log('no such post');
} else {
  await writeFile('127968.md', markdown);
  console.log((await readFile('127968.md', 'utf8')).split('\\n')[0]);
}
`);
	await program('recipes: decode HTML entities (sample content)', 'entities.mjs', `import {retrieveMarkdown} from 'stack-exchange-markdown-retriever';

const entities = {'&quot;': '"', '&#39;': "'", '&lt;': '<', '&gt;': '>', '&amp;': '&'};
const markdown = await retrieveMarkdown({site: 'scifi', entityId: 127968});
console.log(markdown.replaceAll(/&(?:quot|#39|lt|gt|amp);/g, entity => entities[entity]));
`);
	await program('recipes: several posts one after the other (sample content)', 'several.mjs', `import {retrieveMarkdown} from 'stack-exchange-markdown-retriever';

for (const entityId of [1, 2, 404]) {
  const markdown = await retrieveMarkdown({entityId});
  console.log(entityId, markdown);
}
`);
	await program('recipes: handle throttling', 'throttle.mjs', `import {retrieveMarkdown, StackExchangeError} from 'stack-exchange-markdown-retriever';

try {
  await retrieveMarkdown({entityId: 9002});
} catch (error) {
  if (error instanceof StackExchangeError && error.errorName === 'throttle_violation') {
    console.log('throttled:', error.message);
  } else {
    throw error;
  }
}
`);
	await program('recipes: promisify-free callback to Promise', 'wrap.cjs', `const {retrieveMarkdown} = require('stack-exchange-markdown-retriever');

// The callback form, wrapped by hand: note the (markdown, error) order.
const get = options => new Promise((resolve, reject) => {
  retrieveMarkdown(options, (markdown, error) => (error ? reject(error) : resolve(markdown)));
});

get({entityId: 1010, isForAnswer: true}).then(markdown => console.log(markdown));
`);
	await program('recipes: util.promisify gets the order wrong', 'promisify.cjs', `const {promisify} = require('node:util');
const {retrieveMarkdown} = require('stack-exchange-markdown-retriever');

promisify(retrieveMarkdown)({entityId: 1}).then(
  markdown => console.log('resolved', markdown),
  error => console.log('rejected with', error),
);
`);
}

// The proxy recipe: this fixture is itself a proxy, so the recipe's variables are what the children already get.
show('recipes: proxy route this Node used', fx.route);

// ================= Versions and upgrading: 1.1.7 side by side =================
const {OLD, GOLDEN} = process.env;
if (OLD) {
	const oldDir = path.resolve(OLD);
	const oldVersion = JSON.parse(readFileSync(path.join(oldDir, 'node_modules', PACKAGE, 'package.json'), 'utf8')).version;
	show('versions: 1.1.7 installed', `${PACKAGE}@${oldVersion}; request ${JSON.parse(readFileSync(path.join(oldDir, 'node_modules', 'request', 'package.json'), 'utf8')).version}; commander ${JSON.parse(readFileSync(path.join(oldDir, 'node_modules', 'commander', 'package.json'), 'utf8')).version}`);
	const SIDE = `const {retrieveMarkdown} = require('stack-exchange-markdown-retriever');

const calls = [
  {entityId: 127968, site: 'scifi'},
  {entityId: 1010, isForAnswer: true},
  {entityId: 404},
  {entityId: 9001},
  {entityId: 9004},
  {entityId: 'abc'},
];
(async () => {
  for (const options of calls) {
    await new Promise(resolve => {
      try {
        retrieveMarkdown(options, (markdown, error) => {
          console.log(JSON.stringify(options.entityId), '->', JSON.stringify(markdown), error ? error.name + ': ' + error.message : null);
          resolve();
        });
      } catch (error) {
        console.log(JSON.stringify(options.entityId), '-> threw', error.name + ': ' + error.message);
        resolve();
      }
    });
  }
})();
`;
	for (const [label, cwd] of [['versions: 1.1.7 side by side (sample content)', oldDir], ['versions: 2.0.0 side by side (sample content)', process.cwd()]]) {
		const {requests} = await program(label, 'side-by-side.cjs', SIDE, {cwd});
		show(`${label}: requests`, requests);
	}

	const oldCli = path.join(oldDir, 'node_modules', PACKAGE, 'cli.js');
	for (const args of [['-a', '1010'], ['9001'], ['abc'], ['--version']]) {
		const r = await run(process.execPath, [oldCli, ...args], {env: fx.env});
		show(`versions: 1.1.7 cli.js ${args.join(' ')}`, `exit ${r.code}\n--- stdout\n${r.stdout}--- stderr (first line)\n${r.stderr.split('\n')[0]}`);
		const n = await cli(args);
		show(`versions: 2.0.0 cli ${args.join(' ')}`, `exit ${n.code}\n--- stdout\n${n.stdout}--- stderr (first line)\n${n.stderr.split('\n')[0]}`);
	}

	// The registry's deprecation message (a registry read, before nothing else; no fixture variables).
	show('versions: 1.1.7 deprecation message', (await run('npm', ['view', `${PACKAGE}@1.1.7`, 'deprecated'], {shell: WIN, env: plainEnv})).stdout.trim());
	show('versions: 1.1.7 bin field', inspect(JSON.parse(readFileSync(path.join(oldDir, 'node_modules', PACKAGE, 'package.json'), 'utf8')).bin));
}

// ================= Golden capture of 1.1.7, replayed today (L-020, L-113) =================
// The capture starts its own proxy fixture (test/golden/fixture-server.cjs) and sets HTTPS_PROXY itself, so it gets
// only the guard from here (NODE_OPTIONS), never fx.env. 1.1.7 runs it unchanged. The copy run against 2.0.0 gets
// the changes it needs from references/npm.md's four, listed in PATCHES and printed below.
if (GOLDEN && OLD) {
	const CAPTURE = 'capture-1.1.7.cjs';
	const HELPERS = ['codec.cjs', 'fixture-server.cjs'];
	const oldDir = path.resolve(OLD);
	for (const file of [CAPTURE, ...HELPERS]) {
		copyFileSync(path.join(GOLDEN, file), path.join(oldDir, file));
		copyFileSync(path.join(GOLDEN, file), file);
	}

	const routeFile = path.resolve('tls', 'route.cjs').split(path.sep).join('/');
	const PATCHES = [
		['1. the bin path read from package.json', "path.join(path.dirname(require.resolve('stack-exchange-markdown-retriever/package.json')), 'cli.js')",
			"path.join(path.dirname(require.resolve('stack-exchange-markdown-retriever/package.json')), require('stack-exchange-markdown-retriever/package.json').bin['stack-exchange-markdown-retriever'])"],
		['2. none for a dependency 2.0.0 dropped', 'const dependency = name => require(`${name}/package.json`).version;',
			"const dependency = name => {\n    try {\n      return require(`${name}/package.json`).version;\n    } catch {\n      return 'none';\n    }\n  };"],
		['3. undici EnvHttpProxyAgent after the proxy variables, and preloaded in the CLI children', "  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';\n",
			`  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';\n  {\n    const {setGlobalDispatcher, EnvHttpProxyAgent} = require('undici');\n    setGlobalDispatcher(new EnvHttpProxyAgent());\n    process.env.NODE_OPTIONS = \`\${process.env.NODE_OPTIONS || ''} --require "${routeFile}"\`;\n  }\n`],
	];
	let patched = readFileSync(CAPTURE, 'utf8');
	const applied = [];
	for (const [name, from, to] of PATCHES) {
		if (!patched.includes(from)) {
			throw new Error(`patch not applicable: ${name}`);
		}

		patched = patched.replace(from, to);
		applied.push(name);
	}

	applied.push('4. a fixture copy serving CONNECT to other ports in plain HTTP: not needed (2.0.0 requests only https://api.stackexchange.com, CONNECT :443)');
	writeFileSync(`now-${CAPTURE}`, patched);
	show('golden: changes to the copy run against 2.0.0', applied.join('\n'));

	const want = JSON.parse(readFileSync(path.join(GOLDEN, '1.1.7.json'), 'utf8'));
	const answer = entry => JSON.stringify({returned: entry.returned, threw: entry.threw, calls: entry.calls.map(call => call.args), uncaught: entry.uncaught});
	const timing = entry => JSON.stringify(entry.calls.map(call => call.sync));
	const lines = requests => requests.filter(request => (typeof request === 'string' ? !request.startsWith('CONNECT ') : request.method !== 'CONNECT')).map(request => (typeof request === 'string' ? request : `${request.method} ${request.path}`));
	const requestLines = entry => JSON.stringify(lines(entry.requests));
	const cliAnswer = entry => JSON.stringify({status: entry.status, stdout: entry.stdout, stderrError: entry.stderrError});
	const short = text => (text.length > 220 ? `${text.slice(0, 220)}...` : text);
	const guardEnv = {NODE_OPTIONS: preload(fx.guardFile)};
	for (const [label, result] of [
		['golden: 1.1.7 today', await run(process.execPath, [CAPTURE], {cwd: oldDir, env: guardEnv})],
		[`golden: ${VERSION}`, await run(process.execPath, [`now-${CAPTURE}`], {env: guardEnv})],
	]) {
		if (result.code !== 0) {
			show(label, `capture failed, exit ${result.code}\n${result.stderr.split('\n').slice(0, 8).join('\n')}`);
			continue;
		}

		const got = JSON.parse(result.stdout);
		const byName = new Map(got.cases.map(entry => [entry.name, entry]));
		const cliByName = new Map(got.cli.map(entry => [entry.name, entry]));
		const report = [
			`header: package ${got.package}, dependencies ${JSON.stringify(got.dependencies)}, quirks identical: ${JSON.stringify(got.quirks) === JSON.stringify(want.quirks)}`,
			`guard hits in the output: ${result.stdout.includes('wiki-verify guard') ? 'yes' : 'none'}`,
		];
		for (const key of Object.keys(want.quirks)) {
			if (JSON.stringify(got.quirks[key]) !== JSON.stringify(want.quirks[key])) {
				report.push(`quirk ${key}: 1.1.7 ${JSON.stringify(want.quirks[key])}, now ${JSON.stringify(got.quirks[key])}`);
			}
		}
		const differ = {answers: [], timing: [], requests: []};
		for (const entry of want.cases) {
			const now = byName.get(entry.name);
			if (!now) {
				differ.answers.push(`${entry.name}: missing`);
				continue;
			}

			if (answer(now) !== answer(entry)) {
				differ.answers.push(`${entry.name}\n    1.1.7: ${short(answer(entry))}\n    now:   ${short(answer(now))}`);
			}

			if (timing(now) !== timing(entry)) {
				differ.timing.push(`${entry.name}: 1.1.7 ${timing(entry)}, now ${timing(now)}`);
			}

			if (requestLines(now) !== requestLines(entry)) {
				differ.requests.push(`${entry.name}\n    1.1.7: ${short(requestLines(entry))}\n    now:   ${short(requestLines(now))}`);
			}
		}

		const cliDiffer = {answers: [], requests: []};
		for (const entry of want.cli) {
			const now = cliByName.get(entry.name);
			if (cliAnswer(now) !== cliAnswer(entry)) {
				cliDiffer.answers.push(`${entry.name}\n    1.1.7: ${short(cliAnswer(entry))}\n    now:   ${short(cliAnswer(now))}`);
			}

			if (JSON.stringify(lines(now.requests)) !== JSON.stringify(lines(entry.requests))) {
				cliDiffer.requests.push(`${entry.name}\n    1.1.7: ${short(JSON.stringify(lines(entry.requests)))}\n    now:   ${short(JSON.stringify(lines(now.requests)))}`);
			}
		}

		const n = want.cases.length;
		const m = want.cli.length;
		report.push(
			`calls: ${n}; answers identical ${n - differ.answers.length}, timing identical ${n - differ.timing.length}, request lines identical ${n - differ.requests.length}`,
			`CLI runs: ${m}; answers identical ${m - cliDiffer.answers.length}, request lines identical ${m - cliDiffer.requests.length}`,
		);
		for (const [kind, list] of [['answers differ', differ.answers], ['timing differs', differ.timing], ['request lines differ', differ.requests], ['CLI answers differ', cliDiffer.answers], ['CLI request lines differ', cliDiffer.requests]]) {
			if (list.length > 0) {
				report.push(`-- ${kind} (${list.length}):`, ...list.map(item => `  ${item}`));
			}
		}

		show(label, report.join('\n'));
	}
}

// ================= the oldest Node line in engines (L-106) =================
const {OLDEST_NODE, WIKI_VERIFY_CHILD} = process.env;
if (OLDEST_NODE && !WIKI_VERIFY_CHILD) {
	const found = await run('npx', ['-y', '-p', `node@${OLDEST_NODE}`, 'node', '-p', 'process.execPath'], {shell: WIN, env: {NODE_OPTIONS: ''}});
	const alone = path.resolve(`node${OLDEST_NODE}-alone`);
	mkdirSync(alone, {recursive: true});
	const oldNode = path.join(alone, path.basename(found.stdout.trim().split('\n').at(-1)));
	copyFileSync(found.stdout.trim().split('\n').at(-1), oldNode);
	const rerun = await run(oldNode, [fileURLToPath(import.meta.url)], {env: {WIKI_VERIFY_CHILD: '1', PATH: `${alone}${path.delimiter}${process.env.PATH}`}});
	writeFileSync(`wiki-verify.node${OLDEST_NODE}.out.txt`, rerun.stdout);
	show(`oldest node: node@${OLDEST_NODE}`, `${(await run(oldNode, ['--version'])).stdout.trim()}, exit ${rerun.code}, output saved as wiki-verify.node${OLDEST_NODE}.out.txt${rerun.stderr.trim() ? `\n--- stderr\n${rerun.stderr.trim().split('\n').slice(0, 10).join('\n')}` : ''}`);
}

for (const response of hanging.splice(0)) {
	response.destroy();
}

for (const each of closers) {
	await each.close();
}

show('requests the fixture saw', `${fx.seen.length} requests, all to ${[...new Set(fx.seen.map(line => new URL(line.split(' ')[1]).host))].join(', ')}`);
// Keep-alive sockets from this process's proxy agent would hold the loop open; exit once stdout has flushed
// (a pipe to the OLDEST_NODE parent is asynchronous on Windows).
process.stdout.write('', () => process.exit(0));
