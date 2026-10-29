# Third-party notices

Original project code is under [0BSD](LICENSE). That grant does not change the
licences of dependencies, generated third-party code or UnderLX data.

## UnderLX data

Station, line and arrival data come from [UnderLX](https://underlx.com/). Its
developer portal describes API data as [Open Database Licence 1.0
(ODbL)](https://opendatacommons.org/licenses/odbl/1-0/) unless otherwise indicated.
The app credits UnderLX and ODbL in **About / data**. No live database is bundled
in the source repository; fixture data is for deterministic tests. Redistributing
provider data requires respecting its separate terms.

This is an independent application, not affiliated with or endorsed by Metro de
Lisboa. The project licence does not grant rights to third-party branding.

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

Binary distributions must accompany the PBW with this notice and the applicable
complete texts in `LICENSES/`; do not rely on a private repository link. See the
[release checklist](docs/publishing-todo.md) for a download-bundle example. Re-audit
the emitted bundle and SDK/toolchain terms when changing dependencies or SDKs.
