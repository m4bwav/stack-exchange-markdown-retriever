---
title: "v2 shape: keep the callback's URL and answers, add a Promise form, fetch instead of request, validate ids, fix the CLI"
kind: decision
status: accepted
date: 2026-09-26
verified: 2026-09-26
stale_after: never
tags: [v2, api, errors, esm, cjs, golden, compatibility, fetch, cli, security]
summary: "read before changing what retrieveMarkdown answers, which URL it builds, how it requests, or how it is exported: why 2.0.0 keeps 1.1.7's (markdown, err) callback and URL except named fixes, adds a Promise form with StackExchangeError, drops request and commander, refuses ids that are not post ids, adds a 30 s timeout, keeps /2.2/"
---

# Decision: v2 keeps the callback's URL and answers, adds a Promise form, uses fetch, validates ids, fixes the CLI

Date: 2026-09-26. Status: accepted by default (the kickoff's recommendations, silence stands); D3b, D3c and D3d were not settled by the kickoff and are listed for the maintainer at the pull request review. Each point maps to a row of the decisions table in [../plans/2026-09-26-modernization-and-v2-release.md](../plans/2026-09-26-modernization-and-v2-release.md).

## Context

stack-exchange-markdown-retriever 1.1.7 (2019) is one CommonJS file on the deprecated request package, with a CLI that was never registered as a command and whose `-a` flag never worked. Phase 0 recorded its behaviour against a local fixture server (`test/golden/1.1.7.json`); the kickoff prompt gave the maintainer's recommended rulings.

## Decision

- The callback form `retrieveMarkdown(options, callback)` keeps 1.1.7's URL (`/2.2/`, the filter, `order=asc`, `key` before `site`) and its `(markdown, err)` answers for every case in `test/golden/1.1.7.json`, except named exceptions: errors are `StackExchangeError` objects (API messages kept), a plain-JSON body is read, ids that are not post ids throw a TypeError, a non-function callback throws, no callback returns a Promise, a throwing callback is called once, and the CLI's `-a` works and errors exit 1.
- The argument order stays `(markdown, err)`; the new Promise form rejects with typed errors.
- Zero runtime dependencies: fetch, DecompressionStream and a port of `querystring.stringify` replace request and zlib; `parseArgs` replaces commander.
- `timeout` (default 30 000 ms) and `signal` are the only new options; quota fields are not exposed.
- `/2.2/` stays.

## Reasons

- The URL and the callback's answers are all a caller of 1.1.7 could observe; the golden capture pins them, and the exceptions are answers nobody wants (a crash reading `toString`, a double callback, a path injection).
- The kickoff's "uncaught throw on an API error" does not exist in 1.1.7 (the throw is inside the `try` that feeds the callback), so that exception is dropped rather than invented.
- fetch decodes `Content-Encoding` itself, so a plain-JSON body must be readable; header-less gzip is sniffed as 1.1.7's zlib.unzip did.
- The WHATWG URL parser resolves dot segments that request sent as written; refusing non-id values gives one answer on every runtime and closes the injection.

## Alternatives rejected

- Flip to error-first callbacks: breaks every caller for style.
- Keep sending any id with each segment percent-encoded: keeps odd recorded requests, keeps a surface nobody uses.
- No default timeout: exact 1.1.7, but a hung connection never calls back.
- Move to `/2.3/`: every request line changes and the fixture cannot prove the answers match.

Related: builds on [../notes/2026-09-26-phase-0-survey-baseline-and-capture.md](../notes/2026-09-26-phase-0-survey-baseline-and-capture.md); see also [../plans/2026-09-26-modernization-and-v2-release.md](../plans/2026-09-26-modernization-and-v2-release.md).
