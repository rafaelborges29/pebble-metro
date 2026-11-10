# Native implementation and data boundaries

Targets: Pebble Time 2 (`emery`, 200×228) and Pebble Round 2 (`gabbro`, 260×260),
Android Pebble app, SDK 4.33.1. The original Time Round (`chalk`) is not targeted.
The watch is native C. The phone companion, editor and shared validation are strict
TypeScript, compiled to JavaScript for PebbleKit JS.

```text
Time 2 / Round 2: one native window + drawing layer, fixed-size model and persistence
    ↕ DATA JSON chunks + application receipts
Android: bundled PebbleKit JS inside the Pebble mobile app
    ↕ HTTPS station/line catalogue + MQTT over secure WebSocket
UnderLX hosted sources
```

UnderLX-derived data and its adaptations retain ODbL 1.0; original software is
0BSD. [DATA_METHODS.md](../DATA_METHODS.md) documents the exact inputs, alterations,
fixture additions and the case-specific private-client release assessment.

There are no alerts, vibration, disturbances, custom backend, background worker
or watch-side JS runtime. No GPS or private Metro credentials. A self-contained
[phone favourites editor](phone-configuration.md) uses the Pebble app's standard
configuration WebView plus its live local message bridge (Plugins / permissions
preview required). There is no hosted page, additional plugin or new network provider.

## Phone compilation and types

The root `tsconfig.json` is discoverable by editors and checks production
phone/shared sources independently of the E2E harness: strict null/unknown handling, indexed access and optional properties,
without ambient Node globals. SDK builds compile ES2015/CommonJS into
`build/phone/` before webpack 1 runs, with tracked TS/JSON/config/lockfile inputs
and declared generated outputs. Type errors stop the build before packaging.
`src/pkjs/bootstrap.cjs` preserves SDK CommonJS compatibility and bundled notices;
there is no custom ESM loader, new dependency or TypeScript runtime in the PBW.

`src/common/types.ts` describes catalogues, favourites, prediction variants and
watch/settings messages. `src/pkjs/platform.ts` describes the injected bridge,
MQTT, storage, request and timer edges. External JSON remains `unknown` until
runtime validation; compile-time contracts do not replace either phone or native
validation. The page's serialized client imports types only: no runtime imports,
module captures or compiler helpers may enter that self-contained function.

## Native memory design

All catalogue, favourite, ETA, token and transport capacities are fixed:

- 80 stations and eight lines, represented with IDs and station indices/line masks.
- Station IDs up to 48 ASCII bytes; input station/line names validated at their
  full 240/120 UTF-8 byte bounds, then display labels safely truncated to 80/40
  UTF-8 bytes. Native text drawing ellipsizes at the actual screen width.
- 16 favourites, each with at most three fixed-size predictions, plus one fixed
  16-route staging array for whole-list validation/commit.
- Two small persisted recent-route snapshots, not a second full catalogue/model.
- One 5,000-byte reassembly prefix, a 2,000-byte decoded chunk scratch buffer,
  1,024 JSON tokens, 4,096-byte AppMessage inbox and 1,024-byte outbox. The token
  buffer is allocated once at startup with checked failure/exit and freed on
  shutdown; this preserves capacity while keeping the SDK's uint16 virtual image
  below 64 KiB. Parsing/navigation never allocate model or token storage.
- One window/layer. Menus draw at most four rows and have no per-row callbacks,
  dynamic object trees or per-navigation allocations.

The native SDK RAM report now includes application code and static data. Runtime
`heap_bytes_used()` / `heap_bytes_free()` samples are logged at startup, catalogue
replacement and periodically during favourite switching. Emulator stress checks
exercise the full favourite limit and repeated switches with source updates.
There is no interpreter or separately loaded JS archive. The per-app budget is
128 KiB, regardless of how many other apps are installed. Fixed buffers and direct
rendering avoid the memory exhaustion seen in the earlier JS-based prototype.

[Emulator checks](e2e.md#memory-and-crash-diagnosis) enforce at least 50 KiB free
heap, at most 4 KiB steady-state variation and expected app-start counts on both
targets. These are sampled emulator checks, not hardware/battery acceptance.
The PBW contains both watch binaries and one phone bundle/source map. Complete
licence copies are embedded in that bundle, not watch resources.

The drawing layer uses the actual window bounds. Time 2 retains its rectangular
layout. Round 2 centers text and measured ETA/unit groups, places the header and
footer inside the circular safe area, and increases the last menu row's insets.
Both keep four visible menu rows and the same buttons/model/storage/protocol.
The loader remains on the existing one-second tick; no round-specific object tree,
framebuffer or animation timer is allocated by the app. The favourites menu ends
with Add favourite and Retry data; there is no About screen or on-watch version.
Attribution and privacy information are supplied in the store description, and
complete licence copies are embedded in the phone bundle.

### Touch input

On `PBL_TOUCH` targets with firmware 4.33.2+, the window owns one SDK tap recognizer
and one swipe recognizer, created once with allocation-failure fallback to buttons.
Older 4.33 firmware has a recognizer-enabling crash; the runtime version guard
leaves touch off there. The system button-emulation bridge is disabled for this
custom window to avoid duplicate actions. Every physical-button binding remains.

Touch row hit testing shares the renderer's four-row geometry and excludes the
header/footer and invisible round corners. Recognized completions reuse `select()`,
`move()` and `back()`; they never synthesize clicks or duplicate model/cache logic.
A small raw-touch observer latches a navigational touchdown and its row. Actions,
button navigation and catalogue replacement invalidate that contact, so a release
cannot activate a new target or confirm deletion on the same contact. Focus and
window visibility control the raw subscription; owned recognizers are released
with the window. No per-gesture allocation, new timer or phone/protocol change is
introduced. See the official [Touch guide](https://developer.repebble.com/guides/events-and-services/touch/)
and [4.33.1 hotfix notes](https://developer.repebble.com/sdk/changelogs/4.33.1/).

## Sources and validation

- REST: `https://api.underlx.com/v1/stations` and `/lines`.
- MQTT: `wss://perturbacoes.pt/websocket/`, public username `ws`, no password.
- Selected station topic: `json/vehicleeta/pt-ml/<station-id>/all`.

The existing pinned Paho client handles MQTT framing/keepalive. Reconnect backoff
is one to 30 seconds. Only the selected station is subscribed; there is no armed
secondary route and no service-status polling.

REST requests have a 15-second timeout, a one-MiB bound, and old Date/Age headers
fail closed. Validated metadata is cached on the phone and refreshed quietly.
Missing/cached metadata retries after 30 seconds. Recovery resends the actual
feed state so an obsolete metadata failure does not stick. MQTT payloads over
65,536 bytes are rejected before string decoding; WebSocket/Paho frame buffering
is outside that application-level limit.

The phone retains the original prediction semantics: age relative estimates only
from receipt, not from `made` again; independently reject `made` at least 120
seconds old or more than 30 seconds in the future. `validFor` is capped at 120
seconds and bounded by source age. Empty/malformed snapshots invalidate previous
data. Ranges/bounds and minute-only uncertainty are not converted into exact
seconds. There is no stable vehicle identifier or train-tracking claim.

The native receiver independently validates finite values, types, units, orders,
receipt/expiry bounds, timestamps, source ordering and selected route IDs. Watch
receipt times are conservatively rounded down to seconds; expiry is shortened,
never extended. Closed time is counted. Absolute timestamps are translated with
the handshake offset. Zero is `Due` / `Estimated now`, not observed presence.

## Watch/phone protocol

Watch commands remain bounded JSON `{v:1,session,type,...}` with `hello`, `watch`,
`catalog`, `ack` and four-part `settings-state` exports. IDs/sessions are validated
ASCII before serialization. Settings snapshot/result receipts and saves use the
existing phone-to-watch chunk transport; see [configuration protocol](phone-configuration.md).
The open page calls `Pebble.sendMessage("pkjs", ...)`; PKJS handles `configmessage`
and replies only after a complete watch result. Add and confirmed Remove autosave;
no favourite choices pass through a close URL. Watch views remain quiet on both
success and failure; existing storage/cache error indicators are not suppressed.
One native outbox send is active; pending flags are consumed on successful queueing,
not at the later callback, so rapid favourite changes cannot be lost. A fresh phone
runtime sends the startup wake `{}`. Native starts a new session (invalidating old
ETAs if already running), even if the physical app connection never dropped.

The phone answers hello first: `{type:"hello",echo:<watch-send-ms>,at:<phone-ms>}`.
The watch's `echo - at` is a conservative clock-offset lower bound. Retry creates
a new session/offset. Clock discontinuities invalidate estimates. The header clock
uses the watch's local time; this does not affect Unix-time ETA arithmetic.

Compact catalogue:

```text
{type:"catalog", cached:boolean, catalogId:uint32,
 stations:[[id,name,lineMask],...],
 lines:[[id,name,"#rrggbb",[stationIndex,...]],...]}
```

The complete catalogue is validated before replacing the old arrays: capacities,
duplicate IDs, path indices, line masks, colours and reciprocal membership.
A cached phone catalogue never deletes watch favourites. A fresh catalogue may
invalidate estimates for directions no longer served, but saved IDs remain until
the user removes them.

Arrival messages retain the validated object format with station, `at` and up to
64 bounded source predictions. Native storage keeps only matching favourite
triples and at most three ordered estimates per route. No alert state or service
notices are sent. Connection and arrival messages carry a phone-owned uint32
`generation`: initially zero, incremented on connection failure. A changed or first
nonzero generation invalidates every route's RAM/durable ETAs before applying data.
Thus coalescing a disconnect into a later connected message cannot silently retain
another station's stale cache. The same barrier covers a transport queue eviction
or exhausted retry that loses a required station invalidation. This is a cache
continuity barrier, not vehicle tracking.

Phone payloads are UTF-8-bounded to 5,000 bytes and split into up to 32 chunks of
500 JS characters, without splitting surrogate pairs:

```text
{v:1,session,id,part,total,text}
```

The phone waits for the watch's application receipt for each chunk, not just the
physical ACK. Retries preserve bytes/IDs and are bounded per ordinary batch.
Empty snapshots carry a sticky invalidation obligation through coalescing and
station pruning: a newer nonempty replacement must also reach the watch. The
phone queue stays bounded at eight pending batches. If eviction/exhausted retries
lose an obligation, the companion advances its generation and queues a protected
connection barrier after older snapshots; losing that barrier reannounces it.
Normal station-specific invalidations do not clear unrelated saved routes.
The watch rejects foreign
sessions, inconsistent/out-of-order chunks, mismatched retries and oversized
prefixes. Reassembly expires after 20 seconds without progress. Partial messages
never renew an ETA.

`json.c` uses no heap allocation or recursive parsing. It limits nesting to 16,
checks strict UTF-8, escaped surrogate pairs, JSON number grammar and token/input
capacities, and rejects embedded NUL. Object lookup rejects duplicate matching keys.

## Persistence and reopen

`favorites.c` stages the complete favourite list in the inactive one of two
16-record banks (keys `310..341`), checks each write/read, and publishes its
checksummed generation commit last (keys `300..301`). Boot chooses the newest
valid complete bank, including across generation rollover; partial staging cannot
replace the active list. A commit readback failure locks mutations until reload
and reports an unknown outcome, not a guaranteed rollback. All values remain below
256 bytes. Selected slot stays independently persisted at key `1` and is validated
against the loaded list.

Legacy native keys `100..115` are seeded unchanged into the first bank. Only after
that bank and the migration seal at key `302` are verified can mutations proceed
or legacy cleanup occur. An interrupted seed can reload legacy data; a sealed
migration with corrupt banks cannot resurrect deleted legacy choices. Cleanup is
best effort; the previous bank is a recovery copy, not secure deletion. No uninstall,
UUID change or cache expiry reset is part of migration. Older app versions cannot
read the new banks; downgrading/reconciling edits from a downgrade is unsupported.

Two recent-route entries store full route IDs, original prediction receipt/expiry,
a saved-at timestamp and a serial. Short labels are in a second serial-matched
entry. Before updating a snapshot, its commit entry is deleted, labels are written,
then the commit is written last. A torn write cannot pair new labels with old ETAs.
A future saved-at value or expired/invalid prediction is not restored as an ETA.

Writes coalesce to 15 seconds and flush before switching/normal exit/focus loss.
Selecting a valid RAM-only route makes it eligible for the next flush, without
renewing its original timestamps. Invalidations immediately attempt to remove ETAs,
even for an unselected route; short labels can remain in zero-prediction records.
Failed deletions retain durable tracking and retry once per second or on forced
flush. Persistent firmware storage failure can prevent an invalidation being made
durable and is shown as an error. A saved value never becomes live just because it
was restored.
The cache stores no service state or alert continuity. Two favourite banks use
4,736 bytes plus small commit/seal values; both arrival-cache slots remain separate.
Initial migration additionally retains the legacy list until its seed/seal are
verified. The actual firmware persistence limit is queried/logged by
`persist_get_max_size()`; all writes are checked instead of assuming free storage.
No cache/favourite data is evicted to make a failed bank write fit.

## UI language

Flat `locales/en.json` and `locales/pt_PT.json` hold the UI copy under stable
semantic keys. `locales/index.json` maps exact Pebble locale strings to these files
and names the fallback locale. Aliases share one generated table. A dependency-free
Python Waf task validates the registry, keys and format arguments and generates
`build/generated/ui_keys.h` plus private `ui_tables.h` before either target compiles.
The JSON files and generated data are isolated from the UI implementation.

`localization_get(UI_MENU_FAVOURITES)` reads the current SDK locale and looks it up
in the generated registry. Currently `pt_PT` selects Portuguese, `en`/`en_US`
select English, and null/empty/unsupported values use the configured English
fallback. There is no language-specific branching in C. The allocation-free
`src/c/localization.c` module owns lookup, fallback and known diagnostic mappings;
`main.c` only requests text by key. Invalid keys return empty text rather than
indexing outside the table. Each lookup reads the current locale, so retained
notice/error keys follow language changes on the next redraw.

Phone-only copy lives in `src/pkjs/locales/*.json` under semantic keys. The same
root locale registry chooses its bundled table; phone copy never enlarges native
C tables. The page has no inline English/Portuguese copy branches.

Incoming companion diagnostics retain their raw text and existing bounds:
`localization_diagnostic()` maps known wire strings to keys, with verbatim fallback
for unknown errors. Official source labels bypass translation. Protocol,
companion, persistence, expiry, UUID, fonts and layout are unchanged. See
[translation instructions](../CONTRIBUTING.md#translations).

The [SDK internationalization guide](https://developer.repebble.com/guides/tools-and-resources/internationalization/)
documents `pt_PT` and system-font language support. Text uses the existing Gothic
system fonts; numeric countdowns use the LECO/Roboto/Bitham size fallback from
the arrival layout. Portuguese accents are checked
in real emulator frames on both targets. Hardware language selection/font packs
remain a physical-watch acceptance item; see [test limitations](e2e.md).
