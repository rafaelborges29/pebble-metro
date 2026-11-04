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
| `appstore/gabbro_seconds.png` | 260×260 | Round 2 second-precision arrivals |
| `appstore/gabbro_arrivals.png` | 260×260 | Round 2 approximate minute estimates |
| `appstore/gabbro_saved.png` | 260×260 | Round 2 saved estimates and tiny train |
| `appstore/gabbro_favourites.png` | 260×260 | Round 2 favourites inside the circular safe area |

All eight screenshots come from the real native PBW and bundled phone JS in
Emery/Gabbro QEMU, using the existing deterministic REST/MQTT fixtures. They are
**emulator captures with example arrival data**, not real-time observations or
physical-watch photos. They are unframed, unscaled PNGs with the clock and train
left intact. Gabbro's black corners are the actual round display mask, not a
watch-frame overlay.
Do not substitute the clock/loader-masked E2E baselines for these store images.

The 0BSD artwork/UI licence does not relicense displayed UnderLX-derived data.
Keep this notice with publicly shared screenshots (in the store description,
README or an accompanying caption):

> Contains information from UnderLX (https://underlx.com/), made available under
> ODbL 1.0 (https://opendatacommons.org/licenses/odbl/1-0/). Arrival values are
> artificial examples, not live observations.

The fixture data, added fictional stations, capture methods and unresolved
access assessment are documented in the
[data scope and access requirements](../DATA_METHODS.md).

## Rebuild icons

The generated PNGs are checked in; ordinary builds/CI do not need an SVG renderer.
To edit the artwork, use `rsvg-convert` from librsvg:

```sh
rsvg-convert -w 80 -h 80 assets/icon.svg -o assets/appstore/icon-small.png
rsvg-convert -w 144 -h 144 assets/icon.svg -o assets/appstore/icon-large.png
rsvg-convert -w 25 -h 25 assets/menu-icon.svg -o resources/images/menu-icon.png
```

The launcher icon must stay at most 25×25. Emery/Gabbro watchapp launcher icons
are non-inverting greyscale; the store icons are independent full-colour images.

## Recapture screenshots

With the normal [E2E prerequisites](../docs/e2e.md) installed:

```sh
npm run assets:screenshots
```

This explicitly builds the current two-platform PBW and runs the existing
cached-reopen flow for each platform with capture enabled. It briefly publishes
second-unit fixture estimates, restores minute-unit fixtures, captures the saved
state before restarting PKJS, and adds a second favourite for the list screen.
Use `npm run assets:screenshots -- --project=gabbro` (or `--project=emery`) to
recapture one watch. It does not touch physical hardware or upload anything.
CLI-compatible filenames start with `emery_` or `gabbro_`.

Normal E2E/CI runs do not overwrite these assets. Captures intentionally retain the
emulator clock, so recapturing can change pixels even without a UI change. Inspect
every image before committing/uploading. The capture command uses a separate test
output directory and list reporter rather than replacing the full-suite report.

Current requirements and the recommended publishing path are in
[Appstore publishing](../docs/appstore.md).
