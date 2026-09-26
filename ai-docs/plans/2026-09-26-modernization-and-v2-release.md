---
title: Modernization and v2 release
kind: plan
status: active
date: 2026-09-26
verified: 2026-09-26
stale_after: never
tags: [v2, plan, npm, github-actions, tests, release, golden, fetch, cli]
summary: "the living plan for stack-exchange-markdown-retriever 2.0.0: survey, what 1.1.7 gets wrong (-a never worked, a throwing callback called twice, unchecked ids reach other API methods, no timeout, a Snyk token in history), decisions D1-D16, the v2 API with a Promise form, build and test strategy with a local fixture server, phases 0-7 with checkboxes, dispositions of 17 pull requests and 17 branches, security, verification checklist"
---

# Modernization and v2.0.0 release plan: stack-exchange-markdown-retriever

The fourth npm run of the package-modernize skill (C:\Users\m4bwa\.claude\skills\package-modernize: SKILL.md, references/npm.md, references/plan-skeleton.md) and the second on a package that makes network requests. Model: is-an-image-url 2.0.0 (a callback API on request with a CLI, moved to fetch with a Promise form; its `test/golden/` and plan). Evidence goes to [../log.md](../log.md); the survey is [../notes/2026-09-26-phase-0-survey-baseline-and-capture.md](../notes/2026-09-26-phase-0-survey-baseline-and-capture.md); the capture of the published 1.1.7 is `test/golden/1.1.7.json` (90 function cases and 20 CLI runs against `test/golden/fixture-server.cjs`, committed in 15475a7). The kickoff prompt with the maintainer's recommended rulings is `D:\m4bwa\Claude\Projects\Ai\package-modernization\prompts\2026-09-26-stack-exchange-markdown-retriever-kickoff.md`.

## Status

Active. Phases 0 to 4 done 2026-09-26 (PR #22 merged as f17aef4, cleanup applied). Phase 5 waits: the beta tag push was refused by the agent's permission layer; Mark runs it or says "run it" (commands in HANDOFF.md). Open: the Snyk token.

## Goal

- `require('stack-exchange-markdown-retriever').retrieveMarkdown(options, callback)` builds the same URL and calls back with 1.1.7's `(markdown, err)` for every recorded case except the named exceptions; `import` works too, with types for both.
- Called without a callback it returns a Promise of the markdown that rejects with a typed error; options gain `timeout` and `signal`.
- The CLI the README has documented since 2016 exists: registered as `bin`, with `-a` working.
- Zero runtime dependencies: the platform's `fetch` and `DecompressionStream` replace request and zlib; `node:util` `parseArgs` replaces commander. `npm test` never touches the real API.
- Released through npm trusted publishing in staged mode, approved by the maintainer, verified from the registry.

## Where it stands (survey 2026-09-26)

| Fact | Value | Evidence |
|---|---|---|
| Published version, date, downloads a month, dependents | 1.1.7, 2019-11-28; 32 last month (6 to 91 a month over the year); 0 dependents on the registry and by code search | survey note |
| Source, build, tests, language level | `index.js` (75 lines, ES2015 destructuring, CommonJS), `cli.js` (16 lines, commander 4, no shebang), `test.js` (ava 2: two live-API tests, one argument test); no build; xo 0.25, nyc 14, snyk, coveralls, codecov.io, execa (unused) | survey note |
| Entry points and how the old README says to call it | `main: index.js`, `module.exports = {retrieveMarkdown}`; no `bin`; README: `require(...).retrieveMarkdown(options, function (markdown) {...})` and a global CLI `stack-exchange-markdown-retriever [-k <key>] [-a] -s "<site>" <id>` that was never installable | survey note, capture quirks |
| Runtime dependencies and distance from current | request ^2.88.0 (2.88.2, deprecated), commander ^4.0.1 (4.1.1; latest 15.0.0) | survey |
| Issues, pull requests (by author and kind), forks | 0 issues; 17 open pull requests: 15 Dependabot (#2, #4, #7 to #19), 2 Snyk under the maintainer's name (#20, #21); 17 branches, each the head of one of them; fork gitter-badger (2016, closed #1 only) | survey |
| Dependabot alerts, webhooks, secrets, security features | 99 open alerts (runtime scope through request: qs, ajv, uuid, sshpk, json-schema, request); webhooks Snyk 14564188 and 278631033, Travis 83050034; no secrets; scanning and push protection off; workflow permissions write with pull request approval; no rulesets | survey |
| Dead services (badge, config, webhook, app for each) | Travis (badge, `.travis.yml`, webhook 83050034); Snyk (badge, `.snyk`, webhooks 14564188 and 278631033, the `snyk-fix-*` branches, the OAuth app revoked 2026-09-25); Coveralls and codecov (badge, the `coverage` and `travis-after-success` scripts, devDependencies); David (badge); Gitter (badge); nodei.co (two images) | survey note |
| README images and badges | 10 images, the same in the repository and the tarball; 7 to fix (nodei.co twice, Travis and David "not found", Coveralls, Snyk, Gitter), 3 fine (npm version, total downloads, XO) | survey note |
| Leaked credentials | a Snyk API token in package.json's `test` script in the 1.1.4 and 1.1.5 commits and published tarballs (removed in ee6e4b0, 2017) | survey note |
| Baseline: old build and tests as they are | `npm test` fails: xo 0.25.3 crashes on Node 24 (`util.isDate is not a function`); ava's one offline test passes; the two live tests were not run | survey note |
| Golden capture: cases, quirks, claims confirmed or refuted | 90 cases, 20 CLI runs, two identical runs. Refuted: "an API error throws an uncaught exception" (it reaches the callback), "a non-gzipped body gives the zlib error" (a TypeError), "18 branches" (17), "no secrets" (a Snyk token). New: a throwing callback is called twice | `test/golden/1.1.7.json` |

## What the old version gets wrong, confirmed, and what v2 does

Case names are those in `test/golden/1.1.7.json`.

1. **The CLI's `-a` never worked** ("-a answer id", "--answer answer id"): cli.js passes commander's `program` as the options, so `-a` sets `program.answer` and the library reads `isForAnswer`. v2: `-a` fetches the answer. Changelog: "Fixed: `-a`/`--answer` fetches the answer; it was ignored and the question with that id was fetched."
2. **The CLI was never installable**: no `bin`, no shebang. v2: `bin: stack-exchange-markdown-retriever`. Changelog: "Added: the command line tool is installed as `stack-exchange-markdown-retriever`."
3. **The CLI reports every failure as `null` with exit 0** ("API error 400", "plain JSON body", "proxy refuses the tunnel"). v2: the error on stderr, exit 1; not found still prints `null` with exit 0 (recorded). Changelog: "Changed: the command line tool prints errors to stderr and exits 1."
4. **A callback that throws is called a second time** ("callback that throws"): the throw is caught by the `try` around the parse and passed back to the same callback as `(null, err)`, then escapes. v2: the callback runs once; its exception still escapes as an uncaught exception (D3d). Changelog: "Fixed: the callback is called once, even when it throws."
5. **Ids go into the path unchecked** ("entityId with dot segments", "... with a slash", "letters", "negative", "a fraction", "1e21", "true", "an object", "ids as an array", spaces, emoji): `../../users/1` reaches another API method, `1/answers` another route; the WHATWG URL parser that fetch uses would resolve the dot segments differently again. v2: an id must be a whole number or a string of digits, or several joined by `;`; anything else throws a TypeError before any request (D3b). Changelog: "Security: an entityId that is not a post id (or a `;`-joined list of them) throws a TypeError; 1.1.7 put any value into the request path."
6. **No timeout** ("server never answers ..."): a hung server means the callback never runs. v2: `timeout` option, default 30 000 ms (D3c), and `signal`. Changelog: "Added: `timeout` (default 30 seconds) and `signal` options."
7. **No callback crashes the process after the request** ("no callback", "callback null"); a string callback too ("callback a string"). v2: no callback (or `null`) returns a Promise; a callback that is not a function throws a TypeError before the request. Changelog: "Added: called without a callback, `retrieveMarkdown` returns a Promise" and "Changed: a callback that is not a function throws a TypeError."
8. **Undecodable responses give a TypeError about `toString`** ("plain JSON body ...", "HTML error page ...", "truncated gzip body", "204 No Content"): the zlib error is replaced by a crash reading `body.toString()`. v2: the error is a `StackExchangeError` saying what was wrong; the markdown argument stays `null`. A plain-JSON body is parsed (fetch decodes `Content-Encoding` itself, so v2 must parse plain JSON; "plain JSON body" answers `plain`). Changelog: "Changed: errors are `StackExchangeError` objects (API errors keep their message and add `errorId`, `errorName`, `status`)" and "Fixed: a response that is plain JSON (a proxy that decompressed it) is read."
9. **The proxy environment changes meaning**: request honoured `HTTPS_PROXY` and `NO_PROXY`; Node's fetch does only with `NODE_USE_ENV_PROXY=1` (Node 24) or a global dispatcher. v2: documented in the README and the changelog, no code. Changelog: "Changed: requests use the platform's fetch; on Node, `HTTPS_PROXY` is honoured only with `NODE_USE_ENV_PROXY=1`."
10. **Kept, and documented:** the URL (`/2.2/`, `order=asc`, the filter, `key` before `site`, `site` defaulting to `stackoverflow`, `querystring.stringify`'s handling of odd values: numbers, `true`, objects as empty, arrays repeated); `(markdown, err)` argument order, always asynchronous; `(null, null)` for not found, `items: null`, a JSON `null` and an error body without `error_message`; `(undefined, null)` for an item without `body_markdown` and a non-string `body_markdown` passed through; API errors as `(null, err)` with `error_message` as the message; the first item of a `;` list; redirects followed; synchronous `Error: Need an entity id to read` for falsy ids and non-object options, V8's TypeError for null or missing options; deflate and header-less gzip bodies decoded.

## Decisions (recommendation first; the maintainer rules in the plan review, silence means the recommendation stands)

| # | Question | Recommendation | Why | Alternative |
|---|---|---|---|---|
| D1 | The compatibility promise | The callback form builds 1.1.7's URL and calls back 1.1.7's `(markdown, err)` for every captured case, except the named exceptions in items 3 to 8: the markdown argument exactly, `err` null where it was null and an `Error` where it was one (class and message may change except for API errors, whose message stays); the request list (method and path with the query) exactly except where fetch follows the same redirect. The golden suite asserts this on both builds; each exception is named once in test/golden/golden.test.js with its changelog line. The kickoff's named exception "the throw inside the callback on an API error" does not exist in 1.1.7 (the capture refutes it) and is dropped. A later fix that would change a kept answer goes under a new option. | Kickoff ruling; these are the answers a caller can have relied on. | Keep the TypeError-about-`toString` errors exactly (class and message): nobody can rely on them. |
| D2 | Export shape | ESM: named exports `retrieveMarkdown` and `StackExchangeError`, and a default export object holding both (1.1.7's test and README style `import x from` and `x.retrieveMarkdown` keep working). CommonJS: `require()` returns an object with `retrieveMarkdown`, `StackExchangeError` and `default`. Types for both (`.d.mts`, `.d.cts`), attw green in four modes. | `require(...).retrieveMarkdown` is the only call pattern 1.1.7 had; an object export needs no callable-CommonJS recipe. | Named exports only (breaks default-import callers). |
| D3 | Behaviour at the edges | a) Items 3 to 8, each a changelog line. b) Ids: a whole non-negative number, or a string of digits, or digit strings joined by `;` (Number and String wrapper objects unwrapped); anything else throws a TypeError before any request (**not settled by the kickoff; for review**). c) `timeout` default 30 000 ms, bounding the whole call; `0` or a non-finite value means no timeout (**for review**). d) A throwing callback: called once, its exception surfaces as an uncaught exception, as 1.1.7's second throw did (**for review**). e) The Promise form resolves `string | null` (a non-string `body_markdown` becomes `null`) and rejects with the same error the callback would get. | b closes the path injection (`../../users/1`) and gives one answer on every runtime (fetch's URL parser and request's differ on dot segments); every real id is digits. c: a network call with no timeout was the kickoff's reason for the option; 30 s is far above the API's answer time and the recorded hang waits only 3 s. d is the only sane contract. | b: keep sending any id, percent-encoding each path segment (keeps the odd recorded cases' requests but not dot segments). c: no default timeout (exactly 1.1.7). |
| D4 | Whether a major is warranted, and what a patch could do instead | 2.0.0. The package shape changes (exports map, ESM, types, Node floor), the error objects change, ids are validated. After 2.0.0 is verified, the maintainer deprecates 1.x: `npm deprecate stack-exchange-markdown-retriever@"<2" "1.x depends on the deprecated request package, its CLI was never installable and -a was ignored; use 2.x"`. | A 1.1.8 could fix `-a` and add `bin` but would keep request's runtime advisories and a second release path. | No deprecation. |
| D5 | Runtime dependencies | None: `fetch`, `URL`, `AbortSignal`, `DecompressionStream` and `TextDecoder` replace request and zlib; the query is built by a 20-line port of `querystring.stringify`'s rules, unit-tested against `node:querystring` itself; the CLI uses `node:util` `parseArgs`. | Kickoff ruling; request is deprecated and carries the runtime alerts. | Keep commander (15.0.0) for the CLI. |
| D6 | Names | Keep `retrieveMarkdown(options, callback)` and every option name (`entityId`, `isForAnswer`, `site`, `apiKey`). Add: the Promise form on the same name (callbacks are the 2016 idiom); `timeout` and `signal` (a network call with no timeout); `StackExchangeError` (the Promise form needs a typed rejection). Not added: the quota fields (`quota_remaining`): no caller asked. CLI: `stack-exchange-markdown-retriever [-a] [-s <site>] [-k <key>] [--timeout <ms>] <id>`, `-h/--help`, `-v/--version`. | Kickoff ruling. | A second name for the Promise form (`retrieveMarkdownAsync`). |
| D7 | Errors | Error order not flipped: callback `(markdown, err)`. Argument errors: the callback form throws synchronously as 1.1.7 did (`Error: Need an entity id to read` kept word for word for falsy ids; TypeError for bad ids and a non-function callback); the Promise form rejects with the same error. Response errors: `StackExchangeError` with `message` (the API's `error_message`, or what was wrong with the body), `errorId`, `errorName`, `status`, and `cause` for decode failures. Network errors and timeouts: the platform's error as is (`TypeError: fetch failed`, `TimeoutError`, the signal's reason). No error text includes the `key`. | Kickoff ruling (keep the order; typed errors in the Promise form). | Wrap network errors in `StackExchangeError` too. |
| D8 | Node floor and the CI matrix | `engines.node >=20`; Node 20, 22, 24, 26 on Linux, Node 24 on Windows and macOS, Bun, Deno. | The overlay's standing decision; fetch, `DecompressionStream`, `AbortSignal.timeout` and `parseArgs` are all in Node 20. | |
| D9 | Language, build, lint, tests, coverage | The npm defaults: TypeScript ~6.0.3, tsdown 0.23.0 pinned, xo ^5.0.1, node:test against `dist/`, c8 95 and 90, publint, attw, consumer fixtures; the capture's fixture server for the golden, functional and CLI suites; `live.yml` weekly with two real requests. | Same toolchain as the finished runs. | Skip `live.yml`. |
| D10 | Lockfile and the old bot pull requests | A new `package-lock.json` (lockfileVersion 3) under the template's `.npmrc` (`min-release-age=3`). After the merge, with alerts at 0, close the 17 bot pull requests with one comment each naming the merge commit and delete their 17 branches through `post-merge-cleanup.sh` (**needs the maintainer's go in Phase 4**). | The regeneration removes every package they bump. | Leave the branches. |
| D11 | Dead services, and each README badge and image | Remove every image except the three standard badges (table below). Remove `.travis.yml`, `.snyk`, `.vscode/`, the coverage scripts and devDependencies. Delete webhooks 14564188, 278631033 (Snyk) and 83050034 (Travis) (**needs the go in Phase 4**). The maintainer checks github.com/settings/applications for Travis CI and Coveralls grants. | The services are gone or unused. | Keep the XO badge. |
| D12 | Old files to remove | `index.js`, `cli.js`, `test.js`, `.travis.yml`, `.snyk`, .vscode/launch.json, `package-lock.json` (regenerated); `.gitignore` from the template. | Replaced by `src/`, `test/` and the templates. | |
| D13 | Release and version, rehearsal | `2.0.0-beta.1` under `next` through `release.yml` (the template's, GitHub Release in its own job), the maintainer approves, `verify-registry-npm.sh`; then `2.0.0` under `latest`. The trusted publisher already exists (overlay, 2026-09-26); the first staging run proves it. | Kickoff ruling. | |
| D14 | Default branch and optional extras | Keep `master`. Branch ruleset copied from get-title-at-url's 24003504 and the admins-only tag ruleset (`--tag-ruleset`); settings through `gh`: description, homepage the npm page, topics, wiki and projects off, delete-branch-on-merge, secret scanning, push protection, private vulnerability reporting, workflow permissions read (the overlay allows settings; the list goes to the maintainer before Phase 4). No JSR. | The overlay's standing decisions. | |
| D15 | Dependents: what the next run can rely on | None known. A caller of 1.1.7 can move to `^2.0.0` with `require(...).retrieveMarkdown(options, cb)` unchanged for real ids, and can await `retrieveMarkdown(options)`. | | |
| D16 | API version | Keep `/2.2/`. | The promise covers the URL; 2.2 still answers (probe 2026-09-26); the fixture cannot show whether 2.3's answers match, and checking the real API costs quota. A later minor can add an `apiVersion` option if 2.2 is retired. | Move to 2.3 (every recorded request line changes). |

## Proposed public API (v2)

```ts
interface RetrieveMarkdownOptions {
  entityId: number | string;   // a post id, or ids joined by ';'
  isForAnswer?: boolean;       // answers/ instead of questions/
  site?: string;               // default 'stackoverflow'
  apiKey?: string;             // sent as key=
  timeout?: number;            // milliseconds, default 30000; 0 = none
  signal?: AbortSignal;
}
type RetrieveMarkdownCallback = (markdown: string | null | undefined, error: Error | null) => void;
declare function retrieveMarkdown(options: RetrieveMarkdownOptions, callback: RetrieveMarkdownCallback): void;
declare function retrieveMarkdown(options: RetrieveMarkdownOptions): Promise<string | null>;
declare class StackExchangeError extends Error {
  readonly errorId: number | undefined;
  readonly errorName: string | undefined;
  readonly status: number;
}
export {retrieveMarkdown, StackExchangeError};
export default {retrieveMarkdown, StackExchangeError};
```

The callback form throws an Error when `options.entityId` is falsy (1.1.7's message), a TypeError when `options` is null or missing, when the id is not a post id, or when the callback is given and is not a function. The Promise form rejects with the same errors.

## Build and package specifics

- src/retrieve-markdown.ts (URL building, request, decoding, both call forms), src/query-string.ts (the `querystring.stringify` port), src/errors.ts (`StackExchangeError`), src/index.ts (the entry for both builds), src/cli.ts (Node only).
- `package.json` from the template: `type: module`, `exports` with `import` and `require` plus `./package.json`, `main`, `module`, `types`, `bin: {"stack-exchange-markdown-retriever": "dist/cli.mjs"}`, `sideEffects: false`, `files: [CHANGELOG.md, dist]`, `engines >=20`, the overlay's author line, homepage the npm page.
- The portability grep allows `fetch`, `URL`, `AbortSignal`, `DecompressionStream`, `TextDecoder`, `Response`, `Blob`, `queueMicrotask`, `setTimeout`; forbids `process`, `Buffer`, `require`, `node:` in dist/index.*.
- Tests reach the fixture server by replacing `globalThis.fetch` with a wrapper that checks the origin is `https://api.stackexchange.com`, records the URL, and fetches the same path from the fixture server over HTTP (test/helpers/api.js); the CLI suite loads the same wrapper with `node --import`.

## Phases

### Phase 0: survey and baseline (2026-09-26, no package code changed)
- [x] Cloned to `D:\m4bwa\Claude\Projects\Ai\stack-exchange-markdown-retriever`; survey output in the survey note
- [x] Old build and tests run as they are: xo 0.25 crashes, ava's offline test 1/1, live tests not run; logged
- [x] Golden capture from the published 1.1.7 committed under `test/golden/` with its script, `codec.cjs`, `fixture-server.cjs` and `fetch-probe.cjs` (commit 15475a7: the golden JSON, the script and the codec stay as they are from here on)
- [x] everlast registered (mode repo, sync push); AGENTS.md, CLAUDE.md (the AGENTS.md import line), Copilot pointer
### Phase 1: plan
- [x] This plan and the decision record [../decisions/2026-09-26-v2-shape-callback-kept-promise-added-fetch-named-exceptions.md](../decisions/2026-09-26-v2-shape-callback-kept-promise-added-fetch-named-exceptions.md). **Stop**: the kickoff's recommendations stand (silence); D3b, D3c and D3d go to the pull request review; the Snyk token (Security) needs the maintainer.
### Phase 2: rewrite on branch v2
- [x] Remove the D12 files; add the templates; deny dev-only install scripts (2026-09-26)
- [x] Golden test first, green on the first build (292/292, 984df24); canary: 'asc' planted as 'desc', 220 of 292 red, reverted, green; golden files unchanged since 15475a7 (`check-golden-untouched.sh` PASS); then src/, the rest of test/, README, CHANGELOG, SECURITY.md, AGENTS.md (3360719)
- [x] Verified on Node 20, 22, 24, 26 and from a fresh clone (log; 364/364, then 371/371 after the review)
- [x] Workflows and Dependabot added, actionlint 1.7.12, `check-workflow-shell.py` and zizmor clean
- [x] Pushed; pull request #22 opened with a "For review" list (2026-09-26). **Stop.**
### Phase 3: review
- [x] Independent read-only review (prompts/review-subagent.md): 8 findings, 7 fixed and 1 answered (40a1db4); summary on #22 (2026-09-26)
### Phase 4: CI, settings, merge, cleanup
- [x] Merged by Mark 2026-09-26 as a merge commit f17aef4 (read back); ci on master 36262995830 green; the ruleset came after the merge (Mark merged before Phase 4)
- [x] One go from the maintainer for the whole cleanup list (2026-09-26; rulesets 24047775 and 24047776; see log) (the dry run of `post-merge-cleanup.sh` with ai-docs/notes/dispositions.tsv), then `--apply` (with `--tag-ruleset`): alerts 0; tag ruleset; 17 bot pull requests closed; 17 branches deleted; 3 webhooks removed; repo settings; secret scanning and push protection; private vulnerability reporting; workflow permissions read
### Phase 5: release rehearsal
- [ ] `preflight-tag-npm.sh 2.0.0-beta.1` READY (2026-09-26); tag refused by the agent's permission layer, waits for Mark; `watch-run.sh` shows the stage id; **stop** for the approval; `verify-registry-npm.sh` VERIFIED (run id)
### Phase 6: release
- [ ] Changelog dated; `preflight-tag-npm.sh 2.0.0` READY; tagged and staged; **stop** for the approval; `verify-registry-npm.sh` VERIFIED
- [ ] 1.x deprecated by the CLI with the full message in D4; `npm view stack-exchange-markdown-retriever@1.1.7 deprecated` shows it
### Phase 7: wrap-up
- [ ] HANDOFF.md around standing work; inventory row; lessons into the skill; what the kickoff got wrong; next package (format-json-files)

## Test strategy: every artifact, every runtime, and the behaviour itself

| Layer | What it proves | How | Runs where |
|---|---|---|---|
| Golden | D1: every kept case's arguments and request list; each exception named once; Promise-form parity | test/golden/golden.test.js over `1.1.7.json` with `fixture-server.cjs`, both builds | Node 20 to 26, three OSes |
| Unit | the query string against `node:querystring` for odd values and every escaped character; id validation | test/unit/*.test.js | same |
| Functional | both forms: timeout, signal, typed errors, decoding (gzip with and without the header, deflate, plain, truncated), a throwing callback called once, the key never in an error message | test/functional/retrieve-markdown.test.js | same |
| CLI | the golden CLI runs with their exceptions; `-a`; `--help`, `--version`, `--timeout`; errors exit 1 | test/cli/cli.test.js spawning dist/cli.mjs with the fetch wrapper preloaded | same |
| Package shape | exports map, the pack list, the bin with an LF shebang, no Node or DOM references in the library, the CommonJS build in a bare `node:vm` context | test/package/shape.test.js, publint, attw | Node 24 |
| Consumers | `require()` and `import`, default and named; four TypeScript resolution modes; the installed bin | test/consumers/ from the tarball | Node 24; Bun and Deno in CI |
| Live | one question and one answer from the real API | `live.yml`, weekly and on demand, never in `npm test` | Linux, Node 24 |
| From the registry | the published version, fixtures, npx CLI, signatures and attestation | `verify-published.yml` | after each approval |

## Pull requests, issues and forks: disposition

All closing happens in Phase 4, after the v2 merge and with alerts at 0. `{SHA}` is the merge commit.

| Item | What it is | Disposition | Comment to post |
|---|---|---|---|
| #2, #4, #7 to #19 | Dependabot bumps of sshpk, debug, tree-kill, ini, y18n, handlebars, lodash, hosted-git-info, path-parse, ajv, jszip, snyk, decode-uri-component, json5, ms and debug in the 2019 lockfile | close, delete branch | "Closed by the 2.0.0 rewrite ({SHA}): the lockfile was regenerated and the tools that brought this package in (request, snyk, ava 2, nyc 14, xo 0.25, coveralls) are gone. Dependabot alerts: 0." |
| #20, #21 | Snyk integration under the maintainer's name, request 2.88.0 to 2.88.2 | close, delete branch | "Closed by the 2.0.0 rewrite ({SHA}): request is no longer a dependency; 2.0.0 uses the platform's fetch. Snyk is no longer used on this repository." |
| #1, #3, #5, #6 | closed or merged long ago | nothing | none |
| fork gitter-badger/stack-exchange-markdown-retriever | carried #1 only | nothing | none |
| issues | none ever | nothing | none |

## Security

- **Leaked Snyk API token** (survey note): in history and in the published 1.1.4 and 1.1.5. The maintainer revokes it at snyk.io or confirms the account is gone; no history rewrite. Secret scanning and push protection go on in Phase 4.
- Webhooks: three dead ones, deleted with the go (D11). OAuth apps of Travis CI and Coveralls: the maintainer checks; Snyk's was revoked on 2026-09-25.
- Alerts: 99 now, 0 after the lockfile regeneration; `npm audit signatures` and `npm audit --omit=dev` in CI.
- Path injection through `entityId` (item 5): closed by D3b.
- The `key` (the caller's API key) is sent in the query string as the API requires; it never appears in an error message or the CLI's output.
- Workflows from the templates: `permissions: contents: read`, id-token set to write only in the publish job, the GitHub Release in its own job, `persist-credentials: false`, actions pinned to SHAs, actionlint and `check-workflow-shell.py` clean. Default workflow permissions set to read.
- Publishing: npm 2FA with no bypass tokens, trusted publishing bound to `release.yml`, staged mode, the maintainer approves.
- The library: one GET per call plus redirects, bounded by the timeout; no filesystem, `eval` or prototype-touching merges. README says what it is not (no HTML rendering or sanitising of the markdown; the markdown holds HTML entities as the API returns them).
- SECURITY.md with private vulnerability reporting.

## Badges and images: disposition

| Image or badge | What it shows now | Decision | New URL or reason |
|---|---|---|---|
| nodei.co npm card (top) | an unmaintained service's image | remove | replaced by the three badges |
| NPM Version (shields, `?branch=master`) | the version | replace | `https://img.shields.io/npm/v/stack-exchange-markdown-retriever` linking to the npm page |
| downloads (shields, total) | total downloads | replace | `https://img.shields.io/npm/dm/stack-exchange-markdown-retriever` |
| Build Status (Travis) | "not found" | replace | `https://github.com/m4bwav/stack-exchange-markdown-retriever/actions/workflows/ci.yml/badge.svg` |
| Dependency Status (David) | "not found" | remove | Dependabot |
| Coverage Status (Coveralls) | a service not kept | remove | c8 thresholds in CI |
| Known Vulnerabilities (Snyk) | a service not kept | remove | Dependabot alerts and `npm audit` in CI |
| XO code style | true but not useful to users | remove | the three-badge default |
| Gitter | a room nobody answers | remove | issues and private vulnerability reporting |
| nodei.co downloads chart (bottom) | an unmaintained service's image | remove | the downloads badge |

## Verification checklist (what "done" means)

| Claim | Command or place | Expected |
|---|---|---|
| Installs clean | `npm ci` in a fresh clone | no deprecation warnings, 0 vulnerabilities |
| Zero runtime dependencies | `npm ls --omit=dev --all` | nothing under the package |
| Old behaviour kept | `npm test`, CI, verify-published | every kept golden case exact; exceptions named; both builds; every Node line |
| Old call pattern works | `node -e "require('stack-exchange-markdown-retriever').retrieveMarkdown({entityId: 1}, console.log)"` with the fetch wrapper | prints the fixture's markdown and null |
| CLI works | `npx stack-exchange-markdown-retriever@2 --help`, `--version` | the usage text; the version; exit 0 |
| Dual output is correct | `npx publint`, `npx attw --pack .` | no errors in any mode |
| Portable | the shape test | no Node or DOM references in `dist/index.*`; the bare-engine run passes |
| No network in tests | `npm test` | only 127.0.0.1 |
| Published with provenance | `verify-registry-npm.sh` | signature and attestation verified |
| Release exists | `gh release view v2.0.0` | notes from the changelog |
| No alerts | `gh api "repos/m4bwav/stack-exchange-markdown-retriever/dependabot/alerts?state=open" --jq length` | `0` |
| Repo tidy | `gh pr list`, `git ls-remote --heads origin`, `gh api repos/m4bwav/stack-exchange-markdown-retriever/hooks --jq length` | no open pull requests, only `master`, 0 webhooks |
| Badges and images work | `node scripts/check-readme-images.mjs README.md`, and on the published README | exit 0 |
| Scanning on, token dead | `gh api repos/m4bwav/stack-exchange-markdown-retriever --jq .security_and_analysis`; the maintainer's word on the Snyk token | enabled; revoked |

## Risks and open points

- The real API may answer something the fixture does not model (a `backoff` field, other error names); the promise covers only the recorded cases. `live.yml` watches the two ordinary cases weekly.
- Bun's and Deno's fetch may send other headers; the golden suite runs on Node only.
- The CLI's `-s` takes the next argument as its value in both 1.1.7 and v2 (`-s 1` leaves no id); kept.
- DecompressionStream answers some malformed bodies differently per Node line (gzip followed by junk, two gzip members; see test/functional/decoding.test.js); the API sends one gzip member, so only the cases every line agrees on are pinned.

## Appendix: cleanup commands (all paths absolute)

`D:\m4bwa\Claude\Projects\Ai\stack-exchange-markdown-retriever\ai-docs\notes\dispositions.tsv` is written in Phase 4 from the table above, then:

```bash
bash C:/Users/m4bwa/.claude/skills/package-modernize/scripts/post-merge-cleanup.sh m4bwav/stack-exchange-markdown-retriever <PR> D:/m4bwa/Claude/Projects/Ai/stack-exchange-markdown-retriever/ai-docs/notes/dispositions.tsv --ruleset-from m4bwav/get-title-at-url/24003504 --tag-ruleset
```

## Next single action

The maintainer reviews #22 and rules on its "For review" list; then list every Phase 4 GitHub write in one message (from ai-docs/notes/dispositions.tsv and the dry run of post-merge-cleanup.sh) and take the go.
