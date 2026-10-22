#!/bin/zsh
# Updates Profolio on this Mac from the repo: pulls, builds the Release app,
# installs it in /Applications and rebuilds the package's web editor.
#
#   scripts/update-profolio.sh [path/to/nnwoo.portfolio]
#
# The package path is remembered after the first run, so later runs need no
# argument. This is for this Mac only; publishing an update to every Mac is
# scripts/release-profolio.sh.
set -euo pipefail

ROOT=${0:A:h:h}
PROJECT=$ROOT/mac/SiteEditor.xcodeproj
DERIVED=${DERIVED:-$HOME/Library/Caches/Profolio-release}
REMEMBER="$HOME/.config/profolio/package"

PKG=${1:-}
if [[ -z $PKG && -f $REMEMBER ]]; then PKG=$(<"$REMEMBER"); fi
PKG=${PKG%/}
if [[ -n $PKG && ! -d $PKG ]]; then echo "No package at $PKG"; exit 1; fi

# The pull below may rewrite this very file, so the steps live in a
# function that is read in full before anything runs.
main() {
  # Profolio must be closed: its app and its package are about to be replaced.
  if pgrep -xq Profolio; then
    echo "Quitting Profolio…"
    osascript -e 'tell application "Profolio" to quit'
    for _ in {1..20}; do pgrep -xq Profolio || break; sleep 0.5; done
    if pgrep -xq Profolio; then echo "Profolio is still open — quit it and run this again."; exit 1; fi
  fi

  echo "Pulling…"
  # --autostash keeps this Mac's own uncommitted edits (Xcode's signing
  # settings, say) across the pull.
  git -C "$ROOT" pull --autostash --quiet

  VERSION=$(grep -m1 'MARKETING_VERSION' "$PROJECT/project.pbxproj" | sed -E 's/.*= ([^;]+);/\1/')
  echo "Building Profolio $VERSION…"
  LOG=$(mktemp -t profolio-build)
  if ! xcodebuild -project "$PROJECT" -scheme SiteEditor -configuration Release -derivedDataPath "$DERIVED" build > "$LOG" 2>&1; then
    grep -E "error:" "$LOG" | head -20
    echo "Build failed (full log: $LOG)"
    exit 1
  fi

  echo "Installing in /Applications…"
  rm -rf /Applications/Profolio.app
  ditto "$DERIVED/Build/Products/Release/Profolio.app" /Applications/Profolio.app

  if [[ -n $PKG ]]; then
    [[ -d $ROOT/node_modules ]] || (cd "$ROOT" && npm install --silent)
    node "$ROOT/scripts/siteproj.js" editor "$PKG"
    mkdir -p "${REMEMBER:h}"
    print -r -- "$PKG" > "$REMEMBER"
  else
    echo "Skipped the package's editor: pass the package's path once, e.g."
    echo "  scripts/update-profolio.sh ~/Documents/nnwoo.portfolio"
  fi

  echo "Done: Profolio $VERSION is installed."
}

main "$@"
