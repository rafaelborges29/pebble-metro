# Privacy

Metro Lisboa does not operate a custom server, require an app-specific account,
request GPS, or include app analytics or advertising.

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
  and two recent routes' estimates, original timestamps and short labels.
- **Phone:** validated station/line metadata in PebbleKit JavaScript local storage;
  transient selected-station data in the running companion.

Removing a favourite deletes its native preference and attempts to delete its
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
