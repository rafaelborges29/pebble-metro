# Rebble Appstore submission

Issue [#9](https://github.com/rafaelborges29/pebble-metro/issues/9).
**Published:** [Metro Lisboa on Rebble](https://apps.rebble.io/en_US/application/6af0e5dfb99ed90009374190),
version **0.3.0**, **Public**, under **Rafael Borges**, on **2026-11-08**.
The owner submitted the release through the developer portal. Public API, search,
package and asset verification passed afterward. The owning account's OAuth
refresh/ownership checks passed twice and its CI secret is configured for future
releases; normal phone/watch installation has not been verified in this work. Keep GitHub private. Do not change the UUID
or uninstall/wipe the app.

## Findings (2026-11-08)

The live [developer portal](https://dev-portal.rebble.io/submit), its public
JavaScript, and the maintained server implementation support both **Emery
(Time 2, 200×228)** and **Gabbro (Round 2, 260×260)**. The server recognises their
PBW manifests and generates binary records for both. The completed submission
and served package were verified for both targets, but phone/watch installation
was not tested. Do not claim compatibility with original Time Round/Chalk, legacy
watches or iOS.

Important differences from the [Pebble submission](appstore.md):

| Field / asset | Rebble requirement / prepared value |
| --- | --- |
| Title | Metro Lisboa |
| Type / category | Watch App / Daily |
| Description / release notes | Both required; copy below |
| Banner | **Required for watchapps**, 720×320: `assets/rebble/banner.png` |
| Small icon | **48×48**, not Pebble's 80×80: `assets/rebble/icon-small.png` |
| Large icon | Reuse `assets/appstore/icon-large.png` (144×144) |
| Screenshots | At least one per declared target, up to five per target |
| PBW | Exact selected stable release, unchanged UUID and both target binaries |
| Timeline | Off; this app does not use timeline |
| Website / source | Optional; leave blank, not private GitHub URLs |
| Visibility | Explicitly choose; public is the server default |

Use the four existing screenshots for **each** platform, in this order:
`assets/appstore/<platform>_seconds.png`, `_arrivals.png`, `_saved.png`,
`_favourites.png`. These assets are unchanged from v0.3.0. Upload only under
Emery and Gabbro, not Chalk. They are emulator captures with artificial arrival
values, not live observations or proof of physical-device acceptance.
The new banner is original geometric artwork based on our existing icon; its
abstract routes are decorative, not an actual metro map. Review it before use.

The portal's **Hide my app** checkbox sends `visible=false`, producing an
**Unlisted**, direct-link-installable listing, not a private draft. With it
unchecked the server defaults to public. Submission publishes the release
immediately; the portal reports it as live, and the server creates a published
release. Treat uploads and visibility changes as publication actions. Do not
assume a review queue, draft stage, or that unlisted content is secret.

Before submission, public store search returned no results for `Metro Lisboa` or
the app UUID. After publication, title search returns the new listing.
Looking up the Pebble listing's ID on Rebble also returned an empty `data` array;
the two stores' listing IDs must not be assumed to match. These checks **do not
exclude an unlisted listing**, and UUID text search may not index UUIDs.
A speculative `/apps/uuid/...` URL returned 404; it is not a valid duplicate check.
Check the signed-in developer account before creating anything. If the server
returns `app.exists`, stop and recover/update that listing; **never follow its
generic suggestion to generate a different UUID**.

No current cross-store feed/import mechanism was established by this inspection.
Do not assume publishing to Pebble also publishes or updates Rebble. If an imported
listing appears, confirm its owner, UUID, version and downloadable bytes before
creating or updating anything. Do not enable both an importer and manual uploads
without understanding their interaction.

## Selected and verified candidate: v0.3.0

The issue's 0.2.0 reference is historical. The latest published GitHub release
checked on 2026-11-08 is [v0.3.0](https://github.com/rafaelborges29/pebble-metro/releases/tag/v0.3.0).
`main` is a development snapshot and must not be used instead.

| Record | Verified value |
| --- | --- |
| PBW | `metro-lisboa-0.3.0.pbw` |
| Size | 460,406 bytes |
| UUID | `5576168a-8b38-4be1-90e7-343af607c167` |
| Version / targets | `0.3.0` / `emery`, `gabbro` |
| Source commit | `c995ac24765c93490d48550fb96412ce67dd9ce9` |
| SDK / Pebble Tool | `4.33.1` / `5.0.39` |
| Pebble app / release IDs | `dce54d3eb02943f1935e1529` / `f671d29e440e4c1ea6aff962` |
| Rebble app / release IDs | `6af0e5dfb99ed90009374190` / `6af0e5e1b99ed9000937419b` |
| Rebble visibility / publisher | Public / Rafael Borges |
| Rebble publication time | 2026-11-08 21:13:05 UTC |
| Rebble PBW URL | `https://storage.googleapis.com/rebble-pbws/pbw/6af0e5e1b99ed9000937419b.pbw` |

SHA-256:

```text
dfbd218e4c37f388735ca555bfbb8f2ff8092b51c9947d4922bbe998e135f06b
```

Downloaded the original GitHub release assets and used the existing
`tools/release_package.py:verify_pbw` to verify archive integrity, size, UUID,
stable version, both native headers/manifests/resources, shared phone JavaScript
and complete bundled licence notices. The hash matches `SHA256SUMS`,
`provenance.json` and `pebble-release.json`. The original release tag resolves to
the provenance's source commit. An unauthenticated download from the public
Pebble listing also matched those exact bytes and receipt.
The recorded [release workflow](https://github.com/rafaelborges29/pebble-metro/actions/runs/42288487228)
completed successfully, including verification and publication. This preparation
did not rebuild the app, rerun emulator tests, perform touch tests or install it
on hardware.

After the owner's submission, unauthenticated API requests for `hardware=emery`
and `hardware=gabbro` confirmed the listing's identity, version, publisher, Daily
category, Public visibility and target binaries. Public title search finds it.
The served description (including privacy/attribution) and release notes match
the prepared text. Downloaded the Rebble PBW and reran `verify_pbw`: its SHA-256
matches GitHub and Pebble exactly. All eight original screenshots, the banner and
both icons also match our prepared files byte-for-byte. A local convenience
receipt is in `dist/rebble-0.3.0/rebble-release.json`; the durable IDs/hash are above.

**Store compatibility caveat:** Rebble's API/search automatically reports
`ios.supported=true` when no custom Android-only companion is registered. The
inspected server derives this flag from companion metadata, not our testing.
The portal offers no phone-OS selector, and the published description explicitly
requires Android. iOS acceptance remains unverified; do not add a fictitious
Android companion or claim iOS support to match this default. Ask Rebble support
about an Android-only display if needed. Other watch platforms correctly report
no binaries/support.

The prepared local handoff is in `dist/rebble-0.3.0/`: the original release
assets, `description.txt`, `release-notes.txt` and the selected images under
`assets/`. The text files contain no private GitHub links. This ignored directory
is a convenience copy, not a new release or an upload; maintained text lives in
this guide and `docs/appstore.md`.

To obtain a fresh local copy, from this worktree root:

```sh
mkdir -p dist/rebble-0.3.0
gh release download v0.3.0 --repo rafaelborges29/pebble-metro \
  --dir dist/rebble-0.3.0
(cd dist/rebble-0.3.0 && sha256sum --check SHA256SUMS)
PYTHONPATH=tools python3 - <<'PY'
from pathlib import Path
from release_package import read_json, verify_pbw
folder = Path('dist/rebble-0.3.0')
record = read_json(folder / 'provenance.json')
receipt = read_json(folder / 'pebble-release.json')
digest = verify_pbw(folder / 'metro-lisboa-0.3.0.pbw', '0.3.0')
assert digest == record['sha256'] == receipt['sha256']
assert digest == 'dfbd218e4c37f388735ca555bfbb8f2ff8092b51c9947d4922bbe998e135f06b'
print('Verified original v0.3.0 PBW:', digest)
PY
```

`dist/` is ignored. Downloading into an existing populated directory fails rather
than overwriting assets; verify the existing copy or choose a fresh directory.
Do not run `pebble publish` (it rebuilds), create a new release, or repackage the PBW.
Only the PBW goes in the portal's binary field; do not upload the private GitHub
release notes, provenance files, repository, source archive or local reports.

## Listing copy

Reuse the **plain-text description** in [Draft listing](appstore.md#draft-listing),
including its complete privacy policy, UnderLX attribution, ODbL links and
emulator-data disclosure. Those statements describe this verified release, not
future settings-page or TypeScript work. Append this additional provider-policy
reference for Rebble distribution:

```text
If you use Rebble services, their privacy policy is at https://rebble.io/privacy/.
```

Review [Rebble's terms](https://rebble.io/tos/) before upload, particularly D
(user-generated content, responsibility for third-party rights and redistribution)
and H (third-party applications/privacy). The owner must accept the terms; this
preparation is not acceptance on their behalf or legal certification.
The [existing data assessment](../DATA_METHODS.md) and bundled licences remain
applicable to the same binary and screenshot scope; this does not approve
publishing the repository, fixture database or additional data. Do not offer
public application source to satisfy an optional source-link field.

Published first Rebble release notes (no private GitHub PR/changelog links):

```text
First Rebble Appstore release of Metro Lisboa, version 0.3.0.
Lisbon Metro arrival estimates for Pebble Time 2 and Pebble Round 2 with Android.
Save up to 16 favourites using a line-first station and direction picker.
English and Portuguese interface, line-coloured headers and larger countdowns.
Second-precision countdowns only when supplied by the source; saved estimates
retain their original expiry and are clearly marked SAVED.
Round 2 layout has emulator coverage; physical-device feedback is welcome.
This is the same app version and package distributed through the Pebble Appstore.
```

No separate Android companion application is supplied. Do not add support contact
information from commit metadata; use only a public contact approved by the owner.

## Submission checklist

The initial submission is complete and verified as recorded above. Retain this
checklist for reference; step 8's owner-approved installation check remains open.

1. Sign in at the [developer portal](https://dev-portal.rebble.io/). Confirm the
   intended Rebble developer account and public publisher name. If onboarding is
   needed, choose that name deliberately; if an old account/listing is missing,
   recover it rather than creating a duplicate. Never share passwords, tokens or
   OAuth callback URLs in chat, docs or screenshots.
2. Check the account's apps for the UUID above. Record any existing Rebble ID/URL,
   owner and version before proceeding; a name-only match is insufficient.
3. Obtain approval for **v0.3.0**, the listing text/assets, publisher details,
   optional support contact and **Unlisted or Public** visibility. Review terms.
   An existing listing's visibility must not be changed implicitly.
4. For a genuinely new listing choose Watch App / Daily, fill the description and
   notes, upload the two icons, banner and both platform screenshot sets, select
   the exact verified PBW, and explicitly set visibility. Leave timeline off and
   website/source blank. Stop before **Publish App to Store** until approved.
5. Submit once. If it times out, inspect the account/listing before retrying:
   publication may already have succeeded. Never repeatedly POST blindly.
6. Verify the resulting public/direct-link page, publisher, UUID, version,
   visibility, both platform assets and compatibility. Download the served PBW
   and compare its SHA-256 to the candidate. A mismatch blocks acceptance; do not
   disguise a repack or replace a published version silently.
7. Record the Rebble app ID, listing URL, release ID (if exposed), version, SHA-256,
   visibility and publication date here. Add the verified Rebble link alongside
   the [existing Pebble listing](https://apps.repebble.com/dce54d3eb02943f1935e1529)
   in user-facing docs. Do not invent a URL before submission.
8. With separate owner approval, check the normal installation/update path on the
   intended Android/Time 2 and Round 2 setup. Preserve saved favourites; do not
   uninstall, reset app data or use hardware installs as an implicit test step.

## Future releases and recovery

The updated [release workflow](releases.md) includes **both stores** once reviewed,
merged and configured with `REBBLE_REFRESH_TOKEN`. Running Create release (or
intentionally pushing a valid release tag) authorizes the same verified PBW to
Pebble, Rebble and GitHub. No second manual Rebble submission is needed.

Both stores preflight account ownership, current versions and any matching
existing upload before the first store POST. Pebble publishes first, then Rebble;
each served PBW must match the frozen candidate hash. Both receipts are attached
to the GitHub draft, which is published only after both stores succeed. Listing
metadata, Public visibility, icons and screenshots remain untouched. Public-safe
version/platform notes are sent to both stores, not private GitHub PR links.

On failure, inspect the listings and use Re-run failed jobs. Matching uploads are
verified and skipped; conflicting bytes or a newer version stop the run. Never
blindly repeat a POST after a timeout, delete a successful upload, create another
app or regenerate the UUID. Partial success across services is possible. For a
faulty release, preserve its identity and release a reviewed, higher unused
version; withdrawal and visibility changes need an explicit owner decision.

Version 0.3.0 above was submitted manually before this automation. Do not backfill
its GitHub assets or re-upload it to test the implementation. The standalone
`tools/rebble_store.py` entry point checks only authentication/ownership. No
automatic feed/importer, new dependency, live release, hardware install or
repository visibility change is part of this implementation.
An intentional manual recovery, if required, must still use the existing listing's
**New Release** and the original verified PBW, never a rebuild or New App.

## Evidence and current limitations

Inspected the live portal and these upstream sources on 2026-11-08:

- [Portal JavaScript](https://dev-portal.rebble.io/res/js/devPortal.js):
  `PLATFORM_CONFIG`, `submitNewApp`, `submitRelease` and `setAppVisibility`.
- [Portal source](https://github.com/pebble-dev/rebble-dev-portal/tree/48e3cbd5d04aca23580caa0d98e8a70dbf55aaf0)
  and [API configuration](https://dev-portal.rebble.io/res/js/config.js).
- [Server submission/release code](https://github.com/pebble-dev/rebble-appstore-api/blob/cf061e3cef03ece3069a029842af0196f50571f8/appstore/developer_portal_api.py):
  required screenshots per declared target, duplicate UUID rejection, account
  ownership, default public visibility and immediate release creation.
- [Server validation](https://github.com/pebble-dev/rebble-appstore-api/blob/cf061e3cef03ece3069a029842af0196f50571f8/appstore/utils.py):
  48×48 small icon, 144×144 large icon, 720×320 banner and target screenshot sizes.
- [PBW handling](https://github.com/pebble-dev/rebble-appstore-api/blob/cf061e3cef03ece3069a029842af0196f50571f8/appstore/pbw.py):
  Emery/Gabbro manifests and binary records.
- [Public store](https://apps.rebble.io/en_US/): title search returns the published
  listing. Later authenticated ownership checks for pipeline setup confirmed the
  expected developer and app IDs without uploading a release.

The portal's linked `https://help.rebble.io/submit-an-app` returned 404, so do not
rely on that stale help link. Upstream source is evidence, not proof that every
production server revision or limit matches it. No authoritative current Rebble
PBW byte limit was established. The 460,406-byte candidate passes our existing
4.4 MB preflight and was accepted by production; do not infer the maximum allowed
upload size from that successful submission. Recheck requirements on updates.
