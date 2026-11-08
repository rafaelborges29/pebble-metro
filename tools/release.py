"""GitHub release orchestration. Publication commands are invoked only by release jobs."""
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

from release_package import (APP_ID, SDK, TARGETS, TOOL, metadata, next_snapshot,
                             read_json, release_version, require, set_version,
                             sha256, verify_pbw, version_only, version_parts, write_json)

REPOSITORY = "rafaelborges29/pebble-metro"
BOT = ["-c", "user.name=github-actions[bot]", "-c", "user.email=41898282+github-actions[bot]@users.noreply.github.com"]


def run(*args):
    result = subprocess.run(args, text=True, capture_output=True)
    require(result.returncode == 0, f"{args[0]} {args[1]} failed (exit {result.returncode}); inspect permissions and remote state")
    return result.stdout.strip()


def git(*args):
    return run("git", *args)


def api(method, path, data=None):
    args = ["gh", "api", "--method", method, f"repos/{REPOSITORY}/{path}"]
    if data is not None:
        args += ["--input", "-"]
    result = subprocess.run(args, input=json.dumps(data) if data is not None else None,
                            text=True, capture_output=True)
    require(result.returncode == 0, f"GitHub {method} {path} failed; check permissions and remote state")
    return json.loads(result.stdout) if result.stdout.strip() else None


def releases():
    pages = json.loads(run("gh", "api", "--paginate", "--slurp", f"repos/{REPOSITORY}/releases?per_page=100"))
    return [release for page in pages for release in page]


def output(name, value):
    print(f"{name}={value}")
    if os.environ.get("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a") as file:
            file.write(f"{name}={value}\n")


def tag_version(tag):
    require(tag.startswith("v"), "Release tag must start with v")
    version_parts(tag[1:])
    return tag[1:]


def ancestor(commit, ref):
    return subprocess.run(["git", "merge-base", "--is-ancestor", commit, ref], capture_output=True).returncode == 0


def source_json(ref, name):
    return json.loads(git("show", f"{ref}:{name}"))


def validate_tag(tag):
    version = tag_version(tag)
    require(version_parts(version) > (0, 2), "0.2.0 is already distributed; no automatic backfill")
    commit = git("rev-parse", f"refs/tags/{tag}^{{commit}}")
    package, lock = (source_json(commit, name) for name in ("package.json", "package-lock.json"))
    require(package["version"] == lock["version"] == lock["packages"][""]["version"] == version,
            "Tag and source versions differ")
    if not ancestor(commit, "origin/main"):
        parents = git("rev-list", "--parents", "-n", "1", commit).split()[1:]
        require(len(parents) == 1 and ancestor(parents[0], "origin/main"), "Tag is not based on trusted main")
        changed = set(git("diff", "--name-only", parents[0], commit).splitlines())
        require(changed == {"package.json", "package-lock.json"}, "Release branch may change only version metadata")
        require(version_only(source_json(parents[0], "package.json"), source_json(parents[0], "package-lock.json"),
                             package, lock, version), "Release branch contains non-version metadata changes")
    return version, commit


def get_release(tag):
    # The by-tag endpoint is documented for published releases. Include drafts
    # explicitly so a retry cannot create another draft or rebuild a frozen PBW.
    matches = [item for item in releases() if item["tag_name"] == tag]
    require(len(matches) <= 1, "Multiple releases use this tag; inspect them before continuing")
    return matches[0] if matches else None


def ensure_draft(tag, commit):
    release = get_release(tag)
    if release:
        return release
    notes = api("POST", "releases/generate-notes", {"tag_name": tag, "target_commitish": commit})
    return api("POST", "releases", {"tag_name": tag, "target_commitish": commit, "name": tag,
                                    "body": notes["body"], "draft": True, "prerelease": False})


def prepare(kind):
    require(os.environ.get("GITHUB_REF") == "refs/heads/main", "Run Create release from main")
    require(git("rev-parse", "HEAD") == git("rev-parse", "origin/main") and not git("status", "--porcelain"),
            "Preparation needs a clean checkout of main")
    version = release_version(metadata(), kind)
    next_snapshot(version)  # Check numeric capacity before making any remote changes.
    require(version_parts(version) > (0, 2), "0.2.0 is already distributed; no automatic backfill")
    tag, branch = "v" + version, "release/" + version
    for release in releases():
        if not release["tag_name"].startswith("v"):
            continue
        old = tag_version(release["tag_name"])
        if release["draft"]:
            require(release["tag_name"] == tag, "Finish the pending draft release before preparing another")
        else:
            require(version_parts(version) > version_parts(old), "Release version has already been used or superseded")
    existing = git("ls-remote", "origin", f"refs/tags/{tag}", f"refs/heads/{branch}")
    if existing:
        refs = dict(line.split()[::-1] for line in existing.splitlines())
        require(f"refs/tags/{tag}" in refs and f"refs/heads/{branch}" in refs,
                "Incomplete release refs; inspect them before resuming Publish release for the existing tag")
        old_version, commit = validate_tag(tag)
        require(old_version == version and refs[f"refs/heads/{branch}"] == commit
                and refs[f"refs/tags/{tag}"] == git("rev-parse", f"refs/tags/{tag}")
                and git("rev-parse", f"{commit}^") == git("rev-parse", "HEAD"),
                "Release refs already exist at another source revision; resume Publish release for that tag")
    else:
        git("switch", "-c", branch)
        set_version(Path("."), version)
        git("add", "package.json", "package-lock.json")
        git(*BOT, "commit", "-m", f"Release {version}")
        commit = git("rev-parse", "HEAD")
        git(*BOT, "tag", "-a", tag, "-m", f"Release {version}")
        git("push", "--atomic", "origin", f"HEAD:refs/heads/{branch}", f"refs/tags/{tag}")
    ensure_draft(tag, commit)
    # GITHUB_TOKEN-created tags do not start another push workflow.
    api("POST", "actions/workflows/publish-release.yml/dispatches", {"ref": "main", "inputs": {"tag": tag}})
    output("tag", tag)


def names(version):
    return [f"metro-lisboa-{version}.pbw", "SHA256SUMS", "provenance.json"]


def check_provenance(record, version, commit, path):
    require(record["version"] == version and record["source_commit"] == commit
            and record["sdk"] == SDK and record["pebble_tool"] == TOOL
            and record["targets"] == TARGETS and record["pbw"] == names(version)[0]
            and record["sha256"] == sha256(path), "Release provenance/hash mismatch")


def download(tag, filename, directory):
    run("gh", "release", "download", tag, "--repo", REPOSITORY, "--pattern", filename, "--dir", str(directory))


def restore(tag):
    version, commit = validate_tag(tag)
    release = get_release(tag)
    assets = {a["name"] for a in release["assets"]} if release else set()
    pbw, _, provenance = names(version)
    if not assets:
        require(not release or release["draft"], "Published release has no candidate assets")
        output("restored", "false")
        return
    require({pbw, provenance} <= assets,
            "Partially staged candidate: rerun failed jobs in the original Actions run to reuse its artifact")
    with tempfile.TemporaryDirectory() as tmp:
        directory = Path(tmp)
        for name in (pbw, provenance):
            download(tag, name, directory)
        record = read_json(directory / provenance)
        check_provenance(record, version, commit, directory / pbw)
        verify_pbw(directory / pbw, version)
        build = Path("build")
        build.mkdir(exist_ok=True)
        shutil.copyfile(directory / pbw, build / (Path.cwd().name + ".pbw"))
        Path("dist").mkdir(exist_ok=True)
        shutil.copyfile(directory / provenance, Path("dist") / provenance)
    output("restored", "true")


def package(tag):
    version, commit = validate_tag(tag)
    require(git("rev-parse", "HEAD") == commit and metadata() == version, "Build checkout is not the tagged revision")
    require(not git("status", "--porcelain"), "Release build changed tracked source")
    pbw = Path("build") / (Path.cwd().name + ".pbw")
    digest = verify_pbw(pbw, version)
    directory = Path("dist")
    directory.mkdir(exist_ok=True)
    filename, checksum, provenance = names(version)
    if (directory / provenance).exists():
        record = read_json(directory / provenance)
        check_provenance(record, version, commit, pbw)
    else:
        record = {"version": version, "source_commit": commit, "sdk": SDK, "pebble_tool": TOOL,
                  "targets": TARGETS, "pbw": filename, "sha256": digest,
                  "build_run": os.environ.get("GITHUB_RUN_ID")}
        write_json(directory / provenance, record)
    shutil.copyfile(pbw, directory / filename)
    (directory / checksum).write_text(f"{digest}  {filename}\n")


def immutable_upload(tag, release, path):
    existing = [asset for asset in release["assets"] if asset["name"] == path.name]
    if existing:
        require(len(existing) == 1, "Duplicate GitHub release asset")
        with tempfile.TemporaryDirectory() as tmp:
            download(tag, path.name, tmp)
            require(sha256(Path(tmp) / path.name) == sha256(path), "Existing release asset differs; refusing overwrite")
    else:
        require(release["draft"], "Cannot add missing assets to an already published release")
        run("gh", "release", "upload", tag, str(path), "--repo", REPOSITORY)


def publish(tag):
    from pebble_store import PebbleStore, refresh_token
    from rebble_store import APP_ID as REBBLE_APP_ID, RebbleStore, refresh_token as rebble_token
    version, commit = validate_tag(tag)
    record = read_json("dist/provenance.json")
    pbw = Path("dist") / names(version)[0]
    check_provenance(record, version, commit, pbw)
    verify_pbw(pbw, version)
    require(Path("dist/SHA256SUMS").read_text() == f"{record['sha256']}  {pbw.name}\n", "Checksum file mismatch")
    release = ensure_draft(tag, commit)
    # Freeze provenance first. Partial uploads must resume using the original job artifact.
    for filename in ("provenance.json", pbw.name, "SHA256SUMS"):
        immutable_upload(tag, release, Path("dist") / filename)
    receipts = [("pebble-release.json", APP_ID), ("rebble-release.json", REBBLE_APP_ID)]
    if not release["draft"]:
        with tempfile.TemporaryDirectory() as tmp:
            for filename, app_id in receipts:
                download(tag, filename, tmp)
                receipt = read_json(Path(tmp) / filename)
                require(receipt["version"] == version and receipt["sha256"] == record["sha256"]
                        and receipt["app_id"] == app_id and receipt["release_id"], "Published release receipt mismatch")
        print("Release already published to GitHub, Pebble and Rebble; nothing to upload")
        return
    stores = [PebbleStore(refresh_token()), RebbleStore(rebble_token())]
    # Catch credentials, ownership, version conflicts and reused-byte mismatches
    # at either destination before making the first store upload.
    for store in stores:
        store.preflight(pbw, version)
    # GitHub's generated notes can contain private PR/source links. Store notes
    # must be public-safe and identical on retries, not copied from the draft body.
    notes = f"Metro Lisboa {version} for Pebble Time 2 and Pebble Round 2 with Android."
    for store, (filename, _) in zip(stores, receipts):
        receipt_path = Path("dist") / filename
        write_json(receipt_path, store.publish(pbw, version, notes))
        immutable_upload(tag, release, receipt_path)
    # Both public downloads must match before GitHub publication / snapshot bump.
    api("PATCH", f"releases/{release['id']}", {"draft": False, "make_latest": "true"})
    print(f"Published {tag} to GitHub, Pebble and Rebble; SHA-256 {record['sha256']}")


def advance(tag):
    version = tag_version(tag)
    release = get_release(tag)
    require(release and not release["draft"], "Publish the release before advancing development")
    wanted = next_snapshot(version)
    git("fetch", "origin", "main")
    git("switch", "--detach", "origin/main")
    current = metadata()
    if version_parts(current, snapshot=True) >= version_parts(wanted, snapshot=True):
        print("main already has the next development version")
    else:
        set_version(Path("."), wanted)
        git("add", "package.json", "package-lock.json")
        git(*BOT, "commit", "-m", f"Start {wanted} development")
        # A concurrent main update rejects this ordinary push; retry on fresh main.
        git("push", "origin", "HEAD:refs/heads/main")
        print(f"Advanced main to {wanted}")
    # GITHUB_TOKEN pushes need explicit CI. Also dispatch when retrying after a
    # successful push whose original CI dispatch failed.
    api("POST", "actions/workflows/e2e.yml/dispatches", {"ref": "main"})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["check", "prepare", "validate", "restore", "package", "publish", "advance"])
    parser.add_argument("value", nargs="?")
    args = parser.parse_args()
    require(args.command == "check" or bool(args.value), "Missing release type or tag")
    if args.command == "check":
        print("Version metadata valid:", metadata())
    elif args.command == "validate":
        version, commit = validate_tag(args.value)
        output("tag", args.value)
        output("commit", commit)
    else:
        globals()[args.command](args.value)


if __name__ == "__main__":
    try:
        main()
    except (ValueError, RuntimeError, KeyError, OSError) as error:
        raise SystemExit(str(error)) from None
