# Rebble Appstore

[Metro Lisboa on Rebble](https://apps.rebble.io/en_US/application/6af0e5dfb99ed90009374190)
is the existing Public listing. Use the [release workflow](releases.md) for updates
to both stores. Do not create another app, regenerate the UUID, backfill old
release assets or change visibility to test publication.

## Store-specific requirements

The [developer portal](https://dev-portal.rebble.io/) supports Emery (Time 2) and
Gabbro (Round 2). No original Time Round/Chalk, other-watch or iOS support is
claimed. Normal phone/watch installation still requires owner-approved acceptance.

| Field / asset | Value |
| --- | --- |
| Type / category | Watch App / Daily |
| Description / release notes | Both required; version-appropriate [listing copy](appstore.md#draft-listing), including privacy/UnderLX notices |
| Required banner | 720×320, `assets/rebble/banner.png` |
| Small icon | 48×48, `assets/rebble/icon-small.png` (not Pebble's 80×80) |
| Large icon | 144×144, `assets/appstore/icon-large.png` |
| Screenshots | At least one, at most five per declared target; use each platform's seconds/arrivals/saved/favourites PNGs |
| Timeline / custom companion | Off / none |
| Website / source / support | Only approved public destinations, otherwise blank |

The banner is original decorative geometry, not a metro map. Screenshots use
artificial emulator estimates, not live observations. See [asset provenance](../assets/README.md).
Append Rebble's provider privacy reference (`https://rebble.io/privacy/`) to the
shared listing policy and review [Rebble's terms](https://rebble.io/tos/).
The existing [data assessment](../DATA_METHODS.md) covers its stated binary/image
scope, not publication of fixtures or repository history.

**Visibility:** the portal's **Hide my app** produces an Unlisted, installable
listing, not a private draft. Unchecked defaults to Public; uploads publish
immediately. Existing store IDs differ between Pebble and Rebble. Check the
signed-in account, UUID and ownership rather than relying on title/UUID search,
which can miss unlisted apps. On `app.exists`, recover the existing listing;
never follow a generic suggestion to generate a new UUID.

**Phone compatibility caveat:** Rebble's API can report `ios.supported=true` based
on absence of a custom Android-only companion, not actual app acceptance. The
inspected portal has no OS selector. Keep Android-only wording; do not invent a
companion or claim iOS support to match this default.

## First-release receipt: 0.3.0

The owner manually published the first Rebble release on **2026-11-08**, before
dual-store automation. This is a historical receipt, not the current version.
Later releases retain their own `rebble-release.json` in GitHub release assets.

| Record | Verified value |
| --- | --- |
| PBW / size | `metro-lisboa-0.3.0.pbw` / 460,406 bytes |
| UUID | `5576168a-8b38-4be1-90e7-343af607c167` |
| Targets | `emery`, `gabbro` |
| Source commit | `c995ac24765c93490d48550fb96412ce67dd9ce9` |
| SDK / Pebble Tool | `4.33.1` / `5.0.39` |
| Pebble app / release | `dce54d3eb02943f1935e1529` / `f671d29e440e4c1ea6aff962` |
| Rebble app / release | `6af0e5dfb99ed90009374190` / `6af0e5e1b99ed9000937419b` |
| Publisher / visibility | Rafael Borges / Public |
| Publication time | 2026-11-08 21:13:05 UTC |
| Public PBW | `https://storage.googleapis.com/rebble-pbws/pbw/6af0e5e1b99ed9000937419b.pbw` |

SHA-256: `dfbd218e4c37f388735ca555bfbb8f2ff8092b51c9947d4922bbe998e135f06b`.

Archive validation and unauthenticated downloads matched the GitHub and Pebble
candidate byte-for-byte, including both target binaries and complete licence
notices. Public API/search, description/notes, all eight screenshots, banner and
icons were checked after submission. This did not verify hardware installation.
Detailed submission evidence remains in
[issue #9](https://github.com/rafaelborges29/pebble-metro/issues/9).

## Recovery and upstream evidence

Follow [release recovery](releases.md#retry-and-rollback). After a timeout, inspect
both listings before retrying; a store may already be live while GitHub remains a
draft. Never blindly repeat a POST, overwrite a version, delete a successful
upload or rebuild a frozen candidate. An explicitly approved manual recovery must
use the existing listing's **New Release** and original verified PBW.
`tools/rebble_store.py` alone checks authentication/ownership without uploading;
credential handling is documented in [release setup](releases.md#rebble-authentication).

Portal/server behaviour was inspected on 2026-11-08:

- [Portal source](https://github.com/pebble-dev/rebble-dev-portal/tree/48e3cbd5d04aca23580caa0d98e8a70dbf55aaf0)
- [Submission/release API](https://github.com/pebble-dev/rebble-appstore-api/blob/cf061e3cef03ece3069a029842af0196f50571f8/appstore/developer_portal_api.py)
- [Asset validation](https://github.com/pebble-dev/rebble-appstore-api/blob/cf061e3cef03ece3069a029842af0196f50571f8/appstore/utils.py)
- [PBW platform handling](https://github.com/pebble-dev/rebble-appstore-api/blob/cf061e3cef03ece3069a029842af0196f50571f8/appstore/pbw.py)

Upstream source is evidence, not a guarantee of the production revision. No
current authoritative Rebble byte limit was established; keep the local 4.4 MB
preflight and fail clearly if the production endpoint rejects the candidate.
Do not infer a maximum from a successful upload or assume a cross-store importer.
