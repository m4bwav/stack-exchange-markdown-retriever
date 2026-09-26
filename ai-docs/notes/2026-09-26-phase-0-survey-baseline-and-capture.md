---
title: "Phase 0 survey: registry, repository, baseline, capture and security of 1.1.7"
kind: note
status: active
date: 2026-09-26
verified: 2026-09-26
stale_after: 2027-03-26
tags: [survey, baseline, v2, dead-services, tarball, golden, cli, fetch, security, snyk]
aliases: [survey, baseline, cli.js, commander, request, webhooks, fixture server, snyk token]
summary: "read before the plan or the cleanup: what 1.1.7 is and ships, the old suite's result on Node 24, what the golden capture found (API errors do reach the callback; a throwing callback is called twice; -a never worked), the Snyk token in history, the dead services with their webhook ids, how fetch differs from request, and the raw survey-npm.sh, image-check and fetch-probe output"
---

# Phase 0 survey: stack-exchange-markdown-retriever 1.1.7

## Summary

Surveyed 2026-09-26 with the package-modernize skill's `scripts/survey-npm.sh` (raw output below), Node 24.18.0 and npm 11.16.0 on Windows. Nothing in the package changed during Phase 0. The golden capture of the published 1.1.7 is `test/golden/1.1.7.json` (see the plan for the cases and the exceptions).

## Registry and repository

- npm: latest 1.1.7 (2019-11-28), eleven versions since 2016-05-27; 32 downloads 2026-08-26 to 2026-09-24; registry counts 0 dependents; `gh search code` finds only this repository. One registry signature, no attestations. Maintainer markrogers.
- The tarball (3819 bytes, 9 files) equals master file for file (`diff --strip-trailing-cr`), but was packed from Windows: LICENSE, README.md, cli.js, index.js and test.js carry CRLF. It ships `.snyk`, `.travis.yml`, `.vscode/launch.json` and `test.js`; no `files` field, no `bin`, no `engines`.
- Code: `index.js` (CommonJS, `var exports = module.exports = {}`, one export `retrieveMarkdown(options, callback)`), `cli.js` (commander 4, no shebang, not registered as `bin`), `test.js` (ava 2: two live-network tests and one argument test).
- Runtime dependencies: `request ^2.88.0` (2.88.2 resolves; deprecated), `commander ^4.0.1` (4.1.1 resolves; latest 15.0.0). Dev: ava 2, nyc 14, xo 0.25, snyk, coveralls, codecov.io, execa (unused).
- GitHub: 0 issues; 21 pull requests, 19 open: 17 Dependabot (#2, #4, #7 to #19) and 2 Snyk (#20, #21, request 2.88.0 to 2.88.2, opened under m4bwav by Snyk's authorization); closed #1 (gitter-badger), #3 and #6 (Dependabot), merged #5 (Dependabot acorn). 17 branches besides master, every one the head of an open pull request (the kickoff said 18; the survey lists 15 Dependabot and 2 snyk-fix branches). Fork gitter-badger/stack-exchange-markdown-retriever (2016, carried only the closed badge pull request #1): needs nothing. Tags v1.0.1 to v1.1.2 exist; no releases.
- Security settings: 99 open Dependabot alerts (runtime: request, qs, ajv, uuid, sshpk, json-schema through request; the rest dev tooling); webhooks 14564188 (Snyk), 278631033 (Snyk) and 83050034 (Travis), all active, all dead services; secret scanning and push protection off; default workflow permissions write with pull request approval allowed; no rulesets, no branch protection; no Actions secrets, variables, environments or workflows.

## Leaked credential (survey claim refuted)

Commit ee6e4b0 (2017-04-23, "Remove synk token ...") removed `snyk auth d43c368a-...` (a Snyk API token, masked here) from the `test` script in package.json. It is in history since the 1.1.4 commit and in the published package.json of 1.1.4 and 1.1.5 (`npm view stack-exchange-markdown-retriever@1.1.5 scripts.test` shows it, masked by npm as `***`). The kickoff expected no secrets. Snyk's OAuth app was revoked on 2026-09-25 per the overlay, but an account API token is separate: the maintainer revokes it at snyk.io (Account settings, regenerate the token), or confirms the Snyk account is closed. History is not rewritten. `.vscode/launch.json` holds nothing secret (a launch config for `cli.js -s scifi.stackexchange.com 127968`).

## Baseline (old suite as it is)

In a scratch clone on Node 24.18.0: `npm ci` succeeds (1474 packages, core-js deprecation warnings, an allow-scripts warning for core-js 3.4.5). `npx xo` (0.25.3) crashes with `TypeError: util.isDate is not a function`, so `npm test` (`xo && nyc ava`) fails before any test. `npx ava --match "Needs to have an entity id"` passes 1 of 1. The two other ava tests call api.stackexchange.com and were not run (the kickoff forbids tests against the real API). The golden capture is the baseline.

## What the golden capture found

`test/golden/1.1.7.json`: 90 function cases and 20 CLI runs of the published 1.1.7 (request 2.88.2, commander 4.1.1, Node 24.18.0), every one against `test/golden/fixture-server.cjs` through `HTTPS_PROXY` (the proxy records the CONNECT and answers itself over TLS; nothing forwarded). Two runs byte-identical.

- URL: `https://api.stackexchange.com/2.2/questions/<id>?order=asc&filter=!L_(I6pMIzdXP-hC1clc9EY&site=stackoverflow` (`answers` when `isForAnswer` is truthy, even the string "false"); `key` comes between `filter` and `site` and only when `apiKey` is truthy; `site` defaults when falsy. Query values go through `querystring.stringify`: a number is written, `true` becomes "true", an object becomes empty, an array repeats the key (`site=a&site=b`), and `'` is escaped (`it%27s`). Requests send only `host` and `Connection: close`.
- The id goes into the path unchecked: `-1`, `1.5`, `1e+21`, `Infinity`, `true`, `[object%20Object]`, `1,2` (an array), `0127968`, spaces as `%20`, `../../users/1` and `1/answers` sent as written (path injection: other API methods can be reached), `1?site=evil` escaped to `%3F`. An emoji makes request refuse the path: callback `(null, TypeError ERR_UNESCAPED_CHARACTERS)`, no request. Falsy ids (undefined, null, 0, '', NaN, false) and a non-object `options` throw `Error: Need an entity id to read` synchronously; `null` or no options throw V8's `TypeError: Cannot read properties of ...`.
- **Refuted: "the throw on error_message is an uncaught exception that crashes the caller".** The throw happens inside the `try` around `JSON.parse`, so the `catch` passes it on: an API error (400 bad_parameter, 502 throttle_violation, or `error_message` beside items on a 200) calls back `(null, Error(error_message))`. An error body without `error_message` (404 no_method) calls back `(null, null)`.
- **New bug: a callback that throws is called twice.** Its exception from a successful call is caught by that same `try`, so the callback runs again with `(null, <its own error>)`, and the second throw escapes as an uncaught exception.
- The callback is always asynchronous and gets exactly two arguments; success is `(markdown, null)`, not found `(null, null)`. An item without `body_markdown` gives `(undefined, null)`; a numeric `body_markdown` is passed through (`42`); `items: null` and a JSON `null` give `(null, null)`; a semicolon list returns the first item the API lists.
- **Refuted in detail: "a non-gzipped body makes zlib fail"**: it does, but the zlib error is lost: the code then calls `body.toString()` on undefined, so the callback gets `(null, TypeError: Cannot read properties of undefined (reading 'toString'))`. Same for an HTML 500 page, a truncated gzip stream and a 204. Deflate with its header and gzip without a `Content-Encoding` header both decode (zlib.unzip sniffs the bytes). Gzip of non-JSON gives `(null, SyntaxError)`.
- No callback, or a callback that is null or a string: the request is made, then `TypeError: callback is not a function` escapes as an uncaught exception.
- No timeout: a server that never answers gets no callback (the capture waited 3 s). request follows a 302.
- request honours `HTTPS_PROXY` and `NO_PROXY`; Node's fetch does not unless `NODE_USE_ENV_PROXY=1` (Node 24) is set.
- CLI (`node cli.js`, the published file): `-a/--answer` is ignored (commander stores `program.answer`; the library reads `isForAnswer`), so `-a 1010` fetches question 1010 and prints `null`: confirmed. `-s` and `-k` work. Every failure (not found, API error, network error) prints `null` and exits 0. No id exits 1 with `Error: Need an entity id to read` and a stack; `-s 1` takes the id as the site and fails the same way. `--version` and unknown flags exit 1 with commander's `error: unknown option`. `--help` prints commander's usage as `cli [options] <entityId>`.

## How fetch differs (test/golden/fetch-probe.cjs)

Node 24's fetch decodes `Content-Encoding: gzip` and `deflate` itself, so the library sees plain JSON; gzip bytes without the header arrive as gzip (magic `1f8b`) and need `DecompressionStream`. A truncated gzip body arrives as 0 bytes, no error. A plain-JSON body parses (1.1.7 failed on it). The WHATWG URL parser resolves dot segments (`/2.2/questions/../../users/1` becomes `/users/1`) and percent-encodes an emoji; every other recorded path and query is sent as 1.1.7 sent it.

## Kickoff claims checked

- Confirmed: the code layout, no `bin`, no shebang, the tarball's four stray files; the URL, filter, `order=asc`, `site` default, `key`; `(markdown, err)` order; missing id throws synchronously, missing options is a TypeError; `-a` never sets `isForAnswer`; README's CLI block describes a command that was never installed; dependency distances; 17 Dependabot and 2 Snyk pull requests; 99 alerts; the three webhooks; scanning off, permissions write, no rulesets, no workflows; 10 README images; `.snyk` ignores an advisory for a package named `stackexchange`.
- Refuted: API errors do not crash the caller (they reach the callback); a non-gzipped body gives a TypeError, not the zlib error; "18 branches besides master" is 17; "check history for secrets (none expected)": a Snyk API token is in history and in two published versions (1.1.4, 1.1.5).
- Not checked (would spend the real API's quota): that 2.2 and 2.3 answer alike; the survey's probe of 2026-09-26 said so.

## Raw survey-npm.sh output (2026-09-26T17:32Z)

~~~text
# npm survey: stack-exchange-markdown-retriever (2026-09-26T17:32Z)

## Registry metadata
$ npm view stack-exchange-markdown-retriever name version dist-tags time.created time.modified license author repository.url homepage main module types exports bin engines dependencies peerDependencies deprecated
name = 'stack-exchange-markdown-retriever'
version = '1.1.7'
dist-tags = { latest: '1.1.7' }
time.created = '2016-05-27T02:40:52.113Z'
time.modified = '2022-06-26T23:38:30.285Z'
license = 'MIT'
author = 'Mark Rogers'
repository.url = 'git+https://github.com/m4bwav/stack-exchange-markdown-retriever.git'
homepage = 'https://github.com/m4bwav/stack-exchange-markdown-retriever#readme'
main = 'index.js'
dependencies = { commander: '^4.0.1', request: '^2.88.0' }

## All published versions with dates
$ npm view stack-exchange-markdown-retriever time --json
{
  "modified": "2022-06-26T23:38:30.285Z",
  "created": "2016-05-27T02:40:52.113Z",
  "1.0.0": "2016-05-27T02:40:52.113Z",
  "1.0.1": "2016-05-27T02:48:50.193Z",
  "1.0.2": "2016-05-30T17:38:00.365Z",
  "1.1.0": "2016-08-17T03:41:57.412Z",
  "1.1.1": "2016-09-18T23:20:16.065Z",
  "1.1.2": "2016-09-18T23:28:39.964Z",
  "1.1.3": "2017-04-23T17:57:22.116Z",
  "1.1.4": "2017-04-23T18:04:50.090Z",
  "1.1.5": "2017-04-23T18:10:21.063Z",
  "1.1.6": "2017-04-23T18:24:16.272Z",
  "1.1.7": "2019-11-28T02:24:28.318Z"
}

## Attestations and signatures on the latest version
$ npm view stack-exchange-markdown-retriever dist.attestations dist.signatures --json
[
  {
    "keyid": "SHA256:jl3bwswu80PjjokCgh0o2w5c2U4LhQAE57gj9cz1kzA",
    "sig": "MEQCIH80W99Rsk9B/8GJXHE5A/3oyCz0vQmiXMU9sL7Sdi54AiAfHbQtPmygbl40ytIAfpMaiXYdncIwE/S9rVF13g2/lQ=="
  }
]

## Maintainers (emails masked)
$ npm view stack-exchange-markdown-retriever maintainers --json | sed -E 's/ <[^>]*>/ <email>/'
[
  "markrogers <email>"
]

## Downloads, last month
$ curl -s https://api.npmjs.org/downloads/point/last-month/stack-exchange-markdown-retriever
{"downloads":32,"start":"2026-08-26","end":"2026-09-24","package":"stack-exchange-markdown-retriever"}
## Downloads, last year by month
$ curl -s "https://api.npmjs.org/downloads/range/last-year/stack-exchange-markdown-retriever" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const m={};for(const {day,downloads} of JSON.parse(s).downloads){const k=day.slice(0,7);m[k]=(m[k]||0)+downloads}console.log(m)})'
{
  '2025-09': 6,
  '2025-10': 91,
  '2025-11': 28,
  '2025-12': 20,
  '2026-01': 22,
  '2026-02': 52,
  '2026-03': 48,
  '2026-04': 52,
  '2026-05': 49,
  '2026-06': 85,
  '2026-07': 12,
  '2026-08': 39,
  '2026-09': 29
}

## Dependents (registry search; npmjs.com shows the list)
$ curl -s "https://registry.npmjs.org/-/v1/search?text=stack-exchange-markdown-retriever&size=1" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s);console.log(JSON.stringify({total:r.total, first:r.objects[0]?.package?.name, dependents: r.objects[0]?.dependents ?? "(see https://www.npmjs.com/browse/depended/stack-exchange-markdown-retriever)"}))})'
{"total":2385548,"first":"stack-exchange-markdown-retriever","dependents":0}

## Dependents by name: public repositories whose package.json names it (the registry gives only a count)
$ gh search code "\"stack-exchange-markdown-retriever\"" --filename package.json --json repository --jq '.[].repository.nameWithOwner' --limit 50 2>&1 | sort -u
m4bwav/stack-exchange-markdown-retriever

## Tarball file list of the published version
$ npm pack stack-exchange-markdown-retriever --dry-run --json 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const [p]=JSON.parse(s);console.log(p.size+" bytes, "+p.entryCount+" files");for(const f of p.files)console.log(" "+f.path+" "+f.size)})'
3819 bytes, 9 files
 .snyk 162
 .travis.yml 89
 .vscode/launch.json 1019
 LICENSE 1099
 README.md 2505
 cli.js 650
 index.js 1827
 package.json 1460
 test.js 1016

## Runtime dependencies: how far behind
$ npm view <dep> version time.modified deprecated
commander: wanted ^4.0.1, latest 15.0.0 (modified 2026-09-02)
request: wanted ^2.88.0, latest 2.88.2 (modified 2026-07-17), DEPRECATED: request has been deprecated, see https://github.com/request/request/issues/3142

# GitHub side (m4bwav/stack-exchange-markdown-retriever)
# GitHub survey: m4bwav/stack-exchange-markdown-retriever (2026-09-26T17:32Z)

## Repository
$ gh repo view m4bwav/stack-exchange-markdown-retriever --json name,description,defaultBranchRef,pushedAt,createdAt,licenseInfo,stargazerCount,forkCount,isArchived,homepageUrl --jq '{name,description,defaultBranch:.defaultBranchRef.name,pushedAt,createdAt,license:.licenseInfo.key,stars:.stargazerCount,forks:.forkCount,archived:.isArchived,homepage:.homepageUrl}'
{"archived":false,"createdAt":"2016-05-26T00:45:06Z","defaultBranch":"master","description":"Retrieves the markdown for a question or answer on a stack exchange site.","forks":1,"homepage":"","license":"mit","name":"stack-exchange-markdown-retriever","pushedAt":"2025-06-06T09:54:02Z","stars":0}

## Settings and security features
$ gh api repos/m4bwav/stack-exchange-markdown-retriever --jq '{delete_branch_on_merge, has_wiki, has_projects, allow_squash_merge, web_commit_signoff_required, security_and_analysis}'
{"allow_squash_merge":true,"delete_branch_on_merge":false,"has_projects":true,"has_wiki":true,"security_and_analysis":{"dependabot_security_updates":{"status":"enabled"},"secret_scanning":{"status":"disabled"},"secret_scanning_non_provider_patterns":{"status":"disabled"},"secret_scanning_push_protection":{"status":"disabled"},"secret_scanning_validity_checks":{"status":"disabled"}},"web_commit_signoff_required":false}

## Default workflow permissions
$ gh api repos/m4bwav/stack-exchange-markdown-retriever/actions/permissions/workflow
{"default_workflow_permissions":"write","can_approve_pull_request_reviews":true}
## Branches
$ gh api repos/m4bwav/stack-exchange-markdown-retriever/branches --paginate --jq '.[].name'
dependabot/npm_and_yarn/ajv-6.12.6
dependabot/npm_and_yarn/debug-2.6.9
dependabot/npm_and_yarn/decode-uri-component-0.2.2
dependabot/npm_and_yarn/handlebars-4.7.7
dependabot/npm_and_yarn/hosted-git-info-2.8.9
dependabot/npm_and_yarn/ini-1.3.8
dependabot/npm_and_yarn/json5-2.2.3
dependabot/npm_and_yarn/jszip-3.10.1
dependabot/npm_and_yarn/lodash-4.17.21
dependabot/npm_and_yarn/ms-and-debug-2.0.0
dependabot/npm_and_yarn/path-parse-1.0.7
dependabot/npm_and_yarn/snyk-1.996.0
dependabot/npm_and_yarn/sshpk-1.16.1
dependabot/npm_and_yarn/tree-kill-1.2.2
dependabot/npm_and_yarn/y18n-3.2.2
master
snyk-fix-242cde06e300714aea1e373167aedc08
snyk-fix-a4d48840b51d1249e121a508376dca47

## Rulesets and branch protection
$ gh api repos/m4bwav/stack-exchange-markdown-retriever/rulesets --jq '.[] | "\(.id) \(.name) \(.enforcement)"'; gh api repos/m4bwav/stack-exchange-markdown-retriever/branches/$(gh repo view m4bwav/stack-exchange-markdown-retriever --json defaultBranchRef --jq .defaultBranchRef.name)/protection --jq . 2>/dev/null || echo '(no classic branch protection)'
{"message":"Branch not protected","documentation_url":"https://docs.github.com/rest/branches/branch-protection#get-branch-protection","status":"404"}(no classic branch protection)

## Issues (all states)
$ gh issue list -R m4bwav/stack-exchange-markdown-retriever --state all --limit 100 --json number,title,state,author,createdAt,closedAt --jq '.[] | "#\(.number) \(.state) \(.createdAt[:10]) \(.author.login): \(.title)"'

## Pull requests (all states)
$ gh pr list -R m4bwav/stack-exchange-markdown-retriever --state all --limit 100 --json number,title,state,author,headRefName,createdAt --jq '.[] | "#\(.number) \(.state) \(.createdAt[:10]) \(.author.login) [\(.headRefName)]: \(.title)"'
#21 OPEN 2025-06-06 m4bwav [snyk-fix-242cde06e300714aea1e373167aedc08]: [Snyk] Security upgrade request from 2.88.0 to 2.88.2
#20 OPEN 2024-02-03 m4bwav [snyk-fix-a4d48840b51d1249e121a508376dca47]: [Snyk] Security upgrade request from 2.88.0 to 2.88.2
#19 OPEN 2023-01-11 app/dependabot [dependabot/npm_and_yarn/ms-and-debug-2.0.0]: Bump ms and debug
#18 OPEN 2023-01-05 app/dependabot [dependabot/npm_and_yarn/json5-2.2.3]: Bump json5 from 2.1.1 to 2.2.3
#17 OPEN 2022-12-04 app/dependabot [dependabot/npm_and_yarn/decode-uri-component-0.2.2]: Bump decode-uri-component from 0.2.0 to 0.2.2
#16 OPEN 2022-10-06 app/dependabot [dependabot/npm_and_yarn/snyk-1.996.0]: Bump snyk from 1.251.2 to 1.996.0
#15 OPEN 2022-09-08 app/dependabot [dependabot/npm_and_yarn/jszip-3.10.1]: Bump jszip from 3.2.2 to 3.10.1
#14 OPEN 2022-02-12 app/dependabot [dependabot/npm_and_yarn/ajv-6.12.6]: Bump ajv from 6.10.2 to 6.12.6
#13 OPEN 2021-08-11 app/dependabot [dependabot/npm_and_yarn/path-parse-1.0.7]: Bump path-parse from 1.0.5 to 1.0.7
#12 OPEN 2021-05-11 app/dependabot [dependabot/npm_and_yarn/hosted-git-info-2.8.9]: Bump hosted-git-info from 2.4.2 to 2.8.9
#11 OPEN 2021-05-10 app/dependabot [dependabot/npm_and_yarn/lodash-4.17.21]: Bump lodash from 4.17.4 to 4.17.21
#10 OPEN 2021-05-08 app/dependabot [dependabot/npm_and_yarn/handlebars-4.7.7]: Bump handlebars from 4.5.3 to 4.7.7
#9 OPEN 2021-03-31 app/dependabot [dependabot/npm_and_yarn/y18n-3.2.2]: Bump y18n from 3.2.1 to 3.2.2
#8 OPEN 2020-12-12 app/dependabot [dependabot/npm_and_yarn/ini-1.3.8]: Bump ini from 1.3.4 to 1.3.8
#7 OPEN 2020-09-06 app/dependabot [dependabot/npm_and_yarn/tree-kill-1.2.2]: Bump tree-kill from 1.2.1 to 1.2.2
#6 CLOSED 2020-07-18 app/dependabot [dependabot/npm_and_yarn/lodash-4.17.19]: Bump lodash from 4.17.4 to 4.17.19
#5 MERGED 2020-03-14 app/dependabot [dependabot/npm_and_yarn/acorn-7.1.1]: Bump acorn from 7.1.0 to 7.1.1
#4 OPEN 2019-11-28 app/dependabot [dependabot/npm_and_yarn/debug-2.6.9]: Bump debug from 2.6.4 to 2.6.9
#3 CLOSED 2019-11-28 app/dependabot [dependabot/npm_and_yarn/lodash-4.17.15]: Bump lodash from 4.17.4 to 4.17.15
#2 OPEN 2019-11-28 app/dependabot [dependabot/npm_and_yarn/sshpk-1.16.1]: Bump sshpk from 1.13.0 to 1.16.1
#1 CLOSED 2016-05-27 gitter-badger [gitter-badge]: Add a Gitter chat badge to README.md

## Open Dependabot alerts by severity, package and scope
$ gh api "repos/m4bwav/stack-exchange-markdown-retriever/dependabot/alerts?state=open&per_page=100" --paginate --jq '.[] | "\(.security_advisory.severity) \(.dependency.package.name) \(.dependency.scope)"' | sort | uniq -c | sort -rn
      3 medium parse-url development
      3 medium lodash development
      3 high lodash development
      3 high js-yaml development
      3 high handlebars development
      3 high ansi-regex development
      3 critical handlebars development
      2 medium minimist development
      2 medium jszip development
      2 medium js-yaml development
      2 medium bl development
      2 medium ajv runtime
      2 high y18n development
      2 high snyk development
      2 high qs development
      2 critical parse-url development
      2 critical minimist development
      1 medium yargs-parser development
      1 medium xml2js development
      1 medium uuid runtime
      1 medium tunnel-agent development
      1 medium stringstream development
      1 medium snyk-sbt-plugin development
      1 medium snyk-python-plugin development
      1 medium snyk-mvn-plugin development
      1 medium snyk-gradle-plugin development
      1 medium snyk-docker-plugin development
      1 medium snyk development
      1 medium request runtime
      1 medium request development
      1 medium qs runtime
      1 medium qs development
      1 medium picomatch development
      1 medium netmask development
      1 medium handlebars development
      1 medium got development
      1 medium decode-uri-component development
      1 medium @snyk/snyk-cocoapods-plugin development
      1 low tmp development
      1 low snyk development
      1 low ip development
      1 low handlebars development
      1 low @babel/core development
      1 high tree-kill development
      1 high toml development
      1 high tmp development
      1 high sshpk runtime
      1 high snyk-php-plugin development
      1 high snyk-gradle-plugin development
      1 high snyk-go-plugin development
      1 high qs runtime
      1 high parse-url development
      1 high parse-path development
      1 high pac-resolver development
      1 high nconf development
      1 high minimatch development
      1 high lodash.set development
      1 high json5 development
      1 high ip development
      1 high ini development
      1 high hoek development
      1 high form-data development
      1 high flatted development
      1 high dot-prop development
      1 high degenerator development
      1 high decode-uri-component development
      1 high braces development
      1 high brace-expansion development
      1 critical tree-kill development
      1 critical netmask development
      1 critical lodash development
      1 critical json-schema runtime
      1 critical form-data development
      1 critical deep-extend development
      1 critical @babel/traverse development

## Open Dependabot alerts, count
$ gh api "repos/m4bwav/stack-exchange-markdown-retriever/dependabot/alerts?state=open&per_page=100" --paginate --jq length
99

## Webhooks (dead services leave these)
$ gh api repos/m4bwav/stack-exchange-markdown-retriever/hooks --jq '.[] | "\(.id) \(.config.url) active=\(.active) events=\(.events|join(","))"'
14564188 https://snyk.io/webhook/github active=true events=pull_request,push
83050034 https://notify.travis-ci.org active=true events=create,delete,issue_comment,member,public,pull_request,push,repository
278631033 https://snyk.io/webhook/github/f50b9fde-733b-48e1-8b2f-60e8d92203f6 active=true events=pull_request,push

## Actions secrets (count) and variables
$ gh api repos/m4bwav/stack-exchange-markdown-retriever/actions/secrets --jq '{total_count, names:[.secrets[].name]}'; gh api repos/m4bwav/stack-exchange-markdown-retriever/actions/variables --jq '{total_count, names:[.variables[].name]}'
{"names":[],"total_count":0}
{"names":[],"total_count":0}

## Environments
$ gh api repos/m4bwav/stack-exchange-markdown-retriever/environments --jq '.environments[]? | "\(.name) reviewers=\([.protection_rules[]? | select(.type=="required_reviewers") | .reviewers[]?.reviewer.login] | join(","))"'

## Workflows
$ gh api repos/m4bwav/stack-exchange-markdown-retriever/actions/workflows --jq '.workflows[] | "\(.name) \(.path) \(.state)"'

## Action pins in the default branch's workflows, with each action's runtime
$ action_pins (git tree, contents API, action.yml at each ref)
(no workflow files)

## Forks
$ gh api repos/m4bwav/stack-exchange-markdown-retriever/forks --jq '.[] | "\(.full_name) pushed=\(.pushed_at[:10])"'
gitter-badger/stack-exchange-markdown-retriever pushed=2016-05-27

## Releases and tags
$ gh release list -R m4bwav/stack-exchange-markdown-retriever --limit 20; gh api repos/m4bwav/stack-exchange-markdown-retriever/tags --jq '.[].name' | head -30
v1.1.2
v1.1.1
v1.1.0
v1.0.2
v1.0.1

## Dead-service files in the default branch
$ gh api repos/m4bwav/stack-exchange-markdown-retriever/git/trees/HEAD?recursive=1 --jq '.tree[].path' | grep -Ei '^(\.travis\.yml|\.snyk|\.synk|\.sonarcloud\.properties|sonar-project\.properties|\.coveralls\.yml|codecov\.yml|\.codecov\.yml|appveyor\.yml|\.circleci/|\.npmignore|\.nuspec|\.vscode/)' || echo '(none)'
.snyk
.travis.yml
.vscode/launch.json

## Dotfiles at the root of the default branch
$ gh api repos/m4bwav/stack-exchange-markdown-retriever/contents --jq '.[].name' | grep '^\.' || echo '(none)'
.gitignore
.snyk
.travis.yml
.vscode

## Branches with no open pull request (stale work or bot leftovers; each needs a disposition)
$ comm -23 <(gh api repos/m4bwav/stack-exchange-markdown-retriever/branches --paginate --jq '.[].name' | sort) <( (gh pr list -R m4bwav/stack-exchange-markdown-retriever --state open --limit 200 --json headRefName --jq '.[].headRefName'; gh repo view m4bwav/stack-exchange-markdown-retriever --json defaultBranchRef --jq .defaultBranchRef.name) | sort) || echo '(none)'

## Badges in the README
$ gh api repos/m4bwav/stack-exchange-markdown-retriever/readme --jq .content | base64 -d 2>/dev/null | grep -Eo 'https?://[^ )]*(shields\.io|travis-ci|david-dm|snyk\.io|coveralls|codecov|gitter|sonarcloud|nodei\.co|badgen|badge)[^ )]*' | sort -u || echo '(none)'
https://badges.gitter.im/m4bwav/stack-exchange-markdown-retriever.svg
https://coveralls.io/github/m4bwav/stack-exchange-markdown-retriever?branch=master
https://david-dm.org/m4bwav/stack-exchange-markdown-retriever
https://gitter.im/m4bwav/stack-exchange-markdown-retriever?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge
https://img.shields.io/badge/code_style-XO-5ed9c7.svg
https://img.shields.io/coveralls/m4bwav/stack-exchange-markdown-retriever/master.svg
https://img.shields.io/david/m4bwav/stack-exchange-markdown-retriever.svg
https://img.shields.io/npm/dt/stack-exchange-markdown-retriever.svg
https://img.shields.io/npm/v/stack-exchange-markdown-retriever.svg?branch=master
https://img.shields.io/travis/m4bwav/stack-exchange-markdown-retriever/master.svg
https://nodei.co/npm-dl/stack-exchange-markdown-retriever.png?months=3
https://nodei.co/npm/stack-exchange-markdown-retriever.png?downloads=true&downloadRank=true&stars=true
https://nodei.co/npm/stack-exchange-markdown-retriever/
https://snyk.io/test/npm/stack-exchange-markdown-retriever
https://snyk.io/test/npm/stack-exchange-markdown-retriever/badge.svg?style=flat-square
https://travis-ci.org/m4bwav/stack-exchange-markdown-retriever

## Things only the maintainer can see
- Installed GitHub Apps and authorized OAuth apps: github.com/settings/installations and github.com/settings/applications (the API refuses the gh token).
- Whether a token in history is still live: revoke it at the provider regardless.

## Next: in the clone
- Read every source and test file, package.json, the build config, the README and every dotfile.
- Leaked credentials: .travis.yml, .npmrc, .env, workflows, and history (git log -S TOKEN_NAME).
- Run the old build and tests as they are (Windows: npm --script-shell "C:/Program Files/Git/bin/bash.exe" test for ./node_modules/.bin scripts).
- Then the golden capture from the PUBLISHED version in a scratch project (scripts/golden-capture-npm.template.cjs).
~~~

## check-readme-images.mjs on the repository README (the tarball README gives the same 10 images and findings)

~~~text
10 image(s) in D:/m4bwa/Claude/Projects/Ai/stack-exchange-markdown-retriever/README.md, checked for npm
FIX  [npm package] https://nodei.co/npm/stack-exchange-markdown-retriever.png?downloads=true&downloadRank=true&stars=true
       - dead service (nodei.co (unmaintained)): replace with shields.io npm version and downloads badges
ok   [NPM Version] https://img.shields.io/npm/v/stack-exchange-markdown-retriever.svg?branch=master
ok   [downloads] https://img.shields.io/npm/dt/stack-exchange-markdown-retriever.svg
FIX  [Build Status] https://img.shields.io/travis/m4bwav/stack-exchange-markdown-retriever/master.svg
       - dead service (Travis CI): replace with the GitHub Actions badge: https://github.com/OWNER/REPO/actions/workflows/ci.yml/badge.svg
       - the badge itself says "not found"
FIX  [Dependency Status] https://img.shields.io/david/m4bwav/stack-exchange-markdown-retriever.svg
       - dead service (David (shut down)): replace with nothing; Dependabot covers dependency freshness
       - the badge itself says "not found"
FIX  [Coverage Status] https://img.shields.io/coveralls/m4bwav/stack-exchange-markdown-retriever/master.svg
       - dead service (Coveralls): replace with nothing, unless the plan keeps a coverage service
FIX  [Known Vulnerabilities] https://snyk.io/test/npm/stack-exchange-markdown-retriever/badge.svg?style=flat-square
       - dead service (Snyk): replace with nothing; Dependabot alerts and the registry audit in CI
ok   [XO code style] https://img.shields.io/badge/code_style-XO-5ed9c7.svg
FIX  [Gitter] https://badges.gitter.im/m4bwav/stack-exchange-markdown-retriever.svg
       - dead service (Gitter): replace with nothing, or a link to GitHub Discussions if it is switched on
FIX  [NPM] https://nodei.co/npm-dl/stack-exchange-markdown-retriever.png?months=3
       - dead service (nodei.co (unmaintained)): replace with shields.io npm version and downloads badges
7 image(s) to keep-replace-or-remove
~~~

## fetch-probe.cjs output (Node 24.18.0)

~~~text
127968 200  bytes=248 first=7b22 "{\"items\":[{\"question_id\":127968,\"body_markdown\":\"Why is the "
404 200  bytes=67 first=7b22 "{\"items\":[],\"has_more\":false,\"quota_max\":300,\"quota_remainin"
9001 400  bytes=67 first=7b22 "{\"error_id\":400,\"error_message\":\"ids\",\"error_name\":\"bad_para"
9002 502  bytes=140 first=7b22 "{\"error_id\":502,\"error_message\":\"too many requests from this"
9003 200  bytes=87 first=7b22 "{\"items\":[{\"question_id\":9003}],\"has_more\":false,\"quota_max\""
9004 200  bytes=111 first=7b22 "{\"items\":[{\"question_id\":9004,\"body_markdown\":\"plain\"}],\"has"
9005 200  bytes=114 first=7b22 "{\"items\":[{\"question_id\":9005,\"body_markdown\":\"deflated\"}],\""
9006 200  bytes=129 first=1f8b "\u001f�\b\u0000\u0000\u0000\u0000\u0000\u0000\n5�A\u000e� \u0010\u0005Ы4͂hb\u0002W1��a,\u0013\u0005,\fi���]�vo�(�\u000eݱ\f�*�\u0004���"
9007 500  bytes=47 first=3c68 "<html><body>Internal Server Error</body></html>"
9008 200  bytes=0 first= ""
9009 200  bytes=16 first=7468 "this is not json"
9010 204  bytes=0 first= ""
9012 200  bytes=106 first=7b22 "{\"items\":[{\"question_id\":9012,\"body_markdown\":\"\"}],\"has_more"
9013 200  bytes=14 first=7b22 "{\"items\":null}"
9014 200  bytes=4 first=6e75 "null"
9015 200  bytes=200106 first=7b22 "{\"items\":[{\"question_id\":9015,\"body_markdown\":\"xxxxxxxxxxxxx"
9016 200  bytes=86 first=7b22 "{\"items\":[{\"question_id\":9016,\"body_markdown\":\"with an error"
9017 200  bytes=106 first=7b22 "{\"items\":[{\"question_id\":9017,\"body_markdown\":42}],\"has_more"
9018 200 redirected bytes=116 first=7b22 "{\"items\":[{\"question_id\":1,\"body_markdown\":\"Question one.\"}]"
9019 404  bytes=41 first=7b22 "{\"error_id\":404,\"error_name\":\"no_method\"}"
URL "/2.2/questions/../../users/1" -> /users/1?site=it%27s
URL "/2.2/questions/1/2" -> /2.2/questions/1/2?site=it%27s
URL "/2.2/questions/1%202" -> /2.2/questions/1%202?site=it%27s
URL "/2.2/questions/😀" -> /2.2/questions/%F0%9F%98%80?site=it%27s
~~~

Related: see also [../plans/2026-09-26-modernization-and-v2-release.md](../plans/2026-09-26-modernization-and-v2-release.md), [../decisions/2026-09-26-v2-shape-callback-kept-promise-added-fetch-named-exceptions.md](../decisions/2026-09-26-v2-shape-callback-kept-promise-added-fetch-named-exceptions.md).
