"""Release safety checks. All publishing APIs are mocked; Git remotes are local."""
import copy
import json
import os
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch
import urllib.error
import urllib.request
import uuid
import warnings
import zipfile

import pebble_store as store
import release
import release_package as package

HTTP_REQUEST = store.request


class Files(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.old_cwd = Path.cwd()
        os.chdir(self.root)
        self.addCleanup(os.chdir, self.old_cwd)
        self.addCleanup(patch.stopall)
        # A missed mock must never invoke a real GitHub or Pebble write.
        self.api = patch.object(release, "api", side_effect=AssertionError("Unexpected GitHub call")).start()
        self.request = patch.object(store, "request", side_effect=AssertionError("Unexpected Pebble call")).start()
        patch.dict(os.environ, {"GITHUB_OUTPUT": "", "GITHUB_ACTIONS": "false"}).start()
        self.write_metadata()

    def write_metadata(self, version="0.3.0-snapshot"):
        package.write_json("package.json", {"version": version, "pebble": {
            "uuid": package.APP_UUID, "targetPlatforms": package.TARGETS}})
        package.write_json("package-lock.json", {"version": version, "packages": {"": {"version": version}}})

    def bundle(self, version="0.3.0"):
        for name in ("LICENSE", "THIRD_PARTY_NOTICES.md", "LICENSES/dependency.txt"):
            p = Path(name)
            p.parent.mkdir(exist_ok=True)
            p.write_text("Complete notice " + name + "\n")
        self.entries = {
            "appinfo.json": json.dumps({"uuid": package.APP_UUID, "versionLabel": version,
                                        "targetPlatforms": package.TARGETS}).encode(),
            "pebble-js-app.js": b"\n".join(Path(p).read_bytes() for p in
                                          ("LICENSE", "THIRD_PARTY_NOTICES.md", "LICENSES/dependency.txt")),
        }
        # Native format from libpebble2; UUID begins at byte 104.
        header = bytearray(120)
        header[:8] = b"PBLAPP\0\0"
        header[8:14] = bytes([16, 0, 5, 106, *package.version_parts(version, snapshot=True)])
        header[104:120] = uuid.UUID(package.APP_UUID).bytes
        for target in package.TARGETS:
            self.entries[target + "/pebble-app.bin"] = bytes(header)
            self.entries[target + "/app_resources.pbpack"] = b"resources"
            self.entries[target + "/manifest.json"] = json.dumps({"type": "application",
                "application": {"name": "pebble-app.bin", "size": len(header)},
                "resources": {"name": "app_resources.pbpack", "size": 9}}).encode()
        return self.save_bundle()

    def save_bundle(self):
        path = Path("candidate.pbw")
        with zipfile.ZipFile(path, "w") as archive:
            for name, data in self.entries.items():
                archive.writestr(name, data)
        return path


class Versions(Files):
    def test_minor_promotes_planned_snapshot_and_major_resets(self):
        self.assertEqual(package.release_version("0.3.0-snapshot", "minor"), "0.3.0")
        self.assertEqual(package.release_version("0.3.0-snapshot", "major"), "1.0.0")
        self.assertEqual(package.next_snapshot("0.3.0"), "0.4.0-snapshot")
        self.assertEqual(package.next_snapshot("1.0.0"), "1.1.0-snapshot")

    def test_numeric_limits(self):
        self.assertEqual(package.next_snapshot("1.255.0"), "2.0.0-snapshot")
        for value in ("256.0.0", "0.256.0", "0.3.1", "00.3.0", "1.0", "-1.0.0", "1.0.0-beta", "１.0.0"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                package.version_parts(value)
        with self.assertRaises(ValueError):
            package.release_version("255.1.0-snapshot", "major")
        with self.assertRaises(ValueError):
            package.next_snapshot("255.255.0")

    def test_release_requires_snapshot_and_never_patch(self):
        for version, kind in (("0.3.0", "minor"), ("0.3.0-snapshot", "patch")):
            with self.assertRaises(ValueError):
                package.release_version(version, kind)
        with self.assertRaises(ValueError):
            release.tag_version("v0.3.0-snapshot")

    def test_version_update_preserves_other_metadata(self):
        package.set_version(Path("."), "1.0.0")
        self.assertEqual(package.metadata(), "1.0.0")
        self.assertEqual(package.read_json("package.json")["pebble"]["uuid"], package.APP_UUID)

    def test_stale_lock_uuid_and_targets_rejected(self):
        for change in ("lock", "uuid", "targetPlatforms"):
            self.write_metadata()
            path = "package-lock.json" if change == "lock" else "package.json"
            data = package.read_json(path)
            if change == "lock":
                data["packages"][""]["version"] = "0.2.0"
            else:
                data["pebble"][change] = "wrong" if change == "uuid" else ["emery"]
            package.write_json(path, data)
            with self.subTest(change=change), self.assertRaises(ValueError):
                package.metadata()


class Bundles(Files):
    def test_stable_and_snapshot_headers_and_licences(self):
        for version in ("0.3.0", "0.3.0-snapshot"):
            pbw = self.bundle(version)
            self.assertEqual(package.verify_pbw(pbw, version), package.sha256(pbw))

    def test_identity_version_target_and_resource_corruption(self):
        self.bundle()
        original = copy.deepcopy(self.entries)
        mutations = {
            "UUID": ("appinfo.json", self.entries["appinfo.json"].replace(package.APP_UUID.encode(), str(uuid.uuid4()).encode())),
            "version": ("appinfo.json", self.entries["appinfo.json"].replace(b"0.3.0", b"0.4.0")),
            "native version": ("emery/pebble-app.bin", self.entries["emery/pebble-app.bin"][:13] + b"\x04" + self.entries["emery/pebble-app.bin"][14:]),
            "native UUID": ("gabbro/pebble-app.bin", self.entries["gabbro/pebble-app.bin"][:104] + bytes(16)),
            "resources": ("gabbro/app_resources.pbpack", b""),
            "licence": ("pebble-js-app.js", b"Complete notice LICENSE\n"),
        }
        for name, (entry, data) in mutations.items():
            self.entries = copy.deepcopy(original)
            self.entries[entry] = data
            with self.subTest(name=name), self.assertRaises(ValueError):
                package.verify_pbw(self.save_bundle(), "0.3.0")

    def test_missing_platform_or_unexpected_file(self):
        self.bundle()
        del self.entries["gabbro/manifest.json"]
        with self.assertRaisesRegex(ValueError, "target manifests"):
            package.verify_pbw(self.save_bundle(), "0.3.0")
        self.bundle()
        self.entries["secret.json"] = b"unexpected"
        with self.assertRaisesRegex(ValueError, "Unexpected PBW entries"):
            package.verify_pbw(self.save_bundle(), "0.3.0")

    def test_duplicate_or_oversized_archive_rejected(self):
        pbw = self.bundle()
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", UserWarning)
            with zipfile.ZipFile(pbw, "a") as z:
                z.writestr("appinfo.json", "{}")
        with self.assertRaisesRegex(ValueError, "Duplicate"):
            package.verify_pbw(pbw, "0.3.0")
        pbw.write_bytes(bytes(package.MAX_PBW_BYTES + 1))
        with self.assertRaisesRegex(ValueError, "4.4 MB"):
            package.verify_pbw(pbw, "0.3.0")


class Store(Files):
    def setUp(self):
        super().setUp()
        self.pbw = self.bundle()
        self.client = store.PebbleStore("test-token")
        self.me = {"app_lookup": {"by_app_uuid": {package.APP_UUID: package.APP_ID}},
                   "upload_constraints": {"max_pbw_bytes": 4_400_000},
                   "apps": [{"app_id": package.APP_ID, "app_uuid": package.APP_UUID, "versions": ["0.2.0"]}]}
        self.public = {"data": [{"id": package.APP_ID, "uuid": package.APP_UUID,
            "latest_release": {"id": "release-3", "version": "0.3.0",
                "pbw_file": store.API + f"/api/assets/pbw/{package.APP_ID}/0.3.0/package.pbw"}}]}

    def test_uploads_exact_bytes_then_verifies_public_asset(self):
        self.request.side_effect = [self.me, {}, self.public, self.pbw.read_bytes()]
        receipt = self.client.publish(self.pbw, "0.3.0", "Generated notes")
        self.assertEqual(receipt["sha256"], package.sha256(self.pbw))
        args = self.request.call_args_list[1].args
        self.assertIn(self.pbw.read_bytes(), args[2])
        self.assertIn(b'name="isPublished"\r\n\r\ntrue', args[2])
        self.assertIn(b'name="replaceScreenshots"\r\n\r\nfalse', args[2])
        self.assertEqual(args[1], "test-token")
        self.assertEqual(self.request.call_args_list[-1].args, (self.public["data"][0]["latest_release"]["pbw_file"],))

    def test_existing_matching_version_is_never_reuploaded(self):
        self.me["apps"][0]["versions"].append("0.3.0")
        self.request.side_effect = [self.me, self.public, self.pbw.read_bytes()]
        self.client.publish(self.pbw, "0.3.0", "Notes")
        self.assertEqual(self.request.call_count, 3)
        self.assertTrue(all(len(c.args) < 3 for c in self.request.call_args_list))

    def test_existing_conflicting_bytes_fail_without_post(self):
        self.me["apps"][0]["versions"].append("0.3.0")
        self.request.side_effect = [self.me, self.public, b"another build"]
        with self.assertRaisesRegex(ValueError, "different PBW bytes"):
            self.client.publish(self.pbw, "0.3.0", "Notes")
        self.assertTrue(all(len(c.args) < 3 for c in self.request.call_args_list))

    def test_timeout_does_not_blindly_retry_post(self):
        self.request.side_effect = [self.me, RuntimeError("Timed out")]
        with self.assertRaises(RuntimeError):
            self.client.publish(self.pbw, "0.3.0", "Notes")
        self.assertEqual(self.request.call_count, 2)

    def test_wrong_owner_newer_version_or_size_limit_stop_before_upload(self):
        for problem in ("owner", "version", "size"):
            me = copy.deepcopy(self.me)
            if problem == "owner":
                me["app_lookup"]["by_app_uuid"] = {}
            elif problem == "version":
                me["apps"][0]["versions"].append("1.0.0")
            else:
                me["upload_constraints"]["max_pbw_bytes"] = 1
            self.request.reset_mock()
            self.request.side_effect = [me]
            with self.subTest(problem=problem), self.assertRaises(ValueError):
                self.client.publish(self.pbw, "0.3.0", "Notes")
            self.assertEqual(self.request.call_count, 1)

    def test_public_listing_delay_and_unexpected_url_fail(self):
        for problem in ("version", "url"):
            public = copy.deepcopy(self.public)
            public["data"][0]["latest_release"]["version" if problem == "version" else "pbw_file"] = "unexpected"
            self.request.side_effect = [public]
            with self.assertRaises(ValueError):
                self.client.receipt("0.3.0", package.sha256(self.pbw))

    def test_refreshes_short_lived_auth_and_requires_credentials(self):
        with patch.dict(os.environ, {"PEBBLE_FIREBASE_API_KEY": "test-key", "PEBBLE_FIREBASE_REFRESH_TOKEN": "test-refresh"}):
            self.request.side_effect = [{"id_token": "test-id", "refresh_token": "test-rotated"}]
            self.assertEqual(store.refresh_token(), "test-id")
            self.assertIn(b"grant_type=refresh_token", self.request.call_args.kwargs["data"])
        with patch.dict(os.environ, {"PEBBLE_FIREBASE_API_KEY": "", "PEBBLE_FIREBASE_REFRESH_TOKEN": ""}):
            with self.assertRaisesRegex(ValueError, "Configure"):
                store.refresh_token()

    def test_redirect_policy_never_forwards_auth(self):
        req = urllib.request.Request(store.API)
        self.assertIsNone(store.NoRedirect().redirect_request(req, None, 307, "", {}, "https://example.com"))
        handler = store.PublicAssetRedirect()
        for url in ("http://pebble-appstore-backend.x.r2.cloudflarestorage.com/x", "https://example.com/x"):
            with self.assertRaises(ValueError):
                handler.redirect_request(req, None, 307, "", {}, url)
        redirect = handler.redirect_request(req, None, 307, "", {},
                                            "https://pebble-appstore-backend.x.r2.cloudflarestorage.com/pbw/file")
        self.assertNotIn("Authorization", redirect.headers)

    def test_http_failures_do_not_disclose_token_or_response(self):
        secret = "private-token"
        error = urllib.error.HTTPError("https://example.invalid/" + secret, 400, secret, {}, None)
        with patch("urllib.request.build_opener") as opener:
            opener.return_value.open.side_effect = error
            with self.assertRaises(RuntimeError) as caught:
                HTTP_REQUEST("https://example.invalid/" + secret, token=secret)
        self.assertNotIn(secret, str(caught.exception))
        self.assertIn("HTTP 400", str(caught.exception))
        with self.assertRaises(ValueError):
            HTTP_REQUEST("https://example.invalid", token=secret, binary=True)


class GitFlow(Files):
    def setUp(self):
        super().setUp()
        release.git("init", "-b", "main")
        Path("app.c").write_text("trusted main source\n")
        self.commit("Initial main")
        self.base = release.git("rev-parse", "HEAD")
        release.git("update-ref", "refs/remotes/origin/main", self.base)
        patch.dict(os.environ, {"GITHUB_REF": "refs/heads/main"}).start()

    def commit(self, message):
        release.git("add", ".")
        release.git(*release.BOT, "commit", "-m", message)

    def candidate(self):
        release.git("switch", "-c", "release/0.3.0")
        package.set_version(Path("."), "0.3.0")
        self.commit("Release 0.3.0")
        release.git(*release.BOT, "tag", "-a", "v0.3.0", "-m", "Release 0.3.0")

    def remote(self):
        # A sibling local bare repository is the only remote these tests can push to.
        remote = self.root / "remote.git"
        release.git("init", "--bare", str(remote))
        Path(".git/info/exclude").write_text("remote.git/\n")
        release.git("remote", "add", "origin", str(remote))
        release.git("push", "origin", "main")

    def test_trusts_only_main_or_single_version_only_commit(self):
        self.candidate()
        self.assertEqual(release.validate_tag("v0.3.0")[0], "0.3.0")
        Path("app.c").write_text("unexpected release-only source\n")
        release.git("tag", "-d", "v0.3.0")
        self.commit("Unreviewed change")
        release.git("tag", "v0.3.0")
        with self.assertRaisesRegex(ValueError, "trusted main"):
            release.validate_tag("v0.3.0")

    def test_rejects_nonversion_package_changes(self):
        package.set_version(Path("."), "0.3.0")
        data = package.read_json("package.json")
        data["scripts"] = {"build": "unreviewed command"}
        package.write_json("package.json", data)
        self.commit("Unexpected package edit")
        release.git("tag", "v0.3.0")
        with self.assertRaisesRegex(ValueError, "non-version"):
            release.validate_tag("v0.3.0")

    def test_tag_version_must_match_all_metadata(self):
        self.candidate()
        release.git("tag", "v1.0.0")
        with self.assertRaisesRegex(ValueError, "versions differ"):
            release.validate_tag("v1.0.0")
        with self.assertRaisesRegex(ValueError, "already distributed"):
            release.validate_tag("v0.2.0")

    def test_prepare_creates_atomic_refs_and_dispatches_and_can_resume(self):
        self.remote()
        patch.object(release, "releases", return_value=[]).start()
        patch.object(release, "ensure_draft", return_value={}).start()
        self.api.side_effect = None
        release.prepare("minor")
        commit = release.git("rev-parse", "HEAD")
        self.assertEqual(release.git("rev-parse", "HEAD^"), self.base)
        self.assertEqual(release.git("rev-parse", "v0.3.0^{commit}"), commit)
        self.assertEqual(package.metadata(), "0.3.0")
        self.api.assert_called_with("POST", "actions/workflows/publish-release.yml/dispatches",
                                    {"ref": "main", "inputs": {"tag": "v0.3.0"}})
        release.git("switch", "main")
        release.prepare("minor")
        self.assertEqual(release.git("rev-parse", "v0.3.0^{commit}"), commit)

    def test_existing_release_blocks_preparation(self):
        patch.object(release, "releases", return_value=[{"tag_name": "v0.3.0", "draft": False}]).start()
        with self.assertRaisesRegex(ValueError, "used or superseded"):
            release.prepare("minor")
        self.api.assert_not_called()

    def test_preparation_rejects_a_conflicting_release_branch(self):
        self.remote()
        patch.object(release, "releases", return_value=[]).start()
        patch.object(release, "ensure_draft", return_value={}).start()
        self.api.side_effect = None
        release.prepare("minor")
        release.git("switch", "main")
        # Simulate a separately changed branch, keeping the original tag untouched.
        release.git("push", "--force", "origin", "main:refs/heads/release/0.3.0")
        self.api.reset_mock()
        with self.assertRaisesRegex(ValueError, "another source revision"):
            release.prepare("minor")
        self.api.assert_not_called()

    def test_finds_existing_drafts_and_rejects_duplicate_releases(self):
        draft = {"tag_name": "v0.3.0", "draft": True}
        with patch.object(release, "releases", return_value=[draft]):
            self.assertEqual(release.get_release("v0.3.0"), draft)
            self.assertIsNone(release.get_release("v1.0.0"))
        with patch.object(release, "releases", return_value=[draft, draft]):
            with self.assertRaisesRegex(ValueError, "Multiple releases"):
                release.get_release("v0.3.0")

    def test_next_snapshot_recovers_pushed_branch_and_dispatches_pr_checks(self):
        self.remote()
        release.git("switch", "-c", "chore/next-0.4.0")
        package.set_version(Path("."), "0.4.0-snapshot")
        self.commit("Start next development")
        release.git("push", "origin", "HEAD")
        release.git("switch", "main")
        patch.object(release, "get_release", return_value={"draft": False}).start()
        self.api.side_effect = [[], {"html_url": "https://example.invalid/pr"}, None]
        release.advance("v0.3.0")
        self.assertEqual(self.api.call_args_list[1].args[1], "pulls")
        self.api.assert_called_with("POST", "actions/workflows/e2e.yml/dispatches", {"ref": "chore/next-0.4.0"})
        self.assertEqual(release.git("rev-parse", "main"), self.base)


class Publication(Files):
    def setUp(self):
        super().setUp()
        self.pbw = self.bundle()
        Path("dist").mkdir()
        self.filename = release.names("0.3.0")[0]
        shutil.copyfile(self.pbw, Path("dist") / self.filename)
        self.record = {"version": "0.3.0", "source_commit": "trusted-sha", "sdk": package.SDK,
            "pebble_tool": package.TOOL, "targets": package.TARGETS, "pbw": self.filename,
            "sha256": package.sha256(self.pbw), "build_run": "original-run"}
        package.write_json("dist/provenance.json", self.record)
        Path("dist/SHA256SUMS").write_text(f"{self.record['sha256']}  {self.filename}\n")
        self.draft = {"draft": True, "id": 123, "assets": [], "body": "Release notes"}
        self.receipt = {"app_id": package.APP_ID, "release_id": "store-release", "version": "0.3.0",
                        "sha256": self.record["sha256"]}
        patch.object(release, "validate_tag", return_value=("0.3.0", "trusted-sha")).start()
        patch.object(release, "ensure_draft", return_value=self.draft).start()
        self.upload_patch = patch.object(release, "immutable_upload")
        self.upload = self.upload_patch.start()
        patch.object(store, "refresh_token", return_value="test-token").start()
        self.store_publish = patch.object(store.PebbleStore, "publish", return_value=self.receipt).start()
        self.api.side_effect = None

    def test_freezes_candidate_before_store_and_publishes_github_last(self):
        events = []
        self.upload.side_effect = lambda tag, draft, path: events.append(path.name)
        self.store_publish.side_effect = lambda *args: events.append("store") or self.receipt
        self.api.side_effect = lambda *args: events.append("github")
        release.publish("v0.3.0")
        self.assertEqual(events, ["provenance.json", self.filename, "SHA256SUMS", "store", "pebble-release.json", "github"])

    def test_store_failure_leaves_github_draft(self):
        self.store_publish.side_effect = RuntimeError("Upload timed out")
        with self.assertRaises(RuntimeError):
            release.publish("v0.3.0")
        self.api.assert_not_called()

    def test_tampered_artifact_never_reaches_store(self):
        (Path("dist") / self.filename).write_bytes(b"different build")
        with self.assertRaisesRegex(ValueError, "provenance/hash"):
            release.publish("v0.3.0")
        self.store_publish.assert_not_called()

    def test_completed_publication_is_noop(self):
        self.draft["draft"] = False
        with patch.object(release, "download", side_effect=lambda tag, name, folder: package.write_json(Path(folder) / name, self.receipt)):
            release.publish("v0.3.0")
        self.store_publish.assert_not_called()
        self.api.assert_not_called()

    def test_resume_reuses_exact_frozen_pbw_and_original_provenance(self):
        self.draft["assets"] = [{"name": name} for name in (self.filename, "provenance.json")]
        patch.object(release, "get_release", return_value=self.draft).start()
        def download(tag, name, folder):
            shutil.copyfile(Path("dist") / name, Path(folder) / name)
        with patch.object(release, "download", side_effect=download):
            release.restore("v0.3.0")
        self.assertEqual(package.sha256(Path("build") / (self.root.name + ".pbw")), self.record["sha256"])
        self.assertEqual(package.read_json("dist/provenance.json"), self.record)

    def test_partial_staging_refuses_rebuild(self):
        self.draft["assets"] = [{"name": "provenance.json"}]
        patch.object(release, "get_release", return_value=self.draft).start()
        with self.assertRaisesRegex(ValueError, "original Actions run"):
            release.restore("v0.3.0")

    def test_existing_different_asset_is_never_overwritten(self):
        # Exercise the real implementation rather than the publication-order mock.
        self.upload_patch.stop()
        with patch.object(release, "download", side_effect=lambda tag, name, folder: (Path(folder) / name).write_bytes(b"old bytes")), \
                patch.object(release, "run", side_effect=AssertionError("Must not upload")):
            with self.assertRaisesRegex(ValueError, "refusing overwrite"):
                release.immutable_upload("v0.3.0", {"assets": [{"name": self.filename}], "draft": True}, Path("dist") / self.filename)


if __name__ == "__main__":
    unittest.main()
