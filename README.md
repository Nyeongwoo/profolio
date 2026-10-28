# Profolio

A native Mac app for editing and publishing portfolio websites — edit, preview and publish in one window.

I built Profolio to run my own site, [nnwoo.com](https://nnwoo.com), which is now one site made with it. This repository holds the app, the site template every new site starts from, and the tooling that builds and releases them.

<!-- Screenshots: add images to docs/screenshots/ and link them here. -->
> Screenshots coming soon.

## Install

Profolio needs macOS 15 Sequoia or later.

```sh
curl -fsSL https://nyeongwoo.github.io/profolio/install.sh | sh
```

The installer ([pages/install.sh](pages/install.sh)) downloads the newest release from the update feed (GitHub Releases, listed in the appcast on GitHub Pages), checks the app's code signature, puts it in `/Applications` and opens it. After that, Profolio updates itself.

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
- **The editor API runs in JavaScriptCore.** The site's Node/Express editor server is bundled by `template/scripts/siteproj.js` with small shims (`template/scripts/editor-api/`) for `fs`, `path`, `express` and friends. It runs inside the app, confined to the package, so editing needs no Node on the Mac. `template/scripts/editor-api/test.js` is its Node twin for testing.
- **GitHub** uses the OAuth device flow or a pasted fine-grained token, stored in the Keychain.
- **Dependencies:** [Sparkle](https://sparkle-project.org) via Swift Package Manager, and [libwebp](https://chromium.googlesource.com/webm/libwebp) vendored in `mac/SiteEditor/libwebp` (BSD license, see `LICENSE-libwebp.txt`).

## Repository layout

```
mac/
  SiteEditor.xcodeproj     Xcode project (target SiteEditor, builds Profolio.app)
  SiteEditor/              Swift sources, Help pages, app icon, libwebp
  Info.plist
template/                  the site template (React + Vite, editor server, sample content)
  scripts/siteproj.js      builds .portfolio packages and the web editor
  scripts/editor-api/      JavaScriptCore shims for the bundled editor server
scripts/
  build-starter.js         builds StarterSite.zip (template/ + editor) for New Site
  release-profolio.sh      builds, signs and publishes a release (GitHub Releases + Pages feed)
  update-profolio.sh       builds and installs Profolio on this Mac
pages/install.sh           the one-line installer, served from GitHub Pages
docs/siteproj-format.md    the .portfolio package format
```

## Building

Open `mac/SiteEditor.xcodeproj` in Xcode (macOS 15 SDK or later) and run the **SiteEditor** scheme. To build your own copy:

- Set your own **Team** and bundle identifier under Signing & Capabilities.
- Set `GITHUB_CLIENT_ID` to your own GitHub OAuth App (device flow enabled), or leave it empty and paste a token in the app.
- The update feed (`SUFeedURL`) and `SUPublicEDKey` in `mac/Info.plist` point at the official releases. Change them if you publish your own builds.

The starter site (`StarterSite.zip`, which File ▸ New Site… and Update Site… use) is built by `node scripts/build-starter.js` (Node 20 or later) from `template/`; the release and update scripts run it before building. Without it the app still builds and edits existing sites, but New Site has no starter to use.

To work on the site template, run `npm install` and `npm run dev:all` in `template/`. Changes reach sites through Update Site… in the next release.

## License

Copyright © 2026 Nyeongwoo (github.com/Nyeongwoo). All rights reserved. The source is here to read, not to reuse. See [LICENSE](LICENSE). libwebp keeps its own BSD license.
