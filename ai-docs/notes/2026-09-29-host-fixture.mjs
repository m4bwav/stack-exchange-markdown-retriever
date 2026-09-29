// host-fixture: serve pages under their real host names to the published package, its CLI, old versions, Deno,
// Bun and the package managers, with nothing reaching the internet (wikiwright L-116 `by-host-name-proxy`,
// L-117 `guard-normalised-args`, references/npm.md). Copy this file beside wiki-verify.mjs, in the scratch
// project and in the repository's ai-docs/notes/ (as <date>-host-fixture.mjs).
//
//   import {startHostFixture} from './host-fixture.mjs';
//   const fx = await startHostFixture({
//     hosts: ['api.example.com'],                 // every host a page or the package names
//     handle(url, request, response) { ... },     // url: the URL the client meant, https://api.example.com/x?y
//   });
//   fx.guardCheck                                  // the guard refused .invalid hosts with its own message: print it
//   fx.route                                       // how Node children reach the fixture: print it
//   await run(process.execPath, ['example.mjs'], {env: fx.env});   // children: Node, Deno, Bun, npx, bash
//   await fx.routeThisProcess();                   // this process's fetch too (needs undici@7 for Node 20)
//   fx.seen                                        // 'GET https://api.example.com/x?y', in order: print one case
//   await fx.close();
//
// How it works: a plain server and a TLS server share `handle`, behind a stand-in proxy on 127.0.0.1 that
// answers CONNECT and routes by port (443 to TLS, any other to plain: Node tunnels http: too, L-112). The TLS
// certificate is signed by a throwaway CA made here with openssl (Deno refuses a self-signed CA certificate
// as the server's own); runtimes trust the CA through NODE_EXTRA_CA_CERTS and DENO_CERT, read at startup.
// Node 24 honours NODE_USE_ENV_PROXY=1 (read at startup); Node 20 has no such variable, so its children
// preload undici's EnvHttpProxyAgent (npm install undici@7). A probe to an .invalid host picks the route, so
// a probe that skipped the proxy cannot leave the machine. A guard preloaded in every child (and in this
// process by routeThisProcess) refuses any socket not to 127.0.0.1; it reads the options from inside the array
// net.connect() passes, or plain http slips through. The guard is tested at start against .invalid hosts only.

import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import tls from 'node:tls';
import {spawn, spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';

const require = createRequire(import.meta.url);

const GUARD = `'use strict';
const net = require('node:net');
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
	const first = Array.isArray(args[0]) ? args[0][0] : args[0];
	const o = typeof first === 'object' && first !== null ? first : {port: first, host: args[1]};
	if (!o.path && !['127.0.0.1', 'localhost', '::1', undefined].includes(o.host)) {
		throw new Error('wiki-verify guard: refused a connection to ' + o.host + ':' + o.port);
	}
	return Reflect.apply(connect, this, args);
};
`;
const ROUTE = `'use strict';
const {setGlobalDispatcher, EnvHttpProxyAgent} = require('undici');
setGlobalDispatcher(new EnvHttpProxyAgent());
`;
// Every client the guard must stop: fetch and node:http(s), plain and TLS, to hosts that cannot resolve.
const GUARD_TEST = `import http from 'node:http';
import https from 'node:https';
for (const url of ['http://guard-test.invalid/', 'https://guard-test.invalid/']) {
	const viaFetch = await fetch(url).then(r => 'status ' + r.status, e => String(e.cause?.message ?? e.message));
	const viaHttp = await new Promise(resolve => {
		try {
			(url.startsWith('https') ? https : http).get(url, r => resolve('status ' + r.statusCode)).on('error', e => resolve(e.message));
		} catch (error) {
			resolve(error.message);
		}
	});
	console.log(url + ' fetch: ' + viaFetch);
	console.log(url + ' http: ' + viaHttp);
}
`;
const PROBE = "console.log(await fetch('http://wiki-verify.invalid/').then(r => r.status, e => e.message));\n";

// NODE_OPTIONS reads a backslash as an escape: preload paths go in with forward slashes (L-116).
export const preload = file => `--require "${path.resolve(file).split(path.sep).join('/')}"`;

function child(file, args, env) {
	return new Promise(resolve => {
		const proc = spawn(file, args, {env: {...process.env, ...env}});
		proc.stdin.end();
		let out = '';
		proc.stdout.on('data', chunk => {
			out += chunk;
		});
		proc.stderr.on('data', chunk => {
			out += chunk;
		});
		proc.on('close', code => resolve({code, out: out.replaceAll('\r\n', '\n').trim()}));
	});
}

function makeCertificates(dir, hosts, openssl) {
	const steps = [
		['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', `${dir}/ca-key.pem`, '-out', `${dir}/ca.pem`, '-days', '2',
			'-subj', '/CN=wiki-verify CA', '-addext', 'basicConstraints=critical,CA:TRUE', '-addext', 'keyUsage=critical,keyCertSign'],
		['req', '-newkey', 'rsa:2048', '-nodes', '-keyout', `${dir}/key.pem`, '-out', `${dir}/server.csr`, '-subj', '/CN=wiki-verify fixture',
			'-addext', `subjectAltName=${hosts.map(host => `DNS:${host}`).join(',')}`],
		['x509', '-req', '-in', `${dir}/server.csr`, '-CA', `${dir}/ca.pem`, '-CAkey', `${dir}/ca-key.pem`, '-set_serial', '1', '-days', '2',
			'-copy_extensions', 'copyall', '-out', `${dir}/cert.pem`],
	];
	for (const args of steps) {
		// MSYS_NO_PATHCONV: Git for Windows' openssl would read /CN=... as a path.
		const made = spawnSync(openssl, args, {encoding: 'utf8', env: {...process.env, MSYS_NO_PATHCONV: '1'}});
		if (made.status !== 0) {
			throw new Error(`openssl failed (set OPENSSL to an OpenSSL 3 binary): ${made.stderr || made.error}`);
		}
	}
}

export async function startHostFixture({hosts, handle, dir = 'tls', openssl = process.env.OPENSSL || 'openssl'}) {
	mkdirSync(dir, {recursive: true});
	makeCertificates(dir, hosts, openssl);
	const ca = path.resolve(dir, 'ca.pem');
	const guardFile = path.join(dir, 'guard.cjs');
	const routeFile = path.join(dir, 'route.cjs');
	writeFileSync(guardFile, GUARD);
	writeFileSync(routeFile, ROUTE);
	writeFileSync(path.join(dir, 'probe.mjs'), PROBE);
	writeFileSync(path.join(dir, 'guard-test.mjs'), GUARD_TEST);

	const seen = [];
	const serve = scheme => (request, response) => {
		// Through CONNECT the request line is a path; sent to the proxy directly it is the absolute URL.
		const url = new URL(request.url, `${scheme}://${request.headers.host}`);
		if (url.hostname.endsWith('.invalid')) {
			response.writeHead(204).end();
			return;
		}

		seen.push(`${request.method} ${url.href}`);
		handle(url, request, response);
	};

	const plain = http.createServer(serve('http'));
	const secure = https.createServer({key: readFileSync(path.join(dir, 'key.pem')), cert: readFileSync(path.join(dir, 'cert.pem'))}, serve('https'));
	const proxy = http.createServer(serve('http'));
	proxy.on('connect', (request, socket) => {
		socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
		(request.url.endsWith(':443') ? secure : plain).emit('connection', socket);
	});
	await new Promise(resolve => {
		proxy.listen(0, '127.0.0.1', resolve);
	});
	const proxyUrl = `http://127.0.0.1:${proxy.address().port}`;
	// NO_PROXY names the loopback addresses: when it is empty, Node 24's own proxy support also sends a client's
	// connection to the proxy through the proxy (package-modernize L-125, request 2.88 under NODE_USE_ENV_PROXY=1).
	const LOCAL = '127.0.0.1,localhost,::1';
	const base = {
		HTTP_PROXY: proxyUrl, HTTPS_PROXY: proxyUrl, NO_PROXY: LOCAL, http_proxy: proxyUrl, https_proxy: proxyUrl, no_proxy: LOCAL,
		NODE_EXTRA_CA_CERTS: ca, DENO_CERT: ca, NODE_OPTIONS: preload(guardFile),
	};

	// The guard, tested before anything else runs: every line must name the guard, not ENOTFOUND (L-117).
	const test = await child(process.execPath, [path.join(dir, 'guard-test.mjs')], {NODE_OPTIONS: preload(guardFile), HTTP_PROXY: '', HTTPS_PROXY: '', http_proxy: '', https_proxy: '', NODE_USE_ENV_PROXY: ''});
	const lines = test.out.split('\n');
	const guardOk = lines.length === 4 && lines.every(line => line.includes('wiki-verify guard: refused'));
	if (!guardOk) {
		throw new Error(`the guard did not refuse every .invalid request:\n${test.out}`);
	}

	const probe = await child(process.execPath, [path.join(dir, 'probe.mjs')], {...base, NODE_USE_ENV_PROXY: '1'});
	let env;
	let route;
	if (/^\d+$/.test(probe.out)) {
		env = {...base, NODE_USE_ENV_PROXY: '1'};
		route = 'NODE_USE_ENV_PROXY=1';
	} else {
		try {
			require.resolve('undici');
		} catch {
			throw new Error(`Node ${process.version} ignores NODE_USE_ENV_PROXY and undici is not installed here: npm install undici@7`);
		}

		env = {...base, NODE_OPTIONS: `${preload(guardFile)} ${preload(routeFile)}`};
		route = 'undici EnvHttpProxyAgent preloaded';
	}

	return {
		proxyUrl,
		ca,
		env,
		route,
		seen,
		guardFile,
		guardCheck: `guard refused ${lines.length} of 4 requests to .invalid hosts (fetch and node:http, http and https)`,
		// This process: the guard, and undici's ProxyAgent trusting the CA (needs undici in the scratch project).
		async routeThisProcess() {
			require(path.resolve(guardFile));
			const {setGlobalDispatcher, ProxyAgent} = require('undici');
			setGlobalDispatcher(new ProxyAgent({uri: proxyUrl, requestTls: {ca: [...tls.rootCertificates, readFileSync(ca, 'utf8')]}}));
		},
		async close() {
			for (const server of [proxy, secure, plain]) {
				server.closeAllConnections?.();
				server.close();
			}
		},
	};
}
