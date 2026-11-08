# Live phone favourites configuration

Metro Lisboa bundles its favourites editor in the PBW. The Pebble Android app
opens it locally; a live message bridge reads/saves without closing the page.
No website, custom backend, separate plugin, Android app or new dependency is used.

## Requirement and use

Enable **Settings → Plugins → Plugins / permissions preview** in a compatible
Pebble Android app with live configuration support. The bridge was inspected in
mobile app tag **1.17.0.1**; see the pinned references below. This platform preview
is disabled by default and also enables the mobile app's permission system. Metro
adds no plugin, uses only its own `pkjs` target, and keeps the existing UnderLX
connections. Do not assume that enabling the preview grants unrelated permissions.

1. Connect the watch and open **Metro Lisboa → Settings** in the Pebble Android app.
   Keep Metro running on the watch while editing.
2. Choose **Line → Station → Direction** and tap **Add favourite**. It saves
   immediately, shows the confirmed route, and keeps Settings open for another add.
3. **Remove** asks for confirmation and immediately saves the removal. There is no
   separate Save button, draft list or automatic save of merely selecting inputs.
4. Read saving/success/error feedback on the phone. Controls are disabled while a
   save is pending. The watch does not open success/error notices for phone edits.
5. **Refresh** reloads the authoritative list. **Done** closes the page; it does not
   save a picker selection or undo already committed changes. Leaving during an
   in-flight save cannot promise cancellation: reopen/refresh to check its outcome.

The on-watch picker remains available without the preview feature. Surviving
routes retain their slots; new routes fill free slots. Exact duplicates do not
create another route; opposite directions are distinct. Unavailable existing routes
remain visible until explicitly removed. No drag/reorder or language preference
is added. The page follows the watch's English/Portuguese locale when opened.

Missing live support produces a translated preview-setup explanation and disabled
editing; there is **no close-to-save fallback**. A missing/incomplete fresh snapshot,
missing catalogue or storage lock never becomes an editable empty list. Refresh
can recover a missing snapshot without reopening; a changed PKJS/watch session
expires the old page and requires reopening. No durable phone favourites mirror or
queued offline replay is added.

## Page and translations

`package.json` keeps `pebble.capabilities: ["configurable"]`. PKJS still handles
`showConfiguration` and opens percent-encoded `data:text/html;charset=utf-8,` HTML.
This does not use `configPage` metadata or require upgrading the pinned SDK 4.33.1.
The local live bridge is installed by the mobile app's WebView while preview is on,
including for this generated page. Waiting for a fresh opening snapshot is bounded
at five seconds, below the inspected mobile app's ten-second URL timeout.

[`settings-page.ts`](../src/pkjs/settings-page.ts) creates native labelled selects,
compact route cards, a prominent Add action and an accessible live status region.
Its HTML/CSS/JS is self-contained, has a restrictive CSP and no external assets,
forms, network requests or arbitrary return targets. Labels are inserted as text;
embedded JSON escapes script terminators and Unicode separators. Generated data
URIs remain capped at 150,000 characters. Done uses a close URL with no favourites.

Appearance uses native CSS `prefers-color-scheme` and shared light/dark colour
variables, with `color-scheme: light dark` for native controls. It follows the
preference exposed by the Pebble app's WebView, not a stored Metro setting. A
reported preference change restyles the open page without reload, new messages or
lost selections. Missing dark-mode support falls back to light. On mobile builds
that only refresh their WebView theme when opening, reopen Settings after changing
the app theme. Tests emulate the reported preference; they do not prove a particular
Android/WebView build's theme propagation.

Phone-only copy uses flat semantic keys in [`src/pkjs/locales/en.json`](../src/pkjs/locales/en.json)
and [`pt_PT.json`](../src/pkjs/locales/pt_PT.json), selected through the same root
locale registry as the watch. There are no inline English/Portuguese copy pairs.
The tables stay in PKJS rather than consuming native watch RAM. See
[translation guidance](../CONTRIBUTING.md#phone-settings-copy).

## Live saves, conflicts and failures

The page waits for the mobile bridge's `ready` event for target `pkjs`, then calls
`Pebble.sendMessage("pkjs", {v:1,type,edit,...})`. [`settings.ts`](../src/pkjs/settings.ts)
handles the PKJS `configmessage` event and replies through its `respond` callback:

- `settings-read` requests a new complete watch snapshot, with a five-second limit.
- `settings-save` carries the full proposed list, validated as an all-or-nothing
  replacement. An edit token binds the page to its session and baseline. A newer
  watch edit/catalogue rejects the old baseline, returns the current list and asks
  the user to try again; no silent merge, deletion or last-writer-wins overwrite.
- A save reply waits for a complete post-commit watch result, **not** a Bluetooth
  send callback. Only then does the page update its confirmed list and baseline.
- A missing result times out after 15 seconds in PKJS. The page also bounds a
  missing native bridge reply at 20 seconds. The outcome is **unknown**, editing
  is disabled, and Refresh must read the watch before another mutation. There is
  no blind automatic retry/replay of an uncertain user operation.

The page/PKJS message is limited to 5,000 JSON characters. IDs independently pass
strict phone/watch validation: at most 16 unique triples of ASCII IDs up to 48
bytes, valid new routes and unchanged unavailable existing routes. One pending
save/read is allowed; extra concurrent requests get a busy result.

The existing 5,000-byte phone-to-watch chunk transport carries `settings-get`,
`settings-receipt` and `settings-save` logical messages, with protected configuration
queue entries and bounded retries through the single existing sender. The maximum
16-route compact array is 2,481 UTF-8 bytes; its watch save message with maximum
uint32 fields is 2,582 bytes.

Watch-to-phone `settings-state` exports have four stop-and-wait parts with four
fixed slots each. Every part carries snapshot/revision/catalogue IDs, last request
and result, writable flag and bounded raw locale. The maximum frame is 885 bytes,
within the existing 1,000-byte command bound. Partial/inconsistent snapshots never
become baselines. Identical repeated request IDs/bytes return the original result
without another commit; mismatched reuse is rejected.

Phone results do not navigate the watch. The current watch view/picker is retained
unless a removed selected route invalidates an actions/removal screen; then it
returns quietly to arrivals or empty. Existing storage/cache error indicators
remain available. There is no vibration or added notification.

## Storage and upgrade boundary

[`favorites.c`](../src/c/favorites.c) still stages the entire list into the inactive
of two fixed 16-record banks and publishes its checksummed generation commit last.
The previous complete bank remains available for interrupted-save recovery. A
failed/ambiguous commit locks mutations until reload instead of claiming rollback.
Both phone and native watch mutations use this same checked store.

Legacy native keys are seeded **unchanged** before a migration seal enables writes
or legacy cleanup. Interrupted seeding retains the legacy list; a sealed migration
cannot resurrect deleted legacy choices. The UUID, saved routes and cache expiry
are preserved: no uninstall, data wipe or manual re-add is part of a native upgrade.

The recovery bank is not secure erasure: removed choices can remain until it is
overwritten, and legacy cleanup is best effort. Older app versions cannot read the
banks; downgrades and reconciling edits from a downgrade are unsupported. See
[privacy](../PRIVACY.md) and [architecture](architecture.md).

Retained triples keep RAM/disk arrival data and original timestamps; new routes
start without predictions. Removed snapshots use existing checked invalidation/
retry handling and are excluded from restoration unless currently saved. Settings
never renews ETA expiry; a cache cleanup failure cannot undo a favourite commit.

## Verification and references

The existing Playwright harness runs the real PBW/C app and bundled companion on
Emery/Gabbro. Chromium loads the generated page with the documented local bridge
contract: `ready`, `sendMessage` promises and PKJS `configmessage` responses.
It checks live saves without closure, quiet arrival/action/picker screens, stale
removal confirmation, keyed copy, unavailable preview, timeout/refresh recovery,
conflicts, malformed inputs, restart, hostile labels, 16-route/empty lists and cache
expiry. Light/dark cases cover initial preferences, live switching without reload
or writes, and at least 4.5:1 text contrast for content, controls and status colours.
All original navigation/cache/heap/screenshot coverage remains. The host
production-store probe still injects 54 migration and 51 save failure boundaries.
See [E2E](e2e.md). No touch tests, Android WebView/native bridge acceptance or
physical-flash power-loss guarantee is implied by this contract simulation.

- [Live configuration API and preview setup](https://github.com/coredevices/sdk-docs/blob/debf5c76dbb6f54f5aaa7920f73f3972477063eb/source/_guides/plugins/preview.md#settings-pages).
- Android `1.17.0.1`: [page bridge API](https://github.com/coredevices/mobileapp/blob/89f31dca3fd344ae9923fe9ca2f27b0f1f8a0230/pebble/src/commonMain/kotlin/coredevices/pebble/config/ConfigPageBridge.kt),
  [preview gating](https://github.com/coredevices/mobileapp/blob/89f31dca3fd344ae9923fe9ca2f27b0f1f8a0230/pebble/src/commonMain/kotlin/coredevices/pebble/config/ConfigPageSession.kt),
  [PKJS event/respond bridge](https://github.com/coredevices/mobileapp/blob/89f31dca3fd344ae9923fe9ca2f27b0f1f8a0230/libpebble3/src/androidMain/assets/startup.js).

Distributed PBWs expose their client HTML/JS/source maps, not the private Git
repository/history. Catalogue facts retain UnderLX/ODbL attribution; original page
code remains 0BSD. No hosting, store publication, merge or hardware installation
is part of this change.
