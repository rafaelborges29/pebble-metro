"""Update only the existing Rebble listing, preserving the verified PBW bytes."""
import hashlib
import json
import os
from pathlib import Path
import re
import urllib.error
import urllib.parse
import urllib.request
import uuid

from pebble_store import NoRedirect, store_version
from release_package import APP_UUID, MAX_PBW_BYTES, TARGETS, require, sha256, version_parts

API = "https://appstore-api.rebble.io"
APP_ID = "6af0e5dfb99ed90009374190"
DEVELOPER_ID = "690b8ba63399bf0009b60ce2"
# Public OAuth client used by dev-portal.rebble.io; not a client secret.
CLIENT_ID = "MCNV2xmEjwUGj7wJYNA2SaO8"


def request(url, token=None, data=None, content_type=None, binary=False, limit=8_000_000):
    require(not binary or (not token and data is None), "Asset downloads must be unauthenticated GETs")
    headers = {"Accept": "application/json", "Cache-Control": "no-cache"}
    if token:
        headers["Authorization"] = "Bearer " + token
    if content_type:
        headers["Content-Type"] = content_type
    req = urllib.request.Request(url, headers=headers, data=data)
    try:
        # Reject redirects, including on credential exchanges and authenticated GETs.
        with urllib.request.build_opener(NoRedirect).open(req, timeout=120) as response:
            payload = response.read(limit + 1)
    except urllib.error.HTTPError as error:
        code = error.code
        error.close()
        raise RuntimeError(f"Rebble request failed (HTTP {code}); check credentials/listing before retrying") from None
    except (urllib.error.URLError, TimeoutError):
        raise RuntimeError("Rebble request failed or timed out; inspect the listing before retrying") from None
    require(len(payload) <= limit, "Oversized Rebble response")
    return payload if binary else json.loads(payload)


def valid_token(token):
    return (isinstance(token, str) and bool(token) and token.isascii() and token.isprintable()
            and not any(c.isspace() for c in token))


def refresh_token():
    refresh = os.environ.get("REBBLE_REFRESH_TOKEN", "")
    require(valid_token(refresh), "Configure REBBLE_REFRESH_TOKEN from the owning Rebble developer account")
    data = urllib.parse.urlencode({"grant_type": "refresh_token", "client_id": CLIENT_ID,
                                   "refresh_token": refresh}).encode()
    payload = request("https://auth.rebble.io/oauth/token", data=data,
                      content_type="application/x-www-form-urlencoded")
    require(isinstance(payload, dict), "Invalid Rebble token response")
    token = payload.get("access_token")
    require(valid_token(token), "Invalid Rebble access token; sign in again and replace REBBLE_REFRESH_TOKEN")
    token_type = payload.get("token_type")
    require(isinstance(token_type, str) and token_type.lower() == "bearer", "Unexpected Rebble token type")
    if os.environ.get("GITHUB_ACTIONS") == "true":
        print("::add-mask::" + token)
        rotated = payload.get("refresh_token")
        if valid_token(rotated):
            print("::add-mask::" + rotated)
    # Rebble's tokensetter adds new issued tokens without deleting the original
    # refresh token. No repository-secret write permission is needed.
    return token


def multipart(path, notes):
    boundary = "metro-" + uuid.uuid4().hex
    chunks = [f'--{boundary}\r\nContent-Disposition: form-data; name="release_notes"\r\n\r\n{notes}\r\n'.encode(),
              f'--{boundary}\r\nContent-Disposition: form-data; name="pbw"; filename="{Path(path).name}"\r\nContent-Type: application/octet-stream\r\n\r\n'.encode(),
              Path(path).read_bytes(), f'\r\n--{boundary}--\r\n'.encode()]
    return b"".join(chunks), "multipart/form-data; boundary=" + boundary


class RebbleStore:
    def __init__(self, token):
        self.token = token

    def listing(self):
        payload = request(API + f"/api/v1/apps/id/{APP_ID}?release_check=" + uuid.uuid4().hex)
        apps = payload["data"]
        require(len(apps) == 1 and apps[0]["id"] == APP_ID and apps[0]["uuid"].lower() == APP_UUID
                and apps[0]["developer_id"] == DEVELOPER_ID, "Unexpected public Rebble listing")
        return apps[0]

    def context(self):
        me = request(API + "/api/v0/users/me/developer", self.token)
        require(me["id"] == DEVELOPER_ID and not me["needsSetup"]
                and len([app for app in me["applications"] if app["id"] == APP_ID]) == 1,
                "Account does not own the expected existing Rebble app")
        return self.listing()

    def receipt(self, version, expected_hash):
        app = self.listing()
        latest = app["latest_release"]
        require(latest["version"] == version,
                "Rebble has not exposed this version yet; inspect the listing before retrying")
        release_id = latest["id"]
        require(isinstance(release_id, str) and re.fullmatch(r"[0-9a-f]{24}", release_id),
                "Unexpected Rebble release ID")
        url = latest["pbw_file"]
        require(url == f"https://storage.googleapis.com/rebble-pbws/pbw/{release_id}.pbw",
                "Unexpected Rebble PBW download URL")
        require(all(app["compatibility"][target]["has_binary"] for target in TARGETS),
                "Rebble release is missing a watch target")
        actual = hashlib.sha256(request(url, binary=True, limit=MAX_PBW_BYTES)).hexdigest()
        require(actual == expected_hash, "Rebble version has different PBW bytes; refusing to replace it")
        return {"app_id": APP_ID, "release_id": release_id, "version": version,
                "sha256": actual, "pbw_url": url}

    def preflight(self, path, version):
        version_parts(version)
        require(0 < Path(path).stat().st_size <= MAX_PBW_BYTES, "PBW exceeds the release size limit or is empty")
        app = self.context()
        desired = store_version(version)
        current = store_version(app["latest_release"]["version"])
        require(current <= desired, "A newer Rebble version already exists")
        if current == desired:
            return self.receipt(version, sha256(path))
        return None

    def publish(self, path, version, notes):
        existing = self.preflight(path, version)
        if existing:
            return existing
        data, content_type = multipart(path, notes)
        # Exactly one POST. A failed/timed-out response may follow a committed upload.
        result = request(API + f"/api/dp/app/{APP_ID}/release", self.token, data, content_type)
        require(isinstance(result, dict) and result.get("success") is True,
                "Unexpected Rebble upload response; inspect the listing before retrying")
        return self.receipt(version, sha256(path))


if __name__ == "__main__":
    # Authentication/ownership check only: never upload from this entry point.
    try:
        app = RebbleStore(refresh_token()).context()
        print(f"Rebble account/listing verified; current version {app['latest_release']['version']}")
    except (ValueError, RuntimeError, KeyError, OSError) as error:
        raise SystemExit(str(error)) from None
