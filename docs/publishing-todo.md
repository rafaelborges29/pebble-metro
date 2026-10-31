# Release checklist

Source publication and distributing a watch binary are separate steps. The target
is **Pebble Time 2 (`emery`), Pebble Round 2 (`gabbro`) and Android**; do not claim
iOS, original Time Round (`chalk`) or other-watch support or
publish removed alert/service features. See [Appstore publishing](appstore.md) for
current requirements, a draft listing and the recommended Dashboard → Unlisted →
store-install test → Listed workflow.

## Before making the repository public

- [x] Choose 0BSD for original project code; include root `LICENSE` and matching
  package metadata. Third-party components and data retain their own terms.
- [ ] Review the complete diff, including new native sources and screenshot baselines.
- [ ] Review reachable Git history for credentials, private files and personal
  author/committer identities. Ignoring a file does not remove its history.
  Coordinate any intentional history rewrite with collaborators first.
- [ ] Run the pinned build/typecheck/E2E workflow against the exact candidate.
  Confirm hosted checks separately; local passes are not hosted-CI evidence.
- [ ] Confirm public project identity, support contact and repository visibility.
  Keep `package.json`'s `private: true`: it prevents accidental npm publication,
  not public Git hosting.
- [ ] Recheck [third-party notices](../THIRD_PARTY_NOTICES.md), complete texts in
  `LICENSES/`, [privacy](../PRIVACY.md) and
  [UnderLX data/methods scope](../DATA_METHODS.md). Preserve ODbL for data;
  0BSD covers original software/artwork, not the provider's database.

## Verification baseline

The E2E matrix covers 16 native flows on each target, including delayed/in-flight
additions and removals, duplicate/opposite-direction favourites, delete/reopen
persistence, and 16 favourites with 160 switches per platform's stress run.
Heap assertions require at least 50 KiB free and stable switch samples.
See [E2E](e2e.md) for scope, artifacts and commands. Recheck the full matrix after production changes.

A native build has been installed on Time 2 and loaded the full station catalogue.
This is initial hardware evidence, not completed acceptance. Round 2 currently
has emulator evidence only; obtain physical-device feedback before claiming full
hardware acceptance. The earlier 0.1
Alloy build failed with memory exhaustion during switching; its initial successes
are not evidence for the native implementation.

## Physical acceptance before a binary release

- [ ] Record exact watch firmware, Android and Pebble mobile app versions.
- [ ] Re-add favourites after the 0.1 upgrade; verify repeated switching in both
  directions with real data, native heap samples and no restart/error.
- [ ] Check seconds, approximate minutes, ranges, bounds, zero and strict expiry.
- [ ] Check quick reopen from both durable routes before reconnect, including
  expired/empty data and retained route labels.
- [ ] Check phone backgrounding/screen-off/battery restrictions, Bluetooth and
  internet loss/recovery, phone-runtime restart and manual Retry.
- [ ] Check 16 favourites, removal, interchange/terminus selection and storage
  failures/limits where practical.
- [ ] Measure sustained foreground CPU/redraw/battery behaviour. No background
  fetching or notification service is promised.

## Package and distribute

- [ ] Confirm display/developer name, version, release notes and support/privacy
  links. Do not describe an estimate as observed train presence.
- [ ] Confirm applicable SDK/toolchain redistribution terms. Retain generated
  copyright notices and distribute complete applicable licence texts.
- [ ] Build cleanly with SDK 4.33.1; inspect `build/<checkout-name>.pbw`, version,
  UUID, both Emery/Gabbro targets and absence of credentials or unexpected runtime assets.
- [ ] Record the exact PBW SHA-256, source revision and verification results.
- [ ] Provide `LICENSE`, `THIRD_PARTY_NOTICES.md`, `DATA_METHODS.md` and `LICENSES/`
  (including ODbL 1.0) with binary downloads. Offer the exact matching source
  revision/archive free of charge, including all transformation/fixture methods
  and additional test data. Do not rely on a private repository link.
- [ ] Before any external distribution, including an Unlisted store beta, verify
  anonymously that the About/listing links reach the notices, complete licence
  and matching machine-readable methods/source archive. Record the source
  tag/commit next to the PBW. This remains a release gate, not a claim that an
  unpublished source offer is already publicly accessible.

  From the clean, committed revision used to build the candidate, for example:

  ```sh
  mkdir -p dist
  git archive --format=zip --output=dist/metro-lisboa-0.2.0-source.zip HEAD
  zip -r dist/metro-lisboa-0.2.0.zip \
    "build/$(basename "$PWD").pbw" LICENSE THIRD_PARTY_NOTICES.md DATA_METHODS.md LICENSES/
  ```

  Make both archives available with the matching release. The store listing must
  link to the public source/methods offer even when installation delivers only
  the PBW. Do not include users' personal caches in the offer.

- [x] Prepare original 80×80/144×144 store icons, a 25×25 watch launcher icon and
  four unframed captures per native emulator: Emery 200×228 and Gabbro 260×260.
  See [assets](../assets/README.md).
- [ ] Review the artwork/screenshots for the release. Fixture captures must not be
  represented as live hardware. Keep the UnderLX source/ODbL notice with the
  images, including in the store description; do not label their data as 0BSD.
- [ ] Confirm agreements, public contact details and intended Unlisted/Listed
  visibility before an appstore upload. A source release does not publish an app.
- [ ] Install from the distribution link and verify the expected watch/phone build.

## Migration

Keep UUID `5576168a-8b38-4be1-90e7-343af607c167` for upgrades. Public native persistence
cannot import the earlier Alloy string-keyed store. Clearly tell existing users to
re-add favourites; do not silently uninstall, erase data or use private firmware
APIs. Old stored data remains untouched by the native app.
