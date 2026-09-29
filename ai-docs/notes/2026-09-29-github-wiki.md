---
title: GitHub wiki written for 2.0.0
kind: note
status: active
date: 2026-09-29
verified: 2026-09-29
stale_after: 2027-03-29
tags: [wiki, docs, 2.0.0, github, golden, proxy, node20]
aliases: [wiki, wikiwright, wiki-verify, host fixture]
summary: "the wiki's 10 pages, where their git working copy is, how every example was verified against the published 2.0.0 (host-fixture proxy, guard, sample posts, golden replay of 1.1.7, Node 20 rerun), the facts found on the way, the inaccuracies in the shipped docs, and how to update the wiki; read before touching the wiki or the README, CHANGELOG or CLI-help sentences listed under inaccuracies"
---

# GitHub wiki for 2.0.0

## Summary

Asked on 2026-09-29: write the GitHub wiki with the wikiwright skill (0.4.0), verifying every example and CLI invocation against the published 2.0.0 with local servers only. Written: 10 pages plus sidebar and footer, from the README, CHANGELOG, AGENTS.md, `src/`, the tests, the CI workflows, the npm registry and the golden capture of 1.1.7. Every output on a page came from [2026-09-29-wiki-verify.mjs](2026-09-29-wiki-verify.mjs), saved as [2026-09-29-wiki-verify.out.txt](2026-09-29-wiki-verify.out.txt) (Node 24.18.0) and [2026-09-29-wiki-verify.node20.out.txt](2026-09-29-wiki-verify.node20.out.txt) (Node 20.20.2). The wiki commit, 348a628, is local and not pushed (the maintainer pushes; see "How it was published").

Pages: Home, Getting-Started, API-Reference, How-Markdown-Is-Retrieved (the behaviour page), Commands, Edge-Cases-and-Errors, Recipes, Versions-and-Upgrading, FAQ, Development, `_Sidebar`, `_Footer`.

## Where the pages are

`D:\m4bwa\Claude\Projects\Ai\stack-exchange-markdown-retriever.wiki` (a sibling of this clone, outside this repository), branch `master`, remote `origin` = `https://github.com/m4bwav/stack-exchange-markdown-retriever.wiki.git`. One markdown file per page, named as above with `.md`. Plain markdown links between pages (`[Recipes](Recipes)`), no wikilinks, LF line endings.

## How it was published

Preflight (`wikiwright.py preflight m4bwav/stack-exchange-markdown-retriever --enable --clone ...`) reported `placeholder`: the wiki repository existed with GitHub's one-line `Home.md` (commit 62e9d1c, saved by the maintainer). The pages were committed on top of it in the working copy, which makes a plain fast-forward push. Not pushed in this run, by request: `git -C <wiki dir> push`, then `python <wikiwright>/scripts/wikiwright.py live m4bwav/stack-exchange-markdown-retriever <wiki dir>` (every page must answer 200, Home 301 to `/wiki`).

## Updating the wiki later

1. `git -C <wiki dir> pull --ff-only`, then edit the pages. Page names are the file names with hyphens; links are `[Text](Page-Name)`.
2. Re-verify from a scratch folder outside the repository (Node 24, openssl 3 on PATH; on Windows `BASH` set to Git Bash's `bash.exe`):
   - `npm init -y && npm install stack-exchange-markdown-retriever@<new> undici@7`; copy `2026-09-29-wiki-verify.mjs` in as `wiki-verify.mjs` and `2026-09-29-host-fixture.mjs` as `host-fixture.mjs`; bump `VERSION`.
   - Beside it: `../old117` (`npm install stack-exchange-markdown-retriever@1.1.7`) and `../rt` (`npm install deno bun`).
   - `GOLDEN=<this clone>/test/golden OLD=../old117 RT=../rt OLDEST_NODE=20 node wiki-verify.mjs > wiki-verify.out.txt`
   - `python <wikiwright>/scripts/wikiwright.py diffout 2026-09-29-wiki-verify.out.txt wiki-verify.out.txt` (beside this note): every difference is a page to fix. Do the same for `wiki-verify.node20.out.txt`. `diffout ... --save <file>` saves a new output with ports and local paths masked.
3. `wikiwright.py outputs <wiki dir> <new output> <new node20 output> --address ''` (every page output must be in them), then `wikiwright.py check <wiki dir> --version <new>` and the everwrite checker (`tells.py <wiki dir>/*.md`, 0 strong).
4. Commit, `git push`, then `wikiwright.py live`. When a release changes the version, the pages that name it are: Home (last paragraph), Getting-Started (Deno import `@2.0.0`, npx transcripts), Versions-and-Upgrading (the releases table, the golden replay), Commands (`--version` transcript), FAQ (npx question), `_Footer`.

## How the examples were verified

- Route: wikiwright's host-fixture kit (the skill's npm host-fixture template, saved here as [2026-09-29-host-fixture.mjs](2026-09-29-host-fixture.mjs)), not this repository's `test/helpers/api.js`. The fetch wrapper is lighter, but it only works in-process in Node, and it can't run Deno, Bun, yarn or pnpm children or 1.1.7 (which uses `request`). It also can't exercise the proxy route the README and the CLI help describe. The kit serves `api.stackexchange.com` under its real name through a proxy on 127.0.0.1 with a throwaway CA. It covered the CLI, Node 20, Deno, Bun, pnpm, yarn, npx and 1.1.7 with one set of routes, and the proxy recipe was checked by the same run.
- Guard, tested first: before any case, `GUARD_ONLY=1 node wiki-verify.mjs` ran the kit's guard test. All four requests to `.invalid` hosts (fetch and `node:http`, http and https) failed with `wiki-verify guard: refused a connection to guard-test.invalid:80` (and `:443`). Every run prints that section again. Deno and Bun do not load the guard, so each first fetched `https://probe.invalid/` through the proxy, and its example ran only after the fixture answered 204. The runs' last line: 124 requests on Node 24 and 124 on Node 20, all to api.stackexchange.com, all served by the fixture. Only installs reached a registry (npm, corepack's pnpm and yarn, bun add, npx, `typescript@6`, `node@20`, `npm view` for the deprecation message), each with a plain environment.
- Sample content: the fixture's post bodies are made up for the wiki (`Sample question body, made up for this wiki (not the real post).`). Every page output that shows one says so and links the real post for comparison. Error bodies (`ids`, the throttling message) are the fixture's, modelled on `test/golden/fixture-server.cjs`.
- Runtimes and tools run: Node 24.18.0 and 20.20.2, npm 11.16.0, pnpm 10.34.5, Yarn 4.18.1 (Plug'n'Play), Bun 1.4.2, Deno 2.9.6, TypeScript 6.0.3, Git Bash. Not run: browsers, workers, Node 22 and 26, macOS and Linux (the pages say "not tested" where they name them).
- Golden replay of 1.1.7 (`test/golden/capture-1.1.7.cjs`, read only): as child processes, 1.1.7 first then 2.0.0, with only the guard preloaded. 1.1.7 today: 90 of 90 calls identical in answers, timing and request lines, and 20 of 20 CLI runs. 2.0.0: answers 56 of 90, timing 71 of 90, request lines 73 of 90; CLI answers 10 of 20, CLI request lines 17 of 20 (16 of 20 in the saved Node 20 output; an earlier run had it the other way round). The same on both Node lines otherwise. Every difference maps to a CHANGELOG line except "connection dropped during the tunnel" (see Facts 7); the extra CLI request-line difference, when it appears, is a late retry from that case landing in the `no arguments` CLI run.
- Which of references/npm.md's four changes the capture needed: 1 (the bin path from package.json), 2 (`none` for commander and request), 3 (undici's `EnvHttpProxyAgent` after the proxy variables, and preloaded in the CLI children through `NODE_OPTIONS`). Not 4: 2.0.0 only requests `https://api.stackexchange.com`, so every CONNECT is to port 443. package-modernize's current template (`golden-capture-npm.template.cjs` with `capture-proxy.cjs`, C-20260929-1 and L-125) would have removed all three: `binPath()` and `dependency()` cover 1 and 2, and `startCaptureProxy()` sets the variables before the package loads and routes this process and its children, which covers 3. This capture was written on 2026-09-26, before those.
- Node 20 rerun (`OLDEST_NODE=20`; `installed` line `Node v20.20.2`, shell cases `shell node: v20.20.2`). `wikiwright.py diffout` of the two saved outputs: 177 sections, 168 same, 6 changed, 1 added, 2 removed. The differences: the `installed` line and the two `shell node:` lines (v24.18.0 against v20.20.2); the proxy route, printed twice (`NODE_USE_ENV_PROXY=1` on 24, undici `EnvHttpProxyAgent` preloaded on 20), stated per Node line in the prose of Recipes, Commands and FAQ (no output block depends on it, so no `outputs: node` marker was needed); the hang-up case, whose label names the route (same result on both); the golden CLI request-line count above (timing, not the Node line); and the `oldest node` section, which only the parent prints. Deno failed in the first Node 20 run because Deno 2.9.6 runs the `--require` preloads in `NODE_OPTIONS`; the script now gives Deno and Bun the proxy variables without `NODE_OPTIONS`.
- `wikiwright.py outputs <wiki dir> <both saved outputs> --address ''`: 10 pages, 93 outputs checked, 0 missing, 1 skipped (the URL template on How-Markdown-Is-Retrieved). `check --version 2.0.0`: 10 pages, 0 errors, 0 warnings. everwrite `tells.py`: 0 strong, 5 weak (long sentences, one "rather than"; judged fine).
- This repository's tests: `npm test` on Node 24.18.0, Windows 11, 2026-09-29: 371 tests in 4 suites, 371 pass, 0 fail, 0 skipped.

## Facts verified while writing (not in the README)

1. The request is `https://api.stackexchange.com/2.2/<questions|answers>/<ids>?order=asc&filter=!L_(I6pMIzdXP-hC1clc9EY[&key=...]&site=...`, in that parameter order; an apostrophe goes out as `%27`.
2. A `body_markdown` that is not a string (42) reaches the callback as it is; the Promise resolves `null`.
3. The HTTP status decides nothing: a 404 body without `error_message` resolves `null`, and a 200 with `error_message` fails.
4. The 64 MiB cap covers only bodies the package inflates itself (no Content-Encoding header). A gzip body with `Content-Encoding: gzip`, the way the API sends, is inflated by `fetch` first: 65 MiB of valid JSON came back whole (68157440 characters).
5. `timeout` above 2147483647 is cut to it; `AbortSignal.timeout()` rejects with `TimeoutError: The operation was aborted due to timeout`, while the `timeout` option gives `TimeoutError: The operation timed out.`; an abort reason is passed through as the rejection; a signal aborted before the call sends nothing.
6. Node 20.20.2 ignores `NODE_USE_ENV_PROXY`; a proxy there needs undici's `EnvHttpProxyAgent` preloaded. Deno and Bun read `HTTPS_PROXY` themselves.
7. Behind a proxy that hangs up on every CONNECT, Node's `fetch` retries at once until the call's timeout (more than 100 CONNECTs in 2 s on both routes; about 18,000 in 5 s in a side probe). 1.1.7 failed at once. With `timeout: 0` nothing ends it.
8. The ESM and CJS builds are separate copies: `cjs.retrieveMarkdown !== esm.retrieveMarkdown`, and an error from the CJS build is not `instanceof` the ESM `StackExchangeError`.
9. `null` as the callback selects the Promise form.
10. CLI: `-s 1` takes `1` as the site and fails with "Need an entity id"; `-s` or `-k` last gives parseArgs' "argument missing"; an unknown option gives parseArgs' long message; `'2;1'` needs quoting in a shell; exit 0 for both a missing post and a post without markdown.
11. Yarn 4 (Plug'n'Play) needs `yarn node`; Deno needs `--allow-net` and otherwise throws `NotCapable` before any request.
12. With npm 11.16.0, `npx stack-exchange-markdown-retriever@2.0.0 -s scifi 127968` and `-a 1010` pass the flags to the tool.
13. TypeScript: the Promise form is `Promise<string | null>`, so `markdown.length` is error TS18047.
14. `util.promisify(retrieveMarkdown)` rejects with the markdown (the callback is not error-first).
15. A 302 is followed (two requests); `new Number(1)` and `new String('1')` are unwrapped.
16. `require()` of 2.0.0 returns an object whose own keys are `__esModule`, `StackExchangeError`, `default`, `retrieveMarkdown` and `Symbol.toStringTag`; 1.1.7's had `retrieveMarkdown` only (golden quirk `ownKeys`).
17. GitHub tags for 1.x stop at v1.1.2; 1.1.3 to 1.1.7 exist only on npm. Every 1.x version carries the deprecation message.

## Inaccuracies found in the shipped docs

All wait for the maintainer (the README, CHANGELOG and CLI help ship in the package and reach npm only with a release). None was edited in this run.

1. CLI help (`src/cli.ts` lines 22 and 23, shipped in `dist/cli.mjs`): "On Node, a proxy in HTTPS_PROXY is used only when NODE_USE_ENV_PROXY=1 is set." On Node 20, which `engines` supports, setting it does nothing: the kit's probe with `NODE_USE_ENV_PROXY=1` did not reach the proxy on Node 20.20.2 and had to fall back to undici's `EnvHttpProxyAgent`. Suggest: "On Node 24 (and 22.21+), set NODE_USE_ENV_PROXY=1 to use HTTPS_PROXY; Node 20 does not support it." (The 22.21 line is from Node's docs, not tested here.)
2. CHANGELOG, 2.0.0 Security ("A compressed response may expand to at most 64 MiB; a larger one fails with a StackExchangeError"), and the README edge table ("a compressed response that expands past 64 MiB: StackExchangeError"): true only for bodies without a Content-Encoding header. With `Content-Encoding: gzip` (the API's normal answer) `fetch` inflates the body before the cap: 65 MiB of valid JSON resolved to a 68157440-character string (verify output, "edge: 65 MiB of valid JSON with Content-Encoding: gzip").
3. CHANGELOG, 2.0.0 Changed ("1.1.7's `cli.js` printed `null` and exited 0 for every error"): 1.1.7 exited 1 for argument errors. The golden recording has `no arguments` (exit 1, `Error: Need an entity id to read`), `--version` and `--foo` (exit 1, `error: unknown option ...`). It printed `null` with exit 0 for request and response errors only.
4. AGENTS.md, "What this is" ("1.1.7 ... is the published version until 2.0.0 ships ... Until branch `v2` merges, `master` holds the 1.1.7 code, whose `npm test` cannot run on Node 24"): stale since 2026-09-26. 2.0.0 is `latest`, `v2` is merged and deleted, and `npm test` on master passes 371 of 371 on Node 24.18.0.
5. CHANGELOG link `[2.0.0]: .../compare/v1.1.2...v2.0.0`: the comparison starts at 1.1.2 because there is no v1.1.7 tag, so it also spans the 1.1.3 to 1.1.7 changes. Either tag the 1.1.7 commit or say so beside the link.
6. README, Migrating from 1.x ("Behind a proxy on Node: set `NODE_USE_ENV_PROXY=1` (on the Node lines that support it)"): accurate but leaves Node 20 users with no route; the wiki's Recipes page has the undici preload.

Outside the shipped set: `ai-docs/HANDOFF.md` says "The `next` dist-tag stays on 2.0.0-beta.1 until the next prerelease", but on 2026-09-29 the registry's dist-tags held only `latest: 2.0.0`.

## Gotchas

- Deno 2.9.6 runs `--require` preloads from `NODE_OPTIONS`: give Deno children an environment without the harness's preloads.
- Deno's error output is coloured unless `NO_COLOR=1`.
- The capture's CLI request lines are taken by time window; a request retried late from the previous case lands in the next case's list.
- The capture copy's CLI children get undici's agent through `NODE_OPTIONS`, which the patch sets after the proxy variables exist. Never preload it at the capture's own startup: the agent would be built with no proxy, and only the guard would stop a direct request.
- Yarn's plain `node example.mjs` error names the project folder; the script prints it as `<project>` so no local path reaches a page.

Related: builds on [2026-09-26-phase-0-survey-baseline-and-capture.md](2026-09-26-phase-0-survey-baseline-and-capture.md); see also [../HANDOFF.md](../HANDOFF.md), [../log.md](../log.md).
