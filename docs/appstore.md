# Store listing and assets

Use the existing [Pebble/Rebble listings](../README.md) and [release workflow](releases.md)
for binary updates. Do not create another app or change its UUID. The historical
Rebble receipt is in [issue #9](https://github.com/rafaelborges29/pebble-metro/issues/9).

## Listing changes

Release automation preserves text, images, URLs and visibility. Review changes with
the owner in the [Pebble dashboard](https://developer.repebble.com/dashboard) or
[Rebble portal](https://dev-portal.rebble.io/). Use the public repository for
website/source links and GitHub Issues for ordinary support; vulnerabilities follow
[SECURITY.md](../SECURITY.md). Never derive a contact address from commit metadata.

Uploads/visibility changes can take effect immediately without review. Unlisted
means shareable/installable, not private staging; Hidden is not installable.
Visibility changes do not remove installed copies and store caches can lag. After
an uncertain upload, inspect the listing before retrying. Use only the exact verified
PBW, never a rebuild/repack or silently replaced version; see [recovery](releases.md#retry-and-rollback).

## Assets and limits

| Item | Pebble requirement / file |
| --- | --- |
| PBW | Stable production version, both targets, at most 4.4 MB |
| Small / large icon | 80×80 / 144×144, `assets/appstore/icon-{small,large}.png` |
| Emery screenshots | 200×228, unframed, up to five; `assets/appstore/emery_*.png` |
| Gabbro screenshots | 260×260, unframed, up to five; `assets/appstore/gabbro_*.png` |
| Optional banner | 720×320 |
| Watch launcher icon | At most 25×25, `resources/images/menu-icon.png` |

Images accept PNG/JPEG/GIF up to 4.4 MB each. Prepared PNG order is **seconds →
approximate minutes → SAVED → favourites** for each target. Round 2 is Gabbro,
not Chalk. These are emulator examples, not live observations or hardware acceptance.
See [asset provenance/generation](../assets/README.md); retain
[UnderLX attribution/data terms](../THIRD_PARTY_NOTICES.md#underlx-data) and complete
licences in the PBW. Changed datasets/outputs need their own licence review.

## Rebble differences

- Watch App / Daily; description and release notes required, timeline off, no custom companion.
- Required 720×320 banner: `assets/rebble/banner.png`.
- Small icon is **48×48**, `assets/rebble/icon-small.png`; reuse the 144×144 large icon.
- At least one and at most five screenshots per declared Emery/Gabbro target.
- **Hide my app** means Unlisted/installable; unchecked defaults to Public and uploads publish immediately.

Store IDs differ. Check the signed-in account/UUID/ownership; search can miss unlisted
apps. On `app.exists`, recover the existing listing, never generate a new UUID.
Manual recovery uses its **New Release** and original PBW; do not assume an importer.
No authoritative current Rebble byte limit was established: retain the local 4.4 MB
preflight and stop clearly on production rejection.

Rebble can report `ios.supported=true` from companion metadata, not actual acceptance;
the inspected portal has no OS selector. Keep Android-only wording, never invent a
companion or iOS support. Physical installation still needs owner-approved testing.
Add `https://rebble.io/privacy/` to provider references and review [Rebble's terms](https://rebble.io/tos/).
The banner is decorative geometry, not a metro map; preserve screenshot attribution.

## Draft listing

Use Metro Lisboa / Watchapp / Daily, with Time 2 and Round 2 + Android only; Round 2
hardware acceptance is pending. Website/source is `https://github.com/rafaelborges29/pebble-metro`,
support is its `/issues` page, and no separate Android companion is supplied.
Take version-appropriate feature copy from [README](../README.md); binary updates do
not update listing text automatically. Include the notices and policy below prominently:
[distribution agreement §5.3](https://developer.repebble.com/legal/distribution/) requires
privacy-policy delivery; an optional website field or repository link alone does not replace it.

```text
Lisbon Metro arrival estimates on your Pebble Time 2 or Pebble Round 2.
Privacy: no GPS, app-specific account, app analytics or advertising. Full policy below.

Independent app, not affiliated with or endorsed by UnderLX or Metro de Lisboa.
Contains information from UnderLX (https://underlx.com/), made available under
ODbL 1.0 (https://opendatacommons.org/licenses/odbl/1-0/) unless otherwise indicated.
Data adaptations remain ODbL. Third-party notices and complete licence texts are
included in the app package's phone JavaScript bundle.
Screenshots are emulator captures using artificial example arrival data.

PRIVACY POLICY

Metro Lisboa does not operate an application server, require an app-specific
account, request GPS/background location, or include app analytics or advertising.

While the watch app runs, its phone companion connects directly to
https://api.underlx.com/v1/stations and /lines for metadata, and to
wss://perturbacoes.pt/websocket/ for arrival estimates. These providers can receive
the phone's public IP address, selected station topic and a generated MQTT
connection identifier. The app does not upload the full favourites list.

The watch stores up to 16 favourites, the selected route, and two recent routes'
estimates, original timestamps and labels. The current and previous favourites
lists are retained locally for interrupted-save recovery; removed choices can remain
in the previous copy until overwritten, and legacy cleanup is best effort. This
is not secure erasure. The phone stores validated station/line metadata locally;
the selected station, full favourites snapshot and editing draft are transient
in the companion/settings page, not a durable phone favourites mirror.
The settings page is bundled and opened locally without external assets or hosting.
Initial data URLs and live read/save messages stay inside the mobile app, whose
diagnostics/device can still inspect them. Close URLs contain no favourite choices.
Live editing uses the mobile app's preview permission system; Metro adds no plugin
and requests no access to unrelated plugins, files, contacts or location. The full
list is not sent to UnderLX or a developer-operated service.
Closing the app retains saved favourites/cache, but does not renew estimate expiry.
Removing a favourite removes it from the current list and attempts to delete its
saved estimates; storage errors are reported. Use platform app-data controls deliberately
to clear stored data: clearing app/phone data is destructive. Older Alloy storage
is separate and is not erased by the native upgrade.

Native diagnostics log startup and heap counts. The app does not automatically
send diagnostics to its developer. If you choose to share logs or screenshots,
they can reveal selected stations; review and redact them first.

The Pebble mobile app, operating system and UnderLX services have their own privacy
practices, outside this app's control. See https://repebble.com/privacy/ and
https://underlx.com/terms for the providers' published information.
```

## References

- [Submission fields, images and visibility](https://developer.repebble.com/guides/appstore-publishing/preparing-a-submission/)
- [Distribution agreement](https://developer.repebble.com/legal/distribution/) and [program policies](https://developer.repebble.com/legal/program-policies/)

Recheck upstream requirements/defaults before submission. `pebble publish` rebuilds
and CloudPebble Publish selects its latest build; neither substitutes for the frozen
tested PBW. Never put credentials or user data in commands, source, logs or screenshots.
