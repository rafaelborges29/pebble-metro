# Metro Lisboa for Pebble

Lisbon Metro arrival estimates on your wrist. A small native C watch app with a
PebbleKit JavaScript phone companion, connecting directly to [UnderLX](https://underlx.com/).

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

## Language

The watch's system locale selects the UI: **Portuguese (Portugal)** for `pt_PT`,
English for every other locale (including unsupported languages). This follows
[`i18n_get_system_locale()`](https://developer.repebble.com/docs/c/Foundation/Internationalization/),
not the phone/browser language. Choose Portuguese in the watch's system language
settings; availability depends on firmware/mobile-app language support. There is
no Metro language setting or phone configuration page. Changes appear on the next
redraw (a button press, arrival tick or minute tick).

Portuguese uses **ATUAL / GUARDADO** for **LIVE / SAVED**, and **Agora / Hora
estimada** for **Due / Estimated now**: these remain estimates, never an assertion
that a train is present. `~`, ranges/bounds, minutes and source seconds (`seg`)
retain their meanings. Official place/line names and complete legal texts are
unchanged. Existing favourites and cached data need no migration.

## Controls

| Screen | Buttons |
| --- | --- |
| Arrivals | Up/Down: switch favourites · Select: actions · Back: favourites |
| First use | Select: station → line if needed → direction → save |
| Lists | Up/Down: choose (hold to repeat) · Select: open · Back: return |
| Actions | Retry live data or remove the favourite with confirmation |
| Favourites | Open a route, add another, retry, or view About / data |

Back at the favourites root or empty screen exits the app.

**Touch prototype (firmware 4.33.2+):** tap the actual visible menu row to open it.
On arrivals, tap the main content to open Actions; on About/notice screens, tap
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
[the workflow](.github/workflows/e2e.yml).

```sh
pebble sdk install 4.33.1
npm ci
npm run check
```

The SDK names the package after the checkout directory:
`build/<checkout-directory-name>.pbw`. For a clone named `pebble-metro`, this is
`build/pebble-metro.pbw`.

- `npm run build` — native watch app and bundled phone JavaScript.
- `npm run check` — phone entry syntax and production build.
- `npm run typecheck` — TypeScript emulator harness checks.
- `npm run e2e` — typecheck, build and real-emulator tests.
- `npm run assets:screenshots` — explicitly recapture unmasked store screenshots.

Do not add `"type": "module"` to the root package: the SDK generates a CommonJS
webpack configuration. A small build-time adapter handles the phone's ESM sources.
Clean with `pebble clean --sdk 4.33.1` after changing SDK or project type.

UI copy lives in `locales/en.json` and `locales/pt-PT.json`, keyed by meaning
(for example, `menu.favourites`). The Pebble build validates both files and
generates constant C tables in `build/generated/ui_strings.h` using the build's
existing Python interpreter and standard library. Clean and incremental builds
track both locales and the generator; no locale JSON is parsed on the watch.
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
reopen, expiry, phone restart, source replacement, About/removal navigation and
16-favourite/160-switch memory stress.
See [E2E documentation](docs/e2e.md) and [contributing](CONTRIBUTING.md).

To install on your own watch, enable Developer Connection in the Android Pebble app:

```sh
pebble ping --cloudpebble
pebble install --cloudpebble "build/$(basename "$PWD").pbw"
```

Use `--phone PHONE_ADDRESS` instead for a reachable LAN phone. Installation replaces
the app with the same UUID; read the migration note above before upgrading.

## Documentation and licensing

- [Architecture and protocol](docs/architecture.md)
- [UI and cache flow](docs/design.md)
- [Appstore publishing and listing draft](docs/appstore.md)
- [Artwork and screenshots](assets/README.md)
- [Release checklist](docs/publishing-todo.md)
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
