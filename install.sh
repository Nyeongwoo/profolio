#!/bin/sh
# Installs (or updates) Profolio on this Mac:
#
#   curl -fsSL https://nyeongwoo.github.io/profolio/install.sh | sh
#
# It downloads the newest version from the update feed, checks the app's
# signature, puts it in /Applications (or ~/Applications when that isn't
# writable) and opens it. A download made this way isn't marked as coming
# from the internet, so macOS opens Profolio without the "Apple could not
# verify" warning; after this, Profolio updates itself.
set -eu
# Keep this file ASCII and write variables as ${name}: macOS's sh (bash
# 3.2) in a UTF-8 locale reads a character like an ellipsis right after
# an unbraced variable as part of its name ("version?: unbound variable").

FEED=${PROFOLIO_FEED:-https://nyeongwoo.github.io/profolio/appcast.xml}
TEAM=MV2VX9C5T9

say() { printf '%s\n' "$*"; }
fail() { printf 'Profolio: %s\n' "$*" >&2; exit 1; }

[ "$(uname -s)" = Darwin ] || fail "this installs the Mac app; run it on a Mac."
major=$(sw_vers -productVersion | cut -d. -f1)
[ "${major}" -ge 15 ] || fail "Profolio needs macOS 15 Sequoia or later (this Mac has $(sw_vers -productVersion))."

# Newest first in the feed.
url=$(curl -fsSL "${FEED}" | grep -o '<enclosure url="[^"]*"' | head -n 1 | sed 's/.*url="//; s/"$//')
case ${url} in
  https://github.com/Nyeongwoo/profolio/releases/download/v*/Profolio-*.zip) ;;
  *) fail "couldn't find the download in ${FEED}." ;;
esac
version=${url##*/Profolio-}
version=${version%.zip}

work=$(mktemp -d "${TMPDIR:-/tmp}/profolio-install.XXXXXX")
trap 'rm -rf "${work}"' EXIT

say "Downloading Profolio ${version}..."
curl -fL --progress-bar "${url}" -o "${work}/Profolio.zip"
ditto -x -k "${work}/Profolio.zip" "${work}/unzipped"
app="${work}/unzipped/Profolio.app"
[ -d "${app}" ] || fail "the download didn't contain Profolio.app."

# Only an untouched app signed by Profolio's developer goes in.
codesign --verify --deep --strict "${app}" 2>/dev/null || fail "the downloaded app's signature doesn't check out; nothing was installed."
codesign -dv "${app}" 2>&1 | grep -q "^TeamIdentifier=${TEAM}\$" || fail "the downloaded app isn't signed by Profolio's developer; nothing was installed."

dest=${PROFOLIO_DIR:-/Applications}
if [ -z "${PROFOLIO_DIR:-}" ] && [ ! -w "${dest}" ]; then
  dest="${HOME}/Applications"
fi
mkdir -p "${dest}"

# Only the copy being replaced needs to be closed.
running() { pgrep -qf "^${dest}/Profolio.app/Contents/MacOS/Profolio"; }
if running; then
  say "Quitting Profolio..."
  osascript -e 'tell application "Profolio" to quit' >/dev/null 2>&1 || true
  i=0
  while running && [ ${i} -lt 20 ]; do sleep 0.5; i=$((i + 1)); done
  running && fail "Profolio is still open. Quit it, then run this again."
fi

rm -rf "${dest}/Profolio.app"
ditto "${app}" "${dest}/Profolio.app"
xattr -dr com.apple.quarantine "${dest}/Profolio.app" 2>/dev/null || true

say "Profolio ${version} is installed in ${dest}."
[ -n "${PROFOLIO_NO_OPEN:-}" ] || open "${dest}/Profolio.app"
