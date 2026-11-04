# UnderLX data, attribution and transformation methods

Contains information from [UnderLX](https://underlx.com/), made available under the
[Open Database Licence 1.0 (ODbL)](https://opendatacommons.org/licenses/odbl/1-0/)
unless the provider indicates otherwise. The complete licence is included in
[`LICENSES/ODbL-1.0.txt`](LICENSES/ODbL-1.0.txt).

## Scope and upstream terms

The [UnderLX developer portal](https://developer.underlx.com/#dados-abertos)
states that its API data is ODbL 1.0 unless otherwise indicated. Its
[service terms](https://underlx.com/terms) distinguish data, software and branding;
some station/route facts are described as public domain. This project does not
rely on that exception to remove the ODbL notice from its data adaptations.
These published sources and ODbL sections 1.0, 2.3, 3.1, 4.2–4.6 and 6.2 were
rechecked on 2026-11-04.

UnderLX-derived data and this project's adaptations of that data are made
available under ODbL 1.0, not the project's software licence. This includes the
normalized catalogue, compact watch catalogue, retained route labels and arrival
snapshots. Preserve the source/licence notices when redistributing these data.
No additional restriction on reuse of those data is imposed by this project.
Other rights in individual contents and any provider-specific exceptions remain
separate; recheck them when adding a source or new kinds of content.

Original application/test code, UI and train artwork remain under
[0BSD](LICENSE). ODbL does not license the programs operating on a database.
UnderLX's own software is separately Apache-2.0-licensed; this app consumes its
published data endpoints rather than incorporating that software. Neither the
data licence nor 0BSD grants rights to UnderLX or Metro de Lisboa branding.
The app is independent and does not claim either organization's endorsement.

## Current private-client release assessment

This is the maintainer's case-specific assessment, checked on 2026-11-04, not legal
certification or an endorsement from UnderLX. The repository/history and application
source remain private. Original software's 0BSD licence does not require source
publication; ODbL section 2.3(a) excludes database-operating programs. Section 3.1
already grants licensed use, including commercial use, subject to its conditions:
individual permission is not a routine prerequisite for every API client.

### Facts checked for this release

- The PBW contains software, original artwork and licence notices, not a bundled
  UnderLX catalogue or arrival database. `wscript` bundles `src/`, not the test
  fixtures; the emitted phone bundle/source map was checked against that scope.
- `src/pkjs/rest.js` and `feed.js` fetch directly from UnderLX. The application
  publisher does not host or distribute a processed database/feed. Normalization,
  filtering and caching occur on each user's phone and paired watch; their local
  snapshots are not uploaded to the publisher or published as a shared dataset.
- The prepared store screenshots come from the default three-station, one-line
  fixture (Aeroporto, Saldanha and São Sebastião / Vermelha), not the stress-test
  network or a live arrival archive. All shown arrival values are artificial.
  The fixture/harness itself remains private and is not shipped in the PBW.
- UnderLX's terms describe station/route facts as public domain. This does not by
  itself waive rights in a substantial database extraction: ODbL distinguishes
  contents from database rights and assesses substantiality by quantity/quality.
  Considering the limited example facts and artificial estimates actually used,
  this assessment does not identify the prepared images as publication of a
  substantial adapted UnderLX database. Attribution is retained nevertheless.

### Outcome and retained obligations

For this software-only direct-client release and these example images, **no
additional public database/alteration-method download or individual UnderLX
permission is identified as a prerequisite**. This is not a conclusion that
attribution always suffices for any ODbL application. The assessment concerns the
publisher's current release,
not every possible later redistribution of a user's data.

Keep the UnderLX/ODbL attribution and provider/licence URLs in About and the store
description, preserve ODbL for data adaptations, supply complete applicable licence
copies in the PBW, and disclose that screenshot estimates are artificial. Do not
apply additional restrictions to UnderLX-derived data. Normal publisher/agreement,
privacy, version, package and explicit submission-approval checks still apply.
No public application-source ZIP, GitHub history or methods offer is promised.

### When this assessment must be revisited

Reassess before bundling/exporting a catalogue or live snapshots, serving processed
data from a backend, publishing the fixture/data itself, or replacing these small
example images with substantial real-data outputs. Changes to sources, additional
contents or upstream terms also require review. Do not assume software exclusion,
local caching, public-domain facts or absence of a backend is a universal exemption.

If a changed release publicly uses a Derivative Database **or a Produced Work from
one**, sections 4.4(c)/4.6 can require a complete machine-readable database or a
file containing all alterations/the method of making them, including additional
contents. Internet delivery must be free. An applicable offer must actually reach
recipients; a private repository, expiring CI artifact or this prose is not a
substitute. It need not automatically publish unrelated application code or the
entire test harness. Never expose users' personal caches or activity to fulfil it.
Keep any such offer associated with its exact version and retain required prior
materials. Contacting UnderLX remains an optional clarification route, not a
mandatory permission email for the release assessed above.

## Inputs and alterations

The implementation links below are maintainer references inside the private
repository, not recipient-facing access links.

| Stage | Input and alterations | Implementation reference |
| --- | --- | --- |
| Metadata input | Fetch station and line JSON from `https://api.underlx.com/v1/stations` and `https://api.underlx.com/v1/lines`. No full live dataset is checked into the repository or bundled in the PBW. | [`src/pkjs/rest.js`](src/pkjs/rest.js) |
| Normalized catalogue | Select the `pt-ml` network, retain IDs/names/served lines/colours/ordered station paths, validate bounds and reciprocal membership, prefix colours with `#`, and sort stations by name. | `parseNetwork()` in [`src/common/metro.js`](src/common/metro.js) |
| Phone cache and compact catalogue | Cache the normalized network locally. Encode station/line records as arrays, line membership as bitmasks and paths as station indices; do not add a new transport network. | `cachedNetwork()`, `catalog()` and `loadMetadata()` in [`src/pkjs/companion.js`](src/pkjs/companion.js) |
| Arrival input | Subscribe to `json/vehicleeta/pt-ml/<station-id>/all` over `wss://perturbacoes.pt/websocket/`, only for the selected station. Decode the station's prediction snapshot; malformed/empty updates invalidate estimates. | [`src/pkjs/feed.js`](src/pkjs/feed.js) |
| Validated predictions | Retain direction/order/type/units/value and interval bounds. Deduplicate direction/order pairs; add local receipt/expiry fields. Use source age as a staleness bound, cap validity at 120 seconds, and do not age already-aged source values twice. | `parsePredictions()`, `validValue()` and `expiresAt()` in [`src/common/metro.js`](src/common/metro.js) |
| Transport | Serialize bounded JSON, split into chunks and acknowledge delivery. Session/generation fields protect ordering and invalidate estimates across feed gaps; they do not identify vehicles or create new source observations. | [`src/pkjs/transport.js`](src/pkjs/transport.js), [`src/pkjs/companion.js`](src/pkjs/companion.js), `receive_packet()` in [`src/c/main.c`](src/c/main.c) |
| Watch model and labels | Independently validate inputs, decode membership/indices, select station/line/direction favourites and keep at most three predictions per route. Shorten display labels at UTF-8 boundaries; convert colours to native display colours. | `receive_catalog()`, `receive_arrivals()`, `read_prediction()`, `copy_label()` and `labels_for()` in [`src/c/main.c`](src/c/main.c) |
| Time and rendering | Map phone timestamps to the watch clock, conservatively round receipt/expiry times, subtract elapsed time without renewing validity, format ranges/bounds/approximate minutes/source-supplied seconds, and show zero as `Due` / `Estimated now`, not observed presence. | `logical_message()`, `read_prediction()`, `prediction_valid()` and `arrival_label()` in [`src/c/main.c`](src/c/main.c) |
| Watch persistence | Persist two recent route snapshots and short labels; other valid snapshots remain RAM-only. Preserve original expiry, use serial-matched records, invalidate on gaps/empty data, and mark restored estimates SAVED. | `load_preferences()`, `persist_cache()`, `invalidate_disk()` and `invalidate_arrivals()` in [`src/c/main.c`](src/c/main.c) |

The source revision is authoritative for exact validation, mappings, bounds and
failure handling. It includes the JSON decoder and all helpers used by these
methods. This inventory is not an offer of application source, an archived UnderLX
feed or a historical database. Live source responses can change or expire.

## Test data and screenshots

[`e2e/metro-fixture.ts`](e2e/metro-fixture.ts) includes a small base catalogue with
UnderLX-derived station/line names, IDs and route facts. Additional stress-test
stations/lines and every injected arrival estimate are artificial. Treat the
fixture data and its additions as ODbL 1.0 data; the test harness code remains
0BSD. The assessment above covers the prepared example screenshots, not public
redistribution of the fixture/database itself. Reassess access obligations before
publishing that data or substantially different outputs.

Screenshots render that example data, not live observations. Original UI/artwork
rights do not relicense the displayed UnderLX-derived facts. Keep the following
notice with publicly shared screenshots, including the store listing:

> Contains information from UnderLX (https://underlx.com/), made available under
> ODbL 1.0 (https://opendatacommons.org/licenses/odbl/1-0/). Arrival values shown in
> emulator screenshots are artificial examples, not live observations.

See [asset provenance](assets/README.md) and the
[release checklist](docs/publishing-todo.md) for distribution checks.
