#!/usr/bin/env bash
# Never infer the PBW or watch connection: this command installs development only.
set -euo pipefail

usage() {
  printf 'Usage: %s --phone PHONE_ADDRESS | --cloudpebble\n' "$0"
}

case "${1:-}" in
  --phone)
    if [[ $# != 2 || -z ${2:-} || ${2:-} == -* || ${2:-} == *[[:space:]]* ]]; then
      usage >&2
      exit 2
    fi
    ;;
  --cloudpebble)
    if [[ $# != 1 ]]; then usage >&2; exit 2; fi
    ;;
  -h|--help)
    usage
    exit 0
    ;;
  *)
    usage >&2
    exit 2
    ;;
esac

cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
# Pebble transport environment variables can override an explicit CLI connection.
unset PEBBLE_PHONE PEBBLE_CLOUDPEBBLE PEBBLE_EMULATOR PEBBLE_QEMU PEBBLE_BT_SERIAL
npm run build:dev

# Verify and send a private copy, unaffected by subsequent builds in this checkout.
directory=$(mktemp -d)
trap 'rm -rf -- "$directory"' EXIT
pbw="$directory/metro-lisboa-dev.pbw"
cp -- build/metro-lisboa-dev.pbw "$pbw"
python3 tools/release_package.py --dev "$pbw"
pebble install "$@" "$pbw"
