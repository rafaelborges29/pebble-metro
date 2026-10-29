# Contributing

Keep the app small, predictable and arrivals-focused. The supported target is
Pebble Time 2 (`emery`) with Android, SDK 4.33.1 and Node 24.21.0.
See [README](README.md) for setup and [architecture](docs/architecture.md) for the
model, protocol and storage boundaries.

## Local checks

```sh
npm ci
npx playwright install chromium
npm run typecheck
npm run check
npm run e2e
```

The emulator harness needs the Pebble tool and its Python `libpebble2` dependency.
The tested versions and Linux system packages are pinned in
[CI](.github/workflows/e2e.yml); interpreter overrides are documented in
[E2E](docs/e2e.md).

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
