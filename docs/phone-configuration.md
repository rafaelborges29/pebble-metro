# Phone favourites editor

The editor is bundled in the PBW and opens locally in the Pebble Android app.
No website, separate plugin, custom backend or Android companion app is needed.
Protocol, bounds and storage details live in
[architecture](architecture.md#phone-settings-protocol).

## Setup and use

Enable **Settings → Plugins → Plugins / permissions preview** in a compatible
Pebble Android app with live configuration support. This preview is disabled by
default and also enables the platform's permission system; it does not grant
unrelated permissions. Metro uses only its own `pkjs` target.

1. Connect the watch, keep Metro running, and open its **Settings** in Pebble Android.
2. Choose **Line → Station → Direction**, then **Add favourite**. The confirmed
   route appears immediately and Settings stays open for another add.
3. **Remove** asks for confirmation and saves immediately. Merely selecting picker
   inputs does not save; there is no separate Save button.
4. Read feedback on the phone. Pending saves disable controls; phone results do
   not open notices on the watch.
5. **Refresh** reads the authoritative list. **Done** closes without saving picker
   selections or undoing completed changes. Leaving during a save cannot promise
   cancellation: reopen/refresh to check its outcome.

Exact duplicates select the existing route; opposite directions are distinct.
Unavailable existing routes remain until explicitly removed. The on-watch picker
works without preview support. No drag/reorder or language setting is provided.
The editor follows the watch's English/Portuguese locale when opened; reopen it
after a watch-language change. See [translation guidance](../CONTRIBUTING.md#phone-settings-copy).

Appearance follows the WebView's light/dark preference, including native controls,
without a Metro theme toggle. Changes can restyle an open page without losing
selections; if a particular mobile build does not propagate its theme change,
reopen Settings. Missing dark-mode support falls back to light.

## Internet permissions

The version-2 manifest requests only two required Internet domains:

- `api.underlx.com`: station/line catalogue.
- `perturbacoes.pt`: arrival estimates over WebSocket/MQTT.

Pebble's domain grants cover subdomains. No location, local-network, files,
contacts, notifications, timeline or unrelated-plugin permission is requested.
Pebble owns approval/revocation UI, not Metro. With preview enabled, Android
1.18+ exposes a shield in the Settings title bar; 1.18.0.1+ displays purpose and
required fields, which older builds ignore.

A legacy-manifest upgrade may require approving both domains again. Denial does
not erase favourites or extend saved estimates. Grant access, let source retries
recover, then Refresh the same page; a failed mutation is not replayed.

## Recovery and safety

Missing live support shows setup guidance and disables editing; there is no
close-to-save fallback. A missing/incomplete snapshot, missing catalogue or storage
lock never becomes an editable empty list. Refresh can recover missing data; a
restarted companion/watch session requires reopening the page. Conflicting watch
edits return the current list rather than silently overwriting it. An uncertain
save requires Refresh before another mutation, not repeated Add/Remove taps.

Native upgrades preserve the UUID, favourites and original estimate expiry: do
not uninstall, wipe data or manually re-add native favourites as a recovery step.
Recovery copies are not secure erasure; older native versions cannot read the new
banks and downgrades are unsupported. See [privacy](../PRIVACY.md) and
[persistence](architecture.md#persistence-and-reopen).

The [emulator suite](e2e.md) checks live saves, conflicts, recovery, hostile labels,
translations, contrast and persistence failures. It models the bridge contract,
not Android WebView internals, native prompts or physical-flash power loss. Touch
and physical-device acceptance are not implied; no touch tests are added/run.

## Platform references

The live bridge was inspected in Android tag 1.17.0.1:

- [Live configuration API and preview setup](https://github.com/coredevices/sdk-docs/blob/debf5c76dbb6f54f5aaa7920f73f3972477063eb/source/_guides/plugins/preview.md#settings-pages)
- [Page bridge](https://github.com/coredevices/mobileapp/blob/89f31dca3fd344ae9923fe9ca2f27b0f1f8a0230/pebble/src/commonMain/kotlin/coredevices/pebble/config/ConfigPageBridge.kt)
- [Preview gating](https://github.com/coredevices/mobileapp/blob/89f31dca3fd344ae9923fe9ca2f27b0f1f8a0230/pebble/src/commonMain/kotlin/coredevices/pebble/config/ConfigPageSession.kt)
- [PKJS event/respond bridge](https://github.com/coredevices/mobileapp/blob/89f31dca3fd344ae9923fe9ca2f27b0f1f8a0230/libpebble3/src/androidMain/assets/startup.js)

PBWs expose client HTML/JS/source maps, not private Git history. Source catalogue
facts retain UnderLX/ODbL attribution; original page code remains 0BSD.
