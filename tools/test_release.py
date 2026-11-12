"""Offline snapshot-PR recovery checks; only temporary local Git remotes are used."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

import release
from release_package import APP_UUID, TARGETS, metadata, read_json, set_version, write_json


class SnapshotPRTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.work = self.root / "work"
        self.remote = self.root / "origin.git"
        subprocess.run(["git", "init", "--bare", "--initial-branch=main", str(self.remote)],
                       check=True, capture_output=True)
        subprocess.run(["git", "clone", str(self.remote), str(self.work)], check=True, capture_output=True)
        previous = Path.cwd()
        os.chdir(self.work)
        self.addCleanup(os.chdir, previous)
        release.git("config", "user.name", "Offline test")
        release.git("config", "user.email", "test@example.invalid")
        write_json("package.json", {"version": "0.5.0-snapshot", "private": True,
                                    "pebble": {"uuid": APP_UUID, "targetPlatforms": TARGETS}})
        write_json("package-lock.json", {"version": "0.5.0-snapshot",
                                         "packages": {"": {"version": "0.5.0-snapshot"}}})
        self.commit("Initial main")
        release.git("push", "origin", "HEAD:refs/heads/main")
        self.original_main = self.remote_commit("main")
        self.branch = "chore/next-0.6.0"
        self.pull = None
        self.requests = []
        self.fail_once = None
        self.published = True
        self.addCleanup(patch.stopall)
        patch.object(release, "get_release", side_effect=lambda tag: {"draft": not self.published}).start()
        patch.object(release, "api", side_effect=self.github).start()

    def commit(self, message):
        release.git("add", ".")
        release.git("commit", "-m", message)

    def remote_commit(self, branch):
        return release.git("ls-remote", "origin", f"refs/heads/{branch}").split()[0]

    def github(self, method, path, data=None):
        self.requests.append((method, path, data))
        if self.fail_once == (method, path):
            self.fail_once = None
            raise ValueError("Simulated GitHub interruption")
        if method == "GET" and path.startswith("pulls?"):
            return [self.pull] if self.pull else []
        if (method, path) == ("POST", "pulls"):
            self.assertEqual(data["head"], self.branch)
            self.assertEqual(data["base"], "main")
            self.pull = {"html_url": "https://example.invalid/pull/1",
                         "head": {"sha": self.remote_commit(self.branch),
                                  "repo": {"full_name": release.REPOSITORY}}}
            return self.pull
        self.assertEqual((method, path), ("POST", "actions/workflows/e2e.yml/dispatches"))
        self.assertEqual(data, {"ref": self.branch})

    def assert_main_unchanged(self):
        self.assertEqual(self.remote_commit("main"), self.original_main)

    def test_opens_version_only_pr_without_pushing_main(self):
        release.advance("v0.5.0")
        self.assert_main_unchanged()
        self.assertEqual(metadata(), "0.6.0-snapshot")
        changed = release.git("diff", "--name-only", "origin/main", self.remote_commit(self.branch))
        self.assertEqual(set(changed.splitlines()), {"package.json", "package-lock.json"})
        self.assertIsNotNone(self.pull)

    def test_retries_pr_creation_and_ci_without_duplicate_commits(self):
        for failure in [("POST", "pulls"), ("POST", "actions/workflows/e2e.yml/dispatches")]:
            with self.subTest(failure=failure):
                self.fail_once = failure
                with self.assertRaisesRegex(ValueError, "interruption"):
                    release.advance("v0.5.0")
                commit = self.remote_commit(self.branch)
                release.advance("v0.5.0")
                self.assertEqual(self.remote_commit(self.branch), commit)
                self.assert_main_unchanged()
        creations = [request for request in self.requests if request[:2] == ("POST", "pulls")]
        self.assertEqual(len(creations), 2)  # One failed request, one successful PR.

    def test_rejects_tampered_existing_branch_before_reusing_pr(self):
        release.advance("v0.5.0")
        release.git("switch", "--detach", "origin/main")
        set_version(Path("."), "0.6.0-snapshot")
        package = read_json("package.json")
        package["private"] = False
        write_json("package.json", package)
        self.commit("Unexpected package change")
        # Replace only the disposable local fixture's branch, never a real remote.
        release.git("push", "--force", "origin", f"HEAD:refs/heads/{self.branch}")
        self.pull["head"]["sha"] = self.remote_commit(self.branch)
        self.requests.clear()
        with self.assertRaisesRegex(ValueError, "unexpected changes"):
            release.advance("v0.5.0")
        self.assertEqual(self.requests, [])
        self.assert_main_unchanged()

    def test_rejects_mismatched_pr_head(self):
        release.advance("v0.5.0")
        self.pull["head"]["sha"] = "0" * 40
        with self.assertRaisesRegex(ValueError, "does not match"):
            release.advance("v0.5.0")
        self.assert_main_unchanged()

    def test_reuses_version_only_branch_after_main_moves(self):
        release.advance("v0.5.0")
        branch_commit = self.remote_commit(self.branch)
        release.git("switch", "--detach", "origin/main")
        Path("unrelated.txt").write_text("Concurrent main change\n")
        self.commit("Concurrent main change")
        release.git("push", "origin", "HEAD:refs/heads/main")
        updated_main = self.remote_commit("main")
        release.advance("v0.5.0")
        self.assertEqual(self.remote_commit("main"), updated_main)
        self.assertEqual(self.remote_commit(self.branch), branch_commit)

    def test_already_advanced_main_needs_no_pr(self):
        set_version(Path("."), "0.6.0-snapshot")
        self.commit("Next snapshot already reviewed")
        release.git("push", "origin", "HEAD:refs/heads/main")
        release.advance("v0.5.0")
        self.assertEqual(self.requests, [])
        self.assertIsNone(self.pull)

    def test_unpublished_release_and_dirty_checkout_are_rejected(self):
        self.published = False
        with self.assertRaisesRegex(ValueError, "Publish the release"):
            release.advance("v0.5.0")
        self.published = True
        Path("uncommitted.txt").write_text("Do not discard\n")
        with self.assertRaisesRegex(ValueError, "clean checkout"):
            release.advance("v0.5.0")
        self.assertTrue(Path("uncommitted.txt").exists())
        self.assertEqual(self.requests, [])
        self.assert_main_unchanged()


if __name__ == "__main__":
    unittest.main()
