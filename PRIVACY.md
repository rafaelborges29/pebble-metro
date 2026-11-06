# Privacy

Metro Lisboa does not operate a custom server, require an app-specific account,
request GPS, or include app analytics or advertising.

For store distribution, prominently include the user-facing privacy policy in the
store description, as drafted in [the listing](docs/appstore.md). The
[Developer Distribution Agreement, section 5.3](https://developer.repebble.com/legal/distribution/)
requires a privacy policy; optional website/source URL fields do not remove that
requirement. A private link to this file is not the customer-facing policy.

## Network connections

While the watch app runs, its phone companion connects directly to:

- `https://api.underlx.com/v1/stations` and `/lines` for station/line metadata.
- `wss://perturbacoes.pt/websocket/` for UnderLX arrival estimates, subscribing to
  `json/vehicleeta/pt-ml/<selected-station-id>/all`.

These providers can receive normal connection information, including the phone's
public IP address and selected station topic. The MQTT client uses a generated
connection identifier and the public username `ws`, not a personal account.
The app does not upload the full favourites list or request background location.

The Pebble mobile app, operating system and data providers have their own privacy
practices, outside this application's control.

## Local storage

- **Watch:** up to 16 favourite station/line/direction triples, the selected route,
  and two recent routes' estimates, original timestamps and short labels. Two
  favourites banks retain the current and previous lists for interrupted-save
  recovery. Removed choices can remain in the previous bank until it is overwritten;
  legacy native preference cleanup is best effort. This is not secure erasure.
- **Phone:** validated station/line metadata in PebbleKit JavaScript local storage;
  the selected station, complete watch-favourites snapshot and an editing draft are
  transient in the running companion/settings page. Favourites are not stored in
  phone local storage or queued for automatic offline replay.

The Settings page's HTML/CSS/JavaScript is bundled in the PBW and opened locally,
without a hosted website, external page assets, analytics or new service. Its
catalogue and favourites travel in local data/close URIs inside the Pebble app,
not website query parameters. The mobile app/device and their diagnostics can
still inspect these URIs; they are not a secrecy boundary.

Removing a favourite removes it from the current list and attempts to delete its
saved arrival data. Storage errors are reported. Closing does not erase saved
favourites or the two-route reopen cache. Clearing all app/phone data is destructive;
use the platform's app-data controls deliberately.

The 0.2 native app cannot read the earlier Alloy version's separate storage and
does not erase it as part of an upgrade.

## Diagnostics

Native diagnostics log startup and heap counts. Local emulator reports contain
fixture screenshots, commands, subscriptions and phone/watch logs; CI retains
these artifacts for seven days. Hardware logs or screenshots can reveal chosen
stations: review and redact them before posting an issue. No diagnostics are sent
to an application-operated service.
