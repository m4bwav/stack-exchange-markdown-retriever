# AGENTS.md

Rules for any AI agent (Claude Code, Copilot, Cursor, Codex) working in this repository. `CLAUDE.md` and `.github/copilot-instructions.md` only point here.

## What this is

The npm package `stack-exchange-markdown-retriever`: fetches the markdown source (`body_markdown`) of a question or an answer from the Stack Exchange API (`https://api.stackexchange.com/2.2/...`), with a command line tool. On npm since 2016; 1.1.7 (2019-11-28, one CommonJS file on request and commander, no build) is the published version until 2.0.0 ships. Version 2 is TypeScript in `src/`, built by tsdown into ESM and CommonJS with a declaration file for each, with no runtime dependencies. The plan is `ai-docs/plans/2026-09-26-modernization-and-v2-release.md`; start with `ai-docs/HANDOFF.md` to see how far it has got. Until branch `v2` merges, `master` holds the 1.1.7 code, whose `npm test` cannot run on Node 24 (xo 0.25 crashes; see the survey note); the commands below are version 2's.

## Rules

- **The callback answers of 1.1.7 stay, except the named fixes.** `retrieveMarkdown(options, callback)` builds the same URL and calls back with 1.1.7's `(markdown, err)` for every case in `test/golden/1.1.7.json`, except the exceptions the plan's D1 and D3 list, each named once in the golden test with its changelog line. The callback's argument order is not error-first and stays that way; the Promise form (no callback) rejects instead. The golden file was captured from the published 1.1.7 by `test/golden/capture-1.1.7.cjs` with `codec.cjs` against `fixture-server.cjs`, in a scratch project; never regenerate it from this repository, and never edit the golden JSON, the capture script or the codec (`scripts/check-golden-untouched.sh` in the package-modernize skill checks it). Any other change to an old answer needs a decision entry in `ai-docs/decisions/` and a changelog line.
- **Never touch the real API from a test.** The anonymous quota is 300 requests a day per IP address. `npm test` and every suite use the local fixture server (`test/golden/fixture-server.cjs`); only the opt-in `npm run test:live` (and the weekly `live.yml`) calls api.stackexchange.com, with two requests.
- **Availability.** The package must stay usable from `import` and `require`, ship types for both, and support every Node line in `engines`. The library stays free of Node and DOM APIs (`process`, `Buffer`, `require`, `__dirname`, `node:` imports, `window`, `document`); it uses only `fetch`, `URL`, `AbortSignal`, `DecompressionStream`, `TextDecoder` and timers. Only the CLI entry may use Node APIs. No runtime dependency without a decision entry in `ai-docs/decisions/`.
- **Tests cover every artifact, not just the code.** Golden, unit, functional and CLI against the local fixture server, package shape (`publint`, `@arethetypeswrong/cli`), consumer fixtures for ESM, CJS and the type files, Bun and Deno, and post-publish verification from the registry. A behaviour change lands with its test.
- **Nothing reaches npm without the maintainer.** Never run `npm publish` or `npm stage publish` from a machine, never create or store an npm token, and never approve anything on npmjs.com. Releases go through `release.yml`, which only stages; the maintainer approves each version with 2FA.
- **Releases follow one ritual.**
  1. Update `CHANGELOG.md`. A release's heading carries its date; a prerelease uses the section of the release it leads to (`## [2.0.0] - Unreleased`, never a bare `## [Unreleased]`).
  2. Run the package-modernize skill's `scripts/preflight-tag-npm.sh VERSION <this repo>`; it prints READY with the two commands.
  3. Run `npm version <version>`, then `git push --follow-tags`.
  4. `release.yml` builds, tests, stages the npm publish through trusted publishing, and a separate job creates the GitHub Release.
  5. The maintainer approves the staged version on npmjs.com; then `scripts/verify-registry-npm.sh` runs the checks, `verify-published.yml` included.
- **Dependencies.** Dependabot opens weekly pull requests (npm and GitHub Actions) with a cooldown; merge when the `ci` check is green, and read the release notes for a major first. `.npmrc` sets `min-release-age=3`: an install resolves only versions at least three days old. To take a younger one on purpose, pass `--min-release-age=0` on that one command and say why in the commit. Actions are pinned to commit SHAs with the version in a comment.
- **Research beats recall.** Node, npm and tool versions change; the notes under `ai-docs/notes/` carry the date each fact was verified. Re-verify any version number older than three months before relying on it.
- **Document for handoff.** Anything learned, decided or built goes into `ai-docs/` (at minimum a line in `ai-docs/log.md`) before you finish. Rewrite `ai-docs/HANDOFF.md` when work is left unfinished. A fresh session in any tool must be able to continue from disk alone.
- **No AI attribution anywhere**: no Co-Authored-By trailers, no "generated with" lines in commits, pull requests or files.
- **Windows note.** Write files with an editor tool, not shell heredocs (they lose backslashes). Check line endings by counting byte 13 with node; Git Bash's grep cannot see carriage returns. `.gitattributes` keeps the repository LF (the 1.1.7 tarball was published with CRLF files).

## Commands (version 2)

```bash
npm ci
npm run build          # tsdown -> dist/ (index.mjs, index.cjs, index.d.mts, index.d.cts, cli.mjs, maps)
npm test               # build, then node --test: golden, unit, functional, CLI, package shape (local fixture server only)
npm run test:dist      # the same suites against the dist/ already built
npm run test:consumers # build, pack, install the tarball into a scratch project, run the ESM, CJS, type and bin fixtures
npm run test:live      # opt-in: two requests to the real API; never part of npm test
npm run coverage       # c8 over the suites, mapped back to src/; fails under 95% lines or 90% branches
npm run lint           # xo
npm run typecheck      # tsc --noEmit
npm run check          # publint, attw --pack ., npm pack --dry-run (needs a build first)
```

tsdown needs Node 22.18+ or 24 to build; the built output and the tests run on Node 20 and up.

## Layout and traps

- `test/golden/1.1.7.json` was captured from the published 1.1.7. 1.1.7 always requests `https://api.stackexchange.com`, so the capture set `HTTPS_PROXY` to the fixture server, which records each CONNECT and answers it itself over TLS with a throwaway certificate (openssl); nothing was forwarded. The 2.x suites point fetch at the same server over plain HTTP (`test/helpers/api.js` swaps `globalThis.fetch` for one that rewrites the origin and records the URL). Route behaviour is chosen by the id: 127968, 1, 2 and 1010 hold posts, 9001 and up are the odd responses listed in the server file, anything else is not found. `fetch-probe.cjs` is evidence, not a test.
- After `server.dropConnections()` the suites wait before the next request: fetch can otherwise reuse a pooled socket the server just destroyed (seen in is-an-image-url on Node 20, 22 and 26).
- Tests import `dist/`, never `src/`, and run against both builds (`test/helpers/builds.js`). The npm scripts name every test file, because plain `node --test` would also run the fixtures and the capture scripts.
- `xo --fix` rewrites code: stage your work first and read the diff it makes to `src/`.
- The npm trusted publisher names `release.yml`, so renaming the file breaks publishing.

## everlast (session knowledge, load on demand)

- `ai-docs/INDEX.md` lists what past sessions learned here (solutions with verified commands, decisions with reasons, plans). At the start of a task, scan it and open only the entries whose title or tags match; no line matches: `everlast.py search "<key terms>"` before concluding nothing was recorded. Read `ai-docs/HANDOFF.md` when continuing unfinished work (everlast-resume skill).
- Before finishing a task that hit a dead end, verified a non-obvious command, made a design choice, or taught you something about the user, record it (everlast-capture skill, or `everlast.py note` / `handoff`); rewrite `HANDOFF.md` when work is left unfinished.
- Anything naming a person, an internal host or name, a credential, or an opinion about people goes to the private sidecar (`--private`), never here. Lessons about the user or this machine go to the user tier (`--user`).
- Link documents together with relative markdown links; entries link related entries on a typed `Related:` line (`supersedes`, `contradicts`, `builds on`, `see also`). No wikilinks in the repo.
