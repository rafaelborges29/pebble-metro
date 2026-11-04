# Publishing Metro Lisboa

## Recommended first release

Keep the Git repository/history and application source **private**. This guide
prepares a binary-only store release; it does not authorize source publication or
an upload. The [case-specific UnderLX assessment](../DATA_METHODS.md) identifies no
additional public data/methods download or permission email prerequisite for this
release. Retain its attribution/licensing conditions and complete the remaining
[submission checks](publishing-todo.md) before an approved Unlisted upload.

Use the [Pebble Developer Dashboard](https://developer.repebble.com/dashboard)
for the first release, with visibility explicitly set to **Unlisted**. It lets you
review the exact PBW, artwork, URLs and visibility before submitting. After testing
installation from the resulting store link, change the listing to **Listed**.

Users normally discover/install the watch app through the Pebble mobile app's
store. Website and source-code URL fields are optional; leave them blank rather
than linking to private GitHub pages. A distributed PBW still contains extractable
phone JavaScript and a source map; keeping GitHub private does not conceal them.

1. Review/commit the source and assets privately and run hosted CI. No public
   repository or full application-source ZIP is part of this plan.
2. Build the chosen revision with SDK 4.33.1. Record its version, UUID and PBW
   SHA-256 privately; preserve the UUID on updates. Use an unused numeric version
   such as `0.2.0`, not a `-beta` suffix. Retain each distributed version.
3. Complete the [release checklist](publishing-todo.md), including physical-watch
   checks and applicable SDK/toolchain terms. Standard builds embed complete
   licence/notices copies in the phone bundle, so store-installed PBWs carry them.
   Confirm the candidate still matches the recorded UnderLX client/screenshot
   assessment and preserve its notices. No blanket permission email or public
   application-source archive is required by that assessment. Reassess before
   changing data-distribution scope; a private Release or expiring CI artifact
   would not satisfy an offer if one becomes necessary. Test public URLs without
   signing in.
4. Sign in to the Developer Dashboard with the same Pebble account/sign-in method
   used for development. Review any legal agreements yourself.
5. Choose **New**, upload the exact PBW, and check type, UUID, version and both
   **Emery (Time 2) / Gabbro (Round 2)** platform detections. Fill in the listing
   and upload each platform's assets below.
6. **Explicitly select Unlisted before Submit App.** Store submissions can become
   available immediately: there is no review queue. Verify the resulting direct
   link is installable but not discoverable in search/browsing.
7. Install from that store link on Time 2 and Round 2 with Android and repeat
   switching, reopen, expiry and disconnect/reconnect checks. Round 2 currently
   has emulator coverage; collect physical-device feedback during the beta.
8. When ready, use **Edit → App visibility → Listed** in the dashboard. For later
   versions use **New Release**, the same UUID, an unused version and release notes.
   Check the release's published/draft state as well as overall app visibility.

Unlisted is still a shareable, installable release, not a private staging area.
Hidden is not discoverable or installable. Changing visibility does not uninstall
copies already on watches, and cached store pages can lag by up to ten minutes.

## Privacy delivery

The [Developer Distribution Agreement §5.3](https://developer.repebble.com/legal/distribution/)
requires a prominently displayed privacy policy. Optional website/source fields
are not a privacy exemption. The draft below includes the user-facing policy
**directly in the store description**, so no separate website or public repository
is needed for this delivery plan. Keep it visible in the final listing and verify
it on the resulting store page. [PRIVACY.md](../PRIVACY.md) records the detailed
behaviour for maintainers; its private URL is not a customer-facing policy.

Review public publisher/contact details before submission. If providing an
optional support contact, approve it separately; do not automatically reuse a
commit email or private GitHub Issues. A future public privacy/notices-only page
is an alternative, not an assumed prerequisite.

## Assets and limits

Current official requirements, checked 2026-10-29:

| Item | Requirement | Prepared file |
| --- | --- | --- |
| PBW | At most 4.4 MB; released SDK; unique app UUID | `build/<checkout-name>.pbw` |
| Small store icon | 80×80 | `assets/appstore/icon-small.png` |
| Large store icon | 144×144 | `assets/appstore/icon-large.png` |
| Emery screenshots | Exactly 200×228; unframed; up to five | Four `assets/appstore/emery_*.png` files |
| Gabbro screenshots | Exactly 260×260; unframed; up to five | Four `assets/appstore/gabbro_*.png` files |
| Banner | Optional, 720×320 | Not required for the initial beta |
| Watch launcher icon | At most 25×25; separate from store icons | `resources/images/menu-icon.png` |

Store images accept PNG/JPEG/GIF, at most 4.4 MB each. These prepared assets use PNG.
Icons and dashboard screenshots can technically be omitted/generated, but original
icons and useful real-app screenshots make a much clearer listing.

Suggested screenshot order on each platform: **seconds → approximate minutes →
SAVED → favourites**. These are unmodified emulator captures from the native app,
with deterministic example arrival data. Do not describe them as physical-watch
captures or current train observations. Upload each set to its correct platform;
Round 2 is Gabbro, not the original Time Round/Chalk. See
[asset provenance and generation](../assets/README.md).

## Draft listing

- **Name:** Metro Lisboa
- **Type/category:** Watchapp / Daily (confirm the dashboard category label).
- **Compatibility:** Pebble Time 2 and Pebble Round 2 + Android; no iOS, original
  Time Round or other-watch claim. Round 2 hardware acceptance remains pending.
- **Website URL:** leave blank; no approved public website is selected.
- **Source code URL:** leave blank; repository/application source remain private.
- **Support (optional):** use an approved customer-facing contact if provided;
  private GitHub Issues are not a public support channel.
- **Data access:** the current client/example-image assessment identifies no
  separate data/alteration download requirement. Keep attribution and data terms;
  reassess changed database distribution/public outputs before using this draft.
- **Notices:** complete copies are embedded in the PBW's phone JavaScript bundle.
- **Privacy:** include the policy below prominently in the store description.
- **Android companion app:** leave the custom-companion field empty. The bundled
  PebbleKit JavaScript uses the normal Pebble mobile app, not a separate Android app.

Plain-text description draft:

```text
Lisbon Metro arrival estimates on your Pebble Time 2 or Pebble Round 2.
Privacy: no GPS, app-specific account, app analytics or advertising. Full policy below.

Save up to 16 station, line and direction favourites. See the next three estimates,
with second-by-second countdowns when the source supplies seconds. Minute-only
estimates stay approximate rather than inventing precision.

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
estimates, original timestamps and labels. The phone stores validated station/line
metadata locally; selected-station data is transient in the running companion.
Closing the app retains saved favourites/cache, but does not renew estimate expiry.
Removing a favourite deletes its native preference and attempts to delete its saved
estimates; storage errors are reported. Use platform app-data controls deliberately
to clear stored data: clearing app/phone data is destructive. Older Alloy storage
is separate and is not erased by the native upgrade.

Native diagnostics log startup and heap counts. The app does not automatically
send diagnostics to its developer. If you choose to share logs or screenshots,
they can reveal selected stations; review and redact them first.

The Pebble mobile app, operating system and UnderLX services have their own privacy
practices, outside this app's control. See https://repebble.com/privacy/ and
https://underlx.com/terms for the providers' published information.
```

This remains a draft: review its privacy statements against the final build,
public publisher details and any optional support contact. Confirm that the
candidate matches the recorded UnderLX assessment; it is a case-specific reading,
not legal certification or a universal exemption for other data uses. Do not
insert private GitHub links or promise public application source as a shortcut.
Obtain approval for the exact candidate and Unlisted visibility before submission.

Initial release notes draft:

```text
Native C arrivals beta for Pebble Time 2, Pebble Round 2 and Android.
Round 2 includes a circular layout verified in the emulator; device feedback is welcome.
Favourites, source-precision countdowns, two-route saved cache and tiny-train loader.
Earlier Alloy favourites must be re-added after upgrading; the old store is not erased.
```

## Other supported publishing routes

Pebble officially supports three routes to the same appstore listing:

- **Developer Dashboard:** manual PBW/images upload and the only place to edit an
  existing listing's text, images, URLs and visibility. Recommended for this beta.
- **`pebble publish`:** build/capture/upload from the CLI, including non-interactive
  CI uploads. Best considered later for deliberate tagged releases, not every push.
- **CloudPebble Publish:** uses the latest successful CloudPebble build and that
  signed-in account. Avoid it for the initial local release if it risks submitting
  a different build from the exact PBW tested here.

Do not assume a test upload is a draft or Unlisted. Current publishing docs describe
CLI/CloudPebble uploads as immediate and new apps as Listed. The installed
Pebble Tool 5.0.39 help exposes `--is-published` with a false default, which differs
from those docs. Treat defaults as version-dependent and inspect actual listing
visibility and release state; the dashboard's explicit controls are safer initially.
Do not put sign-in tokens in commands, source, logs or screenshots.

## Official references

- [Publishing an app](https://developer.repebble.com/guides/appstore-publishing/publishing-an-app/)
- [Submission fields, images and visibility](https://developer.repebble.com/guides/appstore-publishing/preparing-a-submission/)
- [Developer Distribution Agreement, including privacy §5.3](https://developer.repebble.com/legal/distribution/)
- [Developer Program Policies](https://developer.repebble.com/legal/program-policies/)
- [Watch launcher icon rules](https://developer.repebble.com/guides/app-resources/images/#menu-icon-in-the-launcher)
- [Developer Dashboard](https://developer.repebble.com/dashboard)
- [Public appstore](https://apps.repebble.com/)
