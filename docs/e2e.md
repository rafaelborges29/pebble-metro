# Emulator verification

Playwright/Effect runs the actual Emery/Gabbro PBW in SDK QEMU and its extracted
phone bundle in Chromium. Only external REST/MQTT sources are fixtures: native C,
Paho, AppMessage receipts, drawing, buttons and persistence are real. Unexpected
network destinations/methods fail. Tests never connect to a physical watch,
wipe managed emulator storage, publish or exercise touch input.

## Run

Follow [contributor setup](../CONTRIBUTING.md#setup-and-checks):

```sh
npm run e2e
npm run e2e -- --project=gabbro
npm run e2e -- --repeat-each=2
npm run e2e -- --grep 'favourite lifecycle'
npx playwright test --list
npx playwright show-report
```

`e2e` typechecks, builds both targets and tests `build/<checkout-directory-name>.pbw`.
After an unchanged successful build, use `npx playwright test --update-snapshots=none`
to avoid rebuilding. Application tests execute PBW JavaScript, not a separate TS build.
The bridge discovers Python from `pebble`'s shebang; wrapper installations can set
`PEBBLE_PYTHON` to its venv interpreter. Host persistence probes also require `cc`.
Each test owns disposable flash/browser storage, loopback listeners and output;
Effect handles bounded cleanup. Managed SDK emulators and hardware are untouched.

## Coverage

Use `--list` for the current inventory; the specs are authoritative:

| Spec | Focus |
| --- | --- |
| [`favourite.spec.ts`](../e2e/favourite.spec.ts) | Real-button creation/removal/races, source replacement, expiry, reopen, bounded cache and 16-route/160-switch stress |
| [`settings.spec.ts`](../e2e/settings.spec.ts) | Live saves, conflicts, uncertain outcomes without replay, hostile labels, copy/theme/contrast and persistence faults |
| [`permissions.spec.ts`](../e2e/permissions.spec.ts) | Actual PBW declarations/preflight and denied-network recovery |
| [`locale.spec.ts`](../e2e/locale.spec.ts) | Portuguese and unsupported-locale English fallback |

[`persistence/faults.c`](../e2e/persistence/faults.c) compiles production `favorites.c`
against a host persistence edge and injects failed/torn writes. Recovery must be a
complete old/new list, never resurrect sealed legacy choices. It complements native
PBW flows, not physical-flash power-loss acceptance. The phone bridge/permission
simulations test the observable contract, not Android WebView internals or prompts.
Do not shorten button delays, relax snapshots/expiry or skip cases to improve timing.

## Memory and crash diagnosis

Inspect per-test `messages.json`, `emulator.log`, `phone.log`, commands/subscriptions,
screenshots and traces. Native `Metro memory <reason>: used=… free=…` samples require:

- At least **50 KiB free heap**.
- At most **4 KiB steady-state variation** after font/SDK warmup.
- Exactly the expected starts; hidden crashes/restarts are failures.

For navigation/protocol/cache changes, repeat the suite and inspect these samples.
They are sampled emulator checks, not continuous traces or hardware/battery guarantees.
Preserve [fixed bounds and expiry](architecture.md), including the two-route durable
cache versus other RAM-only snapshots.

## Screenshots and synchronization

Emery baselines are in `e2e/screenshots/`, Gabbro in its `gabbro/` subdirectory;
Portuguese adds `pt-PT/` in each. Masks cover only the header clock and 30×18 loader
area on loading/saved screens; a separate unmasked crop asserts train animation.
[Store captures](../assets/README.md#recapture-screenshots) are unmasked and explicit.

Readiness requires the first real draw, native frames and application receipts,
not launch animations. Race tests hold/release actual unmodified phone chunks and
await native receipts; a WebSocket send alone does not prove delivery. Do not replace
these waits with sleeps. Run without snapshot updates first; for intentional UI work:

```sh
npm run e2e -- --project=gabbro --update-snapshots
```

Inspect every changed image, then rerun normally. Never accept connecting/menu frames
as arrivals baselines. CI never updates baselines; retries are disabled.

## CI and artifacts

PR/main CI uses one Ubuntu runner per target, three workers and `--fully-parallel`.
Local default is one worker/file-level scheduling. Both target jobs finish even on
failure; the final `e2e` gate requires both successes and both reports. Report merging
alone can exit zero for failed tests. Release CI tests the **same frozen PBW** on both
targets without rebuilding and checks provenance/hash before/after; see [releases](releases.md).

Seven-day diagnostics include logs, frames, traces, heap/timing samples and matching
source/fixtures/licences. They are public: use fixture data only, never credentials,
phone storage or personal/device logs. Expiring artifacts do not replace versioned
ODbL data/methods access. SDK cache keys include exact OS/toolchain/interpreter versions;
app builds/flash are not cache paths. npm/uv have dependency caches, not a browser cache.
Fork PRs can read base-branch caches: never cache credentials/confidential data.

### Hosted performance

The three-worker default is based on [PR #26's measurements](https://github.com/rafaelborges29/pebble-metro/pull/26),
not a latency guarantee. To benchmark the current revision without publishing:

```sh
gh workflow run e2e.yml --ref <branch> -f workers=3 -f repeat=2 -f fully_parallel=true
```

`e2e-metrics/` records runner resources, `vmstat`, GNU time and the PBW hash;
per-test `emulator-timings.json` records startup/lifetime and RPC counts/durations.
Compare full pipeline/runner-minutes, case identities, heap/restarts and unchanged
PBW bytes. Cache/CPU variation matters; RPC times overlap and maximum child RSS is
not aggregate process memory. Startup timing is not app readiness.

## Locale and hardware limits

SDK 4.33.1's emulator shell disables language settings. Locale fixtures use bundled
GDB to set the SDK locale in private emulator RAM, verify the release app's actual
`i18n_get_system_locale()` log and detach. No app binary, SDK file or renderer is
replaced; this does not verify hardware language selection/font packs.

Owner-approved hardware acceptance still covers Android WebView/Bluetooth, real
permissions, source variations, repeated switching, reopen, phone/internet recovery,
language/fonts and battery use. Do not treat emulator passes as physical acceptance
or add/run touch tests.
