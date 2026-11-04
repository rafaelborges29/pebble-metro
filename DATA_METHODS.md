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
These published sources and ODbL sections 2.3, 4.2–4.6 were checked on 2026-10-31.

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

## Access requirements for a private-source release

The repository/history and application source remain private. Original software's
0BSD licence does not require source publication. ODbL section 2.3(a) excludes
programs used in making or operating the database; it is not a blanket requirement
to publish this application.

Data obligations remain separate. Under sections 4.4(c) and 4.6, publicly using a
Derivative Database **or a Produced Work from one** requires an offer to its
recipients of either:

- The entire Derivative Database in machine-readable form; or
- A machine-readable file containing all alterations or the method of making them,
  including any additional contents that make up the differences.

Internet delivery must be free. A required offer must cover the actual alterations
and additional contents; it need not automatically include unrelated application
code, UI or the entire test harness. A private GitHub link, attribution alone, or
this prose inventory is not a verified substitute for that offer.

**Release gate — unresolved:** before external distribution, including an Unlisted
beta, record whether these requirements apply to the current client and its
published outputs/screenshots. The app fetches directly from UnderLX, transforms
and caches data on the user's devices, has no custom backend and bundles no full
live dataset. Those facts alone are not a conclusion that section 4.6 cannot apply.
If it applies, prepare a complete, recipient-accessible data/alteration offer
compatible with keeping application source private, or obtain suitable alternative
permission. Do not distribute until the assessment and any required offer are
resolved. Contacting UnderLX is one clarification option, not a per-use permission
step imposed by the published ODbL grant.

No public repository, full application-source ZIP or available methods offer is
promised by this document. Keep the release's source revision, PBW hash and any
required offer associated in private release records. A private GitHub Release or
expiring CI artifact cannot serve as a recipient-facing offer. Retain any required
materials for previously distributed versions. Never upload users' favourites,
personal caches or activity to satisfy these obligations. Reassess when changing
sources, transformations, additional data, public outputs or backend architecture.

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
0BSD. Include any required fixture alterations and additional contents in the
release's data/alteration offer if the access requirements above apply.

Screenshots render that example data, not live observations. Original UI/artwork
rights do not relicense the displayed UnderLX-derived facts. Keep the following
notice with publicly shared screenshots, including the store listing:

> Contains information from UnderLX (https://underlx.com/), made available under
> ODbL 1.0 (https://opendatacommons.org/licenses/odbl/1-0/). Arrival values shown in
> emulator screenshots are artificial examples, not live observations.

See [asset provenance](assets/README.md) and the
[release checklist](docs/publishing-todo.md) for distribution checks.
