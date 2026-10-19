# Flow and alerts

Implemented in Alloy/Poco; hardware validation is pending. See the README for
verification limits. `design.html` preserves the original interactive proposal:
its countdowns and disturbances are fictional, not production data.

## Direction: Glance first

White background, black typography, large countdown, one Metro line colour
used as an accent. Colour is always accompanied by a line name or status label.
No maps, animation loops, auto-scrolling text or obligatory touch gestures.
Station names/service messages stay in Portuguese; controls use English.

The 200 × 228 HTML design is a proposal, not an emulator screenshot. The
implemented watch UI uses supported system fonts and Poco to fit the RAM budget.
Physical-watch readability and haptic feel still need hardware validation.

## Everyday flow

```text
Launch with favourites → last viewed arrivals
  Up/Down → previous/next favourite (station + line + direction)
  Select → actions → arm/cancel arrival alert or read line status
  Back → favourites list → open favourite or add one

First launch → empty favourites → add station → choose line → direction → save
  Skip line selection when only one line serves the station.
  Only offer directions reachable from the selected station.

Service banner → actions → line status → detail pages
  Back always returns to the previous context.
  Back at the root exits; system hold-Back remains an emergency exit.
```

The favourites list also exposes network status, manage favourites and About
(UnderLX/ODbL attribution). A favourite stores IDs, not a hard-coded destination
name. Add via the watch using the alphabetical station list, a line choice at
interchanges, and a valid outbound direction picker. Hold Up/Down to repeat.
No GPS permission is needed. Removal is an explicit action with confirmation.
A phone-based favourites editor can be added later if watch selection is tedious.

### Arrival screen

- Small status strip: `LIVE`, `CONNECTING`, `OFFLINE` or `STALE`; favourite index.
- Station name; line label and destination.
- Large next arrival; next two predictions underneath.
- Footer: action hint, relevant service-warning hint, or armed-alert target.
- Reopening never presents cached predictions as live.
- Unavailable predictions show `No live estimate`, not `0:00`.
- Zero is `Due`, not a departed train. Ranges/bounds retain their uncertainty.

## Alert design

### Arrival alert: deliberately opt-in, one-shot

From actions, choose **Alert at 2 min**. Show **Keep Metro open** and a cancel
option. Alerts apply to the selected station/line/direction, not every favourite.
One active arrival alert at a time; changing its target requires confirmation.

Trigger once when a **fresh, exact** next-arrival prediction crosses from above
120 seconds to at/below 120 seconds. Display station/direction and current ETA,
with one double pulse when vibration is permitted. This is an estimate, not a
promise to catch a particular train: the feed has no stable vehicle identifier.

If already below the threshold when arming, show `Already under 2 min` instead
of silently arming for another train. No immediate surprise vibration. Cancel or
acknowledge consumes the one-shot; feed reordering must never re-trigger it.

An arrival alert does not cancel merely because the user browses another
favourite; retain its target subscription and label the target. Exiting the app
cancels it. Interrupted/expired data pauses the alert. After a gap, require a
fresh above-threshold observation to arm a new crossing; if already below,
show a visual update only, never a retroactive buzz from an unknown crossing.

### Service disruption

A current incident affecting the selected line adds a **Service issue** footer,
not a modal that hides the countdown. Open it through actions for paginated
Portuguese text, line, source, and Lisbon-time last update. Readable text must
never be reduced to an unexplained icon or colour.

In-app service vibration is **off by default**. An optional setting can give one
short pulse for a new/materially changed incident affecting a saved line, not
on each poll or identical text update. Opening an existing incident is silent.
Coalesce simultaneous updates. No background push delivery is promised.

### Lost phone / no internet / expired source

- Phone link lost: immediate `OFFLINE`, `Phone disconnected`, hide exact ETAs;
  small inline notice, no repeated vibration. Pending arrival alert pauses.
- Phone connected but source unavailable: `STALE` or `CONNECTING` as appropriate;
  countdowns may remain only until their actual validity expires.
- Expired feed: replace numbers with dashes and `Waiting for fresh data`.
- Unknown/failed service refresh is `Status unavailable`, never `All normal`.
- Reconnect automatically with backoff; no buzz just for reconnecting.
- Cache last update time for context, not a frozen countdown.

### Quiet behaviour

All alerts are visual first. Haptics are optional; no sound or forced long
backlight. Respect watch Quiet Time. The native hook checks `quiet_time_is_active()` immediately before vibrating;
physical-watch Quiet Time behaviour remains part of the hardware checks. No always-on background alerts, commute schedules or Android
notification service in the initial version.

## Remaining acceptance checks

Initial live arrivals and the loading-feedback update were confirmed on the
physical Time 2. The old unit suite was subsequently removed at the owner's
request. A separately approved [real-emulator E2E flow](e2e.md) covers first use,
arrivals and saved-favourite persistence; syntax/build and manual checks remain.
Before declaring
hardware reliability for the hardened release, verify Android PKJS → Bluetooth →
Time 2, watch readability, actual Quiet Time/haptics, reconnection and Android app
backgrounding. No physical install is authorized
merely by a successful build; wait until the user is ready.
