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

**[Data transformations and access requirements](DATA_METHODS.md):** ODbL does not
automatically require publishing the application source. Sections 4.4(c) and 4.6
can require a recipient-accessible machine-readable database or complete alteration
file/method, including additional contents, when publicly using a Derivative
Database or a Produced Work from one. The applicability assessment and any required
private-source-compatible offer remain release gates; a private repository link
or attribution alone does not settle them. No public application-source archive
or available methods offer is promised here. Preserve attribution/licence notices
with redistributed data and publicly shared screenshots.

The watch's **About / data** shows UnderLX, ODbL, the provider/licence URLs and
where privacy information and bundled licence copies are supplied. It does not
link users to the private repository. The README and draft store listing also
carry attribution. Recheck provider-specific exceptions when adding data. See
[DATA_METHODS.md](DATA_METHODS.md) for the scope and unresolved release gate.

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
The build tracks these files so changes refresh the bundled copies. A private
repository link or an optional download ZIP is not the licence-copy delivery path.

This packaging step does not resolve the UnderLX data-access assessment above or
make a build ready for external distribution. See the
[release checklist](docs/publishing-todo.md). Re-audit the emitted bundle and
SDK/toolchain terms when changing dependencies or SDKs.
