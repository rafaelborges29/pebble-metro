# Phone favourites configuration: recommendation

**Status: proposed design, not implemented.** Research for [issue #7](https://github.com/rafaelborges29/pebble-metro/issues/7).
No capability, application behaviour, hosting or repository visibility changes are
included. Implementation and physical-watch installation require separate approval.

## Recommendation

Feasible through the Pebble Android app's existing Settings action. Bundle a small,
self-contained HTML form in the phone companion and open it as a `data:` URI using
standard PebbleKit JS configuration events. **No public website, custom backend,
account or new dependency is needed for the recommended approach.** Keep the watch
as the durable owner, require a connected/running watch for editing, and complement
rather than replace the on-watch picker from [completed issue #6](https://github.com/rafaelborges29/pebble-metro/issues/6).

The substantial work is safe favourites synchronisation and persistence, not showing
a settings form. Do not ship a page that treats Bluetooth delivery as a saved edit.
Android feasibility is supported by source inspection, **not yet verified on our
installed phone/watch combination**. Validate that combination before feature work.

## Platform evidence and alternatives

The SDK documents `pebble.capabilities: ["configurable"]`, `showConfiguration`,
`Pebble.openURL()` and `webviewclosed` [1, 2, 3]. In the inspected Android source
(tag `1.17.0.1`, commit `89f31dca3fd344ae9923fe9ca2f27b0f1f8a0230`):

- The installed app's **Settings** action checks configurability, requires a
  connected watch, and launches the watchapp if its PKJS session is not running [4].
  This is not a standalone phone editor while the watch is absent.
- PKJS requests the URL through `showConfiguration`, with a ten-second URL timeout
  [5]. Do not wait indefinitely for a catalogue or favourites export before opening.
- The settings WebView explicitly accommodates large `data:` HTML URLs, intercepts
  `pebblejs://close#...`, URL-decodes the response and forwards it to PKJS [6].
  The SDK's older manual example instead decodes in PKJS [2]: accept JSON directly
  or decode once if necessary, with bounded parsing and no double-decoding.

The SDK recommends Clay for general settings [1]. Clay generates percent-encoded
`data:text/html;charset=utf-8,` URLs, demonstrating that a local page does not require
hosting [7]. We can use the same platform mechanism with native HTML controls.
Clay is not installed; dependent pickers, a route list and our commit protocol would
still need custom logic. Its default storage/send handlers are not watch-authoritative.
Do not add it just to open HTML, or copy its old emulator HTTP proxy.

An HTTPS-hosted page is an alternative, not a prerequisite: it introduces hosting
availability, public HTML/JS, server connection logs and a remotely changeable editor.
Do not publish one as a fallback without review. Newer config-page bridges/bundled
`configPage` metadata also exist upstream, but the conventional event/close flow
avoids depending on plugin settings or a new mobile API. No custom Android app.

## Proposed UX

- Open **Metro Lisboa → Settings** in the Pebble Android app. Explain that Metro
  must remain running on the connected watch until the result is confirmed.
- Show the complete watch-confirmed favourites list and `n / 16`. Add through
  **Line → Station → Direction**: named lines (not colour alone), alphabetically
  filtered stations, reachable line termini excluding the origin. Keep the line
  chosen at an interchange. Use labelled native selects/buttons, readable focus
  and error states, and English/Portuguese copy; no language preference is added.
- Add/remove only in a local draft; confirm removal and especially an empty list.
  An exact duplicate triple selects the existing draft item instead of consuming
  another slot; opposite directions are distinct. Disable Add at 16. No drag/reorder
  feature: retain surviving watch slots and put new routes in free slots.
- **Cancel** or Android Back changes nothing. **Send to watch** returns the draft
  via `pebblejs://close#` plus percent-encoded JSON. Closing the page is submission,
  not proof of saving. Show success/error on the watch without vibration, and the
  last known result plus freshly read list on the next Settings visit. The standard
  close flow cannot show an asynchronous commit result in an already-closed page.
- Without a complete current snapshot/catalogue, show a non-editable explanation
  and ask the user to reopen after Metro connects. Never initialise a missing list
  as empty. Allow at most five seconds of preparation before opening this fallback,
  leaving margin under the inspected mobile URL timeout. Export after handshake
  and changes so the usual opening does not have to transfer 16 routes from scratch.

## Current code constraints

[`src/c/main.c`](../src/c/main.c) owns 16 independently persisted `Favorite` records
at keys `100..115`; selected slot is key `1`. It validates ASCII IDs up to 48 bytes,
route membership and reachable termini. Its `watch` command exports **only the
selected route**, not the favourites list. Adds/removals check individual writes;
there is no multi-record transaction. Catalogue updates retain obsolete saved IDs.

[`src/pkjs/companion.js`](../src/pkjs/companion.js) holds that selected route and a
cached validated catalogue, not a durable favourites mirror. The existing
[`parseFavorites()`](../src/common/metro.js) is a forgiving filter with a **20-item**
ceiling, used to validate the selected route. It is not a strict 16-item replacement
validator: silently dropping bad entries could turn a malformed draft into deletion.
Reuse its route rules, not its filtering/truncation behaviour for saves.

[`transport.js`](../src/pkjs/transport.js) already chunks phone-to-watch logical JSON
up to 5,000 UTF-8 bytes and waits for per-chunk application receipts. Its eight-entry
queue coalesces/evicts ordinary messages; this is not a durable settings queue.
Watch-to-phone commands are limited to 1,000 bytes by the companion and a 1,024-byte
native output buffer. A worst-case full list does not fit that reverse path.

## Ownership, transfer and conflicts

Keep only a **transient** phone snapshot/draft; do not add persistent phone favourites
or automatic offline replay in the first version. All edits, including watch-button
edits, go through the same watch validation and durable commit path.

Proposed protocol extension, not existing message types:

1. After the existing session handshake, export a snapshot header and bounded
   per-slot records, including empty slots, with one snapshot token and catalogue
   token. Use application receipts/retries for the reverse transfer too. Each record
   stays below the current command limit; publish the phone mirror only after all
   16 slots form one complete, consistent snapshot. A watch edit/catalogue replacement
   invalidates an in-progress export. Lost/partial exports are never usable baselines.
2. Every page opening has a fresh edit token bound in companion memory to that
   snapshot, watch session and catalogue. A new opening supersedes the old one.
   The watch changes its snapshot token on any committed favourite mutation and its
   catalogue token on replacement; session changes invalidate both. Selected-route
   navigation and arrival ticks alone do not create an edit conflict.
3. Submit a bounded full draft, edit token and request ID. Validate the entire
   schema/list on the phone **and independently on the watch**: types, 0–16 entries,
   ID alphabet/length, uniqueness and valid new routes. Preserve unchanged obsolete
   routes from the baseline, visibly marked unavailable; never silently delete them.
   New routes require the catalogue acknowledged by the watch. Reject a changed
   catalogue or baseline with “Changed on watch; reopen Settings”; no last-writer-wins
   overwrite or automatic merge of deletions.
4. Reuse the existing chunked phone-to-watch `DATA` transport, with a compact list
   of `[station,line,direction]` triples. The list alone is at most 2,481 UTF-8 bytes
   for 16 triples of 48-byte ASCII IDs, leaving space within 5,000 bytes for metadata;
   prove the complete envelope bound during implementation. Keep one pending edit
   outside ordinary coalescing/eviction, integrate it with the single sender, and
   surface failure/unknown outcome explicitly on exhausted retries.
   No concurrent `sendAppMessage()` path or unbounded queue.
5. After complete validation and durable commit, send a separate semantic result
   containing request ID, committed snapshot token and status. A chunk receipt or
   `sendAppMessage` callback means delivery, **not persistence**. Repeat delivery of
   the same request/bytes in the same session returns the same result without another
   commit; reusing an ID with different bytes is rejected. After restart, read the
   canonical list instead of replaying an old session's edit.

Conflict detection remains necessary while the form is open: the standard close
flow does not provide live updates to that form. Tokens detect stale drafts without
locking out watch navigation for the duration of a phone editing session.

## Durable save and upgrade boundary

A single add/remove per Settings visit could reuse existing individual writes, but
would require reopening for every change. Sending a draft as independent operations
risks partial saves. The proposed full-draft UX needs an all-or-nothing commit;
sequential writes to keys `100..115` cannot provide that.

Propose two bounded favourite banks and alternating small commit records containing
format, generation, selected slot and bank checksum. Stage and read back the inactive
bank first; publish its commit record last while retaining the previous committed
bank/record. On boot select the newest valid commit whose whole bank validates;
never load a partly staged bank. Each value must stay within the SDK's 256-byte
limit. Reuse existing `Favorite` records; no database or journal framework.

This requires **failure-injection verification**, not an assumption that multiple
`persist_write_data()` calls are transactional. Confirm single-value write/recovery
semantics on the supported firmware, generation rollover and the two-bank recovery
algorithm before accepting it. If that cannot be demonstrated, stop and revise the
save design rather than shipping best-effort replacement.

Budget both banks, commit records, legacy entries during migration and both existing
arrival-cache slots against `persist_get_max_size()` and real write results. Extra
space is roughly another 2.4 KiB for a 16-record bank, plus metadata; legacy coexistence
raises the migration peak further. Measure both targets; no assumed 4 KiB/large
firmware quota, cache eviction or favourite deletion to force migration to fit.

On upgrade, preserve UUID `5576168a-8b38-4be1-90e7-343af607c167`, read legacy slots in
place and retain them until a verified new-format commit exists. A failed migration
leaves legacy favourites usable and phone editing disabled with an error. Distinguish
absent new-format state from corrupt committed state; do not resurrect an old legacy
list after a later deletion. Route subsequent watch adds/removals through the same
bank mechanism; downgrade behaviour needs explicit review, not dual unsynchronised
writers. Never uninstall or clear app data as an upgrade step.

Keep the selected triple if retained, otherwise choose the first remaining route
(or the existing empty state). Preserve RAM/disk arrival records by **triple**, not
by a reused slot; new routes start with no predictions. Delete removed routes' saved
snapshots using existing checked invalidation/retry handling. Boot must continue
loading snapshots only for current favourites. Retained routes keep original source,
receipt and expiry; a settings save never refreshes an ETA. Cache-cleanup failure is
reported separately and must not pretend to undo a favourites commit already made.

## Failure handling

- **Disconnected/app closes before commit:** reject or abandon the draft; no deferred
  background write. The mobile app itself may close Settings when PKJS stops.
- **Disconnect/timeout after possible commit, before result:** report “result unknown”,
  not “failed/unchanged”. Reopen and fetch the authoritative list. Never blindly replay.
- **Cancel, missing response, invalid JSON/encoding, unknown edit token, oversized
  input or incomplete chunks:** no mutation. An empty valid list requires explicit
  removal confirmation; empty/missing response is not that list.
- **Catalogue missing:** no new-route editing. Cached metadata can support editing
  only when accepted by the watch and bound to the same catalogue token. If refreshed
  while editing, require reopening; preserve unavailable existing routes.
- **Storage failure:** no success response before a verified commit; recover the old
  complete list or the new complete list after interruption, never a mixture. If the
  commit outcome cannot be determined, surface unknown/storage error and reload.

## Privacy and licensing

Keep HTML/CSS/JS, catalogue and edit state local in a self-contained data page. No
CDN, fonts, analytics, fetches from the page, external form action, account/watch
identifier or arbitrary `return_to` target. Safely serialize embedded JSON (including
`<`/script terminators) and render catalogue labels as text, never HTML. Bound URI
and response sizes and omit their contents/favourite choices from diagnostics.
Data/close URIs are local to the mobile app, not requests to a hosting server; they
are not a secrecy boundary against that app, device inspection or diagnostic logs.

The distributed PBW already contains phone JS/source maps. A bundled page also
exposes its client HTML/JS to recipients, but does not publish the private repository,
Git history or unrelated application source on a website. Do not claim client code
can be hidden from installed-app recipients.

Before release, update [privacy](../PRIVACY.md) and [store copy](appstore.md) for the
transient full-list snapshot/draft and additional local configuration surface. Network
providers remain unchanged; never send the full list to UnderLX. Show UnderLX/ODbL
attribution in the picker, retain bundled legal notices, and update
[data methods](../DATA_METHODS.md) for the catalogue's new presentation. Independently
written page code remains 0BSD; copying Clay would require its licence review/notices.
A later hosted variant needs a fresh hosting/privacy/licensing review and approval.

## Small implementation plan for review

1. **Compatibility spike:** with approval, test a minimal bundled data page on the
   actual Android/Pebble/WebView versions and both supported watch targets. Record
   Settings launch, cold PKJS start, close decoding, Back/cancel and URI/response size
   limits. Do not install on physical watches without approval. If the standard flow
   fails, return with evidence/options rather than silently publishing a hosted page.
2. **Model/protocol/storage:** add strict save validation, complete snapshot export,
   conflict tokens, idempotent semantic results and verified bank migration/commit.
   Keep buffers bounded, the existing sender, and independent arrival invalidation.
3. **Page integration:** bundle plain HTML/native controls with the existing SDK
   webpack build, add `configurable` and handlers in `src/pkjs/index.js`, and wire the
   draft UX to the protocol. No dependency, new message-key namespace or backend.
4. **Acceptance/docs:** extend the existing Playwright/emulator harness, without a
   new test framework or touch tests. Cover 0/16/17 routes, worst-case IDs/bytes,
   duplicate/opposite/interchange/terminus rules, malformed and hostile labels,
   missing/repeated/out-of-order chunks/results, simultaneous watch edits, catalogue
   changes, cancel, disconnect and PKJS/watch restart at each save stage. Inject
   storage errors/interruption around bank/commit writes and legacy migration; prove
   retained ETA timestamps, removed-cache exclusion and repeated-switch heap bounds.
   Run both targets normally and repeated, with no snapshot updates unless intentional.
   The emulator does not prove Android WebView behaviour: finish the approved phone/
   hardware checks and publish exact tested versions before claiming support. Update
   README, architecture, E2E, privacy, data methods and listing docs with actual behaviour.

**Review gates:** agree to connected-only editing, the close-then-confirm UX and the
additional transactional storage work. No feature implementation, public hosting,
source publication, store upload or touch testing is authorised by this design PR.

## Sources inspected

SDK guide source was used because the rendered developer site returned HTTP 403.
Links below pin the inspected revisions rather than a moving branch.

1. [SDK configuration/Clay guide](https://github.com/coredevices/sdk-docs/blob/b8459e7d1e79c48a9e38c49673f7f822faaa4710/source/_guides/user-interfaces/app-configuration.md).
2. [SDK manual configuration and close flow](https://github.com/coredevices/sdk-docs/blob/b8459e7d1e79c48a9e38c49673f7f822faaa4710/source/_guides/user-interfaces/app-configuration-static.md).
3. [SDK package metadata](https://github.com/coredevices/sdk-docs/blob/b8459e7d1e79c48a9e38c49673f7f822faaa4710/source/_guides/tools-and-resources/app-metadata.md).
4. [Android locker: `hasSettings()` / `showSettings()`](https://github.com/coredevices/mobileapp/blob/89f31dca3fd344ae9923fe9ca2f27b0f1f8a0230/pebble/src/commonMain/kotlin/coredevices/pebble/ui/LockerAppScreen.kt#L1052-L1110).
5. [PKJS configuration request / result delivery](https://github.com/coredevices/mobileapp/blob/89f31dca3fd344ae9923fe9ca2f27b0f1f8a0230/libpebble3/src/commonMain/kotlin/io/rebble/libpebblecommon/js/PKJSApp.kt#L176-L218).
6. [Settings data URI handling / close interceptor](https://github.com/coredevices/mobileapp/blob/89f31dca3fd344ae9923fe9ca2f27b0f1f8a0230/pebble/src/commonMain/kotlin/coredevices/pebble/ui/WatchappSettingsScreen.kt).
7. [Clay `generateUrl()` / `encodeDataUri()` and default handlers](https://github.com/coredevices/clay/blob/904d6bca559c730767ec459e27b02c902c0ab8e3/index.js).

Persistence limits were checked against the installed SDK **4.33.1** `pebble.h`
Storage API for `emery` and `gabbro` (`PERSIST_DATA_MAX_LENGTH`,
`persist_get_max_size()`, read/write return values). No Android device, physical
watch, page prototype, new protocol or storage implementation was exercised here.
