# Real-emulator functional tests

The first slice is one black-box flow, not a restoration of the deleted unit
suite. The runner, fixtures and configuration use **TypeScript**. **Effect** owns
the emulator process scope and typed RPC operations, with startup/operation
timeouts and guaranteed release. It is a development dependency, not watch code.

## What actually runs

- The real release `.pbw` on the SDK 4.33.1 **Emery QEMU** firmware.
- That same PBW's compiled phone JavaScript, extracted from the archive and run
  in Chromium. This includes the production parser, Paho client and chunk queue.
- Native button events, real AppMessage dictionaries, physical ACK/NACK and the
  application's chunk receipts, real watch rendering and persistent storage.
- A small browser-side Pebble host adapter, plus a Python bridge using the
  Pebble tool's existing `libpebble2`. No app models or renderers are replaced.
- Three-station REST and MQTT-over-WebSocket fixtures. MQTT framing is encoded
  and decoded by `mqtt-packet`; the real Paho client connects and subscribes.
  Unexpected HTTP and WebSocket destinations fail the test instead of reaching
  live services. No UnderLX availability, Pebble account, credentials or physical
  watch is needed.

The test saves **Saldanha / Vermelha / Aeroporto**, verifies the watch command
and corresponding MQTT subscription, checks arrivals, exits with real buttons,
and relaunches the app to verify the favourite survives. A fresh Chromium page
ends/restarts the phone-JavaScript lifecycle while retaining its metadata cache.

Each test receives fresh temporary flash images and a private loopback QEMU port.
Nothing uses or wipes the developer's managed emulator state. Python/QEMU are
released on success and failure; the scope only kills its own process group.
The Python bridge remains necessary to reuse the SDK protocol implementation;
there is no competing `pypkjs` process running the companion.

## Run locally

Currently supported: **Linux x86-64**, Node **24.21.0**, Pebble Tool **5.0.39**,
`libpebble2` **0.0.31**, and SDK **4.33.1**. Install the usual
[Pebble tools](https://developer.repebble.com/sdk/) first. The GitHub workflow
contains the pinned tool installation and Ubuntu runtime packages.

```sh
pebble sdk activate 4.33.1
npm ci
npx playwright install chromium
npm run e2e
```

Keep 4.33.1 active: the Alloy prebuild uses the active SDK even with `--sdk`.
`e2e` runs strict TypeScript checking, the existing syntax/build checks, and then
Playwright. It rebuilds the PBW first, so it cannot silently check stale code.
Restore your previous SDK afterward if necessary.

The bridge discovers the Python interpreter from the `pebble` executable's
shebang. For a wrapper/shim or unusual installation, set `PEBBLE_PYTHON` to the
Python **inside the pebble-tool environment**, not the SDK's separate build venv
or a resolved system-Python symlink.

Useful commands:

```sh
npm run typecheck
npm run e2e -- --repeat-each=3
npx playwright show-report
```

Do not add `"type": "module"` to the root package: that breaks the SDK's generated
CommonJS webpack configuration. Playwright handles the `.ts` files itself;
`e2e/tsconfig.json` typechecks only this harness/configuration.

## Screenshots and synchronization

Six reviewed native-framebuffer baselines live in `e2e/screenshots/`. They cover
initial/relaunch connection screens, first-use state, station/direction selection
and arrivals. Comparison is pixel-exact, with two explicit exceptions:

- The header clock rectangle is masked in every comparison.
- Only on connecting screens, the animated loader-dot rectangle is masked.

Destination text, status and rendered arrivals remain asserted. Legitimate
minute-unit fixture estimates display `~3`, `~4` and `~5` without a second-by-second
snapshot race; they are synthetic observations, not captured live measurements.
Readiness uses the pinned SDK's native inbox-ready message (`15025`), subsequent
real frames and application-level receipts—not fixed startup sleeps. Assertions
poll for bounded periods instead of assuming every frame is immediately ready.

To intentionally update baselines after a UI change:

```sh
npm run e2e -- --update-snapshots
```

Review every changed PNG before committing it, especially the connecting screens:
an intermediate loading frame must not replace an intended app screen. CI never
updates baselines automatically. New scenarios should use distinct snapshot names.

## CI and failure evidence

`.github/workflows/e2e.yml` runs on pull requests, pushes to `main`, and manual
workflow dispatch. It uses Ubuntu 24.04, installs the pinned tool/SDK, activates
4.33.1, installs Chromium and runs one worker. It has read-only repository
permissions and no publishing/deployment step or personal credentials.

The uploaded `emulator-e2e` artifact contains the HTML/JUnit report and outputs:

- Actual/expected/diff PNGs on mismatches, plus an unmasked final watch screenshot.
- A Playwright trace on failure.
- `emulator.log`, `phone.log`, and observed commands/subscriptions in `messages.json`.

These generated reports are ignored by Git. Native console output can contain
binary diagnostic fragments; the readable application log lines precede them.

Local verification includes strict typechecking, repeated fresh-emulator runs,
and a deliberate 25-pixel baseline corruption: the test failed and produced
image diffs, trace and logs. The original baseline was restored afterward.
Check the PR's GitHub Checks tab for the hosted result for its exact revision;
a local pass does not replace that verification. The workflow is checked with
`actionlint`.

## Limits and next slices

This checks the application/phone-bundle software path, not an actual Android
WebView, Bluetooth radio, background restrictions, vibration, Quiet Time or
physical battery use. Hardware acceptance remains separate.

Future focused flows: loading timeout/retry, metadata failure/recovery, stale
prediction expiry, disconnection/reconnection, phone-only clock changes, service
pagination/deduplication, and exact two-minute alerts with coalesced uncertainty.
Do not claim those are covered by this initial happy-path/persistence flow.
