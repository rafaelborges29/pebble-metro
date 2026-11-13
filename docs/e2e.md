# Native real-emulator verification

The TypeScript/Playwright/Effect harness runs the actual PBW on SDK 4.33.1
Emery and Gabbro QEMU and that PBW's extracted phone bundle in Chromium. Only
external REST/MQTT sources are replaced with deterministic fixtures. Native C,
Paho, AppMessage receipts, drawing, buttons and persistence are real.

Tests never connect to a physical watch, wipe managed emulator storage, publish,
or exercise touch input. Button regressions do not verify touch usability.

## Run

Follow [contributor setup](../CONTRIBUTING.md#setup-and-checks), then:

```sh
npm run e2e
npm run e2e -- --project=gabbro
npm run e2e -- --project=emery
npm run e2e -- --repeat-each=2
npm run e2e -- --grep 'favourite lifecycle'
npx playwright show-report
```

`e2e` typechecks, builds both targets and tests
`build/<checkout-directory-name>.pbw`. After an unchanged successful build, use
`npx playwright test --update-snapshots=none` to avoid rebuilding. Tests execute
compiled PBW JavaScript, not an alternate TypeScript application build.

The bridge discovers Python from the `pebble` executable's shebang. For a wrapper,
set `PEBBLE_PYTHON` to the interpreter in the Pebble tool's venv. The settings
persistence fault probe also needs a system C compiler (`cc`).

Each test owns new private flash, browser storage, output files and loopback
listeners. Python passes already-bound serial/debugger sockets into QEMU with
`pass_fds`, avoiding port-rebind races. Effect owns scope, timeouts and cleanup;
there is no competing `pypkjs` process. Unexpected network destinations/methods
fail instead of reaching the internet.

## Coverage

The normal matrix has 49 cases per target (98 total); `--repeat-each=2` runs 196.
Use `npx playwright test --list` for the current inventory. The maintained specs,
not historical run counts, are authoritative:

| Spec | Boundaries covered |
| --- | --- |
| `e2e/favourite.spec.ts` | Creation/removal races, duplicates/opposite directions, source replacement, line-first pickers/colours, reopen/SAVED, RAM-only revisit, phone restart, expiry, ranges/bounds/zero/empty data, queued/coalesced invalidations, 16 favourites and 160 switches |
| `e2e/settings.spec.ts` | Live Add/Remove, conflicts, stale pages, uncertain results/Refresh without replay, idempotence, hostile labels, keyed copy, light/dark contrast, cache expiry and native persistence faults |
| `e2e/permissions.spec.ts` | Actual PBW permission declarations, rejected legacy/broadened manifests and denied-network recovery |
| `e2e/locale.spec.ts` | Portuguese and unsupported-locale English fallback through real native menus, arrivals, notices and removal |

Only two recent routes are durable; tests separately exercise RAM-only arrivals.
The stress case performs 430 real button presses, including 160 switches, then
checks persisted IDs, wraparound and the favourite limit. Do not shorten button
hold/release waits or relax assertions to make CI faster.

`e2e/persistence/faults.c` compiles production `favorites.c` with a minimal host
persistence API. It injects no-op, partial and complete-but-error writes at legacy
migration/save boundaries, commit readback and cleanup. Recovery must produce a
complete old/new list, never resurrect sealed legacy choices. This complements
the PBW tests; it is not physical-flash power-loss verification.

The settings page uses Chromium's implementation of the documented local bridge
contract (`ready`, `Pebble.sendMessage()` promises, PKJS `configmessage`). Page
network requests fail. Permission denial simulates HTTP 403/closed WebSockets.
Neither proves Android WebView internals, native prompts/shield rendering or
permission propagation. See [phone configuration](phone-configuration.md).

## Memory and crash diagnosis

Inspect per-test `messages.json`, `emulator.log`, `phone.log`, commands,
subscriptions, screenshots and traces. Native logs include
`Metro memory <reason>: used=<bytes> free=<bytes>` at startup, catalogue
replacement and every 16 selections (also the first).

The stress requires:

- At least **50 KiB free native heap** in sampled operation.
- At most **4 KiB steady-state variation** after font/SDK warmup.
- Exactly the expected app starts; no hidden crash/restart.

For navigation/protocol/cache changes, run the repeated suite and inspect these
samples and restart counts. They are sampled emulator measurements, not continuous
allocation traces or hardware/battery acceptance. Keep fixed model/token bounds
and expiry/invalidation guarantees; see [architecture](architecture.md).

## Screenshots and synchronization

Emery baselines live in `e2e/screenshots/`; Gabbro uses
`e2e/screenshots/gabbro/`. Portuguese adds `pt-PT/` in each. Pixel comparison
masks only the header clock (using its actual line colour) and the 30×18 loader
area on loading/saved screens. A separate unmasked cropped assertion checks train
animation. Store images are unmasked and recaptured only through
[`npm run assets:screenshots`](../assets/README.md#recapture-screenshots).

Readiness waits for `Metro native UI ready`, then native frames and application
receipts, rejecting system launch frames. Delayed-source cases pause fixture
publishing rather than sleeping. In-flight races hold the real phone bundle's
final unmodified chunk, navigate with buttons, then release it and await its
native receipt. Serialization checkpoints observe actual bytes without changing
them; sending a WebSocket packet alone is not proof of native delivery.

Run without snapshot updates first. For intentional UI changes only:

```sh
npm run e2e -- --project=gabbro --update-snapshots
```

Inspect every changed image, then rerun normally. Never accept a launch/menu frame
as an arrivals baseline. CI never updates baselines.

## CI and artifacts

PR/main CI uses one `ubuntu-24.04` runner per watch target, with three workers and
`--fully-parallel`. Local runs default to one worker and file-level scheduling;
pass explicit options to reproduce CI. Retries are disabled. Both target jobs
finish even if one fails; the final `e2e` gate requires both successes and both
blob reports. Report merging alone can exit zero for failed tests.

Release CI tests the **same immutable candidate** on both targets without
rebuilding, validating provenance/hash before and after. Publication still uses
the original candidate. See [release verification and recovery](releases.md).

Per-target and merged artifacts retain reports, traces, native frames, logs,
heap samples and resource timings for seven days. Diagnostic artifacts also
include source, fixtures, locales, tools and licence/data notices for
reproducibility. They are private only while repository access is private: audit
them before source publication. They are not a public ODbL methods offer.

The SDK cache is scoped to its installation directory, keyed by OS/architecture
and exact SDK/tool/libpebble2/Node/Python patch versions, without fallback keys.
App builds, flash and managed emulators are not configured cache paths. npm/uv
keep their dependency caches; there is no browser cache. Fork PRs can read
base-branch caches: never store credentials or confidential data in any cached
path. See [GitHub's cache access restrictions](https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching#restrictions-for-accessing-a-cache).

### Hosted performance

The three-worker-per-target default balances contention and feedback time. The
[warm-cache measurement](https://github.com/rafaelborges29/pebble-metro/actions/runs/42535418474)
completed the 98-case pipeline in 5m15s; a
[repeated run](https://github.com/rafaelborges29/pebble-metro/actions/runs/42535422402)
passed 196 cases. These are historical observations, not a latency guarantee.
Detailed optimization experiments remain in
[PR #26](https://github.com/rafaelborges29/pebble-metro/pull/26) and Git history,
not this operating guide. Node 24.22.2 remains the supported runner.

To measure the current revision without publishing:

```sh
gh workflow run e2e.yml --ref <branch> -f workers=3 -f repeat=1 -f fully_parallel=true
gh workflow run e2e.yml --ref <branch> -f workers=3 -f repeat=2 -f fully_parallel=true
```

`e2e-metrics/` records CPU/RAM, one-second `vmstat`, GNU time and the tested PBW
hash. Each test attaches `emulator-timings.json` for startup/lifetime and RPC
counts/durations. Startup is not firmware/app readiness; RPC totals can overlap.
GNU time maximum RSS is the largest child, not aggregate process-tree memory.
Compare full pipeline and summed runner-minutes, account for cache hits and
variable hosted CPUs, and verify case identities, heap/restarts and unchanged PBW
bytes before claiming an improvement.

## Locale and hardware limits

SDK 4.33.1's emulator shell disables language settings. Locale fixtures alone use
the bundled GDB/debug ELF to set `s_system_domain.iso_locale` in private emulator
RAM, then assert the release app's real `i18n_get_system_locale()` log. GDB detaches
immediately. No app binary, renderer, translation helper, SDK files or managed
emulator is replaced. See the upstream
[shell stub](https://github.com/coredevices/pebbleos/blob/v4.33.2/src/fw/shell/sdk/stubs.c).
This tests the API and built-in fonts, not hardware language selection/font packs.

Still requiring owner-approved hardware acceptance on both watches: Android
WebView/Bluetooth, real permissions, source variations, repeated switching,
quick reopen, phone/internet recovery, language/font packs and battery use.
Do not add/run touch tests or treat emulator success as physical acceptance.
