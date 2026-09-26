# Handoff

<!-- Keep under 50 lines. Replace, never append. Written at the end of a work session so the next one starts without re-deriving state. -->

## Current state
2.0.0 is released (2026-09-26): npm latest 2.0.0, next 2.0.0-beta.1, provenance and signatures verified (verify-registry-npm.sh VERIFIED; release run 36264098125). master is protected by ruleset 24047775 (required check `ci`), tags by ruleset 24047776 (admins only). No open pull requests, 0 webhooks, 0 alerts.

## Mark's tasks (open)
- Deprecate 1.x in his own terminal (the agent shell gets EOTP):
  npm deprecate stack-exchange-markdown-retriever@"<2" "1.x depends on the deprecated request package, its CLI was never installable and -a was ignored; use 2.x"
  Check: npm view stack-exchange-markdown-retriever@1.1.7 deprecated
- Revoke the Snyk API token that sat in package.json of 1.1.4 and 1.1.5 (snyk.io account settings), or confirm the account is closed.
- Delete the merged branch v2 (refused for the agent): git push origin --delete v2

## Standing work
- Dependabot pull requests weekly: merge when `ci` is green; read release notes for majors; TypeScript 7 is held in dependabot.yml until xo supports it.
- live.yml runs weekly against the real API (two requests); a red run is a changed post or the quota, not a bug by itself.
- Next major when Node 22 reaches end of life (2027-04-30): floor to 24.
- If api.stackexchange.com retires /2.2/, add an apiVersion option in a minor (plan D16).
- The `next` dist-tag stays on 2.0.0-beta.1 until the next prerelease.

## Next single action
None in this repository; the next package is format-json-files (kickoff in package-modernization/prompts).
