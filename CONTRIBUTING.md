# Contributing

Keep the app small, predictable and arrivals-focused. The supported target is
Pebble Time 2 (`emery`) and Pebble Round 2 (`gabbro`) with Android, SDK 4.33.1
and Node 24.22.2.
See [README](README.md) for app usage and [architecture](docs/architecture.md)
for the model, protocol and storage boundaries.

## Setup and checks

The tested host is Linux x86-64. Install [uv](https://docs.astral.sh/uv/), Node
24.22.2, and the runtime libraries listed in
[the shared CI setup](.github/actions/setup-pebble/action.yml). On Ubuntu 24.04,
that action is the authoritative package/toolchain recipe. Other hosts are not
verified.

```sh
uv tool install --python 3.13 --with libpebble2==0.0.31 pebble-tool==5.0.39
pebble sdk install 4.33.1
pebble sdk activate 4.33.1
npm ci
npx playwright install --with-deps --only-shell chromium
python3 tools/release.py check
python3 -m unittest discover -s tools -p test_release.py
npm run typecheck
npm run check
npm run e2e
```

Phone/shared application sources are TypeScript under `src/pkjs/` and
`src/common/`. `npm run typecheck` checks these and the harness separately;
`npm run build` and direct SDK builds also compile/check production sources before
bundling. Do not edit generated `build/phone/` JavaScript or add root
`"type": "module"`. Keep runtime validation at every JSON boundary. The settings
client is serialized into its HTML page: type-only imports are safe, runtime
imports/captures and downlevel compiler helpers are not.

Automated tests use the emulator E2E suite, which runs both platform projects.
Use `npm run e2e -- --project=gabbro` (or
`--project=emery`) for a focused run. New Round 2 baselines live under
`e2e/screenshots/gabbro/`; the existing Time 2 baselines remain at the root.

The emulator harness needs the Pebble tool and its Python `libpebble2` dependency.
The tested versions and Linux system packages are pinned in
[the shared CI setup](.github/actions/setup-pebble/action.yml); interpreter overrides are documented in
[E2E](docs/e2e.md).

The production PBW is `build/<checkout-directory-name>.pbw`; both native targets
are included. Useful commands:

- `npm run build` — compile phone TypeScript and build the production PBW.
- `npm run build:dev` — build `build/metro-lisboa-dev.pbw`, without installing it.
- `npm run check` — bootstrap syntax check and production build.
- `npm run assets:screenshots` — explicitly recapture unmasked store screenshots.
- `pebble clean --sdk 4.33.1` — clean after changing SDK or project type.

### Development builds

Build variants sequentially: they share generated intermediates. Normal checks
and E2E stay production-only; no dual-app emulator setup is needed.

| Variant | Name | Permanent UUID |
| --- | --- | --- |
| Production | Metro Lisboa | `5576168a-8b38-4be1-90e7-343af607c167` |
| Development | Metro Lisboa Dev | `af9f9c16-6542-4568-bdd8-01e57443e3d0` |

Use only the [guarded dev installer](README.md#install-development-on-your-watch)
for owner-requested hardware tests. It validates metadata and both native headers,
makes a private package copy and installs those exact bytes. Dev starts with its
own favourites and Internet grants. Open its matching Settings entry and close
old pages when switching apps; the shared page title still reads Metro Lisboa.
Android's preview toggle/connectivity remain shared. Logs are not UUID-filtered:
launch dev before `pebble logs --cloudpebble` (or explicit `--phone PHONE_ADDRESS`).
Remove only **Metro Lisboa Dev** through Pebble Android if removal is intended;
updates do not require uninstalling either app. Production release validation
rejects dev packages.

Hardware coexistence acceptance remains pending: with explicit owner approval,
keep live favourite A, install dev and save different B, update dev, then remove
only dev. Verify live A, both companions/Settings and independent permission
grants on the actual Android/watch versions. Package/emulator checks cannot prove
these platform interactions. Build, CI, PR or release approval does not authorize
physical installation.

## Versions and releases

Main carries the next `major.minor.0-snapshot` version. Keep `package.json` and both
root lockfile version fields aligned. The build preserves that development label
while Pebble's native binary uses numeric major/minor. Do not publish snapshot PBWs.

An explicitly approved **Actions → Create release** run publishes to GitHub,
Pebble and Rebble after verification, then opens a version-only next-snapshot
PR. Review and merge that PR before the next release; automation does not approve,
merge or push main. See [release setup and recovery](docs/releases.md).
Do not dispatch it merely to test a change.

## Translations

Edit the flat UTF-8 objects in `locales/en.json` and `locales/pt_PT.json`.
Keep the same semantic keys in both files. A key such as `menu.favourites`
generates `UI_MENU_FAVOURITES`; use `localization_get(UI_MENU_FAVOURITES)` in C.
Keep keys stable when wording changes. Use lowercase dotted groups and snake_case
words; keys that would generate the same C identifier are rejected.

The build fails on duplicate, missing or extra keys, invalid text and incompatible
printf arguments. Keep placeholder argument order/types (including length modifiers
and `*` width/precision arguments); positional formats and `%n` are unsupported.
In formatted strings, use `%%` for a literal percent. Existing footer formats use
`%d/%d`. Preserve estimate semantics, deliberate spaces/newlines, short buffer
limits, and both screen shapes. Official names, complete legal texts and wire
diagnostics are not translation keys. Known companion errors map to UI keys
inside `localization_diagnostic()`; unknown diagnostics display verbatim.

`locales/index.json` owns locale selection: `en` and `en_US` map to `en.json`,
`pt_PT` maps to `pt_PT.json`, and `fallback` names the default mapping. To add a
language, add a complete translation JSON and register its exact Pebble locale
string here. Multiple locale strings may share one file; the generator emits its
table only once. Use explicit mappings instead of broad language-prefix matching.
Missing, empty and unsupported runtime locales use the configured fallback.
No language-specific changes belong in `main.c`, `localization.c` or the generator.

`npm run build` generates `build/generated/ui_keys.h` and `ui_tables.h` before
compiling either platform. Only `localization.c` includes the private tables;
UI code includes `localization.h`. Never edit or commit the generated headers.
The generator uses only the Python standard library in the existing Pebble build
environment. Run the normal build and emulator checks. Pixel-preserving copy
refactors must pass existing English and Portuguese snapshots without updating them.

### Phone settings copy

The phone editor uses separate flat keyed tables in `src/pkjs/locales/en.json`
and `src/pkjs/locales/pt_PT.json`, selected through the same root locale registry.
Keep keys identical and values nonempty/well-formed; `settings.spec.ts` checks
parity and the page's literal key references. Page code calls `t(key)`, not inline
English/Portuguese string pairs. Official station/line names are not translated.
Phone-only copy is bundled in PKJS, not generated into native C tables, avoiding
unnecessary watch RAM use. The current editor supports English and Portuguese;
new phone languages also need an explicit bundled-table/language mapping.

## Changes

- Keep diffs focused. Avoid new dependencies or abstractions without a current need.
- Preserve fixed watch-memory bounds, strict expiry and source validation. Do not
  turn unavailable data into zero or present saved data as LIVE.
- Keep Portuguese place names, visible text labels and button navigation usable.
- Update docs when behaviour, setup or commands change. Add relevant coverage to
  the existing real-emulator flows rather than introducing another test framework.
- Run E2E without updating snapshots first. For intentional UI changes, run
  `npm run e2e -- --update-snapshots`, inspect every changed image, then rerun
  normally. Never accept a loader/menu frame as an arrivals baseline.
- For protocol, cache or navigation changes, also use
  `npm run e2e -- --repeat-each=2` and inspect memory samples and restart counts.
- Do not commit build products, local credentials, real-device logs or emulator
  reports. Do not change the app UUID casually: it identifies installed data.

## Reporting issues

For bugs, include app version, watch model/firmware, Android/Pebble app versions,
steps to reproduce, and expected/actual behaviour. Say whether you used live or
dev and whether it happens on hardware or an emulator. For feature requests,
describe the problem and a concrete use case before suggesting an implementation.
Redact personal data from screenshots/logs; never attach credentials or phone
storage. Report vulnerabilities through [SECURITY.md](SECURITY.md), not public
issues. Emulator success does not replace physical-watch and battery testing.

Contributions to original project code are under [0BSD](LICENSE), the project's
licence. Third-party licences and UnderLX attribution remain separate.
