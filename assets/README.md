# App artwork and store screenshots

Original geometric train artwork, covered by the project's [0BSD licence](../LICENSE).
It is not Metro de Lisboa's logo. No third-party artwork or fonts are embedded.

## Files

| File | Dimensions | Purpose |
| --- | --- | --- |
| `icon.svg` | 144×144 viewBox | Editable colour master |
| `menu-icon.svg` | 25×25 viewBox | Editable monochrome launcher master |
| `appstore/icon-small.png` | 80×80 | Small appstore icon |
| `appstore/icon-large.png` | 144×144 | Large appstore icon |
| `../resources/images/menu-icon.png` | 25×25 | Actual watch launcher icon, included in the PBW |
| `appstore/emery_seconds.png` | 200×228 | Second-precision arrivals; suggested first screenshot |
| `appstore/emery_arrivals.png` | 200×228 | Approximate minute-only estimates |
| `appstore/emery_saved.png` | 200×228 | Saved estimates and native train loader |
| `appstore/emery_favourites.png` | 200×228 | Two favourites and management controls |

All four screenshots come from the real native PBW and bundled phone JS in Emery
QEMU, using the existing deterministic REST/MQTT fixtures. They are **emulator
captures with example arrival data**, not real-time observations or physical-watch
photos. They are unframed, unscaled PNGs with the clock and train left intact.
Do not substitute the clock/loader-masked E2E baselines for these store images.

## Rebuild icons

The generated PNGs are checked in; ordinary builds/CI do not need an SVG renderer.
To edit the artwork, use `rsvg-convert` from librsvg:

```sh
rsvg-convert -w 80 -h 80 assets/icon.svg -o assets/appstore/icon-small.png
rsvg-convert -w 144 -h 144 assets/icon.svg -o assets/appstore/icon-large.png
rsvg-convert -w 25 -h 25 assets/menu-icon.svg -o resources/images/menu-icon.png
```

The launcher icon must stay at most 25×25. Emery watchapp launcher icons are
non-inverting greyscale; the store icons are independent full-colour images.

## Recapture screenshots

With the normal [E2E prerequisites](../docs/e2e.md) installed:

```sh
npm run assets:screenshots
```

This explicitly builds the current PBW and runs the existing cached-reopen flow
with capture enabled. It briefly publishes second-unit fixture estimates, restores
minute-unit fixtures, captures the saved state before restarting PKJS, and adds a
second favourite for the list screen. It does not touch a physical watch or upload
anything. The CLI-compatible filenames start with `emery_`.

Normal E2E/CI runs do not overwrite these assets. Captures intentionally retain the
emulator clock, so recapturing can change pixels even without a UI change. Inspect
every image before committing/uploading. The capture command uses a separate test
output directory and list reporter rather than replacing the full-suite report.

Current requirements and the recommended publishing path are in
[Appstore publishing](../docs/appstore.md).
