# Watch installation

- When the user asks to install/send/update the watch app, use the **development**
  app unless they explicitly request production/live.
- Use `npm run install:dev -- --phone PHONE_ADDRESS` with the owner's explicit
  target, or `npm run install:dev -- --cloudpebble` for their cloud connection.
  The Bash script builds, checks the fixed dev UUID in the PBW and both native
  headers, then installs that exact package. Never bypass its validation.
- Never use bare `pebble install` or install the default build for routine testing:
  `npm run build` / `npm run check` produce the **production UUID**, replacing live.
- Do not uninstall live, wipe the watch or clear phone app data to install dev.
  Dev has its own stable identity and favourites; update it without uninstalling.
- Building, running checks and opening a PR do not authorize physical installation.
  Only send to a watch when the user requests it. Installer tests use mocked
  external commands and never contact hardware.

E2E stays single-app/production; no dual-app emulator infrastructure is needed.
Run `python3 -m unittest discover -s tools -p 'test_dev_install.py'` for offline
package and installer safety checks. See README for build/install commands.
