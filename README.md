# Pebble Metro

An independent **Metro Lisboa app for Pebble Time 2 (`emery`)**, written in
**Alloy JavaScript**, with a small Poco-rendered UI and bundled Android-side
PebbleKit JS. It connects **directly to UnderLX**, not the homeserver Metro app.

## Features

- Save up to 16 station + line + direction favourites on the watch.
- Launch into the last favourite; Up/Down switches favourites.
- Next three arrival estimates, with watch-local countdowns and expiry.
- Valid outbound directions only, including interchange and terminus selection.
- Current line disruptions and font-measured, paginated Portuguese service text.
  Long notices are visibly shortened to fit a 1,200-byte per-notice / 4,800-byte
  snapshot budget; multiple incidents are read one at a time.
- Explicit connecting, unavailable, stale and phone-disconnected states.
- Lightweight three-dot loading indicator, with real phone/station/arrival stages.
- Opt-in one-shot arrival alert at a fresh two-minute threshold crossing.
- Optional arrival/service vibration; **off by default**, with a native Quiet
  Time check. No sound or forced backlight.
- Source attribution and licence information under **About / data**.

**Alerts require Metro to remain running.** Closing the watch app cancels an
arrival alert. Expired, uncertain or interrupted predictions never trigger a
catch-up alert. These are estimates, not promises about a particular train.

No custom Android app, server, Docker stack, account, GPS permission or
Tailscale connection is needed. The paired Android phone needs the Pebble app
and internet access. Preferences belong to the watch, not the web app.

## Build

Use **SDK 4.33.1** and watch firmware **4.33 or newer** (the tested emulator runs
4.33.2). SDK 4.17 is not a supported runtime for this app. The implementation
was checked with Pebble Tool 5.0.39 and Node 24.21.0.

Install the [official Pebble tools](https://developer.repebble.com/sdk.md), then:

```sh
pebble sdk install 4.33.1
pebble sdk activate 4.33.1
npm ci
npm run check
```

`check` runs syntax checks, Node tests and the pinned-SDK production build.
`npm run build` builds without rerunning the tests. The package is:

```text
build/pebble-metro.pbw
```

When changing SDK versions, clean first to avoid mixing incompatible XS
bytecode in the build cache:

```sh
pebble sdk activate 4.33.1
pebble clean --sdk 4.33.1
npm run check
```

Keep 4.33.1 active while building: Pebble Tool 5.0.39 runs the Alloy prebuild
with the active SDK even when `--sdk` selects a different SDK for the C build.
Restore a previous SDK with `pebble sdk activate VERSION` if needed. Do not add `"type": "module"`
to the root package: the SDK generates a CommonJS webpack configuration there.
Node's module-detection warning during tests is harmless. The small build-time
ESM adapter exists because the SDK's webpack 1 cannot lower these modules itself.

## Controls

- **Arrivals:** Up/Down changes favourite; Select opens actions; Back opens the
  favourites list.
- **Lists:** Up/Down moves the highlight; hold to repeat; Select chooses.
- **First use:** Select → station → line (if needed) → destination → save.
- **Actions:** arm/cancel the two-minute alert, read line status, retry data, or
  remove the favourite with confirmation.
- **Favourites list:** add a station, inspect network status, open settings or
  read the attribution. Stations are an alphabetical paged list.
- **Text:** Up/Down changes pages; Select or Back returns.
- **Back at the root:** exits. System hold-Back remains available.

An already-under-two-minute or unsupported estimate cannot be armed. One alert
is active at a time. Browsing other favourites keeps the armed target subscribed.
Service buzz only signals a materially changed incident affecting a saved line;
opening an existing notice, polling identical text and reconnecting are silent.

### Loading feedback

While opening the app or switching to a favourite without data, three small dots
replace the empty countdown. The label follows the actual stage: **Connecting to
phone**, **Loading stations**, or **Waiting for arrivals**. First use gets the same
feedback before station selection becomes available.

Animation uses the existing one-second timer, pauses while unfocused, and stops
immediately for live data, explicit failure, disconnection, stale data or an
unavailable estimate. Each pending stage stops animating after 15 seconds and
shows an explicit message instead; a manual retry starts a new loading window.
No fabricated percentages or faster animation timer are used. Back/navigation
remain available throughout. This loader update has been checked in the emulator,
installed through CloudPebble and confirmed by the user on the physical watch.

## Emulator

```sh
pebble install --emulator emery --sdk 4.33.1 --vnc
pebble screenshot --emulator emery --sdk 4.33.1 --vnc --no-open /tmp/metro.png
pebble logs --emulator emery --sdk 4.33.1 --vnc
```

Installation launches the app. Keep **the same `--vnc` choice on every command**;
toggling it makes Pebble Tool replace the running emulator. For XS heap metrics,
build with `pebble build --sdk 4.33.1 --debug` and attach logs.

The UI uses Poco rather than a Piu object tree to fit the watch's RAM budget.
The C entry point reserves a measured XS pool: 4 KiB stack, 40 KiB slots and
28 KiB chunks. The SDK's build-time C memory report does **not** include this
runtime heap or the loaded JavaScript archive.

## What has been verified

- Combined checks and production build, plus independent code review.
- Actual built phone bundle in Chromium: live UnderLX REST catalogue (50 stations,
  four lines), current service response, WSS connection and changing Aeroporto
  predictions. No credentials or TLS bypass were used.
- Actual Time 2 emulator: catalogue delivery, station/direction selection,
  favourite creation and persistence, and arrival rendering with a freshly
  captured live UnderLX snapshot injected through the SDK.
- Native emulator alert crossing and invalidation with explicitly synthetic
  predictions; model/UI tests cover expiry, gaps, focus, reconnect, removal,
  service freshness, clock changes and transport retries. A native stress check
  delivered eight synthetic notices (4,712 UTF-8 bytes) and paged through all of
  them without exhausting watch memory.

- Physical Time 2 on firmware **4.41.2**: CloudPebble ping and installation
  succeeded on 2026-10-19. Android PKJS started, and a watch screenshot confirmed
  the first-use screen with downloaded station metadata. The user then confirmed
  that arrivals appeared and updated correctly on the watch. The subsequent
  loader update was also installed and confirmed by the user.

**Remaining hardware checks:** Android app backgrounding, reconnection and
vibration/Quiet Time.
The Python phone simulator completes REST, but its MQTT client stays connecting
in this environment. Consequently, continuous MQTT-to-watch delivery was **not**
verified through that simulator; the browser and native-watch checks above are
separate, not a claim that the simulator works end-to-end.

The SDK linker emits an RWX LOAD-segment warning. The phone simulator may emit
packet-footer decode warnings. Neither is suppressed or treated as a clean
hardware validation.

## Install on the real watch — only when ready

1. Check watch firmware is 4.33+ and update through the Pebble app if necessary.
2. Enable **Developer Connection** in the Android Pebble app. For CloudPebble,
   connect it to the same account used by the Pebble CLI; no LAN IP is needed.
3. From this repository, after explicitly choosing to install:

   ```sh
   pebble install --cloudpebble build/pebble-metro.pbw
   ```

   Alternatively, for a reachable LAN connection:

   ```sh
   pebble install --phone PHONE_ADDRESS build/pebble-metro.pbw
   ```

4. Add an interchange and a terminus favourite. Check the live countdown changes,
   switch favourites, read service status, disconnect/reconnect, and verify stale
   estimates disappear. Test the optional alert both with and without Quiet Time.

The first physical-watch installation was explicitly authorized and completed
through CloudPebble. Live arrivals were confirmed by the user; real-world alert
and reconnection checks remain pending.

## Files and data

- `src/embeddedjs/main.js` — Alloy/Poco UI and watch integration.
- `src/common/watch-model.js` — expiry, alert state and chunk reassembly.
- `src/common/display.js` — small shared countdown/direction helpers.
- `src/common/metro.js` — phone-side validation of UnderLX source payloads.
- `src/pkjs/` — direct HTTPS/MQTT connection and bounded, acknowledged transport.
- `src/c/` — Alloy entry and tiny native Quiet Time/exit hooks, not a C UI.
- `docs/design.html` — original interactive design mockup, with fictional data.
- [Architecture](docs/architecture.md) · [Flow and alert design](docs/design.md).

Data: [UnderLX](https://underlx.com/) under
[ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/).
See [third-party notices](THIRD_PARTY_NOTICES.md). No appstore release or server
deployment has been created.
