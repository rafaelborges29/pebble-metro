# Releases

Use **Actions → Create release → Run workflow**, select **main**, then **minor**
(promote the planned snapshot) or **major**. This authorizes publication to GitHub
and both existing Pebble/Rebble listings after verification, without another
publication approval. Intentionally pushing a valid release tag also authorizes it.
Do not dispatch a live release merely to test changes or use GitHub's manual release form.

Main carries `major.minor.0-snapshot`; stable releases are `major.minor.0`, without
patch releases. Pebble stores major/minor in 0–255; exhausted capacity fails before
release preparation. After publication, review/merge the version-only next-snapshot
PR before another release. Automation never approves/merges it or pushes main.

## Repository setup

- Releases/tag source archives are public; preserve exact source/version provenance.
- Protect main with required PRs, `e2e`, and blocked force-push/deletion. No release-bot
  bypass is needed. Permit creation of `release/*`, `chore/next-*` and `v*` tags.
- Keep default Actions token permissions read-only. Release jobs request only their
  necessary write scopes. Enable **Actions → General → Workflow permissions → Allow
  GitHub Actions to create and approve pull requests** so the bot can create snapshot
  PRs; the workflow itself never approves them.
- Configure these under **Settings → Secrets and variables → Actions**:

| Kind | Name | Purpose |
| --- | --- | --- |
| Variable | `PEBBLE_FIREBASE_API_KEY` | Firebase Web API key used by Pebble Tool |
| Secret | `PEBBLE_FIREBASE_REFRESH_TOKEN` | Owning Pebble account's refresh token |
| Secret | `REBBLE_REFRESH_TOKEN` | Owning Rebble account's OAuth refresh token |

### Pebble authentication

With pinned Pebble Tool, run `pebble login`. Its persistent
`firebase_oauth_storage.json` contains `firebase_api_key` and `refresh_token`;
the tool account object's `credential_path` identifies the file. Transfer values
through GitHub settings/private input, never issues, chat, source, logs or artifacts.
Use the refresh token, not short-lived `id_token`. Reauthenticate and replace the
secret if refresh fails; CI does not rewrite repository secrets.

### Rebble authentication

Sign in at [the developer portal](https://dev-portal.rebble.io/). In Developer Tools
→ Application/Storage → Local Storage for that origin, copy only `refresh_token`
(not `access_token`) into `REBBLE_REFRESH_TOKEN`. Do not copy full storage or callback
URLs. No client secret/extra GitHub token is needed. New tokens are masked and not
stored in artifacts; revoke/replace the configured secret if authentication fails.

To verify authentication/ownership without uploading, supply it privately and run:

```sh
python3 tools/rebble_store.py
```

That entry point exchanges tokens and GETs the account/listing only. Never enable
shell tracing or dump the environment with credentials loaded. The uploader's
[inspected refresh-token contract](https://github.com/pebble-dev/rebble-auth-py/blob/c1990c094b298eed38e8b62ac403d2882bca6c1a/auth/oauth.py)
permits reuse; a changed contract must fail closed, not assume a permanent token.

## Verification and publication

Implementation: [`release.py`](../tools/release.py),
[`release_package.py`](../tools/release_package.py),
[`pebble_store.py`](../tools/pebble_store.py), [`rebble_store.py`](../tools/rebble_store.py)
and [Publish release](../.github/workflows/publish-release.yml).

1. Create release makes a package/lockfile-version-only commit on `release/<version>`,
   atomically pushes it with an annotated tag, creates a draft and dispatches Publish.
   Tag validation accepts trusted main ancestry and rejects other branch changes.
2. Build once with the [pinned CI toolchain](../.github/actions/setup-pebble/action.yml).
   Both emulator targets test the **same immutable candidate**, no rebuild or snapshot
   updates, validating provenance/hash before and after. Both jobs/report gate must pass.
3. Preflight checks ZIP/size (4.4 MB ceiling), production UUID/name, numeric versions,
   both native headers/manifests/resources, phone bundle, complete licences and exact
   version-2 permission declarations. Dev/snapshot release packages are rejected.
4. Freeze the original PBW, checksum and provenance in the draft. Both stores preflight
   credentials, ownership, versions and any matching upload **before the first POST**.
   Publish to Pebble, then Rebble, verifying each public download against the frozen
   hash and preserving receipts. Only then publish GitHub. Store notes use a stable
   version/platform summary; generated PR/source notes stay on GitHub.
5. Open/reuse `chore/next-<version>` → main with only the next snapshot metadata, then
   dispatch branch CI. Retries validate existing ancestry/content and PR head; unexpected
   changes stop recovery. Already-advanced main is left alone.

`GITHUB_TOKEN`-created tags/PRs do not trigger ordinary push/PR workflows, so publication
and snapshot CI are dispatched explicitly. Only the store-publishing step gets store
credentials. Both release workflows share one concurrency group: finish/recover a
pending release before requesting another; newer pending runs can replace queued ones.

The workflow updates existing listings only, never text, images, visibility or UUID:

| Identity | Value |
| --- | --- |
| Production UUID | `5576168a-8b38-4be1-90e7-343af607c167` |
| Pebble app | `dce54d3eb02943f1935e1529` |
| Rebble app / developer | `6af0e5dfb99ed90009374190` / `690b8ba63399bf0009b60ce2` |

API/ownership/download-host changes fail rather than selecting another app or upload
route. Pebble's account size limit is checked too; no authoritative Rebble limit was
established, so keep the local ceiling and stop clearly on production rejection.

## Assets and provenance

Each GitHub release retains the original `metro-lisboa-<version>.pbw`, `SHA256SUMS`,
`provenance.json` (source revision/toolchain/targets/hash/build-run) and verified
`pebble-release.json` / `rebble-release.json` receipts (app/release IDs, version, hash,
stable public PBW URL). No credentials, device logs, screenshots or internal evidence.

Actions diagnostics are public and retained seven days, candidate artifacts 30 days.
Once staged, draft/release assets remain indefinitely until deliberately removed.
Never put credentials or personal/device data in diagnostics or SDK/dependency caches;
fork PRs can read base-branch caches. Missing reports/setup failures still block release.

## Retry and rollback

Start with **Re-run failed jobs** to retain the original candidate. Never overwrite
assets (`--clobber`), move tags, rebuild an existing version or blindly repeat store POSTs.

| Failure | Recovery |
| --- | --- |
| Build/tests/preflight | No new publication. Fix main; use a new unused version and deliberately retire abandoned draft/refs after inspection. |
| Refs exist, dispatch failed | Run Publish release on main with the existing valid tag; conflicting refs stop recovery. |
| Candidate incompletely staged | Rerun the original job using its artifact. Provenance without the original PBW cannot be substituted with a rebuild. |
| PBW/provenance frozen in draft | A full retry restores those bytes, validates provenance and retests them. |
| Store timeout/partial success | Inspect both listings, then retry failed jobs. Matching downloadable bytes are verified/skipped; only missing destinations upload. Conflicting bytes, unavailable downloads or a newer store version stop recovery. |
| Snapshot PR/CI dispatch | Rerun that job; validated branch/PR are reused. Inspect unexpected/closed refs; no force-push, auto-merge or republication. |

Publication is not atomic across services. Keep successful uploads/receipts even if
another destination fails. If the original candidate is lost, inspect store/draft
state and choose a new version, never pretend a rebuilt PBW is the same artifact.
For a bad live version, preserve its tag/assets, review a fix/revert on main and
release a higher unused version. Store withdrawal needs an explicit dashboard
decision; automation does not delete releases, downgrade data or install on watches.

## Development checks

```sh
python3 tools/release.py check
python3 -m unittest discover -s tools -p test_release.py
npm run typecheck
npm run check
npx playwright test --update-snapshots=none
```

The package/lockfile's three root version fields must agree. `wscript` narrowly
supports `-snapshot` for SDK 4.33.1; native headers stay numeric and release validation
rejects snapshots. Offline snapshot tests use temporary local Git remotes/simulated
GitHub responses, not live publication. Do not dispatch a release for testing.
See [store requirements](appstore.md) and [historical receipts in issue #9](https://github.com/rafaelborges29/pebble-metro/issues/9).
