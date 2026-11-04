# Native implementation and data boundaries

Targets: Pebble Time 2 (`emery`, 200×228) and Pebble Round 2 (`gabbro`, 260×260),
Android Pebble app, SDK 4.33.1. The original Time Round (`chalk`) is not targeted.
The watch is native C. Only the phone companion is JavaScript.

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

There are no alerts, vibration, disturbances, settings page, custom backend,
background worker or watch-side JS runtime. No GPS or private Metro credentials.

## Native memory design

All catalogue, favourite, ETA, token and transport storage is statically bounded:

- 80 stations and eight lines, represented with IDs and station indices/line masks.
- Station IDs up to 48 ASCII bytes; input station/line names validated at their
  full 240/120 UTF-8 byte bounds, then display labels safely truncated to 80/40
  UTF-8 bytes. Native text drawing ellipsizes at the actual screen width.
- 16 favourites, each with at most three fixed-size predictions.
- Two small persisted recent-route snapshots, not a second full catalogue/model.
- One 5,000-byte reassembly prefix, a 2,000-byte decoded chunk scratch buffer,
  1,024 caller-owned JSON tokens, 4,096-byte AppMessage inbox and 1,024-byte outbox.
- One window/layer. Menus draw at most four rows and have no per-row callbacks,
  dynamic object trees or per-navigation allocations.

The native SDK RAM report now includes application code and static data. Runtime
`heap_bytes_used()` / `heap_bytes_free()` samples are logged at startup, catalogue
replacement and periodically during favourite switching. Emulator stress checks
exercise the full favourite limit and repeated switches with source updates.
There is no interpreter or separately loaded JS archive. The per-app budget is
128 KiB, regardless of how many other apps are installed. Fixed buffers and direct
rendering avoid the memory exhaustion seen in the earlier JS-based prototype.

Each native target uses approximately **61 KiB code/static RAM**, leaving about
**61 KiB free native heap** after UI/messages in emulator button-regression runs. The stress tests
check both platforms independently for headroom and switch-sample growth. Each
watch binary plus resources is approximately **31 KiB**. The PBW contains both
watch binaries but only one phone bundle/source map. Complete licence/notices
copies are embedded as a comment in that phone bundle, not as watch resources.
Rebuilds can change size/hash; these are emulator measurements, not physical-watch
heap or battery acceptance.

The drawing layer uses the actual window bounds. Time 2 retains its rectangular
layout. Round 2 centers text and measured ETA/unit groups, places the header and
footer inside the circular safe area, and increases the last menu row's insets.
Both keep four visible menu rows and the same buttons/model/storage/protocol.
The loader remains on the existing one-second tick; no round-specific object tree,
framebuffer or animation timer is allocated by the app. About / data displays the
provider, ODbL and full provider/licence URLs in a compact font, with long URLs
wrapped across lines on both shapes. Privacy points to the store description and
licence copies to the phone bundle; no private repository link is advertised.

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
`catalog` and `ack`. IDs/sessions are validated ASCII before serialization.
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
{type:"catalog", cached:boolean,
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

Native favourite records use independent integer-keyed Pebble persistence entries;
removing one does not rewrite or reindex every other favourite. Write failures are
reported and an unsaved add/remove is not presented as successful. Selected slot
is persisted separately. Each value is at most 256 bytes.

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
The cache stores no service state or alert continuity. Favourites plus both cache
slots use approximately 3.2 KiB of value payloads at the 16-favourite limit. The
actual firmware persistence limit is queried/documented by `persist_get_max_size()`;
all writes are checked, rather than assuming global watch storage is available.
