#!/bin/zsh
# Builds a Profolio release and, with --publish, publishes it.
#
#   scripts/release-profolio.sh ["What's new, one line per change"] [--publish]
#
# 1. Builds the starter site (scripts/build-starter.js) and the universal
#    Release app (the version is MARKETING_VERSION in
#    mac/SiteEditor.xcodeproj — bump it first).
# 2. Zips it as Profolio-<version>.zip in the release cache, with the notes
#    as Profolio-<version>.html beside it. Only the newest three are kept.
# 3. Runs Sparkle's generate_appcast, which signs the zip with the EdDSA key
#    in this Mac's login keychain and rewrites appcast.xml. Each download
#    points at the version's GitHub Release (tag v<version>).
# 4. Puts appcast.xml and install.sh in .pages/, a worktree of the gh-pages
#    branch that GitHub Pages serves at https://nyeongwoo.github.io/profolio/.
# 5. Copies the app to iCloud Drive/nnwoo (Profolio.app and Releases/).
#
# Without --publish it stops there, so the feed can be checked first. With
# it, the zip goes up as the GitHub Release v<version>, then gh-pages is
# committed and pushed: once Pages deploys, every Profolio offers it.
# Installing on this Mac stays a separate step: quit Profolio first.
set -euo pipefail

ROOT=${0:A:h:h}
PROJECT=$ROOT/mac/SiteEditor.xcodeproj
DERIVED=${DERIVED:-$HOME/Library/Caches/Profolio-release}
FEED=$DERIVED/feed
PAGES=$ROOT/.pages
REPO=Nyeongwoo/profolio
ICLOUD="$HOME/Library/Mobile Documents/com~apple~CloudDocs/nnwoo"
PUBLISH=
NOTES=
for arg in "$@"; do
  if [[ $arg == --publish ]]; then PUBLISH=1; else NOTES=$arg; fi
done

VERSION=$(grep -m1 'MARKETING_VERSION' "$PROJECT/project.pbxproj" | sed -E 's/.*= ([^;]+);/\1/')
echo "Profolio $VERSION"
if [[ -n $PUBLISH ]] && gh release view "v$VERSION" -R $REPO >/dev/null 2>&1; then
  echo "v$VERSION is already released: bump MARKETING_VERSION first."
  exit 1
fi

node "$ROOT/scripts/build-starter.js"

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
"$BIN/generate_appcast" --download-url-prefix "https://github.com/$REPO/releases/download/" \
  --embed-release-notes --maximum-deltas 0 "$FEED"
# generate_appcast takes one prefix for every zip; each release has its own tag.
sed -i '' -E "s#(https://github.com/$REPO/releases/download/)Profolio-([^\"/]+)\\.zip#\\1v\\2/Profolio-\\2.zip#g" "$FEED/appcast.xml"

if [[ ! -d $PAGES ]]; then
  git -C "$ROOT" fetch -q origin gh-pages 2>/dev/null || true
  if git -C "$ROOT" rev-parse -q --verify origin/gh-pages >/dev/null; then
    git -C "$ROOT" worktree add -q "$PAGES" -B gh-pages origin/gh-pages
  else
    git -C "$ROOT" worktree add -q --orphan -b gh-pages "$PAGES"
  fi
fi
cp "$FEED/appcast.xml" "$PAGES/appcast.xml"
cp "$ROOT/pages/install.sh" "$PAGES/install.sh"
touch "$PAGES/.nojekyll"

if [[ -d $ICLOUD ]]; then
  rm -rf "$ICLOUD/Profolio.app"
  ditto "$APP" "$ICLOUD/Profolio.app"
  mkdir -p "$ICLOUD/Releases"
  cp "$ZIP" "$ICLOUD/Releases/"
fi

echo "Built app: $APP"
if [[ -z $PUBLISH ]]; then
  echo "Ready: $ZIP and $PAGES/appcast.xml — run again with --publish to release."
  exit 0
fi

BODY=$(print -r -- "$NOTES" | sed '/^$/d; s/^/- /')
gh release create "v$VERSION" "$ZIP" -R $REPO --title "Profolio $VERSION" --notes "${BODY:-Profolio $VERSION}"
git -C "$PAGES" add -A
git -C "$PAGES" commit -q -m "Profolio $VERSION"
git -C "$PAGES" push -q origin gh-pages
echo "Published: https://github.com/$REPO/releases/tag/v$VERSION"
echo "Feed: https://nyeongwoo.github.io/profolio/appcast.xml (live once Pages deploys)"
