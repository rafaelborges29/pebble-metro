# Releases

Use **Actions → Create release → Run workflow**, select **main**, then choose
**minor** (default) or **major**. Running it authorizes publication to GitHub and
both existing **Pebble and Rebble Appstore** listings after verification. There is
no second approval. Do not use GitHub's manual “Draft a new release” form for this flow.

| Version on main | Choice | Release branch / tag | Next version on main |
| --- | --- | --- | --- |
| `0.3.0-snapshot` | minor | `release/0.3.0` / `v0.3.0` | `0.4.0-snapshot` |
| `0.3.0-snapshot` | major | `release/1.0.0` / `v1.0.0` | `1.1.0-snapshot` |

The minor choice promotes the already-planned snapshot, without incrementing it
twice. Stable versions are `major.minor.0`; Pebble stores only major/minor in its
native header, each in 0–255. Patch releases are not offered. After minor 255,
the next snapshot rolls to the next major; exhausted numeric capacity fails
before preparing a release.

## One-time repository setup

Before an approved release:

1. Keep the repository private. GitHub releases and automatically generated tag
   source archives inherit that visibility; this does not change the public
   store listings or approve the separate source-publication work.
2. Repository rules must permit the workflow token to create `release/*` branches
   and `v*` tags, and push the next development version directly to main. These are
   ordinary fast-forward pushes; the workflow never bypasses branch protection or
   force-pushes. Permission to create pull requests is not needed.
3. In **Settings → Secrets and variables → Actions**, configure:

   | Kind | Name | Value |
   | --- | --- | --- |
   | Variable | `PEBBLE_FIREBASE_API_KEY` | Firebase Web API key used by Pebble Tool |
   | Secret | `PEBBLE_FIREBASE_REFRESH_TOKEN` | Pebble/Firebase refresh token from the account that owns Metro Lisboa |
   | Secret | `REBBLE_REFRESH_TOKEN` | Rebble developer portal OAuth refresh token from the account owning the existing Rebble listing |

   With the pinned Pebble Tool, run `pebble login` locally. Its
   `firebase_oauth_storage.json` in the tool's persistent data directory contains
   `firebase_api_key` and `refresh_token`. Transfer these through GitHub's secret
   settings; never paste the credential file into an issue, PR, logs or source.
   Use a refresh token, not the short-lived `id_token`. The current tool's account
   object exposes `credential_path` if locating that file programmatically.

The publisher exchanges the refresh token immediately before upload and masks
returned tokens in Actions logs. Missing, expired or revoked credentials fail
before either store upload or publication of the GitHub draft. Reauthenticate with
`pebble login` and replace the repository secret if refresh fails; no credential
file or token is retained in artifacts. Firebase refresh tokens are long-lived
until expiry/revocation conditions apply; the workflow does not require permission
to rewrite repository secrets. See [Firebase session management](https://firebase.google.com/docs/auth/admin/manage-sessions)
and its [refresh-token API](https://firebase.google.com/docs/reference/rest/auth#section-refresh-token).

### Rebble authentication

Sign in at `https://dev-portal.rebble.io/` using the owning account. In the browser's
Developer Tools → Application/Storage → Local Storage for that origin, find
`refresh_token` (not `access_token`). Transfer it only through a private secret
input or GitHub Actions secret settings, never chat, console output, screenshots,
source or a PR. Do not copy the full storage contents. Configure it as
`REBBLE_REFRESH_TOKEN`; no client secret or extra GitHub token is required.

The uploader POSTs the refresh grant to `https://auth.rebble.io/oauth/token` using
the portal's existing public OAuth client. New access/refresh tokens are masked in
Actions logs and excluded from artifacts. The inspected
[Rebble auth implementation](https://github.com/pebble-dev/rebble-auth-py/blob/c1990c094b298eed38e8b62ac403d2882bca6c1a/auth/oauth.py)
adds new issued tokens without deleting the original refresh token; we retain the
configured secret and do not grant CI permission to rewrite repository secrets.
If that contract changes or access is revoked, stop before publication, sign in
again and replace the secret. No long-lived access-token assumption is made.

To check authentication/ownership locally without uploading, supply the secret
through a private environment and run `python3 tools/rebble_store.py`. Repeat with
the same refresh token to confirm reuse. It only exchanges OAuth tokens and GETs
the account/listing; it cannot publish through that entry point. Never enable shell
tracing or dump the environment while credentials are loaded.

Authentication is checked against the existing accounts/listings before every
upload. Required identifiers:

- App UUID: `5576168a-8b38-4be1-90e7-343af607c167`
- Pebble App ID: `dce54d3eb02943f1935e1529`
- Rebble App ID: `6af0e5dfb99ed90009374190`
- Rebble Developer ID: `690b8ba63399bf0009b60ce2`

The workflow never creates an app, changes listing text/visibility, or replaces
screenshots. The Pebble uploader follows Pebble Tool **5.0.39**'s existing-app
multipart API. The Rebble uploader follows the developer portal's existing-app
`POST /api/dp/app/<id>/release` with only `pbw` and `release_notes`; this endpoint
publishes immediately. An API contract change fails the release instead of
selecting another listing, download host or upload route. Rebble PBW downloads
are restricted to the exact release's public Google Storage path, without auth
headers or redirects.

## What runs

1. **Create release** takes an exact main commit, checks metadata/unused version,
   creates one version-only commit on `release/<version>`, and atomically pushes
   the branch and annotated tag. Only `package.json` and matching lockfile versions
   change. It generates GitHub release notes and a draft, then explicitly
   dispatches **Publish release** for that tag.
2. **Publish release** resolves the tag with main's validator. It accepts a commit
   already in main, or a single version-only commit based on main. Other source or
   package changes on a release branch are rejected. An intentionally user-pushed
   valid `vmajor.minor.0` tag also starts this pipeline and authorizes publication.
3. The exact revision uses the shared pinned toolchain: SDK **4.33.1**, Pebble Tool
   **5.0.39**, libpebble2 **0.0.31**, Python **3.13** for the tool, Node **24.21.0**.
   It checks production phone/shared TypeScript and the harness, then builds once
   (compiling the phone to SDK-compatible JavaScript). This build-only job skips
   Chromium. Two independent Ubuntu jobs download the **same immutable candidate**
   and install it on `emery` / `gabbro`, without rebuilding or updating snapshots.
   Each uses the shared three-worker CI default and test-level scheduling, with fresh
   watch/browser storage per test and retries disabled. Both jobs validate the
   candidate's source provenance/hash before and after testing; a changed PBW is
   rejected. Both validation steps require the downloaded provenance file to be
   present and nonempty, rather than letting packaging regenerate it. Both targets
   finish even if one fails. Their blob reports merge into
   one private HTML/JUnit report; the report gate explicitly requires both target
   jobs to pass. Publication waits for all these jobs, then downloads the original
   candidate artifact. See the [hosted measurements](e2e.md#hosted-performance)
   before changing concurrency. The pinned SDK cache contains no app build or
   credentials; its exact key includes OS/toolchain/interpreter versions. No
   physical watch or touch tests are run.
4. Preflight verifies ZIP integrity and allowed entries, UUID, numeric release
   version, native header versions/UUIDs, both target manifests/binaries/resources,
   phone bundle, complete bundled licence notices, and the 4.4 MB size ceiling.
   It also requires `manifestVersion: 2` and permission declarations exactly matching
   `package.json`, rejecting stripped, legacy or unexpectedly broadened metadata.
   Pebble publication also checks the account's current upload size limit. Rebble's
   inspected API provides no account upload-limit field; retain the local ceiling
   and fail clearly if the production endpoint rejects a candidate.
5. An immutable Actions artifact carries the candidate between jobs. Its PBW,
   checksum and provenance are frozen in the GitHub draft before any store upload.
   Both stores preflight authentication, ownership, versions and any existing
   matching upload before the first store POST. The publisher sends those exact
   bytes to Pebble, verifies its public PBW hash and freezes its receipt, then
   repeats for Rebble. Only after both match does it publish the GitHub release.
   Store release notes use a deterministic public-safe version/platform summary;
   generated GitHub notes stay on GitHub, not in either store's public changelog,
   because they can contain private PR/source links.
6. Immediately after publication, a separate job fetches current main and pushes
   one commit updating the package and lockfile to the next snapshot. It then
   explicitly dispatches main's normal emulator CI. There is no bump branch, PR or
   additional approval. The tagged release remains unchanged. A concurrent main
   update rejects the push safely; rerun the failed job to use the latest main.

Both release workflows share a concurrency group, so publication jobs cannot
overlap. GitHub allows one running and one pending run per group; avoid queuing
multiple release requests because a newer pending run can replace an older one.
Finish or recover a pending draft before starting another version.

Explicit dispatches matter: a push created with `GITHUB_TOKEN` does not trigger
another ordinary push workflow. Both release publication and main's checks after
the snapshot bump are dispatched deliberately. See [GitHub's trigger rules](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow).
Normal PR CI has read-only repository access and no publishing secrets. Only the
publication step receives the Pebble and Rebble credentials. Release verification needs
`contents: write` because GitHub exposes draft releases only to callers with push
access; checkout does not persist that token in Git configuration.

## Assets and provenance

Each published GitHub release contains generated notes and:

- `metro-lisboa-<version>.pbw`: the tested package, unchanged after testing.
- `SHA256SUMS`: its SHA-256 and filename.
- `provenance.json`: version, exact source commit, SDK/tool versions, targets,
  package name/hash and original Actions build-run ID.
- `pebble-release.json` and `rebble-release.json`: each existing app ID, resulting
  store release ID, version, SHA-256 and stable public PBW download URL. Signed
  redirect URLs are not recorded.

No credentials, device logs, screenshots, test reports or internal evidence are
release assets. Each target's private `release-test-diagnostics-emery` /
`release-test-diagnostics-gabbro` artifact and the merged `release-test-diagnostics`
report are retained for seven days, on success as well as failure. Test-job setup
failures may have no blob to merge; they still block publication. The tested
candidate artifact is retained for 30 days; once staged,
the draft/release also retains its candidate indefinitely until deliberately removed.

The existing **0.2.0** store upload is historical. This automation will not rebuild,
backfill, retag or replace it. Keep its original source/artifact record separately.
The already-published **v0.3.0** predates Rebble automation and was submitted there
manually; its verified receipt is in [Rebble submission](rebble.md). Do not modify
its GitHub assets to pretend the old pipeline published it to both stores. New
release revisions carry the updated uploader; no historical upload is triggered
by implementing or merging this change.

## Retry and rollback

Start with the failed run's **Re-run failed jobs**. This retains the successful
verification job's artifact and avoids rebuilding a candidate. Publication never
uses `--clobber`, moves tags, or retries a store POST automatically.

| Failure point | Recovery |
| --- | --- |
| Build/tests/preflight fail | Nothing is published. Fix main and prepare a new unused version; inspect and deliberately retire any abandoned draft/refs first. Never repoint an existing release tag. |
| Branch/tag created but dispatch failed | Rerun Create release while main is still at that source, or run Publish release on main with the existing tag. Existing conflicting refs fail. |
| Candidate not yet staged | Rerun failed jobs in the original run to keep its verified artifact. |
| Only provenance reached the draft | Rerun failed jobs in the original run. A fresh full run refuses to substitute a rebuilt PBW; recover the original artifact within its retention period. |
| PBW and provenance reached the draft | A full retry via Publish release restores those exact bytes, reruns emulator tests, and preserves original provenance. |
| Either store POST timed out, or one store succeeded but the next destination failed | Rerun failed jobs after inspecting both listings. Both uploaders query current versions first; an existing version must have the same downloadable bytes. Matching uploads are skipped, receipts are verified/frozen, and only the missing destination is uploaded. There is no automatic POST retry. Allow time for a listing to expose an accepted upload. |
| Existing version has different bytes, is not publicly downloadable, or a newer store release exists | Stop and inspect the store. No overwrite, duplicate upload, or silent downgrade occurs. |
| Release published but the next snapshot update failed | Rerun the failed snapshot job. It fetches current main and pushes the version-only commit normally. If the bump already landed, it skips that commit and retries CI dispatch. It never republishes the app or lowers main's version. |

If the only original candidate is lost, do not rebuild and present it as the same
artifact. Inspect store/draft state and choose a new version. Publication is not
atomic across services: Pebble may become live while Rebble fails, or both stores
may be live while GitHub remains a draft. Keep the successful uploads/receipts;
never delete or downgrade them to undo partial success. The next development
snapshot is not advanced until all destinations succeed.

For a bad live release, preserve its tag/assets and receipt. Revert the faulty code
on main, review it, then release a higher unused version through the same workflow.
If an urgent store withdrawal is needed, handle it explicitly in the dashboard;
the automation does not delete releases, roll back user data or install on watches.

## Development checks

`package.json` is the version source; the lockfile's two root version fields must
match. Main carries the next development snapshot. SDK 4.33.1 rejects prerelease
labels in its configuration validator, so `wscript` narrowly adapts that validator for our
`-snapshot` suffix. The PBW retains the full label; native headers use major/minor.
Source files and the installed SDK remain unchanged during builds. Release tag
validation rejects snapshots before credentials are used. There is no version UI.

```sh
python3 tools/release.py check
npm run typecheck
npm run check
npx playwright test --update-snapshots=none
```

Runtime preflights, package-hash verification and receipt checks stop publication
on errors; there is no separate publisher test suite. Do not dispatch a live
release to test workflow changes. Building, CI and source review do not authorize
publication or physical-watch installation.
See the [existing Rebble listing and first-release receipt](rebble.md).
