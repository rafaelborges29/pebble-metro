# Publishing TODOs

Target the current Pebble appstore first, with an unlisted beta for **Pebble
Time 2 (`emery`) and Android**. Keep the GitHub repository private. Do not claim
support for other watches or iOS without implementation and verification.
This checklist is not authorization to install, upload or publish a release.

## Review status and existing evidence

- [x] Private GitHub repository created and initial source pushed.
- [x] Live arrivals and subsequent loading-feedback update confirmed by the
  user on a physical Time 2, firmware 4.41.2.
- [x] GPT-6.1 Sol completed a read-only whole-repository review of `52257d8`.
  The parent reproduced its seven findings before changing the code.
- [x] At the owner's request, remove the eight old unit-test files, the test
  command and the design-preview verification hook. Keep production validation.
  `npm run check` performs entry-point syntax checks and a production build.
  The subsequently approved functional suite below does not restore those tests.
- [x] Fix all seven findings below and verify with temporary Node probes and a
  clean SDK 4.33.1 production build. Temporary verification scripts are not part
  of the repository. Restore the previously active SDK, 4.17, after building.
- [ ] Retry the independent **OpenCode DeepSeek V4.1 Flash Free** review after
  its expired API key is replaced in provider settings. It failed before review;
  no DeepSeek findings or approval are available. Do not paste credentials into
  this repository or chat.
- [ ] Reconcile the second review, validate any new findings and update this list.

Live-arrival and loader success remain valid for the installed version. The user
manually closed the app; its return to the watchface was not evidence of a crash.
**The subsequent hardening fixes are local and have not been installed on the
physical watch or published.** The verified local PBW SHA-256 is:

```text
bd1e763c0f95192294ae17df9b7b112012433984ab68d0188b7fc9b69a922964
```

## 1. Completed correctness and adversarial fixes

These findings refer to the reviewed baseline; their source fixes are subsequent
local changes. Temporary checks exercised production modules and fake clocks,
feed clients and watch bridges; they are not physical-device acceptance.

- [x] **REV-1 — High: preserve alert continuity breaks through coalescing.**
  [companion.js](../src/pkjs/companion.js) advances generation when an exact-second
  first prediction loses alert eligibility. A busy queue can no longer hide that
  break between `130s` and `119s`. Checked bounds, intervals, minute units and
  timestamp estimates; none produced the false alert.
- [x] **REV-2 — Medium: restore connection state after metadata recovery.**
  [companion.js](../src/pkjs/companion.js) resends actual feed state after metadata
  succeeds, clearing the obsolete metadata error. Checked cold-start failure,
  automatic recovery, live arrivals and a subsequent legitimate alert crossing.
- [x] **REV-3 — Medium: recover from a phone-only clock change.**
  [main.js](../src/embeddedjs/main.js) makes explicit Retry renew the session and
  clock offset, clearing arrival/service continuity. A renewed handshake also
  retries a disconnected feed without duplicating a connected client. Checked
  forward/backward phone-only changes and no catch-up alert/service buzz.
- [x] **REV-4 — Medium: reject oversized MQTT bytes before decoding.**
  [feed.js](../src/pkjs/feed.js) checks `payloadBytes.byteLength` before accessing
  `payloadString`. Checked oversized byte arrays without invoking their string
  getter, a real Paho message at 65,536 bytes, and multibyte text over the byte
  limit. Paho/WebSocket frame buffering remains outside this application limit;
  no actual phone hang or OOM was demonstrated.
- [x] **REV-5 — Medium: make dictionaries prototype-safe.**
  [watch-model.js](../src/common/watch-model.js) uses null-prototype service
  signatures and arrival maps, including resets. Checked silent repeated
  `__proto__`, `constructor` and ordinary incident IDs and safe arrival lookup
  for a prototype-like station key. This was a deduplication/key-collision
  defect, not demonstrated arbitrary code execution.
- [x] **REV-6 — Medium: align catalogue validation contracts.**
  Phone, watch and persisted display names accept up to 80 characters. Checked
  64/65/80-character station names and rejection of 81 by both validators. No
  current UnderLX station was shown to trigger the former 64/80 disagreement.
- [x] **REV-7 — Low: preserve surrogate pairs in display cuts.**
  [watch-model.js](../src/common/watch-model.js) pagination and
  [main.js](../src/embeddedjs/main.js) ellipsizing preserve pairs. Checked ordinary
  and narrow wrapping boundaries without dropped characters or malformed UTF-16.
  Font glyph availability remains a separate issue.

## 1a. First functional CI slice

- [x] Add TypeScript Playwright fixtures/configuration and Effect-managed emulator
  scope, typed RPC, timeouts and guaranteed cleanup. Keep Effect out of watch code.
- [x] Run the actual PBW in private headless Emery QEMU and extract that archive's
  PKJS into Chromium. Exercise real buttons, AppMessage receipts and persistent
  watch storage against deterministic REST/MQTT fixtures, not model substitutes.
- [x] Cover first use, station/direction selection, rendered arrivals, and retaining
  the saved favourite after app/phone-runtime relaunch. Inspect six native PNG
  baselines, masking only the header clock and connecting animation dots.
- [x] Verify strict typechecking, production build and three consecutive clean
  TypeScript/Effect E2E runs. A deliberate 25-pixel mismatch failed with PNG diffs,
  Playwright trace and logs; restore the baseline and confirm process cleanup.
- [x] Independently review the new harness with GPT-6.1 Sol; no actionable findings.
- [x] Prepare a least-privilege Ubuntu 24.04 GitHub workflow with pinned Node,
  Pebble Tool/SDK and failure artifacts; validate with `actionlint`.
- [ ] Before merging or releasing, verify the exact candidate revision's hosted
  GitHub checks and reports. A local pass is not proof of a successful hosted run.
- [ ] Expand into focused timeout/retry, stale-data, recovery, service and
  exact-alert/uncertainty flows. The first happy-path/persistence flow does not
  yet automate these cases. See [E2E setup and limitations](e2e.md).

## 2. Measure performance and memory

These are measurement tasks, not established leaks or battery regressions.

- [ ] Profile catalogue replacement, 16 favourites, long/multiple service notices,
  rapid navigation and repeated reconnects. Record native heap and XS slot/chunk
  usage, including peaks, and verify no exhaustion or steadily increasing use.
  The observed native usage `117788 / 122192` leaves 4,404 bytes, but does not
  describe free capacity inside the separately reserved XS pools.
- [ ] Measure responsiveness and battery/network behaviour while displaying
  arrivals, waiting for data, browsing menus/service pages and losing focus.
  Confirm the existing redraw signature and one-second loader behave as intended.
- [ ] Profile work before redraw suppression: menus are rebuilt and service text
  repaginated every timer tick in `draw()`. Cache only if measurements justify it,
  with invalidation for data, selection and freshness changes. Do not blindly
  increase memory pools or introduce a broad rendering rewrite.

## 3. Complete physical acceptance

- [ ] Check Android Pebble app backgrounding, screen-off and relevant battery
  restrictions. Document limitations rather than promising an always-on service.
- [ ] Check Bluetooth loss/recovery, phone internet loss/recovery and app relaunch.
  Verify metadata, service state and live arrivals recover without frozen ETAs
  or delayed alerts. Include an initial metadata failure.
- [ ] Verify optional arrival/service vibration on the watch, with Quiet Time on
  and off. Defaults must remain quiet; focus loss and gaps must not cause a
  catch-up buzz. Use controlled fixtures for alert boundaries, not train guesses.
- [ ] Check favourites persistence, removal, interchange and terminus selection,
  stale/unavailable messaging and the loading timeout/retry flow on the hardened
  release candidate. Record watch firmware, Android/Pebble versions and hash.

## 4. Distribution, privacy and public-facing materials

- [ ] Audit the complete redistributed component inventory and ship the applicable
  full licence texts and notices with accessible release materials. Include Paho
  and the Google Apache-2.0 SDK phone wrapper found in the built JavaScript.
  The inspected PBW retains copyright/licence headers but has no separate licence
  or notice files; private-repository links are not sufficient delivery to store
  users. Inspect the release package and accompanying materials.
- [ ] Decide the original application's licensing/distribution terms. Publishing
  a binary does not require making the source repository public; do not describe
  the project as open source without choosing an appropriate licence.
- [ ] Preserve UnderLX/ODbL attribution and the unofficial-app disclaimer. Use
  original or appropriately licensed artwork, without implying Metro endorsement.
- [ ] Write a short privacy disclosure: Android connects directly to UnderLX REST
  and its MQTT broker; these services receive network connections and station
  subscriptions. Explain locally stored watch preferences and phone metadata
  cache, no GPS/app-specific account/analytics, and foreground-only alert limits.
- [ ] Choose a public support contact and an accessible way to deliver privacy
  and licence information without exposing the private source repository or
  unintentionally publishing a personal account email.

## 5. Prepare the listing and release candidate

- [ ] Confirm title **Metro Lisboa**, developer name, category, release version
  and release notes. Keep UUID `5576168a-8b38-4be1-90e7-343af607c167` unchanged;
  use a new, store-valid version for each later release.
- [ ] Draft the description: Lisbon coverage, favourites, next-three estimates,
  disturbances, optional alerts, Android/internet requirements, UnderLX source
  and limitations. Claim Time 2 support only; leave private source URL unset.
- [ ] Prepare original **80×80** and **144×144** icons, or explicitly choose the
  Pebble-generated icons. A **720×320** banner is optional.
- [ ] Capture 3–5 useful, unframed **200×228** Time 2 screenshots: live arrivals,
  station/direction selection, service status and optionally loading/settings.
  Prefer the release UI; do not present the design mockup as a screenshot or
  synthetic predictions as a live measurement.
- [ ] For the final release, activate SDK **4.33.1**, clean incompatible caches if
  necessary, run `npm ci` and `npm run check`, and inspect
  `build/pebble-metro.pbw`. Keep the SDK active through the Alloy prebuild and
  restore the previous SDK afterward. See [build instructions](../README.md#build).
- [ ] Check release metadata/platforms, dependency notices, absence of secrets and
  package size (Pebble maximum **4.4 MB**). Record commit, verification and SHA-256.

## 6. Publish only after explicit approval

- [ ] Obtain owner approval for the release candidate, account/legal agreements,
  public listing text/contact, chosen visibility and actual upload/publication.
- [ ] Use the [Pebble Developer Dashboard](https://developer.repebble.com/dashboard)
  to upload the PBW and listing assets. Explicitly set and verify **Unlisted**
  visibility for the first beta. Do not rely on CLI defaults: publication can be
  immediate and the current store has no review queue.
- [ ] Install via the store link, without developer sideloading, and verify the
  intended binary, phone-side JavaScript, first-use flow and live updates.
- [ ] Share the beta link with testers; address validated feedback and confirm
  that the unlisted app is installable by link but absent from search/browsing.
- [ ] Obtain separate approval before switching visibility to **Listed**. Retain
  the release artifact and notes, and verify the public listing/install route.
- [ ] Optional: confirm current Time 2/Alloy support in the
  [Rebble portal](https://dev-portal.rebble.io/) before planning a second listing.
  Do not assume Pebble submission automatically publishes to Rebble. Keep the
  same app UUID across stores and document the update workflow.

## Publishing references

- [Pebble submission requirements](https://developer.repebble.com/guides/appstore-publishing/preparing-a-submission/)
- [Pebble publishing workflow](https://developer.repebble.com/guides/appstore-publishing/publishing-an-app/)
- [Pebble legal agreements](https://developer.repebble.com/legal/)
- [Rebble publishing workflow](https://developer.rebble.io/guides/appstore-publishing/publishing-an-app/)
