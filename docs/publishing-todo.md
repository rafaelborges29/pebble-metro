# Release checklist

Keep the Git repository/history and application source **private**. Publishing a
watch app does not require making its GitHub repository public. Original software
is 0BSD; dependencies and UnderLX data retain separate terms. A distributed PBW
contains extractable phone JavaScript, including a source map; private Git hosting
does not make that part confidential.

The targets are **Pebble Time 2 (`emery`), Pebble Round 2 (`gabbro`) and Android**.
Do not claim iOS, original Time Round (`chalk`), other-watch support or removed
alert/service features. See [Appstore publishing](appstore.md) for the draft
listing and Dashboard → Unlisted → store-install test → Listed workflow.
Repository visibility, merges, tags/releases and store uploads are separate actions.

## Private-source release preparation

- [x] Include root `LICENSE` and matching 0BSD package metadata. This licence does
  not require source publication. Keep `package.json`'s `private: true` to prevent
  accidental npm publication; it is separate from GitHub visibility.
- [x] Embed `LICENSE`, `THIRD_PARTY_NOTICES.md` and complete `LICENSES/*.txt` copies
  in the phone bundle so they accompany store-installed PBWs, not only optional
  download archives. Retain generated upstream copyright headers.
- [x] Remove the private repository URL from About; retain public UnderLX/ODbL URLs
  and identify the store description and phone bundle as privacy/notices locations.
- [x] Draft an inline store privacy policy. The
  [Distribution Agreement §5.3](https://developer.repebble.com/legal/distribution/)
  requires prominent privacy information even though website/source fields are
  optional. A private `PRIVACY.md` URL is not the delivery path.
- [ ] Resolve and record the [UnderLX data-access assessment](../DATA_METHODS.md),
  including public outputs/screenshots. Do not assume that attribution, a local
  cache or the absence of a backend settles ODbL §§4.4(c)/4.6. If applicable,
  supply a complete, free, recipient-accessible machine-readable data/alteration
  offer, or obtain suitable alternative permission. Do not distribute, including
  an Unlisted beta, until this is resolved. No full application-source archive is
  automatically required or promised; keep the application source private.
- [ ] Review the diff, complete notices, privacy text and intended public publisher
  details. If providing an optional support contact, approve it separately; do not
  use private GitHub Issues as a customer-facing channel or assume a commit email
  is the chosen contact.
- [ ] Run the pinned build/typecheck/E2E workflow against the exact candidate.
  Confirm hosted checks separately; local passes are not hosted-CI evidence.

## Verification baseline

The E2E matrix covers 18 native flows on each target, including queued invalidation
and coalescing races during station changes, delayed/in-flight additions and
removals, duplicate/opposite-direction favourites, delete/reopen persistence, and
16 favourites with 160 switches per platform's stress run. Heap assertions require
at least 50 KiB free and stable switch samples. See [E2E](e2e.md) for scope,
artifacts and commands. Recheck the full matrix after production changes.

The native 0.2.0 touch-prototype build was installed on Time 2 firmware `v4.44.1`
without uninstalling or clearing data. The SDK reported Metro running and the
device owner accepted the build. Its PBW SHA-256 was
`ebc4129f4d191b358f2396c432303bae85cdbe9b8dfa02bbd25ec3e9302f45bd`.
This is a basic installation/running-app check and owner feedback, not complete
hardware/battery acceptance or gesture verification. No touch tests were performed.
Round 2 has emulator evidence only; obtain physical feedback before claiming full
hardware acceptance. Earlier 0.1 Alloy successes are not evidence for the native
implementation.

## Physical acceptance

- [ ] Record exact watch firmware, Android and Pebble mobile app versions for the
  release candidate.
- [ ] Re-add favourites after the 0.1 upgrade where needed; verify repeated switching
  in both directions with real data, native heap samples and no restart/error.
- [ ] Check seconds, approximate minutes, ranges, bounds, zero and strict expiry.
- [ ] Check quick reopen from both durable routes before reconnect, including
  expired/empty data and retained route labels.
- [ ] Check phone backgrounding/screen-off/battery restrictions, Bluetooth and
  internet loss/recovery, phone-runtime restart and manual Retry.
- [ ] Check 16 favourites, removal, interchange/terminus selection and storage
  failures/limits where practical.
- [ ] Measure sustained foreground CPU/redraw/battery behaviour. No background
  fetching or notification service is promised. Disable Developer Connection for
  normal-use battery measurements so debug traffic does not skew them.

## Package and distribute

- [ ] Confirm display/developer name, unused numeric version, release notes and
  any optional support contact. Do not describe an estimate as observed presence.
- [ ] Confirm applicable SDK/toolchain redistribution terms. Inspect the emitted
  PBW for complete applicable licence copies and retained copyright notices.
- [ ] Build cleanly with SDK 4.33.1; inspect `build/<checkout-name>.pbw`, version,
  UUID, both Emery/Gabbro targets and absence of credentials or unexpected assets.
- [ ] Record the exact PBW SHA-256, full source commit and verification results in
  private release records. Retain each distributed version; do not overwrite old
  artifacts or move a release tag. A private GitHub Release can be an internal
  archive, not a recipient-facing licence/data-access URL.

  For a local binary/checksum copy, from the clean candidate revision:

  ```sh
  version=$(node -p "require('./package.json').version")
  mkdir -p dist
  cp "build/$(basename "$PWD").pbw" "dist/metro-lisboa-$version.pbw"
  (cd dist && sha256sum "metro-lisboa-$version.pbw" > "metro-lisboa-$version.pbw.sha256")
  ```

  These commands publish nothing and do not create a full application-source archive.

- [ ] Confirm the UnderLX assessment and any required data/alteration offer for
  this exact version. Test every recipient-facing URL without authentication;
  retain required materials for previous releases. Do not expose personal caches.
  Expiring diagnostic CI artifacts are not a permanent offer.
- [x] Prepare original 80×80/144×144 store icons, a 25×25 watch launcher icon and
  four unframed captures per native emulator: Emery 200×228 and Gabbro 260×260.
  See [assets](../assets/README.md).
- [ ] Review release artwork/screenshots. Fixture captures are not live hardware;
  keep the UnderLX/ODbL notice and artificial-example disclosure in the description.
- [ ] Review the developer agreements and final description, including its full
  privacy policy. Leave website/source URL fields blank unless a deliberately
  approved public destination exists; never use a private repository link.
- [ ] Obtain explicit approval to upload the exact candidate with **Unlisted**
  visibility. Unlisted is shareable/installable, not private staging.
- [ ] Install from the store link and verify the expected watch/phone build.
  Obtain Round 2 physical feedback during the beta before claiming acceptance.
- [ ] Obtain separate approval before changing the listing to **Listed**.

## If repository visibility changes later

This is not part of the current plan. Before a separately approved visibility
change, review reachable Git history and every remote branch/tag/PR ref, plus
GitHub issues/PR text/comments/reviews, attachments, Actions logs/artifacts and
releases with authenticated access. Rotate any exposed secret before publication;
local scans do not cover all GitHub metadata. Coordinate any history rewrite.
Publish only intended branches/tags with explicit refspecs. Never use
`git push --mirror` or push `refs/t3/*` / local checkpoint refs. After the change,
verify refs, default branch, links and metadata anonymously. Making a repository
public does not merge a PR or authorize appstore publication.

## Migration

Keep UUID `5576168a-8b38-4be1-90e7-343af607c167` for upgrades. Public native persistence
cannot import the earlier Alloy string-keyed store. Clearly tell existing users to
re-add favourites; do not silently uninstall, erase data or use private firmware
APIs. Old stored data remains untouched by the native app.
