# Native real-emulator verification

The harness uses TypeScript, Playwright and Effect; the watch application is
native C. Effect owns emulator scope, typed RPC, timeouts and guaranteed cleanup.
No application model or watch renderer is replaced by a mock.

The existing flows use physical-button packets, not touchscreen input. The touch
prototype has no automated/manual touch checks or QMP touch-injection extension;
button regression passes do not verify touch gestures or finger usability.

## What actually runs

- The current checkout's real release PBW on SDK 4.33.1 Emery and Gabbro QEMU,
  selected by Playwright's `emery` / `gabbro` projects.
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
   Check maximum-length minutes, ranges and bounds. Render `Due` / `Estimated now`,
   then an empty update. Relaunch must not resurrect
   its invalidated ETA. Route names remain without implying an available estimate.
6. **Metadata replacement (three stages):** highlight or select the second line,
   remove it while the line, filtered station or direction picker is open, and
   refresh through the real companion. Each native draft/history resets safely
   without changing existing favourites.
7. **Menu/removal navigation:** wrap through Retry data as the last favourites
   row, inspect removal confirmation, keep the favourite, and return to arrivals
   on both screen shapes.
8. **Reported-crash regression:** use 50 stations and four lines (4,204 bytes in
   the validated original metadata shape), create all 16 favourites with actual
   buttons, and perform 160 UP/DOWN switches in both directions with new source
   updates, including seconds. Then inspect the two durable recent-route caches,
   relaunch, verify every persisted favourite ID, exercise wraparound and the
   16-favourite limit. A snapshot at menu position 17/18 checks that two-digit
   counts remain visible inside the round footer. This test has a 180-second bound.

9. **Add after LIVE:** keep A's loaded data, add B with source publishing paused,
   verify B's empty loading screen and animated train, then deliver distinct B
   estimates. Reopen and verify both recent routes remain SAVED.
10. **Add while loading:** hold A's actual final AppMessage chunk, add B, then
    release A. B must stay empty until its own update; revisiting A shows only
    A's delayed estimates, not B's values.
11. **Remove while loading:** remove B while its real arrival packet is in flight.
    Late B data must not recreate its row or overwrite surviving A. A is SAVED
    until a fresh update, then survives reopening without B.
12. **Remove a loaded first slot:** delete A after both routes have data. B remains
    in its original nonzero persistence slot, appears SAVED until fresh data,
    survives reopening and wraps in both directions without resurrecting A.
13. **Remove the last favourite:** delete a loaded route with another update in
    flight, verify the empty root and no active station subscription, and release
    the late data. Reopen and re-add the same route: no old favourite or ETA may
    reappear before a new source update.
14. **Duplicate favourite:** adding the same station/line/direction selects the
    existing row, keeps one subscription and persists only one favourite.
15. **Opposite directions:** publish one whole-station snapshot with distinct
    estimates for both directions. Switching directions retains the correct LIVE
    data without resubscribing; removing one direction leaves the other intact.
16. **Cancel an unfinished add:** back out of the direction/station/line pickers while
    A is loading. Its selection/subscription remains unchanged, no draft is saved,
    and fresh A data still renders correctly.
17. **Queued invalidation during a switch:** cache A/B, hold a newer A batch, and
    serialize an empty A update behind it before selecting B. Release the batch
    and require the empty update's actual native receipt. A must show no estimate
    in RAM or after reopening, while B's valid cache remains available.
18. **Invalidation coalesced into new data:** use the same ordering but replace the
    queued empty update with a newer nonempty A snapshot before switching. That
    replacement must reach native C and replace both the older RAM/durable data;
    pruning must not erase the pending invalidation obligation.

19. **Line-first creation:** select Azul from the four-line fixture, verify only
    its two synthetic interchange stations appear, and keep that line through
    direction selection. Both termini exclude themselves; a one-item direction
    picker wraps safely. Back preserves highlighted station/line rows; cancelling
    first use saves nothing. Save, inspect the favourite and reopen it from cache.
20. **Line headers:** choose blue, green and yellow lines using their textual
    picker rows, verify LIVE headers, then relaunch without the phone and verify
    each saved colour. The ordinary arrivals flows cover red. Explicit store
    capture also records seconds, `m:ss` and a maximum-length numeric countdown.
    To refresh the unmasked yellow proof captures in `docs/assets/issue-5/`, run
    `METRO_CAPTURE_ASSETS=1 npx playwright test --grep 'line headers'` after building.

Only two recent routes are durable; other still-valid snapshots are RAM-only.
The stress deliberately asserts the uncached third route rather than pretending
all 16 arrival histories persist.

The removal cases caught a native fallback bug: changing stations after deletion
could label the survivor's retained data LIVE without a new update. The fallback
now marks it SAVED; a continuously subscribed same-station direction remains LIVE.

## Phone configuration coverage

`settings.spec.ts` adds 19 cases per target using the same compiled PBW/companion:
17 emulator/browser flows, a host C fault probe and a keyed-translation check.
The generated local data page runs in Chromium with the documented live bridge:
`ready` for target `pkjs`, `Pebble.sendMessage()` promises and PKJS `configmessage`
responses. Only Done invokes the intercepted close URL. Page network requests fail
the test. This models the API contract, not Android WebView/native bridge internals.

The cases cover immediate Add/confirmed Remove with no close, an unsubmitted
picker selection on Done, duplicates, 16-route/empty lists, retained slots/restart,
independent native validation, concurrent watch/catalogue edits, refresh recovery,
stale pages, idempotent requests, missing-result timeouts with no blind replay,
unavailable preview, hostile labels, keyed Portuguese copy and unchanged cache
expiry. Existing arrival/action/picker screenshots verify no phone-result notice
or unwanted navigation; removing a selected route dismisses its obsolete removal
confirmation safely. Appearance cases start in both light/dark preferences, switch
both ways while open, preserve the URL/list/selection and native revision, and
check 4.5:1 text contrast for content/controls and success/warning/error statuses.
Native dropdown colour-scheme support is declared; these browser tests cannot prove
every mobile WebView's app-theme propagation. No existing screenshots are replaced
or relaxed.

`e2e/persistence/faults.c` compiles production `favorites.c` with the system `cc`
and a minimal persistence API edge. It injects no-op, partial and complete-but-error
writes at each of 18 legacy migration and 17 normal save boundaries, plus failed
commit readback and legacy cleanup. Recovery must be a complete old/new list;
a sealed migration cannot fall back to obsolete legacy entries. This is a fault
model, not a claim of physical-flash power-loss verification. No new test framework,
production fault switches, hardware installation or touch injection is used.

## Memory assertions

The native app logs `Metro memory <reason>: used=<bytes> free=<bytes>` at startup,
catalogue replacement and every 16 selections (also the first). Samples are
captured in `messages.json`. The stress requires:

- At least **50 KiB free native heap** throughout sampled operation.
- No more than **4 KiB variation** after font/SDK warmup.
- Exactly the expected app starts; no hidden crash/restart is accepted.

The normal matrix has **45 cases per platform (90 tests)**, including four locale
and 19 configuration cases per platform. Each platform independently checks heap
headroom, switch variation and expected startup count.
For repeated runs use `npm run e2e -- --repeat-each=2` (180 tests). Recheck after
every production change; samples are not continuous allocation traces or a
physical-watch/battery guarantee.

Historical baseline before the phone editor: after removing the About screen,
the matrix passed **52/52 tests** (four
workers, 5.4 minutes) with snapshot updates disabled:
`npm run e2e -- --workers=4 --update-snapshots=none`.
All 16 new or changed menu baselines and both refreshed store menu images were
visually inspected, covering English/Portuguese, zero/one/16 favourites and Retry
wraparound. Across 352 memory samples:

| Target | Free native heap | Switch samples (used / free) |
| --- | --- | --- |
| Time 2 / Emery | 60,752–60,832 bytes | 5,680 / 60,832 bytes |
| Round 2 / Gabbro | 60,608–60,688 bytes | 5,680 / 60,688 bytes |

No unexpected native restart occurred. Recheck against the candidate revision
rather than treating these measurements as permanent guarantees.

## Run

Supported locally: Linux x86-64, Node 24.21.0, Pebble Tool 5.0.39,
`libpebble2` 0.0.31 and SDK 4.33.1.

```sh
npm ci
npx playwright install chromium
npm run e2e
```

`e2e` typechecks the harness, builds native C and phone JS, then runs Playwright.
The native build first validates both locale files and generates the constant C
copy tables. See [translation instructions](../CONTRIBUTING.md#translations).
The SDK names the PBW after the checkout directory; the harness installs exactly
`build/<checkout-name>.pbw`, never an old differently named package.

The bridge discovers Python from the `pebble` executable's shebang. For a wrapper
installation, set `PEBBLE_PYTHON` to the interpreter inside the Pebble tool's venv.

```sh
npm run typecheck
npm run e2e -- --project=gabbro
npm run e2e -- --project=emery
npm run e2e -- --repeat-each=2
npm run e2e -- --grep 'favourite lifecycle'
npx playwright show-report
```

Do not add `"type": "module"` to the root package: the SDK webpack configuration
is CommonJS. `npm run typecheck` checks strict phone/shared application sources
(root `tsconfig.json`) as well as the harness (`e2e/tsconfig.json`); the SDK build
then compiles the phone sources to `build/phone/` before bundling. Emulator/browser
tests execute the extracted PBW JavaScript, not an alternate TypeScript test build.
The configuration spec also requires a system C compiler (`cc`) for
its production-store fault probe. Host probes complement, never replace, the
actual native PBW flows.

## Permission checks

`permissions.spec.ts` inspects the built PBW's version-2 manifest and checks that
only the two production UnderLX Internet domains are declared, with purposes and
required flags. It also mutates disposable archive copies to prove preflight
rejects legacy, missing and broadened permission metadata.

The existing native-emulator/browser fixture can deny network access with HTTP
403 and a closed WebSocket, matching the Android network gate's observable
behaviour. A denied-start/grant test uses real compiled PKJS, its automatic retries
and the real watch to recover on the same Settings page without saving, closing
or replaying a mutation. These simulations do not test Android's permission prompts
or shield rendering; those belong to the Pebble app and need a compatible phone.
The SDK/tool pins, screenshot baselines and minimum heap assertions are unchanged.

## Screenshots and synchronization

Time 2 baselines remain in `e2e/screenshots/`; Round 2 baselines are isolated in
`e2e/screenshots/gabbro/` and are 260×260. Pixel comparison masks only:

- The header clock at that platform's native position, filled with the actual
  header colour. Frame readiness accepts the four fixture line colours as well
  as the neutral black header and still rejects launch frames.
- The platform-specific 30 × 18 train area on loading/saved screens. An unmasked
  cropped assertion separately checks that its frames change.

Raw store screenshots are captured without either mask by the explicit
`npm run assets:screenshots` command, for both platforms. Normal tests never
rewrite the checked-in store assets. See [asset generation](../assets/README.md).

The source's legitimate minute units keep ordinary ETA screenshots stable. Numeric
seconds are exercised during churn and zero rendering; tests do not manufacture
seconds for minute-only observations. Fixture data is not a live measurement.

Readiness waits for `Metro native UI ready`, emitted after the first real draw,
then real frames and application receipts. System launch-animation frames are
rejected. Normal assertions poll boundedly.

Delayed-data tests disable automatic fixture publishing instead of sleeping.
For in-flight races, the harness holds the final unmodified chunk emitted by the
real phone bundle, changes the route through native buttons, then releases that
same chunk and waits for the native application receipt. A transparent
`JSON.stringify` observer records the real phone's arrival serialization without
changing its arguments, bytes or result. `queueStation()` uses that checkpoint to
prove an empty snapshot entered transport before changing stations, then returns
a separate native-receipt waiter; the test does not rely on a sleep or assume a
WebSocket send has already been processed. It does not inject a replacement watch
model or renderer. Whole-station fixtures can include both
directions; active MQTT subscriptions are recorded separately from their history.

```sh
npm run e2e -- --project=gabbro --update-snapshots
```

Review every changed image before accepting it, especially during startup/source
transitions. CI never updates baselines. A useful source state must not be
replaced by a prior menu/connecting frame just because an update run accepted it.

## CI, probes and limits

The existing least-privilege Ubuntu workflow builds/tests and saves reports,
traces, native screenshots, `phone.log`, `emulator.log`, commands/subscriptions
and heap samples. The artifact also carries `LICENSE`, `THIRD_PARTY_NOTICES.md`,
`DATA_METHODS.md`, `LICENSES/` and the matching `src/` / `e2e/` for diagnostic
reproducibility and data provenance. These private diagnostics are not a public
methods offer; see the case-specific release assessment in `DATA_METHODS.md`.
The workflow allows 25 minutes for setup and the 90-case serial matrix, matching
the release verification budget. Workers and retry policy are unchanged.
It never installs on hardware or publishes. A local pass does
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

A temporary actual companion/feed/transport probe also covers retained empty,
malformed and oversized-fallback invalidations, coalescing into newer data,
20-station queue pressure, monotonic generations and exhausted retries of both
an invalidation and its replacement barrier. The pending queue remains bounded at
eight; losses fail closed through the existing native generation mechanism. The
two corresponding emulator regressions failed on both watches before the fix.
These scratch probes are not a restored unit-test suite.

Remaining hardware acceptance on both watches, particularly physical Round 2:
real Android WebView/Bluetooth, source variations,
repeated favourite switching, quick reopen, phone/internet loss/recovery and
battery use. This version does not use vibration.

## Portuguese and English fallback

`locale.spec.ts` adds four flows per platform: menus, LIVE/SAVED, estimate
ranges/bounds/zero/empty data and removal confirmation under `pt_PT` and
unsupported `fr_FR`; and the line picker/catalogue-replacement notice in each
locale. French deliberately expects the existing English baselines. Portuguese
baselines live in `screenshots/pt-PT/` and `screenshots/gabbro/pt-PT/`. All app
navigation still uses real buttons. The default English regression suite keeps
its original firmware locale and baselines.

**SDK limitation:** the SDK 4.33.1 emulator shell disables language settings:
[`shell/sdk/stubs.c`](https://github.com/coredevices/pebbleos/blob/v4.33.2/src/fw/shell/sdk/stubs.c)
returns English and an invalid language resource ID. Installing a language pack
cannot select it there. For the two locale fixtures only, the harness uses the
SDK's bundled GDB/debug ELF to set `s_system_domain.iso_locale` in the private
emulator's RAM before installing Metro. It asserts the locale logged by the
release app's actual `i18n_get_system_locale()` call; no app renderer, translation
helper, phone language or app binary is substituted. The debugger uses a private
loopback port and detaches immediately. Normal SDK files and managed emulators
are untouched. These tests exercise the native API boundary and built-in system
fonts, **not** the physical watch's language picker or downloaded font packs.

Run `npm run e2e -- --grep 'watch locale'` for this matrix, and add
`--repeat-each=2` to repeat it. Full hardware language-switch acceptance remains
necessary on both shapes.

Nine generator checks cover translation validation, explicit locale mappings,
aliases sharing tables, a configurable fallback, and malformed/missing registry
entries. They run with both system Python and the Pebble tool's Python. Build
probes cover clean/no-op builds, adding a mapped translation file, editing it,
removing/restoring the mapping, and regeneration after deleting either generated
header. Restoring inputs reproduces identical generated headers and localisation
object bytes on both targets.

A temporary host C probe compiles the actual `localization.c` with ASan/UBSan. It
checks locale changes, null/empty/unsupported fallback, known/unknown diagnostics,
invalid keys, and a third language/alias added through JSON alone. This supplements
the actual release-PBW emulator flows; it does not replace them or physical-watch
language/font acceptance.
