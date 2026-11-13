# Store listing and assets

Metro Lisboa already has listings in the
[Pebble Appstore](https://apps.repebble.com/dce54d3eb02943f1935e1529) and
[Rebble Appstore](https://apps.rebble.io/en_US/application/6af0e5dfb99ed90009374190).
Use the approved [release workflow](releases.md) for binary updates; do not create
another app or change its UUID. Rebble differences are below; its historical
first-release receipt is retained in [issue #9](https://github.com/rafaelborges29/pebble-metro/issues/9).

This guide maintains listing copy and dashboard requirements. Review uploads,
legal terms and store-visibility changes with the owner.

## Listing changes

Use the [Pebble Developer Dashboard](https://developer.repebble.com/dashboard)
for text, images, URLs and visibility. Release automation preserves these fields.
Review the exact copy/assets and publisher/contact details with the owner before
changing them. Use the [public repository](https://github.com/rafaelborges29/pebble-metro)
for website/source links and [GitHub Issues](https://github.com/rafaelborges29/pebble-metro/issues)
for ordinary support. Vulnerabilities follow [SECURITY.md](../SECURITY.md), not
public issues. Do not derive a support address from commit metadata.

Uploads/visibility changes can take effect immediately, without a review queue.
**Unlisted** is shareable and installable, not private staging. **Hidden** is not
installable/discoverable. Store caches can lag; visibility changes do not remove
already-installed copies. After an uncertain upload, inspect the existing listing
before retrying. Never rebuild/repackage an already verified release or replace a
published version silently. See [release recovery](releases.md#retry-and-rollback).

The [distribution agreement §5.3](https://developer.repebble.com/legal/distribution/)
requires a prominent privacy policy. Include the policy below directly in the
store description; an optional website field or a link to `PRIVACY.md` does
not replace it. Recheck privacy statements, permissions and compatibility against
the exact published version, not an unreleased main snapshot.

Preserve [UnderLX attribution and data terms](../THIRD_PARTY_NOTICES.md#underlx-data),
complete licence copies in the phone bundle, and artificial-screenshot disclosure.
Review changed data distribution against those terms; do not assume attribution
alone covers every dataset or output.

## Assets and limits

| Item | Pebble requirement | File |
| --- | --- | --- |
| PBW | At most 4.4 MB; stable version; both targets | Exact verified release PBW |
| Small icon | 80×80 | `assets/appstore/icon-small.png` |
| Large icon | 144×144 | `assets/appstore/icon-large.png` |
| Emery screenshots | 200×228, unframed, up to five | `assets/appstore/emery_*.png` |
| Gabbro screenshots | 260×260, unframed, up to five | `assets/appstore/gabbro_*.png` |
| Optional banner | 720×320 | Not required for Pebble |
| Launcher icon | At most 25×25 | `resources/images/menu-icon.png` |

Store images accept PNG/JPEG/GIF, at most 4.4 MB each. Use the prepared PNGs in
**seconds → approximate minutes → SAVED → favourites** order for each platform.
Round 2 is **Gabbro**, not Chalk. Images are actual emulator captures with
artificial estimates, not live observations or proof of hardware acceptance.
See [asset provenance and generation](../assets/README.md).

## Rebble differences

Use the existing listing in the [developer portal](https://dev-portal.rebble.io/),
Watch App / Daily. Do not create another app, backfill old assets or assume a
cross-store importer. Existing Rebble and Pebble listing IDs differ.

| Item | Rebble requirement |
| --- | --- |
| Banner | Required, 720×320: `assets/rebble/banner.png` |
| Small icon | 48×48: `assets/rebble/icon-small.png` (not Pebble's 80×80) |
| Large icon | Reuse `assets/appstore/icon-large.png`, 144×144 |
| Screenshots | At least one and at most five for each declared Emery/Gabbro target |
| Description / release notes | Both required; use version-appropriate copy below |
| Timeline / custom companion | Off / none |

The banner is decorative geometry, not a metro map. Keep artificial-emulator-data
disclosure and UnderLX attribution with screenshots. Include
`https://rebble.io/privacy/` with provider privacy references, and review
[Rebble's terms](https://rebble.io/tos/) before an approved submission.

**Hide my app** produces an Unlisted installable listing, not a draft; unchecked
defaults to Public and uploads publish immediately. Search can miss unlisted apps:
check the signed-in account, UUID and ownership. On `app.exists`, recover the
existing listing; never follow a generic suggestion to generate another UUID.
For approved manual recovery use that listing's **New Release** and original
verified PBW, not a rebuild. See [release recovery](releases.md#retry-and-rollback).

Rebble can report `ios.supported=true` from absence of a custom Android companion,
not actual testing; the inspected portal has no OS selector. Keep Android-only
wording rather than inventing a companion or claiming iOS support. Physical
phone/watch installation acceptance remains separate and owner-approved.

Portal/server evidence inspected on 2026-11-08:
[portal](https://github.com/pebble-dev/rebble-dev-portal/tree/48e3cbd5d04aca23580caa0d98e8a70dbf55aaf0),
[submission API](https://github.com/pebble-dev/rebble-appstore-api/blob/cf061e3cef03ece3069a029842af0196f50571f8/appstore/developer_portal_api.py),
[asset validation](https://github.com/pebble-dev/rebble-appstore-api/blob/cf061e3cef03ece3069a029842af0196f50571f8/appstore/utils.py)
and [PBW handling](https://github.com/pebble-dev/rebble-appstore-api/blob/cf061e3cef03ece3069a029842af0196f50571f8/appstore/pbw.py).
These sources do not guarantee the deployed revision. No authoritative current
Rebble byte limit was established; retain the local 4.4 MB preflight and fail
clearly on rejection rather than inferring a maximum from an accepted upload.

## Draft listing

- **Name/type/category:** Metro Lisboa / Watchapp / Daily (confirm dashboard label).
- **Compatibility:** Time 2 and Round 2 with Android only; Round 2 hardware
  acceptance is pending. Do not claim original Time Round, other watches or iOS.
- **Website/source:** `https://github.com/rafaelborges29/pebble-metro`.
- **Support:** `https://github.com/rafaelborges29/pebble-metro/issues` for ordinary bugs/features.
- **Custom Android companion:** none; PKJS runs inside the normal Pebble app.
- **Notices/privacy:** complete licences in the PBW; prominent policy below.

The following copy describes current development behaviour. Review which features
exist in the selected stable release before using it; binary publication does not
automatically update listing text.

```text
Lisbon Metro arrival estimates on your Pebble Time 2 or Pebble Round 2.
Privacy: no GPS, app-specific account, app analytics or advertising. Full policy below.

Save up to 16 station, line and direction favourites on the watch or in Metro
Lisboa's Settings in the Pebble Android app. Phone editing requires a connected
watch, live settings support and Settings → Plugins → Plugins / permissions preview
enabled. Add and confirmed Remove save immediately without closing the page;
feedback stays on the phone. Its bundled editor needs no separate website or account.
See the next three estimates, with second-by-second countdowns when the source
supplies seconds. Minute-only estimates stay approximate rather than inventing precision.

Reopen quickly with saved estimates for two recent routes, clearly marked SAVED.
Original source expiry is preserved; unavailable or expired data is not shown as
an arriving train. A tiny animated train shows when the app is updating.

Requires an Android phone with the Pebble app and internet for live updates.
No GPS, app-specific account, alerts or background service.

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

For Rebble, also include `https://rebble.io/privacy/` as its provider-policy
reference. Review applicable [Pebble policies](https://developer.repebble.com/legal/program-policies/)
and [Rebble terms](https://rebble.io/tos/) before approved submissions. Never
expose user data or credentials to satisfy an optional field.

## References

- [Publishing an app](https://developer.repebble.com/guides/appstore-publishing/publishing-an-app/)
- [Submission fields, images and visibility](https://developer.repebble.com/guides/appstore-publishing/preparing-a-submission/)
- [Distribution agreement](https://developer.repebble.com/legal/distribution/)
- [Launcher icon rules](https://developer.repebble.com/guides/app-resources/images/#menu-icon-in-the-launcher)

Requirements and upstream defaults can change. `pebble publish` rebuilds;
CloudPebble Publish uses its latest build. Neither is a substitute for the exact
verified PBW used by this project's release workflow. Never put sign-in tokens in
commands, source, logs or screenshots.
