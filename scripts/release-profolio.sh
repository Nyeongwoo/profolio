#!/bin/zsh
# Builds a Profolio release and publishes it to the update feed.
#
#   scripts/release-profolio.sh ["What's new, one line per change"]
#
# 1. Builds the universal Release app (the version is MARKETING_VERSION in
#    mac/SiteEditor.xcodeproj — bump it first, see the app-versioning note).
# 2. Zips it as public/profolio/Profolio-<version>.zip, with the notes as
#    Profolio-<version>.html beside it.
# 3. Runs Sparkle's generate_appcast, which signs the zip with the EdDSA key
#    in this Mac's login keychain and rewrites public/profolio/appcast.xml.
#    Only the newest three zips are kept.
# 4. Copies the app to iCloud Drive/nnwoo (Profolio.app and Releases/).
#
# Then commit public/profolio and push: once nnwoo.com deploys, every
# Profolio checks https://nnwoo.com/profolio/appcast.xml and offers it.
# Installing on this Mac stays a separate step: quit Profolio first.
set -euo pipefail

ROOT=${0:A:h:h}
PROJECT=$ROOT/mac/SiteEditor.xcodeproj
FEED=$ROOT/public/profolio
DERIVED=${DERIVED:-$HOME/Library/Caches/Profolio-release}
ICLOUD="$HOME/Library/Mobile Documents/com~apple~CloudDocs/nnwoo"
NOTES=${1:-}

VERSION=$(grep -m1 'MARKETING_VERSION' "$PROJECT/project.pbxproj" | sed -E 's/.*= ([^;]+);/\1/')
echo "Profolio $VERSION"

# A failed build must stop here: the previous build is still on disk and
# would otherwise be released under the new version.
LOG=$(mktemp -t profolio-build)
if ! xcodebuild -project "$PROJECT" -scheme SiteEditor -configuration Release -derivedDataPath "$DERIVED" \
  ARCHS="arm64 x86_64" ONLY_ACTIVE_ARCH=NO build > "$LOG" 2>&1; then
  grep -E "error:" "$LOG" | head -20
  echo "Build failed (full log: $LOG)"
  exit 1
fi
echo "Build succeeded"
APP="$DERIVED/Build/Products/Release/Profolio.app"
BUILT=$(defaults read "$APP/Contents/Info.plist" CFBundleShortVersionString)
[[ $BUILT == "$VERSION" ]] || { echo "Built $BUILT, expected $VERSION"; exit 1; }
codesign --verify --deep --strict "$APP"

mkdir -p "$FEED"
ZIP="$FEED/Profolio-$VERSION.zip"
rm -f "$ZIP"
ditto -c -k --keepParent "$APP" "$ZIP"
if [[ -n $NOTES ]]; then
  {
    echo "<ul>"
    print -r -- "$NOTES" | while IFS= read -r line; do
      [[ -n $line ]] && print -r -- "<li>${line//&/&amp;}</li>"
    done
    echo "</ul>"
  } > "$FEED/Profolio-$VERSION.html"
fi

# Keep the newest three versions.
ls -t "$FEED"/Profolio-*.zip | tail -n +4 | while read -r old; do
  rm -f "$old" "${old%.zip}.html"
done

BIN=$(ls -d "$DERIVED"/SourcePackages/artifacts/*/Sparkle/bin | head -1)
"$BIN/generate_appcast" --download-url-prefix "https://nnwoo.com/profolio/" \
  --embed-release-notes --maximum-deltas 0 "$FEED"

if [[ -d $ICLOUD ]]; then
  rm -rf "$ICLOUD/Profolio.app"
  ditto "$APP" "$ICLOUD/Profolio.app"
  mkdir -p "$ICLOUD/Releases"
  cp "$ZIP" "$ICLOUD/Releases/"
fi

echo "Ready: $ZIP and $FEED/appcast.xml — commit public/profolio and push to publish."
echo "Built app: $APP"
