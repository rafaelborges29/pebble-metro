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

Each test uses new private flash images and private loopback listeners for the
serial bridge and debugger. Python passes both already-bound listening sockets
to QEMU with `pass_fds`; there is no release/rebind window in which another test
can steal a port. The harness never connects to a physical watch or wipes managed emulator storage. Python
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

`settings.spec.ts` adds 20 cases per target using the same compiled PBW/companion:
18 emulator/browser flows, a host C fault probe and a keyed-translation check.
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

The normal matrix has **49 cases per platform (98 tests)**, including four locale,
20 configuration and three permission cases per platform. Each platform independently checks heap
headroom, switch variation and expected startup count.
For repeated runs use `npm run e2e -- --repeat-each=2` (196 tests). Recheck after
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
npx playwright install --only-shell chromium
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
Normal PR/main runs and release verification use one `ubuntu-24.04` runner per
watch target, sharing `.github/actions/test-emulator`. Each job selects exactly
one Playwright project and uses test-level parallel scheduling (`--fully-parallel`)
with three workers per target, the shared CI default. Local runs still default
to one worker and
sequential tests within each file; pass `--workers` / `--fully-parallel` explicitly
to reproduce a CI target. Retries remain disabled and snapshots are never updated.
Each test still owns fresh flash, its browser context and per-test output directory.
Both target jobs finish even if one fails (`fail-fast: false`). Their separate
`emulator-e2e-emery` / `emulator-e2e-gabbro` artifacts retain native logs, traces,
heap samples, timings, JUnit and Playwright blob reports. A small final `e2e` job
merges both blobs into the existing `emulator-e2e` HTML/JUnit artifact and preserves
the required-check name. It requires both target jobs to succeed, independently
of report rendering: `merge-reports` itself exits zero even for failing tests.
A missing target/blob also fails the gate; reports cannot silently omit a platform.
Normal CI never installs on hardware or publishes. A local pass does not prove
hosted checks passed for an exact revision.

### Hosted performance

Use **Actions → Emulator E2E → Run workflow** to benchmark `workers` (2/3/4 per
target), `repeat` (1/2), and `fully_parallel` scheduling on `ubuntu-24.04`:

```sh
gh workflow run e2e.yml --ref <branch> -f workers=3 -f repeat=1 -f fully_parallel=true
gh workflow run e2e.yml --ref <branch> -f workers=3 -f repeat=2 -f fully_parallel=true
```

The workflow separates setup, typecheck, native/phone build, testing and artifact
upload into timed steps. `e2e-metrics/` in the private artifact records CPU/RAM,
one-second `vmstat` samples, GNU time output and the tested PBW's SHA-256 (checked
again after testing). GNU time's maximum RSS is the largest individual child,
not aggregate process-tree memory; use `vmstat` to inspect whole-runner pressure.
Each emulator writes/attaches `emulator-timings.json`: bridge startup (Python,
flash preparation and socket connection), lifetime including teardown, and RPC
counts/elapsed totals for install, buttons, screenshots and delivery. Startup is
not firmware/application readiness; the existing draw and receipt waits remain.
RPC totals can overlap and must not be summed into a test's wall time. JUnit and
HTML reports retain per-test/platform durations, logs and failure traces.

#### Single-runner baseline

Measured on 2026-11-08, all using `ubuntu-24.04` with **2 vCPUs / 7.75 GiB RAM**.
The before revision `4b795ce` adds measurement only; `f9f019a` adds inherited
sockets/headless-only setup, and `e03589f` selects the four-worker CI default.
Production code, all 98 test identities and screenshot baselines are identical.
Times below are rounded to seconds; whole-job time excludes queueing.

| Configuration / hosted run | Setup | Typecheck + build | Tests | Report upload | Whole job | Result |
| --- | --- | --- | --- | --- | --- | --- |
| [Before: 1 worker](https://github.com/rafaelborges29/pebble-metro/actions/runs/42529218535) | 1m11s | 7s | 20m54s | 2s | **22m22s** | 98 passed |
| [2 workers](https://github.com/rafaelborges29/pebble-metro/actions/runs/42529367222) | 1m11s | 5s | 10m45s | 3s | 12m12s | 98 passed |
| [4 workers, files](https://github.com/rafaelborges29/pebble-metro/actions/runs/42529369378) | 59s | 5s | 7m00s | 2s | **8m13s** | 98 passed |
| [4 workers, fully parallel](https://github.com/rafaelborges29/pebble-metro/actions/runs/42529517026) | 1m08s | 6s | 6m55s | 2s | 8m20s | 98 passed |
| [4 workers, files: confirmation](https://github.com/rafaelborges29/pebble-metro/actions/runs/42530501498) | 1m11s | 6s | 6m53s | 2s | **8m18s** | 98 passed |
| [4 workers, files: repeat-each=2](https://github.com/rafaelborges29/pebble-metro/actions/runs/42530499386) | 1m11s | 4s | 13m27s | 3s | 14m58s | **196 passed** |

| Configuration | CPU model | CPU busy mean / peak | Peak non-cache RAM | Median bridge startup |
| --- | --- | --- | --- | --- |
| Before: 1 worker | EPYC 7763 | 26.9% / 79% | 1.31 GiB | 1.917s |
| 2 workers | EPYC 9V74 | 48.0% / 99% | 1.81 GiB | 1.756s |
| 4 workers, files | EPYC 9V45 | 66.7% / 100% | 2.66 GiB | 2.207s |
| 4 workers, fully parallel | EPYC 9V74 | 85.6% / 100% | 2.74 GiB | 2.718s |
| 4 workers, files: confirmation | EPYC 9V45 | 65.7% / 100% | 2.63 GiB | 2.184s |
| 4 workers, files: repeat | Xeon 6975P-C | 70.8% / 100% | 2.73 GiB | 2.208s |

Resource figures are whole-runner, one-second samples, not continuous maxima or
aggregate child RSS. Non-cache RAM is approximately total minus free/buffers/cache;
CPU summaries exclude `vmstat`'s first (since-boot) row. Hosted CPU models vary
within this runner class, so these are not identical-hardware microbenchmarks.

The first-stage setting reduced full-job wall time and runner-minutes by about
**63%** without larger runners or duplicate setup jobs. The under-eight-minute
target was **not quite reached at that stage**: normal confirmations took 8m13s–8m18s for today's 98 cases,
not the issue's historical 52. No external download outlier occurred; setup still
varied from 59–71 seconds, so do not credit all setup differences to `--only-shell`.

On that single runner, fully parallel execution was only a few seconds faster in
testing, with higher CPU pressure and slower individual starts/screenshots. That
stage therefore retained file-level scheduling; the per-target split below makes
test-level scheduling useful without doubling contention on one machine.
Each stress case still uses 430 real button presses, including the 160 switches;
about 109 seconds is spent in button RPCs. Both 100 ms press / 150 ms release
waits are retained: no coverage, persistence timing, heap/restart assertions or
screenshot tolerances are relaxed. Production timeout/recovery cases also retain
their real waits. Setup downloads only Chromium's required headless shell, not
the unused full browser. At this first stage no SDK/browser cache or extra CI
runner was added; concurrency addressed the dominant serial bottleneck first.
The confirmation/repeat runs also checked that testing left PBW bytes unchanged.
Across all runs, stress samples retained at least 53,772 bytes free on Gabbro and
53,908 on Emery, zero sampled steady-state heap variation and exactly two expected
starts per stress case. No tests were skipped or retried. Four concurrent local
locale cases additionally exercised both platforms' inherited debugger listeners; four
SIGTERM probes verified QEMU exit and private-flash removal. These checks do not
replace the physical-watch acceptance below.

#### Per-target runners and setup

PR/main CI builds from the exact checkout in each independent target job; builds
are deliberately not serialized behind a third SDK setup job. Release verification
instead builds/restores and freezes one PBW, then both target jobs download that
same immutable candidate artifact. Each validates the release provenance/hash
before and after testing, without rebuilding. Publication depends on both targets
and their report gate; it still downloads the original frozen candidate, not a
separately rebuilt watch package. The release critical path includes candidate
preparation, so measure it separately from PR feedback.

The shared setup installs browser dependencies before the QEMU runtime libraries,
reusing the fresh apt indexes instead of running `apt-get update` twice. The
release build-only job skips Chromium and refreshes apt itself. All required
system packages and native/browser validation remain intact.

Only `~/.local/share/pebble-sdk/SDKs/4.33.1` is cached. The exact key includes OS,
architecture, Ubuntu version, SDK, Pebble Tool, libpebble2, Node and the installed
Python **patch** version: the SDK contains a venv with interpreter paths. There
are no fallback restore keys. A miss installs the pinned SDK; every run activates
it. Application builds, test storage, credentials and the developer's managed
emulators are never cached. npm/uv retain their existing caches; no browser cache
is added. Record cold saves and warm restores separately before attributing any
speedup to caching.

Initial split-runner measurements (same two-core runner class per target) are
below. Pipeline time runs from the first watch job starting through the merged
report gate completing, not just the faster platform's test time. CPU models vary
and runner-minutes sum all three jobs, so splitting is not a free speedup.

| Run / workers per target | SDK cache | Full pipeline | Result |
| --- | --- | --- | --- |
| [2 workers](https://github.com/rafaelborges29/pebble-metro/actions/runs/42533915573) | Not yet added | 8m15s | 98 passed |
| [3 workers](https://github.com/rafaelborges29/pebble-metro/actions/runs/42533917999) | Not yet added | 6m39s | 98 passed |
| [4 workers](https://github.com/rafaelborges29/pebble-metro/actions/runs/42533920282) | Not yet added | 6m57s | 98 passed |
| [Normal PR, 4 workers](https://github.com/rafaelborges29/pebble-metro/actions/runs/42533920706) | Not yet added | **5m17s** | 98 passed |
| [3 workers, consolidated setup](https://github.com/rafaelborges29/pebble-metro/actions/runs/42534850485) | Cold miss/save | 6m45s | 98 passed |
| [Normal PR, 4 workers, consolidated setup](https://github.com/rafaelborges29/pebble-metro/actions/runs/42534856192) | Cold miss/save | 6m53s | 98 passed |
| [3 workers, consolidated setup](https://github.com/rafaelborges29/pebble-metro/actions/runs/42535418474) | Warm hit | **5m15s** | 98 passed |
| [4 workers, consolidated setup](https://github.com/rafaelborges29/pebble-metro/actions/runs/42535420304) | Warm hit | 6m24s | 98 passed |
| [Normal PR, 4 workers, consolidated setup](https://github.com/rafaelborges29/pebble-metro/actions/runs/42535543763) | Warm hit | **5m45s** | 98 passed |
| [4 workers, repeat-each=2](https://github.com/rafaelborges29/pebble-metro/actions/runs/42535422402) | Warm hit | 9m36s | **196 passed** |

Choose **three workers per target**: it reaches the goal without the higher
contention/memory of four. In the warm three-worker sample, test execution took
3m45s / 3m55s on Emery/Gabbro, setup took 51s / 40s and the report job took 18s;
combined job durations cost about 10.05 runner-minutes. CPU busy averaged
54.7% / 59.7%, with peak non-cache RAM 2,258 / 2,331 MiB. Both runners were
EPYC 9V45. By comparison, the warm four-worker samples used about 2.6–2.9 GiB
per runner and could average nearly 90% CPU busy on slower EPYC 7763 hosts.
The initial two-worker sample cost 15.77 runner-minutes; four-worker samples
ranged 9.92–12.57. These are observed runner-minutes, not billing-rounded totals.

SDK warm-hit setup was 40–55s rather than the cold 66–74s in these consolidated
setup samples. Both exact-key restores and cached SDK/venv execution passed;
there was no fresh SDK install on a hit. CPU models and download speeds still
vary, so not all wall-time differences are caused by caching or worker count.

Sub-six-minute PR feedback is possible, but the slower cold/hosted runs must not
be hidden or described as a guaranteed sub-six SLA. The selected setting's final
PR check and repeated-suite evidence are linked in the PR; rerun after source or
toolchain changes. Button delays and all production timeout cases remain unchanged.

The merged/per-target JUnit identities were compared with the original 98-case
baseline, including exact multiplicities in the repeated run. Stress artifacts
retained 430 real button presses, heap headroom/variation checks and exactly two
expected app starts per case, with no errors, skips or retries.

One-off local integration probes verified both successful and intentionally failed
blob merges: both projects and the failure survive into HTML/JUnit. The explicit
job-result gate rejects failure, cancellation and skipped targets even though the
merger exits zero. An offline temporary release fixture exercised candidate copies
and pre/post provenance validation for both targets, rejecting a tampered PBW and
a wrong-source provenance record. No release workflow was dispatched or published.

#### Runtime profiling and transport readiness

A bounded Bun 1.4.4 experiment used the verified official Linux binary, without
changing dependencies or the lockfile. Four locale checks passed under Bun, but
full-suite discovery failed with `AggregateError` while loading the favourite,
settings and permissions specs. Explicit harness-tsconfig and Playwright async-
loader attempts did not make all 98 cases discoverable. A passing subset is not
a valid runtime replacement: Node 24.21.0 remains the supported runner, and the
bridge continues to reuse the Pebble SDK's Python `libpebble2` implementation.

Local process accounting across eight representative range/header/locale flows
measured 5.99 CPU-seconds in Python and 35.87 CPU-seconds in its QEMU/GDB children.
Bridge lifetimes summed to 96.67 seconds across concurrently running cases; this
is not one job's elapsed time or a complete Node/Chromium CPU profile. The result
does not justify porting the watch protocol to a new runtime.

Playwright step profiling instead found avoidable delay observing transport state
already delivered into fixture memory. Only the serialization checkpoint and real
native-receipt predicates now use 20/50/100 ms polling intervals; their assertion
deadlines and required values/receipts are unchanged. These checks do not issue
extra browser/watch RPCs. Button hold/release delays, screenshot/animation polling,
production timeout/recovery timers, fresh storage and heap/restart checks remain
unchanged. In the eight-flow local pilot, serialization-plus-arrival expect-step
time summed to 6.48s before / 3.25s after. Total pilot wall time was 37.1s / 36.6s;
these small local timings are not a hosted speedup claim. Full hosted confirmation
and repeated-suite evidence are linked in the PR.

### Other probes and limits

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
helper, phone language or app binary is substituted. The debugger uses an inherited
private loopback listener and detaches immediately. Normal SDK files and managed emulators
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
