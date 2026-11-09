"""Offline package/installer guards. No SDK, emulator or physical watch connection."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
import uuid
from zipfile import ZipFile

from release_package import (APP_NAME, APP_UUID, DEV_NAME, DEV_PBW, DEV_UUID, HEADER,
                             TARGETS, metadata, verify_dev_pbw, verify_pbw, version_parts)

ROOT = Path(__file__).resolve().parent.parent
TRANSPORT_ENV = ("PEBBLE_PHONE", "PEBBLE_CLOUDPEBBLE", "PEBBLE_EMULATOR", "PEBBLE_QEMU", "PEBBLE_BT_SERIAL")


class DevInstallTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix="metro dev guards-")
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        (self.root / "tools").mkdir()
        (self.root / "build").mkdir()
        for name in ("package.json", "package-lock.json", "LICENSE", "THIRD_PARTY_NOTICES.md"):
            shutil.copyfile(ROOT / name, self.root / name)
        shutil.copytree(ROOT / "LICENSES", self.root / "LICENSES")
        for name in ("install-dev.sh", "release_package.py"):
            shutil.copyfile(ROOT / "tools" / name, self.root / "tools" / name)
        self.version = metadata(self.root)
        self.dev = self.entries(DEV_UUID, DEV_NAME, self.version)
        self.production = self.entries(APP_UUID, APP_NAME, self.version)
        self.artifact = self.write_bundle(self.dev, "input.pbw")
        self.events = self.root / "events"
        self.args = self.root / "install-args"
        self.sent = self.root / "sent.pbw"
        self.bin = self.root / "bin"
        self.bin.mkdir()
        # Both external commands are stubs; even a broken guard cannot reach a watch.
        guard = "\n".join(f'[[ ! -v {name} ]] || exit 99' for name in TRANSPORT_ENV)
        self.stub("npm", f'''{guard}
[[ "$*" == 'run build:dev' ]] || exit 98
printf 'build\\n' >> "$TEST_EVENTS"
[[ ${{TEST_BUILD_FAIL:-0}} == 0 ]] || exit 1
cp -- "$TEST_ARTIFACT" build/{DEV_PBW}
''')
        self.stub("pebble", f'''{guard}
printf 'install\\n' >> "$TEST_EVENTS"
printf '%s\\n' "$@" > "$TEST_ARGS"
cp -- "${{@: -1}}" "$TEST_SENT"
exit "${{TEST_INSTALL_STATUS:-0}}"
''')

    def entries(self, app_uuid, name, version):
        info = json.loads((self.root / "package.json").read_text())["pebble"]
        info.update(uuid=app_uuid, displayName=name, shortName=name, longName=name, versionLabel=version)
        major, minor = version_parts(version, snapshot=True)
        binary = HEADER.pack(b"PBLAPP\0\0", 0, 0, 0, 0, major, minor, 0, 0, 0,
                             name.encode(), b"", 0, 0, 0, 0, uuid.UUID(app_uuid).bytes)
        notices = [self.root / "LICENSE", self.root / "THIRD_PARTY_NOTICES.md",
                   *sorted((self.root / "LICENSES").glob("*.txt"))]
        entries = {"appinfo.json": json.dumps(info).encode(),
                   "pebble-js-app.js": "\n".join(path.read_text() for path in notices).encode()}
        for target in TARGETS:
            entries[f"{target}/pebble-app.bin"] = binary
            entries[f"{target}/app_resources.pbpack"] = b"resources"
            entries[f"{target}/manifest.json"] = json.dumps({
                "type": "application",
                "application": {"name": "pebble-app.bin", "size": len(binary)},
                "resources": {"name": "app_resources.pbpack", "size": len(b"resources")},
            }).encode()
        return entries

    def write_bundle(self, entries, name="candidate.pbw"):
        path = self.root / name
        with ZipFile(path, "w") as bundle:
            for filename, data in entries.items():
                bundle.writestr(filename, data)
        return path

    def stub(self, name, body):
        path = self.bin / name
        path.write_text("#!/usr/bin/env bash\nset -euo pipefail\n" + body)
        path.chmod(0o755)

    def install(self, *args, **extra_env):
        env = dict(os.environ, PATH=str(self.bin) + os.pathsep + os.environ["PATH"],
                   TEST_ARTIFACT=str(self.artifact), TEST_EVENTS=str(self.events),
                   TEST_ARGS=str(self.args), TEST_SENT=str(self.sent))
        env.update({name: "conflicting-target" for name in TRANSPORT_ENV})
        env.update(extra_env)
        # Deliberately not the project root; the script must locate its own checkout.
        return subprocess.run(["bash", str(self.root / "tools/install-dev.sh"), *args],
                              cwd=self.root / "bin", env=env, capture_output=True, text=True)

    def test_production_and_dev_have_separate_validation_gates(self):
        verify_dev_pbw(self.artifact, self.version, self.root)
        prod = self.write_bundle(self.production, "production.pbw")
        verify_pbw(prod, self.version, self.root)
        with self.assertRaisesRegex(ValueError, "identity"):
            verify_dev_pbw(prod, self.version, self.root)
        # A release-looking label and filename still cannot pass the production gate.
        for version in (self.version, "1.0.0"):
            with self.subTest(version=version):
                path = self.write_bundle(self.entries(DEV_UUID, DEV_NAME, version), "production.pbw")
                with self.assertRaisesRegex(ValueError, "identity"):
                    verify_pbw(path, version, self.root)

    def test_dev_rejects_mismatched_metadata(self):
        for field, value in (("uuid", APP_UUID), ("versionLabel", "1.0.0"),
                             ("displayName", APP_NAME), ("shortName", APP_NAME),
                             ("longName", APP_NAME), ("targetPlatforms", ["emery"]),
                             ("manifestVersion", 1), ("usesPermissions", [])):
            with self.subTest(field=field):
                entries = self.dev.copy()
                info = json.loads(entries["appinfo.json"])
                info[field] = value
                entries["appinfo.json"] = json.dumps(info).encode()
                with self.assertRaises(ValueError):
                    verify_dev_pbw(self.write_bundle(entries), self.version, self.root)

    def test_dev_rejects_wrong_native_identity_on_either_target(self):
        for target in TARGETS:
            for field, value in ((16, uuid.UUID(APP_UUID).bytes), (10, APP_NAME.encode()), (6, 255)):
                with self.subTest(target=target, field=field):
                    entries = self.dev.copy()
                    path = f"{target}/pebble-app.bin"
                    header = list(HEADER.unpack(entries[path]))
                    header[field] = value
                    entries[path] = HEADER.pack(*header)
                    with self.assertRaisesRegex(ValueError, "Native binary"):
                        verify_dev_pbw(self.write_bundle(entries), self.version, self.root)

    def test_explicit_phone_builds_verifies_and_sends_only_private_dev_copy(self):
        result = self.install("--phone", "192.0.2.1")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.events.read_text(), "build\ninstall\n")
        args = self.args.read_text().splitlines()
        self.assertEqual(args[:3], ["install", "--phone", "192.0.2.1"])
        self.assertEqual(Path(args[3]).name, DEV_PBW)
        self.assertNotEqual(Path(args[3]).parent, self.root / "build")
        self.assertFalse(Path(args[3]).exists(), "Private package must be cleaned up")
        self.assertEqual(self.sent.read_bytes(), self.artifact.read_bytes())
        verify_dev_pbw(self.sent, self.version, self.root)

    def test_explicit_cloud_connection(self):
        result = self.install("--cloudpebble")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.args.read_text().splitlines()[:2], ["install", "--cloudpebble"])

    def test_invalid_arguments_never_build_or_install(self):
        for args in ((), ("--phone",), ("--phone", ""), ("--phone", "--force"),
                     ("--phone", "two words"), ("--phone", "192.0.2.1", "production.pbw"),
                     ("--cloudpebble", "--logs"), ("--emulator", "emery")):
            with self.subTest(args=args):
                self.assertNotEqual(self.install(*args).returncode, 0)
                self.assertFalse(self.events.exists())

    def test_failed_build_never_installs_stale_dev_artifact(self):
        shutil.copyfile(self.artifact, self.root / "build" / DEV_PBW)
        result = self.install("--phone", "192.0.2.1", TEST_BUILD_FAIL="1")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.events.read_text(), "build\n")
        self.assertFalse(self.args.exists())

    def test_production_disguised_as_dev_never_installs(self):
        self.artifact = self.write_bundle(self.production, "disguised-dev.pbw")
        result = self.install("--phone", "192.0.2.1")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("identity", result.stderr)
        self.assertEqual(self.events.read_text(), "build\n")
        self.assertFalse(self.args.exists())

    def test_install_failure_propagates_and_removes_private_copy(self):
        result = self.install("--phone", "192.0.2.1", TEST_INSTALL_STATUS="7")
        self.assertEqual(result.returncode, 7)
        self.assertFalse(Path(self.args.read_text().splitlines()[-1]).exists())


if __name__ == "__main__":
    unittest.main()
