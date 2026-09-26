# Changelog

All notable changes to this package are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the package uses [Semantic Versioning](https://semver.org/).

## [2.0.0] - Unreleased

**The compatibility promise.** `require('stack-exchange-markdown-retriever').retrieveMarkdown(options, callback)` builds the same request URL 1.1.7 built (`https://api.stackexchange.com/2.2/...`, the same filter and parameters) and calls back in the same order, `(markdown, err)`, with the same markdown, `null` for a post that does not exist, and an error where 1.1.7 had one. The test suite checks this against 90 calls and 20 command-line runs recorded from the published 1.1.7 against a local test server, on both builds and every supported Node line. The exceptions are listed below; each one was a crash, a wrong answer or a way into other API methods: errors are `StackExchangeError` objects (API errors keep their message), an id that is not a post id throws, a callback that is not a function throws, a callback that throws is not called a second time, a plain-JSON response is read, and the command-line tool's `-a` works and its errors exit 1.

### Changed (breaking)

- Needs Node 20 or later. The package has an `exports` map, so deep imports such as `stack-exchange-markdown-retriever/index.js` no longer resolve; import the package by its name.
- `entityId` must be a post id: a whole number, a string of digits, or such ids joined by `;`. Anything else (`-1`, `1.5`, `'abc'`, an array, `'../../users/1'`) throws a `TypeError` before any request. 1.1.7 put any value into the request path, so a crafted id could call other API methods.
- Errors are `StackExchangeError` objects when the API answered with an error (same message as 1.1.7's `Error`, plus `status`, `errorId` and `errorName`) or with a body that is not its JSON (1.1.7 gave a `TypeError` about `toString` for an HTML error page, an empty or cut-off response). Network failures, timeouts and aborts are the platform's own errors.
- A callback that is not a function throws a `TypeError` before any request. 1.1.7 made the request, then crashed the process with an uncaught `TypeError`.
- Requests use the platform's `fetch`. On Node, `HTTPS_PROXY` and `NO_PROXY` are read only when Node is told to (`NODE_USE_ENV_PROXY=1` or `--use-env-proxy`, on the Node lines that have them); 1.1.7's `request` always read them.
- A request that gets no answer fails after 30 seconds with a `TimeoutError` (the new `timeout` option; `0` turns it off). 1.1.7 waited for ever.
- The command-line tool prints errors to stderr, without a stack trace, and exits 1. 1.1.7's `cli.js` printed `null` and exited 0 for every error. A post that does not exist still prints `null` and exits 0; so does a post without markdown (1.1.7 printed `undefined`). `-s` or `-k` without a value is an error (1.1.7 sent `site=true` or `key=true`).

### Fixed

- A callback that throws is called once; its exception still surfaces as an uncaught exception. 1.1.7 caught it and called the callback a second time with that exception as the error.
- A response that is plain JSON (a proxy that had already decompressed it) is read. 1.1.7 failed on anything that was not gzip or deflate data.
  Zero padding after gzip data, and extra bytes after zlib data, are still read, as 1.1.7 read them.
- The command-line tool's `-a`/`--answer` fetches the answer. 1.1.7 ignored it and fetched the question with that id.

### Added

- The command-line tool is installed as `stack-exchange-markdown-retriever` (1.1.7's README documented it, but the package had no `bin`). It also takes `--timeout <ms>`, `--help` and `--version`.
- Called without a callback, `retrieveMarkdown(options)` returns a Promise of the markdown (or `null`), which rejects with the same errors the callback would get, argument errors included.
- `timeout` and `signal` options.
- `StackExchangeError`, exported by name.
- ES module build with the named exports and a default export holding them; TypeScript declarations for both builds.
- Runs in Bun, Deno, workers and browsers: the library uses only `fetch`, `URL`, `AbortController`, `DecompressionStream`, `TextDecoder` and timers.
- Published from GitHub Actions through npm trusted publishing, with provenance.

### Security

- No runtime dependencies. 1.x depends on the deprecated `request` package, whose tree carries critical and high advisories.
- Ids are checked (see Changed): no path injection.
- A compressed response may expand to at most 64 MiB; a larger one fails with a `StackExchangeError`. 1.1.7 had no limit.

## [1.1.7] - 2019-11-28

The last 1.x release: `retrieveMarkdown(options, callback)` on `request` and `zlib`, and a `cli.js` on commander that was never registered as a command.

[2.0.0]: https://github.com/m4bwav/stack-exchange-markdown-retriever/compare/v1.1.2...v2.0.0
[1.1.7]: https://www.npmjs.com/package/stack-exchange-markdown-retriever/v/1.1.7
