"""Offline publication regressions; stdlib only, no live store uploads."""
import contextlib
import copy
import hashlib
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch
import urllib.error
import urllib.parse

import pebble_store
import rebble_store
import release
from release_package import APP_UUID, SDK, TARGETS, TOOL


class OfflineTest(unittest.TestCase):
    def setUp(self):
        self.addCleanup(patch.stopall)
        patch("urllib.request.OpenerDirector.open", side_effect=AssertionError("Network forbidden in tests")).start()
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.path = Path(self.directory.name) / "metro-lisboa-0.4.0.pbw"
        self.binary = b"verified package bytes\x00\xff\r\n"
        self.path.write_bytes(self.binary)
        self.digest = hashlib.sha256(self.binary).hexdigest()


class RebbleStoreTests(OfflineTest):
    def setUp(self):
        super().setUp()
        self.app = {"id": rebble_store.APP_ID, "uuid": APP_UUID,
                    "developer_id": rebble_store.DEVELOPER_ID,
                    "latest_release": {"version": "0.3.0", "id": "a" * 24,
                                       "pbw_file": "https://storage.googleapis.com/rebble-pbws/pbw/" + "a" * 24 + ".pbw"},
                    "compatibility": {target: {"has_binary": True} for target in TARGETS}}
        self.me = {"id": rebble_store.DEVELOPER_ID, "needsSetup": False,
                   "applications": [{"id": rebble_store.APP_ID}]}
        self.uploads = []
        self.asset = self.binary
        self.api = patch.object(rebble_store, "request", side_effect=self.respond).start()
        self.store = rebble_store.RebbleStore("private-access-token")

    def respond(self, url, token=None, data=None, content_type=None, binary=False, limit=None):
        if url.endswith("/api/v0/users/me/developer"):
            self.assertEqual(token, "private-access-token")
            return copy.deepcopy(self.me)
        if "/api/v1/apps/id/" in url:
            self.assertIsNone(token)
            return {"data": [copy.deepcopy(self.app)]}
        if url.startswith("https://storage.googleapis.com/"):
            self.assertTrue(binary)
            self.assertIsNone(token)
            self.assertIsNone(data)
            return self.asset
        self.assertEqual(url, rebble_store.API + f"/api/dp/app/{rebble_store.APP_ID}/release")
        self.assertEqual(token, "private-access-token")
        self.assertIn(self.binary, data)
        self.assertIn(b'name="pbw"', data)
        self.assertIn(b'name="release_notes"', data)
        self.assertNotIn(b'name="visible"', data)
        self.assertNotIn(b'name="screenshot"', data)
        self.assertIn("multipart/form-data", content_type)
        self.uploads.append(data)
        self.app["latest_release"]["version"] = "0.4.0"
        return {"success": True}

    def test_uploads_exact_bytes_once_and_verifies_receipt(self):
        result = self.store.publish(self.path, "0.4.0", "Public release notes")
        self.assertEqual(len(self.uploads), 1)
        self.assertEqual(result["sha256"], self.digest)
        self.assertEqual(result["app_id"], rebble_store.APP_ID)
        self.assertEqual(self.path.read_bytes(), self.binary)

    def test_retry_skips_matching_existing_version(self):
        first = self.store.publish(self.path, "0.4.0", "Notes")
        self.assertEqual(self.store.publish(self.path, "0.4.0", "Notes"), first)
        self.assertEqual(len(self.uploads), 1)

    def test_conflicting_existing_bytes_are_not_uploaded(self):
        self.app["latest_release"]["version"] = "0.4.0"
        self.asset = b"different package"
        with self.assertRaisesRegex(ValueError, "different PBW bytes"):
            self.store.publish(self.path, "0.4.0", "Notes")
        self.assertEqual(self.uploads, [])

    def test_newer_version_blocks_downgrade(self):
        self.app["latest_release"]["version"] = "0.5.0"
        with self.assertRaisesRegex(ValueError, "newer Rebble"):
            self.store.publish(self.path, "0.4.0", "Notes")
        self.assertEqual(self.uploads, [])

    def test_wrong_account_or_missing_owned_app_is_rejected(self):
        for key, value in [("id", "other-account"), ("needsSetup", True), ("applications", [])]:
            with self.subTest(key=key):
                original = self.me[key]
                self.me[key] = value
                with self.assertRaisesRegex(ValueError, "does not own"):
                    self.store.publish(self.path, "0.4.0", "Notes")
                self.me[key] = original
        self.assertEqual(self.uploads, [])

    def test_public_identity_mismatch_is_rejected(self):
        for key in ("id", "uuid", "developer_id"):
            with self.subTest(key=key):
                original = self.app[key]
                self.app[key] = "wrong"
                with self.assertRaisesRegex(ValueError, "Unexpected public Rebble"):
                    self.store.publish(self.path, "0.4.0", "Notes")
                self.app[key] = original
        self.assertEqual(self.uploads, [])

    def test_missing_target_blocks_acceptance(self):
        self.app["latest_release"]["version"] = "0.4.0"
        self.app["compatibility"]["gabbro"]["has_binary"] = False
        with self.assertRaisesRegex(ValueError, "missing a watch target"):
            self.store.publish(self.path, "0.4.0", "Notes")
        self.assertEqual(self.uploads, [])

    def test_unexpected_asset_urls_are_never_fetched(self):
        self.app["latest_release"]["version"] = "0.4.0"
        for url in ("https://evil.test/package.pbw", "http://storage.googleapis.com/rebble-pbws/pbw/a.pbw",
                    self.app["latest_release"]["pbw_file"] + "?signed=secret"):
            with self.subTest(url=url):
                self.app["latest_release"]["pbw_file"] = url
                with self.assertRaisesRegex(ValueError, "Unexpected Rebble PBW"):
                    self.store.publish(self.path, "0.4.0", "Notes")
        self.assertEqual(self.uploads, [])

    def test_snapshot_and_empty_package_are_rejected(self):
        with self.assertRaisesRegex(ValueError, "release cannot"):
            self.store.publish(self.path, "0.4.0-snapshot", "Notes")
        self.path.write_bytes(b"")
        with self.assertRaisesRegex(ValueError, "empty"):
            self.store.publish(self.path, "0.4.0", "Notes")
        self.api.assert_not_called()

    def test_unexpected_upload_response_stops_without_retry(self):
        for response in (None, [], {}, {"success": False}):
            with self.subTest(response=response):
                self.api.reset_mock()
                self.api.side_effect = [copy.deepcopy(self.me), {"data": copy.deepcopy([self.app])}, response]
                with self.assertRaisesRegex(ValueError, "Unexpected Rebble upload response"):
                    self.store.publish(self.path, "0.4.0", "Notes")
                self.assertEqual(self.api.call_count, 3)
                self.assertIn("/release", self.api.call_args.args[0])

    def test_timeout_is_not_retried_and_next_run_reconciles(self):
        self.api.side_effect = [copy.deepcopy(self.me), {"data": copy.deepcopy([self.app])},
                                RuntimeError("upload timed out")]
        with self.assertRaisesRegex(RuntimeError, "timed out"):
            self.store.publish(self.path, "0.4.0", "Notes")
        self.assertEqual(self.api.call_count, 3)
        self.assertIn("/release", self.api.call_args.args[0])
        # A timeout may happen after commit; the next run sees and verifies it.
        self.app["latest_release"]["version"] = "0.4.0"
        self.api.side_effect = self.respond
        self.assertEqual(self.store.publish(self.path, "0.4.0", "Notes")["sha256"], self.digest)
        self.assertEqual(self.uploads, [])


class PebblePreflightTests(OfflineTest):
    def setUp(self):
        super().setUp()
        self.store = pebble_store.PebbleStore("private-access-token")
        self.app = {"versions": ["0.3.0"]}
        patch.object(self.store, "context", side_effect=lambda: (self.app, 4_400_000)).start()
        self.receipt = {"sha256": self.digest}
        self.verify = patch.object(self.store, "receipt", return_value=self.receipt).start()
        self.api = patch.object(pebble_store, "request").start()

    def test_new_version_posts_exact_bytes_once(self):
        self.assertEqual(self.store.publish(self.path, "0.4.0", "Notes"), self.receipt)
        self.api.assert_called_once()
        self.assertIn(self.binary, self.api.call_args.args[2])
        self.verify.assert_called_once_with("0.4.0", self.digest)

    def test_matching_version_skips_post(self):
        self.app["versions"].append("0.4.0")
        self.assertEqual(self.store.publish(self.path, "0.4.0", "Notes"), self.receipt)
        self.api.assert_not_called()

    def test_conflicting_version_or_newer_version_skips_post(self):
        self.app["versions"].append("0.4.0")
        self.verify.side_effect = ValueError("different bytes")
        with self.assertRaisesRegex(ValueError, "different bytes"):
            self.store.publish(self.path, "0.4.0", "Notes")
        self.app["versions"].append("0.5.0")
        with self.assertRaisesRegex(ValueError, "newer store version"):
            self.store.publish(self.path, "0.4.0", "Notes")
        self.api.assert_not_called()


class TransportTests(OfflineTest):
    def test_refresh_uses_post_body_and_masks_new_tokens(self):
        with patch.dict(os.environ, {"REBBLE_REFRESH_TOKEN": "private-refresh", "GITHUB_ACTIONS": "true"}, clear=True), \
             patch.object(rebble_store, "request", return_value={"access_token": "private-access",
                         "token_type": "Bearer", "refresh_token": "new-private-refresh"}) as api, \
             contextlib.redirect_stdout(io.StringIO()) as log:
            self.assertEqual(rebble_store.refresh_token(), "private-access")
        self.assertEqual(api.call_args.args, ("https://auth.rebble.io/oauth/token",))
        fields = urllib.parse.parse_qs(api.call_args.kwargs["data"].decode())
        self.assertEqual(fields, {"grant_type": ["refresh_token"], "client_id": [rebble_store.CLIENT_ID],
                                  "refresh_token": ["private-refresh"]})
        self.assertEqual(log.getvalue(), "::add-mask::private-access\n::add-mask::new-private-refresh\n")

    def test_missing_or_invalid_refresh_fails_without_network(self):
        for token in ("", "with space", "with\nnewline", "with\x1bescape"):
            with self.subTest(token=repr(token)), patch.dict(os.environ, {"REBBLE_REFRESH_TOKEN": token}, clear=True), \
                 patch.object(rebble_store, "request") as api:
                with self.assertRaisesRegex(ValueError, "Configure REBBLE_REFRESH_TOKEN"):
                    rebble_store.refresh_token()
                api.assert_not_called()

    def test_malformed_refresh_response_is_rejected(self):
        for response in ([], {}, {"access_token": "with\nnewline", "token_type": "Bearer"},
                         {"access_token": "access", "token_type": "unexpected"},
                         {"access_token": "access", "token_type": 123}):
            with self.subTest(response=response), patch.dict(os.environ, {"REBBLE_REFRESH_TOKEN": "refresh"}), \
                 patch.object(rebble_store, "request", return_value=response):
                with self.assertRaises(ValueError):
                    rebble_store.refresh_token()

    def test_transport_rejects_redirects_and_hides_error_bodies(self):
        error = urllib.error.HTTPError("https://auth.rebble.io/oauth/token", 401, "private-error", {},
                                       io.BytesIO(b"private-response-token"))
        with patch.object(rebble_store.urllib.request, "build_opener") as build:
            build.return_value.open.side_effect = error
            with self.assertRaisesRegex(RuntimeError, "HTTP 401") as caught:
                rebble_store.request("https://auth.rebble.io/oauth/token", data=b"private-refresh")
            build.assert_called_once_with(pebble_store.NoRedirect)
            self.assertNotIn("private", str(caught.exception))
        self.assertIsNone(pebble_store.NoRedirect().redirect_request(None, None, 302, "", {}, "https://evil.test"))

    def test_oversized_response_and_credentialed_download_are_rejected(self):
        with patch.object(rebble_store.urllib.request, "build_opener") as build:
            build.return_value.open.return_value.__enter__.return_value.read.return_value = b"1234"
            with self.assertRaisesRegex(ValueError, "Oversized"):
                rebble_store.request("https://assets.test", limit=3)
            with self.assertRaisesRegex(ValueError, "unauthenticated"):
                rebble_store.request("https://assets.test", token="secret", binary=True)
            self.assertEqual(build.call_count, 1)


class PublicationTests(OfflineTest):
    def setUp(self):
        super().setUp()
        self.original_cwd = Path.cwd()
        os.chdir(self.directory.name)
        self.addCleanup(os.chdir, self.original_cwd)
        Path("dist").mkdir()
        self.version = "0.4.0"
        self.commit = "c" * 40
        self.filename = self.path.name
        self.path.rename(Path("dist") / self.filename)
        record = {"version": self.version, "source_commit": self.commit, "sdk": SDK, "pebble_tool": TOOL,
                  "targets": TARGETS, "pbw": self.filename, "sha256": self.digest, "build_run": "123"}
        Path("dist/provenance.json").write_text(json.dumps(record))
        Path("dist/SHA256SUMS").write_text(f"{self.digest}  {self.filename}\n")
        self.events = []
        self.github_release = {"draft": True, "id": 123, "assets": [],
                               "body": "Private notes https://github.com/private/repo/pull/7"}
        patch.object(release, "validate_tag", return_value=(self.version, self.commit)).start()
        patch.object(release, "verify_pbw", return_value=self.digest).start()
        patch.object(release, "ensure_draft", return_value=self.github_release).start()
        patch.object(release, "immutable_upload", side_effect=lambda tag, rel, p: self.events.append(p.name)).start()
        self.github = patch.object(release, "api", side_effect=lambda *args: self.events.append("github.publish")).start()
        self.pebble_token = patch.object(pebble_store, "refresh_token", return_value="pebble-token").start()
        self.rebble_token = patch.object(rebble_store, "refresh_token", return_value="rebble-token").start()
        self.stores = []
        self.receipts = {}
        for module, label in ((pebble_store, "pebble"), (rebble_store, "rebble")):
            store = Mock(spec=getattr(module, label.title() + "Store"))
            store.preflight.side_effect = lambda *args, label=label: self.events.append(label + ".preflight")
            receipt = {"app_id": module.APP_ID, "release_id": label + "-id", "version": self.version,
                       "sha256": self.digest, "pbw_url": "https://store.test/" + label}
            self.receipts[label + "-release.json"] = receipt
            def publish(*args, label=label, receipt=receipt):
                self.events.append(label + ".publish")
                return receipt
            store.publish.side_effect = publish
            patch.object(module, label.title() + "Store", return_value=store).start()
            self.stores.append(store)

    def publish(self):
        with contextlib.redirect_stdout(io.StringIO()):
            release.publish("v" + self.version)

    def test_freezes_preflights_both_publishes_both_then_github(self):
        self.publish()
        self.assertEqual(self.events, ["provenance.json", self.filename, "SHA256SUMS", "pebble.preflight",
                         "rebble.preflight", "pebble.publish", "pebble-release.json", "rebble.publish",
                         "rebble-release.json", "github.publish"])
        for store in self.stores:
            pbw, version, notes = store.publish.call_args.args
            self.assertEqual(pbw.read_bytes(), self.binary)
            self.assertEqual(version, self.version)
            self.assertNotIn("github.com", notes)
            self.assertNotIn("Private", notes)
        self.assertEqual(self.stores[0].publish.call_args.args[2], self.stores[1].publish.call_args.args[2])
        self.assertEqual(json.loads(Path("dist/rebble-release.json").read_text()), self.receipts["rebble-release.json"])
        self.github.assert_called_once_with("PATCH", "releases/123", {"draft": False, "make_latest": "true"})

    def test_either_preflight_failure_prevents_all_store_uploads(self):
        for index in (0, 1):
            with self.subTest(store=index):
                original = self.stores[index].preflight.side_effect
                self.stores[index].preflight.side_effect = ValueError("preflight failed")
                with self.assertRaisesRegex(ValueError, "preflight failed"):
                    self.publish()
                self.stores[index].preflight.side_effect = original
        for store in self.stores:
            store.publish.assert_not_called()
        self.github.assert_not_called()

    def test_missing_rebble_credential_prevents_pebble_upload(self):
        self.rebble_token.side_effect = ValueError("Configure REBBLE_REFRESH_TOKEN")
        with self.assertRaisesRegex(ValueError, "REBBLE_REFRESH_TOKEN"):
            self.publish()
        for store in self.stores:
            store.publish.assert_not_called()
        self.github.assert_not_called()

    def test_rebble_failure_keeps_github_draft_and_pebble_receipt(self):
        self.stores[1].publish.side_effect = RuntimeError("Rebble timed out")
        with self.assertRaisesRegex(RuntimeError, "timed out"):
            self.publish()
        self.assertTrue(Path("dist/pebble-release.json").is_file())
        self.assertFalse(Path("dist/rebble-release.json").exists())
        self.github.assert_not_called()

    def test_published_retry_validates_both_receipts_without_auth_or_upload(self):
        self.github_release["draft"] = False
        def download(tag, filename, directory):
            (Path(directory) / filename).write_text(json.dumps(self.receipts[filename]))
        with patch.object(release, "download", side_effect=download):
            self.publish()
        self.pebble_token.assert_not_called()
        self.rebble_token.assert_not_called()
        self.github.assert_not_called()
        for store in self.stores:
            store.publish.assert_not_called()

    def test_published_retry_rejects_mismatched_receipt(self):
        self.github_release["draft"] = False
        self.receipts["rebble-release.json"]["sha256"] = "wrong"
        def download(tag, filename, directory):
            (Path(directory) / filename).write_text(json.dumps(self.receipts[filename]))
        with patch.object(release, "download", side_effect=download), self.assertRaisesRegex(ValueError, "receipt mismatch"):
            self.publish()
        self.rebble_token.assert_not_called()
        self.github.assert_not_called()

    def test_changed_candidate_is_rejected_before_any_publication(self):
        (Path("dist") / self.filename).write_bytes(b"tampered")
        with self.assertRaisesRegex(ValueError, "provenance/hash mismatch"):
            self.publish()
        self.assertEqual(self.events, [])
        self.rebble_token.assert_not_called()


if __name__ == "__main__":
    unittest.main()
