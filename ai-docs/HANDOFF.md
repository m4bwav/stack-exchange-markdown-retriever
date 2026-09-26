# Handoff

<!-- Keep under 50 lines. Replace, never append. Written at the end of a work session so the next one starts without re-deriving state. -->

## Current state
Phases 0 to 3 of the package-modernize run are done (2026-09-26). The run is **stopped at the pull request review**.
- master: 15475a7 (Phase 0: survey, golden capture of the published 1.1.7) and b102128 (Phase 1: plan and decision record), pushed.
- v2: 984df24 (golden test first), 3360719 (the rewrite), 40a1db4 (fixes from the independent review), plus the docs commit; pushed.
- Pull request #22: https://github.com/m4bwav/stack-exchange-markdown-retriever/pull/22. CI run 36262493273 is green on 40a1db4. The review summary is posted as a comment.
- Verified: npm test 371/371 on Node 24.18.0, with the decoding suite also green on Node 20, 22, 24.21 and 26. Coverage 100%. Lint, typecheck, publint, attw and the consumer fixtures are clean. The golden files are unchanged since 15475a7.

## In progress
Nothing is running. Waiting on the maintainer.

## Decisions made this session
- The plan is `ai-docs/plans/2026-09-26-modernization-and-v2-release.md` (D1 to D16). The decision record is in `ai-docs/decisions/`.
- The kickoff's recommendations stand. D3b (refuse ids that are not post ids), D3c (30 s default timeout), D3d (a throwing callback is called once) and the rejection when there is no callback are open for the maintainer's ruling in the pull request's "For review" list.

## Dead ends hit
- The "server never answers" golden case failed only in a full run: a pooled connection was closed under it. It now gets a fixture server of its own.
- `node --import` needs a file URL on Windows.
- `npx --no <bin> -a` hands `-a` to npm; use `npx --no -- <bin> -a`.
- `xo --fix` rewrote the public types from `null` to `undefined`; `src/` was reverted.
- DecompressionStream behaves differently on different Node lines for junk after gzip and for two gzip members; those cases are not pinned.

## Next single action
The maintainer reviews #22 and rules on its "For review" list. He also revokes the Snyk API token from the 1.1.4 and 1.1.5 package.json (at snyk.io). Then, for Phase 4, list every GitHub write in one message and take his go. The writes are:
- close the 17 bot pull requests and delete their 17 branches;
- delete webhooks 14564188, 278631033 and 83050034;
- add the branch and tag rulesets;
- apply the settings, secret scanning, push protection, private vulnerability reporting, and read-only workflow permissions.

The command is:

```bash
bash C:/Users/m4bwa/.claude/skills/package-modernize/scripts/post-merge-cleanup.sh m4bwav/stack-exchange-markdown-retriever 22 D:/m4bwa/Claude/Projects/Ai/stack-exchange-markdown-retriever/ai-docs/notes/dispositions.tsv --ruleset-from m4bwav/get-title-at-url/24003504 --tag-ruleset
```

Run it as a dry run first, then with `--apply` after the merge. Then Phase 5: `npm version 2.0.0-beta.1` after `preflight-tag-npm.sh`.
