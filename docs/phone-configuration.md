# Phone favourites configuration

Metro Lisboa bundles its favourites editor in the PBW. The Pebble Android app
opens it locally through standard PebbleKit JS configuration events. No website,
custom backend, separate Android app or additional dependency is used.

## Use

1. Connect the watch and open **Metro Lisboa → Settings** in the Pebble Android app.
   The mobile app can launch Metro on the watch; keep it running until confirmation.
2. Review the current watch list and `n / 16`. Add through **Line → Station →
   Direction**. Interchanges keep the selected line; termini exclude the origin.
   Opposite directions are separate routes; exact duplicates are not added twice.
3. Remove individual routes with confirmation. Edits remain a local draft.
4. **Cancel** or Android Back discards the draft. **Send to watch** submits it;
   removing the entire list requires another confirmation.
5. Submission closes the page. Check the watch for success/error. Reopening
   Settings reads the actual list and shows the last result known to that companion.

The on-watch picker remains available. Surviving routes keep their slots; new
routes fill free slots. No drag/reorder or language preference is added. English
and Portuguese follow the watch language when opening the page.

A missing/incomplete fresh snapshot, missing catalogue or watch storage lock gives
an explanation-only page, never an editable empty list. There is no persistent
phone favourites mirror or automatic offline replay. Previously saved routes that
are no longer served remain visible as unavailable until explicitly removed.

## Implementation and bounds

- `package.json` declares `pebble.capabilities: ["configurable"]`.
- [`settings.js`](../src/pkjs/settings.js) handles `showConfiguration` and
  `webviewclosed` in the existing companion lifecycle. Opening asks the watch for
  a fresh complete snapshot, with a five-second preparation limit before the
  explanation-only fallback (under the inspected mobile app's ten-second timeout).
- [`settings-page.js`](../src/pkjs/settings-page.js) serializes plain native HTML
  controls, inline CSS/JS and initial data into `data:text/html;charset=utf-8,`.
  It escapes script terminators/Unicode separators, renders labels as text and has
  a restrictive CSP. There are no external assets, forms, requests or arbitrary
  return targets. Generated URIs are capped at 150,000 characters.
- The page returns percent-encoded JSON via `pebblejs://close#`. PKJS accepts JSON
  already decoded by current Android or decodes once for the older standard flow.
  Encoded input is limited to 15,000 characters and decoded JSON to 5,000. The
  strict list contains at most 16 triples of validated ASCII IDs up to 48 bytes.
- Each visit has a new edit token bound to its watch session, catalogue and list
  revision. The watch independently checks that baseline at save time, validates
  all routes/duplicates and preserves unchanged unavailable routes. An on-watch
  edit or catalogue replacement rejects a stale draft; it never silently merges
  deletions or overwrites the newer list.

The existing 5,000-byte phone-to-watch chunk transport carries `settings-get`,
`settings-receipt` and `settings-save` logical messages. Configuration entries are
protected from feed-queue eviction; retries remain bounded and there is only one
sender. The maximum 16-route compact array is 2,481 UTF-8 bytes; its save message
with maximum uint32 fields is 2,582 bytes.

Watch-to-phone `settings-state` exports have four stop-and-wait parts, each with
four fixed slots (triples or nulls). Every part carries the same snapshot ID,
revision, catalogue ID, last request/result, writable flag and language. The
largest frame with 48-byte IDs/session and maximum uint32 fields is 874 bytes,
within the existing 1,000-byte command bound. Matching application receipts
advance the export; missing receipts retry on the existing tick. Partial,
inconsistent or duplicate-slot snapshots never become a page baseline.

A chunk ACK is not a successful save. A complete post-commit state export carries
the semantic result. Repeated identical request IDs/bytes return the original
result without another commit; mismatched reuse is rejected. The companion waits
up to 15 seconds for a result. A timeout or restart during an uncertain save means
**result unknown**, not proof that the old list survived; reopen and inspect the
watch's list. Nothing is replayed from phone storage.

## Storage, migration and arrival data

[`favorites.c`](../src/c/favorites.c) owns two bounded 16-record banks with
checksummed generation commits. It writes/read-checks the inactive bank first,
then publishes its commit while retaining the previous complete bank. Boot picks
the newest valid bank. Readback ambiguity locks mutations until reload instead
of claiming a rollback. Individual watch adds/removals use the same commit path.

Legacy native keys are first seeded **unchanged** into a bank. Only after its
commit and migration seal are verified are mutations enabled and old keys cleaned
up. An interrupted seed retains the legacy list; later corrupt committed storage
cannot resurrect deleted legacy favourites. The UUID is unchanged and no uninstall,
data wipe or manual re-add is required for native-version upgrades. Migration and
save writes check real results; no favourites/cache eviction forces a save to fit.

The previous bank is a recovery copy, not secure erasure: removed favourites can
remain there until overwritten, and legacy cleanup is best effort. See
[privacy](../PRIVACY.md). Downgrading to older versions that only read legacy keys
is unsupported: they cannot read the new banks, and edits made while downgraded
are not reconciled when upgrading again.

Retained triples keep their RAM/disk arrival data and original timestamps; new
routes start without predictions. Removed routes' snapshots use existing checked
invalidation/retry handling and are excluded from restoration unless currently
saved. Settings never renews prediction expiry. A separate cache-cleanup failure
cannot pretend to undo an already committed favourite list.

## Verification and platform references

The existing Playwright harness runs the real compiled C app and bundled companion
on Emery/Gabbro. Its settings bridge loads the generated data URI in Chromium and
simulates Android's local close interception, including encoded/already-decoded
responses and a page-network deny rule. It is not an Android WebView or hardware
acceptance claim. No physical watch was installed and no touch tests were added.
The separate manual compatibility spike was waived for this implementation.

Coverage includes cancel/duplicates, 16-route and empty saves, native rejection
after phone validation is bypassed, watch/catalogue conflicts, fresh-snapshot
failure, stale pages after runtime restart, idempotent requests, hostile source
labels, Portuguese and unchanged cache expiry. A host C probe in the same suite
compiles the production store against a minimal persistence edge and injects
failures/torn writes at all 54 migration and 51 save boundaries, plus unknown
commit readback and failed legacy cleanup. Simulated storage faults do not prove
physical-flash power-loss behaviour. Existing button/cache/screenshot/stress
checks are retained unchanged; see [E2E](e2e.md).

Source inspection supporting the standard mechanism:

- [SDK configuration/Clay guide](https://github.com/coredevices/sdk-docs/blob/b8459e7d1e79c48a9e38c49673f7f822faaa4710/source/_guides/user-interfaces/app-configuration.md)
  and [manual event/close flow](https://github.com/coredevices/sdk-docs/blob/b8459e7d1e79c48a9e38c49673f7f822faaa4710/source/_guides/user-interfaces/app-configuration-static.md).
- Android app tag `1.17.0.1`: [Settings launch](https://github.com/coredevices/mobileapp/blob/89f31dca3fd344ae9923fe9ca2f27b0f1f8a0230/pebble/src/commonMain/kotlin/coredevices/pebble/ui/LockerAppScreen.kt#L1052-L1110),
  [PKJS URL timeout](https://github.com/coredevices/mobileapp/blob/89f31dca3fd344ae9923fe9ca2f27b0f1f8a0230/libpebble3/src/commonMain/kotlin/io/rebble/libpebblecommon/js/PKJSApp.kt#L176-L218),
  [data URI/close handling](https://github.com/coredevices/mobileapp/blob/89f31dca3fd344ae9923fe9ca2f27b0f1f8a0230/pebble/src/commonMain/kotlin/coredevices/pebble/ui/WatchappSettingsScreen.kt).

The distributed PBW exposes its client HTML/JS to recipients, as it already does
for companion JS/source maps; it does not publish the private Git repository or
history. Catalogue facts retain UnderLX/ODbL attribution in the editor and
[data methods](../DATA_METHODS.md); page code is original 0BSD. No hosting or
repository/store publication is part of this feature.
