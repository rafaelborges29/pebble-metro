# Metro Lisboa for Pebble

Lisbon Metro arrival estimates on your wrist. A small native C watch app with a
PebbleKit JavaScript phone companion, connecting directly to [UnderLX](https://underlx.com/).

**Get the app:** [Pebble Appstore](https://apps.repebble.com/dce54d3eb02943f1935e1529)
· [Rebble Appstore](https://apps.rebble.io/en_US/application/6af0e5dfb99ed90009374190).

**Targets:** Pebble Time 2 (`emery`, 200×228) and Pebble Round 2 (`gabbro`,
260×260), firmware 4.33+, and Android. The original Pebble Time Round (`chalk`),
other watches and iOS are not supported. Version 0.2 is under hardware validation;
Round 2 has emulator coverage, not physical-watch acceptance yet.

![Time 2 arrival estimates in the emulator](assets/appstore/emery_seconds.png)
![Round 2 arrival estimates in the emulator](assets/appstore/gabbro_seconds.png)

Screenshots use deterministic emulator fixtures, not live train observations.
Contains information from [UnderLX](https://underlx.com/), made available under
[ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/).
See the [data attribution and transformation methods](DATA_METHODS.md).

## Features

- Up to 16 station / line / direction favourites, including interchange selection.
- Next three estimates with local countdowns and strict source expiry.
- Seconds when supplied; minute-only estimates remain approximate (`~3 min`).
- A tiny animated train while connecting, without blocking navigation.
- Two recent routes saved for quick reopen, explicitly labelled **SAVED**.
- Retry, confirmed removal, and UnderLX attribution.

No alerts, vibration, line-status pages, GPS, watch-side JavaScript runtime,
background worker, custom Android app or custom backend. The paired phone needs
the Pebble mobile app and internet access. See [privacy](PRIVACY.md).

**Phone favourites editor:** enable **Settings → Plugins → Plugins / permissions
preview** in a Pebble Android app with live settings support, then open Metro
Lisboa's **Settings**. Choose line → station → direction and tap **Add favourite**;
Add and confirmed Remove save immediately while the page stays open. Save/error
feedback stays on the phone, with no watch popup. Keep Metro running on the
connected watch. The editor is bundled: no website, separate plugin or Android
app is needed. The page automatically follows the WebView's light/dark preference
from the Pebble app, including native controls, with no separate theme toggle.
The on-watch picker remains available without the preview feature.
Metro declares only two required Internet domains: `api.underlx.com` for the
catalogue and `perturbacoes.pt` for arrivals. Approve them in Pebble's native
permissions UI; compatible 1.18+ builds expose a shield in the Settings title bar.
No location, files, contacts or notification access is requested.
See [permissions, sync, recovery and upgrade details](docs/phone-configuration.md).

## Language

The watch's system locale selects the UI: **Portuguese (Portugal)** for `pt_PT`,
English for every other locale (including unsupported languages). This follows
[`i18n_get_system_locale()`](https://developer.repebble.com/docs/c/Foundation/Internationalization/),
not the phone/browser language. Choose Portuguese in the watch's system language
settings; availability depends on firmware/mobile-app language support. There is
no Metro language preference. The phone favourites editor also uses the watch's
language. Watch changes appear on the next redraw (a button press, arrival tick or
minute tick); reopen Settings to change an already-open editor's language.

Portuguese uses **ATUAL / GUARDADO** for **LIVE / SAVED**, and **Agora / Hora
estimada** for **Due / Estimated now**: these remain estimates, never an assertion
that a train is present. `~`, ranges/bounds, minutes and source seconds (`seg`)
retain their meanings. Official place/line names and complete legal texts are
unchanged. Changing language does not alter favourites or cached data.

## Controls

| Screen | Buttons |
| --- | --- |
| Arrivals | Up/Down: switch favourites · Select: actions · Back: favourites |
| First use / Add favourite | Select: line → station on that line → direction → save |
| Lists | Up/Down: choose (hold to repeat) · Select: open · Back: return |
| Actions | Retry live data or remove the favourite with confirmation |
| Favourites | Open a route, add another, or retry |

Back at the favourites root or empty screen exits the app.

**Touch prototype (firmware 4.33.2+):** tap the actual visible menu row to open it.
On arrivals, tap the main content to open Actions; on notice screens, tap
content to go back; on first use, tap content to add/retry. Swipe up for the next
item/favourite, down for the previous, or right for Back. Removal still requires a
separate tap on **Remove it**. Headers, footers, missing rows and round-screen
corners are not tap targets. The existing four-row layout is unchanged.

Touch must be enabled in the watch's system settings and the interaction session
must be awake (button/wake gesture); unarmed touches are ignored. All buttons,
including hold-to-repeat, remain available when touch is disabled or unavailable.
Firmware 4.33/4.33.1 keeps button navigation without enabling the affected
recognizer API. Touch behaviour/usability is unverified; no touch tests or injection
infrastructure have been added.

## Saved arrivals

All favourites persist. Arrival snapshots and short labels persist for **two
recently viewed routes**; other snapshots are RAM-only while the app runs.
Reopening shows SAVED estimates only while their original validity remains.
Time spent closed is subtracted; saving never renews expiry.

Fresh source data becomes LIVE. Empty updates, connection loss, manual Retry and
clock jumps invalidate estimates. Expired numbers disappear; route labels can
remain. **Due / Estimated now** is an estimate, not proof a train is at the platform.

Writes are batched about every 15 seconds and flushed on normal exit, focus loss
or route changes. The countdown does not write storage every second. The loading
train stops after at most 15 seconds per attempt or on explicit failure.

**Upgrading from 0.1 / Alloy:** favourites do not migrate automatically to native
storage. Re-add them after upgrading. The old store is left untouched; uninstalling
or erasing app data is not a migration step.

## Build

Install the [Pebble tools](https://developer.repebble.com/sdk/), SDK **4.33.1**,
and Node **24.21.0**. The pinned tool versions and Linux CI setup are in
[the shared CI setup](.github/actions/setup-pebble/action.yml).

```sh
pebble sdk install 4.33.1
npm ci
npm run check
```

The default build uses the **production identity** and names the package after
its checkout directory: `build/<checkout-directory-name>.pbw`. For a clone named
`pebble-metro`, this is `build/pebble-metro.pbw`. Installing it replaces live.

- `npm run build` — type-check/compile phone TypeScript, build C and bundle JavaScript.
- `npm run build:dev` — build `Metro Lisboa Dev` as `build/metro-lisboa-dev.pbw`.
- `npm run check` — SDK bootstrap syntax and production build.
- `npm run typecheck` — strict phone/shared TypeScript and emulator harness checks.
- `npm run e2e` — typecheck, build and real-emulator tests.
- `npm run assets:screenshots` — explicitly recapture unmasked store screenshots.

Do not add `"type": "module"` to the root package: the SDK generates a CommonJS
webpack configuration. The root `tsconfig.json` compiles strict phone/shared TypeScript
to ES2015/CommonJS under `build/phone/` before SDK webpack runs. A tiny
`src/pkjs/bootstrap.cjs` loads the compiled entry and bundled notices; the custom
ESM adapter is no longer needed. Direct `pebble build --sdk 4.33.1` also performs
this compile/type check. Generated JavaScript is ignored, not edited or committed.
Clean with `pebble clean --sdk 4.33.1` after changing SDK or project type.

UI copy lives in `locales/en.json` and `locales/pt_PT.json`, keyed by meaning
(for example, `menu.favourites`). The Pebble build validates both files and
generates keys and constant C tables under `build/generated/` using the build's
existing Python interpreter and standard library. `locales/index.json` maps Pebble
locale strings to translation files and selects the English fallback. The native
`localization` module owns selection, lookup and diagnostic translation; screens
request text by key without language-specific branches. Clean and incremental
builds track the registry and translations; no locale JSON is parsed on the watch.
See [translation instructions](CONTRIBUTING.md#translations).

## Test and install

```sh
npx playwright install chromium
npm run e2e
```

The tests run the actual package and phone bundle with real buttons, AppMessage
receipts and disposable Emery/Gabbro QEMU storage. Both platforms run the same
flows with separate native screenshot baselines. REST/MQTT fixtures replace only
the external data sources. Tests never connect to a physical watch. They cover
reopen, expiry, phone restart, source replacement, removal navigation and
16-favourite/160-switch memory stress.
See [E2E documentation](docs/e2e.md) and [contributing](CONTRIBUTING.md).

### Send a development build to your watch

Enable Developer Connection in Pebble Android, then use one explicit connection:

```sh
# Phone's reachable LAN address (enable LAN developer connection on trusted Wi-Fi):
npm run install:dev -- --phone 192.168.1.42
# Or your signed-in CloudPebble developer connection:
npm run install:dev -- --cloudpebble
```

`tools/install-dev.sh` builds with SDK 4.33.1, makes a private PBW copy, verifies
its dev UUID/name in package metadata and both native binaries, then sends that
exact copy. It stops on failure, rejects extra arguments and clears conflicting
Pebble connection environment variables. No production package or implicit
`pebble install` selection is used. No new dependencies are required.

Dev uses the permanent UUID `af9f9c16-6542-4568-bdd8-01e57443e3d0` and the name
**Metro Lisboa Dev**. It can coexist with store-installed **Metro Lisboa**
(`5576168a-8b38-4be1-90e7-343af607c167`); a name change alone would not suffice.
Watch favourites/caches, phone companion storage and native permission grants
are UUID-scoped. Dev starts with its own empty favourites and needs its own
Internet grants. Open dev on the watch and choose its matching Settings entry
on the phone; close old Settings pages when switching apps. The shared HTML page
title still reads Metro Lisboa. Android's preview toggle/connectivity remain shared.

Rerun the same command to update dev **without uninstalling**. To switch, use the
watch's named app entries; for logs, launch dev then use `pebble logs --phone
PHONE_ADDRESS` (or `--cloudpebble`). Logs are not UUID-filtered. To remove dev,
remove only **Metro Lisboa Dev** through Pebble Android. Never wipe the watch or
uninstall live. Production UUID/store IDs and release checks stay unchanged;
store updates continue to target live, and production validation rejects dev PBWs.

Build variants sequentially in one checkout; they share generated intermediates.
Normal build/E2E commands remain production-only. The direct dev build command is
`pebble build --sdk 4.33.1 -- --app-variant=dev`; unknown variants are rejected.
Platform references: [app identity](https://developer.repebble.com/guides/tools-and-resources/app-metadata/),
[storage](https://developer.repebble.com/guides/events-and-services/persistent-storage/),
[developer connection](https://developer.repebble.com/guides/tools-and-resources/developer-connection/)
and the [UUID-scoped Android settings session](https://github.com/coredevices/mobileapp/blob/89f31dca3fd344ae9923fe9ca2f27b0f1f8a0230/pebble/src/commonMain/kotlin/coredevices/pebble/config/ConfigPageSession.kt).

Hardware acceptance still needs an owner-requested install: keep live favourite A,
install dev and save different B, update dev, then remove only dev; live A and its
Settings must survive. Check each app's companion and independent permission
approval/revocation on the actual Android/watch versions. Emulator and package
checks alone do not verify those platform interactions.

## Documentation and licensing

- [Architecture and protocol](docs/architecture.md)
- [UI and cache flow](docs/design.md)
- [Appstore publishing and listing draft](docs/appstore.md)
- [Rebble Appstore submission and update checklist](docs/rebble.md)
- [Artwork and screenshots](assets/README.md)
- [GitHub Actions releases, versioning and recovery](docs/releases.md)
- [Privacy](PRIVACY.md)
- [UnderLX data attribution and transformation methods](DATA_METHODS.md)
- [Third-party notices](THIRD_PARTY_NOTICES.md) and [licence texts](LICENSES/)

Original project code is licensed under [0BSD](LICENSE): use, modify, redistribute
or sell it without an attribution requirement. It is provided without warranty.
Third-party components and UnderLX data retain their own terms; see the notices.
The repository/history and application source remain private; 0BSD does not
require publishing them. A distributed PBW still contains extractable phone
JavaScript; private Git hosting does not make that bundled code confidential.

Independent application, not affiliated with or endorsed by UnderLX or Metro de
Lisboa. Contains information from [UnderLX](https://underlx.com/), made available
under [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/) unless otherwise
indicated by the provider. Data adaptations remain ODbL; see
[data transformations and access requirements](DATA_METHODS.md) and the
[complete licence](LICENSES/ODbL-1.0.txt).
