# Contributing

Keep the app small, predictable and arrivals-focused. The supported target is
Pebble Time 2 (`emery`) and Pebble Round 2 (`gabbro`) with Android, SDK 4.33.1
and Node 24.21.0.
See [README](README.md) for setup and [architecture](docs/architecture.md) for the
model, protocol and storage boundaries.

## Local checks

```sh
npm ci
npx playwright install chromium
python3 -m unittest discover -s tools
python3 tools/release.py check
npm run typecheck
npm run check
npm run e2e
```

E2E runs both platform projects. Use `npm run e2e -- --project=gabbro` (or
`--project=emery`) for a focused run. New Round 2 baselines live under
`e2e/screenshots/gabbro/`; the existing Time 2 baselines remain at the root.

The emulator harness needs the Pebble tool and its Python `libpebble2` dependency.
The tested versions and Linux system packages are pinned in
[the shared CI setup](.github/actions/setup-pebble/action.yml); interpreter overrides are documented in
[E2E](docs/e2e.md).

## Versions and releases

Main carries the next `major.minor.0-snapshot` version. Keep `package.json` and both
root lockfile version fields aligned. The build preserves that development label
while Pebble's native binary uses numeric major/minor. Do not publish snapshot PBWs.

Use **Actions → Create release** with **minor** or **major** to prepare and publish
a tested release. This action creates a release branch/tag, publishes the same PBW
to GitHub and Pebble after checks, then opens the next-snapshot PR. It does not need
a second approval; merge the next-snapshot PR before the following release.
See [release setup, verification and recovery](docs/releases.md). The Python test
suite covers versioning, PBW validation and publication failures without uploading.

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
The generator uses only the Python standard library in the existing Pebble build environment. Run
`python3 -m unittest discover -s tools` for generator validation checks, then the
normal build and emulator checks. Pixel-preserving copy refactors must pass existing
English and Portuguese snapshots without updating them.

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

For bug reports, include the app version, watch model/firmware, Android/Pebble app
versions and steps to reproduce. Redact personal data from screenshots and logs.
Emulator success does not replace physical-watch and battery testing.

Contributions to original project code are under [0BSD](LICENSE), the project's
licence. Third-party licences and UnderLX attribution remain separate.
