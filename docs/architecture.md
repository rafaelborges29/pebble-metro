# Implementation and data boundaries

Target: Android Pebble app + Pebble Time 2 (`emery`), SDK 4.33.1.
Implementation/research: 2026-10-19. Physical-device validation remains pending.

```text
Time 2: Alloy + Poco UI, local expiry and alerts
    ↕ bounded DATA chunks + application receipts
Android: bundled PebbleKit JS inside the Pebble mobile app
    ↕ HTTPS / MQTT over secure WebSocket
UnderLX hosted data sources
```

There are no requests to the homeserver Metro app, no shared runtime, custom
backend, GPS dependency, private Metro credentials or hosted settings page.
Only the SDK bridge and tiny exit/Quiet Time hooks are native C; product logic
and rendering run in Alloy JavaScript.

## Direct sources

- REST base: `https://api.underlx.com/v1`.
- `/stations` and `/lines`: current selectable metadata.
- `/disturbances?filter=ongoing`: current service updates, polled every 30 seconds.
- MQTT broker: `wss://perturbacoes.pt/websocket/`.
- Public WebSocket username `ws`, no password.
- Station topic: `json/vehicleeta/pt-ml/<station-id>/all`.

Exactly pinned `paho-mqtt@1.1.0` owns MQTT framing/keepalive in PKJS. Reconnects
back off from one to 30 seconds. There is one client and at most two station
subscriptions: the viewed station and an armed/visible alert target. Old topics
are unsubscribed. No vehicle-position subscription, map tiles or speculative
provider failover.

REST has a 15-second timeout and one-MiB response bound. Invalid responses and
old HTTP Date/Age headers fail closed. Validated metadata is cached on the phone
and marked cached on fallback. A stale cache must not erase newer watch
favourites. Service errors never imply normal service. Service notices use the
newest status and are paginated one incident at a time using measured font width.
Each notice is capped at 1,200 UTF-8 bytes, and text is shortened further when
needed to keep the entire snapshot below 4,800 bytes. An ellipsis marks shortening.
Service freshness expires after 90 seconds.

## Prediction semantics

`validFor` and relative countdowns have already been aged by UnderLX. Decrement
only from receipt, not from `made` a second time. Separately reject upstream
`made` timestamps at least 120 seconds old or more than 30 seconds in the future.
Remaining validity is bounded to 120 seconds. Unknown/unavailable, malformed and
unsupported estimates replace old predictions rather than refreshing them.

Ranges/bounds retain their uncertainty; minute-based estimates are not exact
second countdowns. Zero is due/at platform. The alert accepts only a fresh,
exact seconds estimate and an observed crossing from above 120 seconds. There
is no stable vehicle identifier, so it is a one-shot next-arrival estimate alert,
not tracking a particular train.

A monotonic feed `generation` records empty/invalid updates, disconnects, lost
first-train directions and expired continuity. Every snapshot carries it. This
survives queue coalescing, so the watch cannot mistake a recovery below two
minutes for a continuously observed threshold crossing.

## Watch/phone protocol

`DATA` is the only application key. Watch commands are bounded JSON objects with
`v:1`, a per-run session and `type`. Commands: `hello`, `watch`, `refresh`,
`catalog` and `ack`.

PKJS first sends an empty DATA probe. Alloy `Message.onWritable` does not fire
until it receives a PKJS message; waiting for a watch hello without this probe
would deadlock startup. The normal session handshake follows immediately.

Phone messages are limited to 5,000 UTF-8 bytes and split into at most 32 chunks
of 500 characters, without splitting surrogate pairs. Metadata validation and
service text budgets leave space for the message envelope. Unrepresentable
arrival snapshots explicitly invalidate the old estimates instead of being
silently dropped:

```text
{v:1, session, id, part, total, text}
```

There is one physical AppMessage in flight. **Physical ACK is insufficient:**
Alloy's native inbox can ACK a packet before JavaScript reads it, and a following
packet can overwrite that unread map. The phone therefore also waits for the
watch's application receipt (`type:ack`, `id`, `part`) before advancing. Missing
receipts retry identical bytes/IDs. Data batches stop after three failures;
hello retries until the session is replaced or the app exits. Queues are bounded
and replace obsolete queued arrivals per station.

The watch rejects foreign sessions, out-of-order/inconsistent chunks and oversized
records, including an independent 5,000-byte UTF-8 accumulation bound. A single
prefix buffer avoids retaining both every chunk and a joined copy in watch RAM.
Reassembly times out after 20 seconds **without progress**, rather than
20 seconds for the whole download. Invalid chunks are not ACKed; consumed
immutable retries are. A missing catalogue is requested again periodically.
Incomplete data never renews an arrival's lifetime.

A hello echoes the watch's send time and includes the phone's send time. The
watch uses `echo - phoneTime` as a conservative clock-offset lower bound. It
translates receipt/expiry and absolute timestamp estimates; outbound latency
shortens, rather than extends, validity. Clock jumps or an interrupted app loop
invalidate the session and require new data.

## Rendering, storage and alert lifecycle

Poco uses system fonts and a fixed 200 × 228 button-first layout. Only numeric
ETAs use Bitham; words, missing estimates and uncertainty use Gothic, avoiding
missing glyphs. Drawing is skipped when content, the displayed minute and any
active loader phase are unchanged. Loading uses three small rectangles at one
hertz on the existing timer, with handshake/metadata/arrival stage labels. It
pauses while unfocused and stops on explicit failure or after 15 seconds per
stage/target; it never replaces stale or unavailable estimates with an endless
spinner. Long station/destination labels are ellipsized; service text is paged.

Favourites, last selection and optional haptic settings persist locally on the
watch. Storage failure is shown and changes remain in memory. Up to 16 valid
ID triples are allowed. Removal needs confirmation. The cache never stores
indefinitely live ETAs.

The watch owns countdown expiry, service freshness and alert crossing history.
It hides captured alert estimates across a gap and reads current validated data,
not an old modal snapshot. Open service pages are also recomputed after failure
or expiry. Focus loss suppresses haptics and clears threshold continuity. Native
`quiet_time_is_active()` is checked immediately before any vibration.

PKJS follows the watch-app lifecycle; no always-running Android service or
server-pushed background alerts are claimed. See [flow rules](design.md).

## Verification and limits

See the README for the exact checks and remaining Android/hardware validation.
The built phone bundle succeeded in actual Chromium against live REST and MQTT.
The SDK 4.33.1 emulator rendered catalogue/favourites and injected fresh real
arrival snapshots; synthetic threshold/invalid-data fixtures exercised its alert
UI. Its Python phone simulator's MQTT connection remains unverified/stalled.
The user subsequently authorized installation through CloudPebble: a physical
Time 2 on firmware 4.41.2 responded to ping, accepted the package, started Android
PKJS and displayed the first-use screen with station metadata. The user confirmed
that live arrivals appeared and updated correctly, and subsequently confirmed
the installed loading-feedback update. Reconnection, backgrounding and
haptics/Quiet Time still need validation. No server deployment has been changed.

## References

- [Alloy](https://developer.repebble.com/guides/alloy/getting-started.md)
- [Poco](https://developer.repebble.com/guides/alloy/poco-guide.md)
- [App messages](https://developer.repebble.com/guides/alloy/app-messages.md)
- [Runtime memory](https://developer.repebble.com/guides/alloy/reference.md)
- [PKJS lifecycle](https://developer.repebble.com/guides/communication/using-pebblekit-js.md)
- [Vibration](https://developer.repebble.com/guides/alloy/vibration.md)
- [UnderLX developer portal](https://developer.underlx.com/)
- [Arrival expiry implementation](https://github.com/underlx/disturbancesmlx/blob/master/mqttgateway/vehicleeta.go)

Transit design references were Pebble Transit (no declared licence, no code
copied) and Toronto Transit Time (MIT). The earlier browser design remains a
mockup, not an emulator or hardware screenshot.
