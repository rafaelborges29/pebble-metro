# Native real-emulator verification

The harness uses TypeScript, Playwright and Effect; the watch application is
native C. Effect owns emulator scope, typed RPC, timeouts and guaranteed cleanup.
No application model or watch renderer is replaced by a mock.

## What actually runs

- The current checkout's real release PBW on SDK 4.33.1 Emery QEMU.
- That same PBW's extracted phone JavaScript in Chromium, including the source
  parser, real Paho client, metadata cache and chunk/receipt transport.
- Native buttons, AppMessage dictionaries/ACKs, native drawing and persistence.
- Deterministic station/line REST and MQTT-over-WebSocket fixtures, encoded by
  `mqtt-packet`. Unexpected destinations/methods fail instead of reaching the
  internet. Service/disruption requests are not allowed in this slim version.

Each test uses new private flash images and a private loopback port. The harness
never connects to a physical watch or wipes managed emulator storage. Python
reuses the Pebble tool's `libpebble2`; no competing `pypkjs` process runs.

## Flows

1. **Create and reopen:** save Saldanha / Vermelha / Aeroporto through real menus,
   receive arrivals, close/relaunch and show SAVED data before any phone runtime
   starts. A cropped native-frame assertion verifies the train advances. Start a
   fresh phone runtime and recover LIVE data. Inspect the two-item actions menu.
2. **RAM-only revisit:** visit three routes to evict A from the two-slot durable
   cache, pause automatic source publishing, revisit A from RAM, close/relaunch and
   recover the same SAVED data without another source update.
3. **Phone-only restart:** recreate only PKJS while the native process and physical
   app connection stay alive. The startup wake must trigger a new hello and recover
   LIVE arrivals without requiring manual Retry.
4. **Expiry while closed:** advance the native watch clock 130 seconds while the
   app is stopped. Saved numbers stay hidden; fresh data returns after the new
   phone-clock handshake. This uses the SDK time packet, not a fake app clock.
5. **Ranges, bounds, zero and empty data:** render ranges and both bounds through
   real MQTT, keeping the range dash visible (the large number-only font lacks it).
   Render `Due` / `Estimated now`, then an empty update. Relaunch must not resurrect
   its invalidated ETA. Route names remain without implying an available estimate.
6. **Metadata replacement:** highlight the second line in an interchange picker,
   remove that line in the REST fixture and refresh through the real companion.
   The native picker/history resets safely instead of indexing a removed line.
7. **Reported-crash regression:** use 50 stations and four lines (4,204 bytes in
   the validated original metadata shape), create all 16 favourites with actual
   buttons, and perform 160 UP/DOWN switches in both directions with new source
   updates, including seconds. Then inspect the two durable recent-route caches,
   relaunch, verify every persisted favourite ID, exercise wraparound and the
   16-favourite limit. This test has a 180-second bound.

Only two recent routes are durable; other still-valid snapshots are RAM-only.
The stress deliberately asserts the uncached third route rather than pretending
all 16 arrival histories persist.

## Memory assertions

The native app logs `Metro memory <reason>: used=<bytes> free=<bytes>` at startup,
catalogue replacement and every 16 selections (also the first). Samples are
captured in `messages.json`. The stress requires:

- At least **50 KiB free native heap** throughout sampled operation.
- No more than **4 KiB variation** after font/SDK warmup.
- Exactly the expected app starts; no hidden crash/restart is accepted.

The 0.2.0 reference run passed all **seven flows twice** without snapshot updates
(`npm run e2e -- --repeat-each=2`, 14/14, 5.7 minutes). Across 112 recorded samples,
free heap was **64,344–64,424 bytes** and used heap **5,448–5,528 bytes**. Both
16-favourite/160-switch runs had identical switch samples: **5,448 used / 64,424
free**. No unexpected app startup occurred. Recheck after every production change;
these are emulator samples, not continuous allocation traces or a physical-watch
guarantee.

## Run

Supported locally: Linux x86-64, Node 24.21.0, Pebble Tool 5.0.39,
`libpebble2` 0.0.31 and SDK 4.33.1.

```sh
npm ci
npx playwright install chromium
npm run e2e
```

`e2e` typechecks the harness, builds native C and phone JS, then runs Playwright.
The SDK names the PBW after the checkout directory; the harness installs exactly
`build/<checkout-name>.pbw`, never an old differently named package.

The bridge discovers Python from the `pebble` executable's shebang. For a wrapper
installation, set `PEBBLE_PYTHON` to the interpreter inside the Pebble tool's venv.

```sh
npm run typecheck
npm run e2e -- --repeat-each=2
npx playwright show-report
```

Do not add `"type": "module"` to the root package: the SDK webpack configuration
is CommonJS. One-off host C probes can check production helpers and persistence
failures, but do not replace the actual native PBW flows.

## Screenshots and synchronization

Native baselines live in `e2e/screenshots/`. Pixel comparison masks only:

- The header clock.
- The 30 × 18 train area on loading/saved screens. An unmasked cropped assertion
  separately checks that its frames change.

The source's legitimate minute units keep ordinary ETA screenshots stable. Numeric
seconds are exercised during churn and zero rendering; tests do not manufacture
seconds for minute-only observations. Fixture data is not a live measurement.

Readiness waits for `Metro native UI ready`, emitted after the first real draw,
then real frames and application receipts. System launch-animation frames are
rejected. Normal assertions poll boundedly.

```sh
npm run e2e -- --update-snapshots
```

Review every changed image before accepting it, especially during startup/source
transitions. CI never updates baselines. A useful source state must not be
replaced by a prior menu/connecting frame just because an update run accepted it.

## CI, probes and limits

The existing least-privilege Ubuntu workflow builds/tests and saves reports,
traces, native screenshots, `phone.log`, `emulator.log`, commands/subscriptions
and heap samples. It never installs on hardware or publishes. A local pass does
not prove hosted checks passed for an exact revision.

During development, the allocation-free C JSON decoder was separately checked
using one-off host probes with C99 warnings,
ASan/UBSan, malformed UTF-8/escapes/numbers/nesting/token bounds and differential
probes. Temporary host probes include catalogue replacement while editing,
invalid draft indices, cache deletion/commit failures, invalidation, retained
labels, original expiry, clock rollback and revisiting an evicted RAM snapshot.
A temporary real companion/feed/transport probe holds a batch active across a
source disconnect/reconnect: even when coalescing removes the disconnect message,
empty arrivals and the final connected message retain the invalidation generation.
The C probe separately checks initial-zero, initial-nonzero and changed-generation
handling against all route caches.

Remaining hardware acceptance: real Android WebView/Bluetooth, source variations,
repeated favourite switching, quick reopen, phone/internet loss/recovery and
battery use. This version does not use vibration.
