# Profolio

A native Mac app for editing and publishing portfolio websites — edit, preview and publish in one window.

I built Profolio to run my own site, [nnwoo.com](https://nnwoo.com). This repository holds the app and the tooling that builds and releases it. The site it edits stays in its own private repository.

<!-- Screenshots: add images to docs/screenshots/ and link them here. -->
> Screenshots coming soon.

## Install

Profolio needs macOS 15 Sequoia or later.

```sh
curl -fsSL https://nnwoo.com/profolio/install.sh | sh
```

The installer ([public/profolio/install.sh](public/profolio/install.sh)) downloads the newest release from the update feed, checks the app's code signature, puts it in `/Applications` and opens it. After that, Profolio updates itself.

## What it does

- **One window for the whole site.** The sidebar lists the site's pages, projects, blog, settings and Lab pieces. The middle is a live preview of the site from this Mac's copy (desktop, tablet or mobile). On the right, a native inspector edits whatever is selected.
- **Publish to GitHub.** Publish lists every change, with text shown before → after and images side by side. It pulls in edits made elsewhere, asks which to keep when both sides changed the same value, and commits. Vercel then deploys the site.
- **New Site.** Starts a fresh portfolio from a starter with a layout preset (Grid, Showcase, Feed or Compact), creates its GitHub repository and the project file.
- **Assistant (⌘J).** A chat about the site, kept per page. It can see the site's structure, the selection and the preview, and it can make edits when asked.
- **Lab.** Interactive web pieces (HTML/CSS/JS) embedded in site pages. They have a live preview, a tuning panel, and a coding agent (Claude Code) that works on the piece through Profolio's own MCP server, with screenshots and pick-to-point.
- **Translations.** English, Korean and Simplified Chinese, with untranslated counts per page.
- **Backups.** Snapshots of each page as you edit, kept inside the project file and restorable from File ▸ Backups….
- **Images.** Cropping, WebP encoding (bundled libwebp), SVG recoloring and annotations.
- **Sparkle updates.** Releases are EdDSA-signed and served from an appcast feed.

## How it's built

- **Swift, SwiftUI and AppKit** (`mac/SiteEditor/`). AppKit handles the windows, menus and document handling. SwiftUI builds the forms and sheets. WKWebView renders the preview and the web editor.
- **The `.portfolio` package** ([docs/siteproj-format.md](docs/siteproj-format.md)) is a document bundle holding a site's content, images, Lab pieces, backups and a built copy of the site's web editor. It usually lives in iCloud Drive so it syncs between Macs.
- **The editor API runs in JavaScriptCore.** The site's Node/Express editor server is bundled by `scripts/siteproj.js` with small shims (`scripts/editor-api/`) for `fs`, `path`, `express` and friends. It runs inside the app, confined to the package, so editing needs no Node on the Mac. `scripts/editor-api/test.js` is its Node twin for testing.
- **GitHub** uses the OAuth device flow or a pasted fine-grained token, stored in the Keychain.
- **Dependencies:** [Sparkle](https://sparkle-project.org) via Swift Package Manager, and [libwebp](https://chromium.googlesource.com/webm/libwebp) vendored in `mac/SiteEditor/libwebp` (BSD license, see `LICENSE-libwebp.txt`).

## Repository layout

```
mac/
  SiteEditor.xcodeproj     Xcode project (target SiteEditor, builds Profolio.app)
  SiteEditor/              Swift sources, Help pages, app icon, libwebp
  Info.plist
scripts/
  siteproj.js              builds .portfolio packages, the web editor and the starter site
  starter.js               the starter site New Site begins from
  editor-api/              JavaScriptCore shims for the bundled editor server
  release-profolio.sh      builds, zips, signs and publishes a release to the feed
  update-profolio.sh       builds and installs Profolio on this Mac
public/profolio/install.sh the one-line installer
docs/siteproj-format.md    the .portfolio package format
```

## Building

Open `mac/SiteEditor.xcodeproj` in Xcode (macOS 15 SDK or later) and run the **SiteEditor** scheme. To build your own copy:

- Set your own **Team** and bundle identifier under Signing & Capabilities.
- Set `GITHUB_CLIENT_ID` to your own GitHub OAuth App (device flow enabled), or leave it empty and paste a token in the app.
- The update feed (`SUFeedURL`) and `SUPublicEDKey` in `mac/Info.plist` point at the official releases. Change them if you publish your own builds.

Some parts are not in this repository, and the scripts that need them expect to run from the site repository:

- **The starter site** (`StarterSite.zip`, which File ▸ New Site… uses) is built by `node scripts/siteproj.js starter` from the site's source. Without it the app still builds and edits existing sites, but New Site has no starter to use.
- **The web editor and editor server** that go into each `.portfolio` package are built from the site's source (`vite build --mode app`).

## License

Copyright © 2026 Nyeongwoo Kwon. All rights reserved. The source is here to read, not to reuse. See [LICENSE](LICENSE). libwebp keeps its own BSD license.
