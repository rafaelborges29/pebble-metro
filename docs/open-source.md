# Open-source preparation

Tracks [issue #8](https://github.com/rafaelborges29/pebble-metro/issues/8).
**Keep the repository private until the owner approves the exact publication
plan.** Cleanup, scanning, a PR or merging preparation work is not that approval.
Do not rewrite history, change author identity, delete remote material or publish
source as an incidental remediation step.

## Tools

- [GitHub Skills: secure your supply chain](https://github.com/skills/secure-repository-supply-chain)
  is a tutorial, not an audit. Do not copy its exercise workflows into this app.
- [OpenSSF Scorecard](https://github.com/ossf/scorecard) checks repository practices.
  Review applicable findings rather than adding boilerplate to chase its score.
- [OSV-Scanner](https://github.com/google/osv-scanner) and `npm audit` check known
  dependency vulnerabilities, not app correctness or every SDK/toolchain input.
- [Gitleaks](https://github.com/gitleaks/gitleaks) checks common secret patterns;
  [zizmor](https://github.com/zizmorcore/zizmor) checks Actions security.

Useful local commands (install audit tools separately, not as app dependencies):

```sh
npm audit
osv-scanner scan source --recursive .
zizmor --offline .github
gitleaks git --redact --log-opts=--all .
```

Keep detailed scanner reports outside the repo and redact before sharing. Scan
uncommitted intended files too. Never upload the private repository to an external
analysis service without approval. `--all` covers locally available refs, not
unfetched GitHub history, deleted server material, artifacts or PR attachments.

## Initial pass

- Consolidated setup in CONTRIBUTING, usage in README, publishing in the release
  guide; replaced old first-submission plans and experiment diaries with operating
  instructions and retained receipt/evidence links. Kept legal/data/privacy docs,
  reviewed screenshots and all emulator infrastructure.
- External Actions are pinned to resolved commit SHAs; Dependabot configuration
  requests weekly npm/Actions update PRs. Pins must still be reviewed and tested;
  the Pebble SDK/tool's dependencies are outside the root npm lockfile.
- `npm audit` reported no known vulnerabilities. A recursive repository scan
  with OSV-Scanner 2.7.1 identified 45 packages in `package-lock.json` and reported
  no known vulnerabilities (exit 0). It respects ignore rules and does not audit
  native C correctness, Actions behaviour or the external SDK/tool installation.
  Gitleaks 8.30.1 found no secrets in its 137-commit scan of
  locally reachable Git history. A directory scan
  flagged two ignored Waf lock files' serialized build environment; pattern hits
  alone do not establish a credential leak. These generated files are not intended
  for publication, but must not be included in uploaded diagnostics unreviewed.
- zizmor 1.32.0 identified floating Actions references (now pinned). Remaining
  findings need context: release preparation/snapshot jobs retain checkout
  credentials for their explicit Git pushes; the tool setup writes its own
  `uv tool dir --bin` to `GITHUB_PATH`; local composite-action syntax is unchanged
  to preserve execution from the validated checkout. It also recommends
  Dependabot cooldowns, which are not configured. No findings are suppressed.
- GitHub reports Dependabot alerts disabled. Main branch protection returned an
  upgrade/public-repository requirement on the current private plan. No repository
  settings were changed. Update PR configuration alone does not enable alerts.
- Verification: a fresh local clone with the preparation diff applied passed
  `npm ci`, release metadata checks, typecheck and a clean build of both targets.
  The working checkout passed all 98 emulator cases with snapshot updates
  disabled. Actionlint 1.7.12 passed workflow validation (ShellCheck unavailable);
  local Markdown link targets and `git diff --check` passed. Check hosted CI on
  the exact PR commit; local checks alone do not establish hosted success.

These observations are a starting point, **not security certification or a
complete publication audit**. Record final checks against an exact revision.

## Before publication

- [ ] Review focused cleanup and repository-local skills; verify a clean clone
  builds both `emery` and `gabbro` and passes existing checks without snapshot
  changes. Keep `npm private: true`, stable UUIDs and saved-data safety boundaries.
- [ ] Choose what becomes public: existing repository/history versus a separately
  prepared source snapshot, exact branches/tags, releases and associated material.
  Existing-repo visibility changes expose more than the current working tree.
- [ ] Audit intended source/assets/fixtures and all reachable history for secrets,
  author/contact information, device identifiers/logs and internal-only material.
  Fetch/review remote branches, tags and PR refs deliberately. Local orchestration
  checkpoint refs exist: never publish them or use `git push --mirror`.
- [ ] Review GitHub issues/PR discussions, release notes/assets/source archives,
  Actions logs/artifacts/caches and old branches. Diagnostics include source and
  fixtures. Do not assume material stays private after a visibility change or
  that deleting a current file removes historical copies. Coordinate remediation
  and credential rotation privately; obtain approval for destructive changes.
- [ ] Reassess [UnderLX data scope](../DATA_METHODS.md) for public fixtures,
  adaptations, screenshots and history; review original/third-party licensing.
  The private-client store assessment does not cover these contents. Decide any
  versioned machine-readable data/alteration offer actually required by ODbL;
  attribution alone and expiring/private artifacts cannot replace one. Do not
  invent a blanket application-source or permission-email requirement.
- [ ] Confirm a working private vulnerability-reporting channel and enable
  appropriate GitHub security settings: dependency graph/Dependabot alerts and
  security updates, secret scanning/push protection and applicable code scanning.
  Availability depends on visibility/plan; do not change visibility just to test.
- [ ] Decide branch/ruleset review protections, preserving the current release
  workflow's deliberate branch/tag creation and direct snapshot push. Tighten
  Actions permissions/allowed actions where compatible. Do not auto-merge updates.
- [ ] Run applicable Scorecard/OSV checks and review gaps; CodeQL analysis of this
  Pebble C build needs verified build configuration, not an untested template.
- [ ] Prepare approved public support/publisher details and update private-only
  wording, source URLs and reporting instructions as part of the transition.
  Obtain final owner approval listing exact public contents and remaining risks.

No watch install, store upload, merge or visibility change is part of this work.
