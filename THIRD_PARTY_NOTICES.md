# Third-party notices

Original project code is under [0BSD](LICENSE). That grant does not change the
licences of dependencies, generated third-party code or UnderLX data.

## UnderLX data

Contains information from [UnderLX](https://underlx.com/), made available under
the [Open Database Licence 1.0
(ODbL)](https://opendatacommons.org/licenses/odbl/1-0/) unless otherwise indicated.
Its [developer portal](https://developer.underlx.com/#dados-abertos) states this
licence for API data. The complete text is in
[`LICENSES/ODbL-1.0.txt`](LICENSES/ODbL-1.0.txt).

UnderLX-derived data and this project's data adaptations remain under ODbL 1.0,
not 0BSD. This covers normalized/compact catalogues, retained labels, arrival
snapshots and the UnderLX-derived facts in fixtures/screenshots. Test arrival
values and extra stress-test stations are artificial, not live observations.
No full live database is bundled in the repository or PBW.

The app fetches catalogue/arrivals directly from UnderLX and caches locally.
Normalization, filtering and prediction timing are implemented in
[`src/common/metro.ts`](src/common/metro.ts); compact catalogue encoding and phone
caching in [`src/pkjs/companion.ts`](src/pkjs/companion.ts); native validation,
rendering and persistence in [`src/c/main.c`](src/c/main.c). See
[architecture](docs/architecture.md) for the data flow and bounds.

The complete [fixture and spec inputs](e2e/), including
[`metro-fixture.ts`](e2e/metro-fixture.ts), provide machine-readable example data
and generation methods. The base catalogue uses three UnderLX-derived stations;
additional stress stations and arrival estimates are artificial. Fixture data
and additions remain ODbL; harness code remains 0BSD. Fixtures are not in the PBW.

Preserve attribution/licence notices with redistributed data and screenshots.
Public use of a Derivative Database or Produced Work from one can trigger ODbL
4.4(c)/4.6: provide the complete machine-readable database or all alterations/
generation methods, including additions, freely over the internet at the matching
version. Attribution or expiring/private links alone cannot replace applicable
access. Do not impose additional restrictions on these data or expose users'
personal caches. Recheck obligations when changing sources or distributed data.

The README/store description carry UnderLX/ODbL attribution and provider/licence
URLs. Store copy supplies privacy information; the phone bundle contains these
notices and complete licences. The watch has no About screen.

This is an independent application, not affiliated with or endorsed by UnderLX or
Metro de Lisboa. The project/data licences do not grant third-party branding
rights. UnderLX's software is separately Apache-2.0-licensed; consuming its data
does not incorporate that software into this app.

## Eclipse Paho JavaScript client

The phone bundle includes the unmodified `paho-mqtt@1.1.0` client from
[Eclipse Paho](https://github.com/eclipse/paho.mqtt.javascript). Its source notice
is retained in the generated bundle:

> Copyright (c) 2013 IBM Corp.
>
> All rights reserved. This program and the accompanying materials are made
> available under the terms of the Eclipse Public License v1.0 and Eclipse
> Distribution License v1.0 which accompany this distribution.
>
> Contributor: Andrew Banks — initial API, implementation and documentation.

Complete upstream texts, copied from the pinned npm package:

- [Eclipse Public License 1.0](LICENSES/EPL-1.0.txt)
- [Eclipse Distribution License 1.0](LICENSES/EDL-1.0.txt)

## Generated phone bundle

The Pebble SDK adds a JavaScript wrapper with this notice:

> Copyright 2024 Google LLC
>
> Licensed under the Apache License, Version 2.0.

Its header remains in the generated bundle. The complete
[Apache License 2.0](LICENSES/Apache-2.0.txt) is included.

The generated webpack bootstrap also includes webpack runtime code, under MIT:

> Copyright (c) 2012 - 2015 Tobias Koppers

The complete [webpack MIT licence](LICENSES/MIT-webpack.txt) is copied from the
SDK's webpack package. No webpack source or SDK installation is vendored here.

## SDK, tools and distribution

The watch uses native Pebble C APIs; the [SDK terms](https://developer.repebble.com/legal/sdk-license/)
and applicable toolchain licences remain separate from this project's licence.
The app does not bundle an Alloy/Moddable/Poco archive. Development dependencies
retain the licence texts in their installed packages and are not watch resources.

Every normal build embeds `LICENSE`, this notice and the complete texts in
`LICENSES/` as a comment in the phone JavaScript bundle, alongside the retained
upstream copyright headers. The copies travel inside the PBW, including through
store installation; they are not watch resources and add no native watch RAM.
The build tracks these files so changes refresh the bundled copies. A repository
link or an optional download ZIP is not the licence-copy delivery path.

Packaging alone does not settle data-access obligations. See the UnderLX terms
above and the [publishing guide](docs/appstore.md) for distribution requirements.
Re-audit the emitted bundle and SDK/toolchain terms when changing dependencies or SDKs.
