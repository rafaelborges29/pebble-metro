"""Version and PBW checks shared by local preflight and release automation."""
import hashlib
import json
from pathlib import Path
import re
import struct
import uuid
import zipfile

APP_UUID = "5576168a-8b38-4be1-90e7-343af607c167"
APP_ID = "dce54d3eb02943f1935e1529"
TARGETS = ["emery", "gabbro"]
SDK = "4.33.1"
TOOL = "5.0.39"
MAX_PBW_BYTES = 4_400_000
VERSION = re.compile(r"(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.0(-snapshot)?", re.ASCII)
# libpebble2.util.bundle.PebbleBundle's native application header layout.
HEADER = struct.Struct("<8s6BHII32s32sIIII16s")


def require(condition, message):
    if not condition:
        raise ValueError(message)


def version_parts(version, snapshot=False):
    match = VERSION.fullmatch(version)
    require(match is not None, "Expected major.minor.0, optionally with -snapshot for development")
    require(snapshot or not match[3], "A release cannot contain -snapshot")
    parts = int(match[1]), int(match[2])
    require(max(parts) <= 255, "Pebble major/minor must be in 0..255")
    return parts


def release_version(development, kind):
    major, minor = version_parts(development, snapshot=True)
    require(development.endswith("-snapshot"), "main must contain the next development snapshot")
    require(kind in ("major", "minor"), "Choose major or minor")
    result = f"{major + 1}.0.0" if kind == "major" else f"{major}.{minor}.0"
    version_parts(result)
    return result


def next_snapshot(version):
    major, minor = version_parts(version)
    result = f"{major + 1}.0.0" if minor == 255 else f"{major}.{minor + 1}.0"
    version_parts(result)
    return result + "-snapshot"


def read_json(path):
    return json.loads(Path(path).read_text())


def write_json(path, value):
    Path(path).write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n")


def metadata(root=Path(".")):
    package = read_json(root / "package.json")
    lock = read_json(root / "package-lock.json")
    version = package["version"]
    version_parts(version, snapshot=True)
    require(lock["version"] == lock["packages"][""]["version"] == version,
            "package.json and package-lock.json versions differ")
    require(package["pebble"]["uuid"] == APP_UUID, "Unexpected app UUID")
    require(sorted(package["pebble"]["targetPlatforms"]) == TARGETS, "Both dedicated watch targets are required")
    return version


def set_version(root, version):
    version_parts(version, snapshot=True)
    metadata(root)
    package = read_json(root / "package.json")
    lock = read_json(root / "package-lock.json")
    package["version"] = lock["version"] = lock["packages"][""]["version"] = version
    write_json(root / "package.json", package)
    write_json(root / "package-lock.json", lock)


def version_only(before_package, before_lock, after_package, after_lock, version):
    """A release-branch commit may change only these three metadata values."""
    before_package["version"] = before_lock["version"] = before_lock["packages"][""]["version"] = version
    return before_package == after_package and before_lock == after_lock


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def verify_pbw(path, version, root=Path(".")):
    parts = version_parts(version, snapshot=True)
    path = Path(path)
    require(0 < path.stat().st_size <= MAX_PBW_BYTES, "PBW exceeds the 4.4 MB release limit or is empty")
    with zipfile.ZipFile(path) as bundle:
        names = bundle.namelist()
        require(len(names) == len(set(names)), "Duplicate PBW archive entries")
        require(sum(info.file_size for info in bundle.infolist()) <= 16_000_000, "Excessive unpacked PBW size")
        require(bundle.testzip() is None, "Corrupt PBW archive")
        info = json.loads(bundle.read("appinfo.json"))
        require(info["uuid"] == APP_UUID and info["versionLabel"] == version, "PBW identity/version mismatch")
        require(sorted(info["targetPlatforms"]) == TARGETS, "PBW target metadata mismatch")
        manifests = {f"{target}/manifest.json" for target in TARGETS}
        require({name for name in names if name.endswith("manifest.json")} == manifests,
                "Unexpected or missing PBW target manifests")
        allowed = {"appinfo.json", "pebble-js-app.js", "pebble-js-app.js.map"} | manifests | {
            f"{target}/{filename}" for target in TARGETS for filename in ("pebble-app.bin", "app_resources.pbpack")}
        require(set(names) <= allowed, "Unexpected PBW entries")
        for target in TARGETS:
            manifest = json.loads(bundle.read(f"{target}/manifest.json"))
            require(manifest["type"] == "application", "Expected a native application")
            for section, filename in (("application", "pebble-app.bin"), ("resources", "app_resources.pbpack")):
                entry = manifest[section]
                data = bundle.read(f"{target}/{filename}")
                require(entry["name"] == filename and len(data) == entry["size"] and len(data) > 0,
                        f"Invalid {target} {section}")
            header = HEADER.unpack_from(bundle.read(f"{target}/pebble-app.bin"))
            require(header[0] == b"PBLAPP\0\0", "Invalid native application header")
            require(header[5:7] == parts, "Native binary version differs from PBW version")
            require(str(uuid.UUID(bytes=header[16])) == APP_UUID, "Native binary UUID mismatch")
        # Webpack indents this comment once; remove only that module indentation.
        phone = bundle.read("pebble-js-app.js").decode("utf-8").replace("\n\t", "\n")
        notices = [root / "LICENSE", root / "THIRD_PARTY_NOTICES.md", *sorted((root / "LICENSES").glob("*.txt"))]
        require(len(notices) >= 3, "Missing source licence files")
        for notice in notices:
            require(notice.read_text() in phone, f"Missing complete bundled notice: {notice.name}")
    return sha256(path)
