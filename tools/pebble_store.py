"""Update the existing Pebble listing using the CLI's API, without rebuilding."""
import hashlib
import json
import os
from pathlib import Path
import urllib.error
import urllib.parse
import urllib.request
import uuid

from release_package import APP_ID, APP_UUID, MAX_PBW_BYTES, require, sha256

API = "https://appstore-api.repebble.com"


class NoRedirect(urllib.request.HTTPRedirectHandler):
    # Never forward a publishing credential to another endpoint via a redirect.
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class PublicAssetRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        parsed = urllib.parse.urlsplit(newurl)
        require(parsed.scheme == "https" and parsed.netloc.startswith("pebble-appstore-backend.")
                and parsed.netloc.endswith(".r2.cloudflarestorage.com"), "Unexpected public asset redirect")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def request(url, token=None, data=None, content_type=None, binary=False, limit=8_000_000):
    require(not binary or (not token and data is None), "Asset downloads must be unauthenticated GETs")
    headers = {"Accept": "application/json", "Cache-Control": "no-cache"}
    if token:
        headers["Authorization"] = "Bearer " + token
    if content_type:
        headers["Content-Type"] = content_type
    req = urllib.request.Request(url, headers=headers, data=data)
    try:
        handler = PublicAssetRedirect if binary else NoRedirect
        with urllib.request.build_opener(handler).open(req, timeout=120) as response:
            payload = response.read(limit + 1)
    except urllib.error.HTTPError as error:
        # Server error bodies and token-refresh URLs must not leak credentials.
        error.close()
        raise RuntimeError(f"Pebble request failed (HTTP {error.code}); no automatic upload retry") from None
    except (urllib.error.URLError, TimeoutError):
        raise RuntimeError("Pebble request failed or timed out; check the existing release before retrying") from None
    require(len(payload) <= limit, "Oversized Pebble response")
    return payload if binary else json.loads(payload)


def refresh_token():
    key = os.environ.get("PEBBLE_FIREBASE_API_KEY", "")
    refresh = os.environ.get("PEBBLE_FIREBASE_REFRESH_TOKEN", "")
    require(key and refresh, "Configure PEBBLE_FIREBASE_API_KEY and PEBBLE_FIREBASE_REFRESH_TOKEN before releasing")
    payload = request("https://securetoken.googleapis.com/v1/token?" + urllib.parse.urlencode({"key": key}),
                      data=urllib.parse.urlencode({"grant_type": "refresh_token", "refresh_token": refresh}).encode(),
                      content_type="application/x-www-form-urlencoded")
    token = payload["id_token"]
    require(isinstance(token, str) and token and "\n" not in token and "\r" not in token, "Invalid Firebase token")
    if os.environ.get("GITHUB_ACTIONS") == "true":
        print("::add-mask::" + token)
        rotated = payload.get("refresh_token", "")
        if rotated:
            print("::add-mask::" + rotated)
    return token


def store_version(value):
    # Older listings may label a version 0.2 instead of 0.2.0.
    parts = value.split(".")
    require(len(parts) in (2, 3) and all(p.isascii() and p.isdecimal() for p in parts),
            "Unrecognized existing store version; inspect it before releasing")
    return tuple(int(p) for p in parts) + (0,) * (3 - len(parts))


def multipart(path, version, notes):
    boundary = "metro-" + uuid.uuid4().hex
    chunks = []
    for name, value in {"version": version, "releaseNotes": notes,
                        "isPublished": "true", "replaceScreenshots": "false"}.items():
        chunks.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode())
    chunks += [f'--{boundary}\r\nContent-Disposition: form-data; name="pbwFile"; filename="metro-lisboa-{version}.pbw"\r\nContent-Type: application/octet-stream\r\n\r\n'.encode(),
               Path(path).read_bytes(), f'\r\n--{boundary}--\r\n'.encode()]
    return b"".join(chunks), "multipart/form-data; boundary=" + boundary


class PebbleStore:
    def __init__(self, token):
        self.token = token

    def context(self):
        me = request(API + "/api/v1/developer/me", self.token)
        lookup = me["app_lookup"]["by_app_uuid"]
        require(lookup.get(APP_UUID) == APP_ID, "Account does not own the expected existing Pebble app")
        apps = [app for app in me["apps"] if app["app_id"] == APP_ID]
        require(len(apps) == 1 and apps[0]["app_uuid"].lower() == APP_UUID, "Unexpected Pebble listing")
        return apps[0], min(MAX_PBW_BYTES, int(me["upload_constraints"]["max_pbw_bytes"]))

    def receipt(self, version, expected_hash):
        payload = request(API + f"/api/v1/apps/id/{APP_ID}?release_check=" + uuid.uuid4().hex)
        apps = payload["data"]
        require(len(apps) == 1 and apps[0]["id"] == APP_ID and apps[0]["uuid"].lower() == APP_UUID,
                "Unexpected public Pebble listing")
        latest = apps[0]["latest_release"]
        require(latest["version"] == version, "Store has not exposed this version yet; rerun the failed publication job later")
        url = latest["pbw_file"]
        parsed = urllib.parse.urlsplit(url)
        require(parsed.scheme == "https" and parsed.netloc == "appstore-api.repebble.com"
                and parsed.path.startswith(f"/api/assets/pbw/{APP_ID}/{version}/") and not parsed.query,
                "Unexpected store PBW download URL")
        # Public asset request: no developer credential is sent.
        actual = hashlib.sha256(request(url, binary=True, limit=MAX_PBW_BYTES)).hexdigest()
        require(actual == expected_hash, "Store version exists with different PBW bytes; refusing to replace it")
        return {"app_id": APP_ID, "release_id": latest["id"], "version": version,
                "sha256": actual, "pbw_url": url}

    def publish(self, path, version, notes):
        app, maximum = self.context()
        require(Path(path).stat().st_size <= maximum, "PBW exceeds current store upload limit")
        desired = store_version(version)
        versions = [store_version(v) for v in app["versions"]]
        require(not any(v > desired for v in versions), "A newer store version already exists")
        digest = sha256(path)
        if desired not in versions:
            data, content_type = multipart(path, version, notes)
            # Intentionally one POST. A timeout may mean the store already accepted it.
            request(API + f"/api/dashboard/apps/{APP_ID}/releases", self.token, data, content_type)
        return self.receipt(version, digest)
