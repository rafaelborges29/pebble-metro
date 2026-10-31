# Publishing Metro Lisboa

## Recommended first release

Use the [Pebble Developer Dashboard](https://developer.repebble.com/dashboard)
for the first release, with visibility explicitly set to **Unlisted**. It lets you
review the exact PBW, artwork, URLs and visibility before submitting. After testing
installation from the resulting store link, change the listing to **Listed**.

The source repository and the appstore are separate: a public GitHub repository
or Release does not create a Pebble listing. Users normally discover/install the
watch app through the Pebble mobile app's store.

1. Commit/review the native source and assets, run hosted CI, and publish the
   source repository with its 0BSD licence, notices and privacy documentation.
2. Build the chosen source revision with SDK 4.33.1. Record its version, UUID and
   PBW SHA-256; preserve the UUID on all updates. Use an unused numeric version
   such as `0.2.0`, not a `-beta` suffix.
3. Prepare the [release checklist](publishing-todo.md), including physical-watch
   checks, applicable SDK/toolchain terms and complete binary licence delivery.
   Attach the PBW, a licence/notices download bundle, matching source archive and
   checksums to a GitHub Release for the source tag. Include
   [DATA_METHODS.md](../DATA_METHODS.md) and the complete ODbL text. Before even an
   Unlisted upload, verify the source/licence/methods links without signing in;
   recipients must be able to obtain the matching alteration methods for free.
   Keep public support/privacy links working.
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
- **Website/support:** public repository README and GitHub Issues.
- **Source:** `https://github.com/rafaelborges29/pebble-metro` once the native changes
  are committed/pushed and the repository is public.
- **Privacy:** public `PRIVACY.md` linked from the README/listing.
- **Android companion app:** leave the custom-companion field empty. The bundled
  PebbleKit JavaScript uses the normal Pebble mobile app, not a separate Android app.

Plain-text description draft:

```text
Lisbon Metro arrival estimates on your Pebble Time 2 or Pebble Round 2.

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
Data adaptations remain ODbL. Data transformation methods and notices:
https://github.com/rafaelborges29/pebble-metro
Screenshots are emulator captures using artificial example arrival data.
```

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
- [Watch launcher icon rules](https://developer.repebble.com/guides/app-resources/images/#menu-icon-in-the-launcher)
- [Developer Dashboard](https://developer.repebble.com/dashboard)
- [Public appstore](https://apps.repebble.com/)
