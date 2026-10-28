# .portfolio package format (v1)

The Mac editor app (Profolio) edits the site through a single document package,
`nnwoo.portfolio`, kept in iCloud Drive. It holds the site's content and
assets plus editor backups; the site code stays only in git. Publishing turns
the package's changes into one GitHub commit, and Vercel deploys from there.

Build one from this repo with `node scripts/siteproj.js import`
(see the header of [scripts/siteproj.js](../scripts/siteproj.js)).

## Layout

```
nnwoo.portfolio/
├── manifest.json        format, repository, managed paths, publish state
├── base-index.json      git blob id of every managed file at the base commit
├── editor/              the site's web editor, built for the app (not published)
├── site/                content, mirrored at its repo path
│   ├── src/data/*.json
│   ├── src/i18n/ko.json
│   ├── src/i18n/zh.json
│   └── public/**
└── backups/             editor snapshots, keyed by the document's folder
    └── public/assets/projects/<category>/<id>/<timestamp>.json
```

`site/<path>` is the file at `<path>` in the repo; nothing is renamed, so
publishing is a direct path mapping.

## manifest.json

| key | meaning |
| --- | --- |
| `format` | always `com.nnwoo.siteproj` (the format's original name, kept) |
| `formatVersion` | `1`; readers refuse newer versions |
| `repository` | `{ owner, name, branch }` publishing targets |
| `paths.include` / `paths.exclude` | globs of repo paths the package manages (`**` crosses folders, `*` doesn't) |
| `editor` | `{ commit, dirty, builtAt }` the code the editor build came from |
| `lastPublished` | ISO date of the last successful publish, or `null` |
| `importedAt` | ISO date the package was built from the repo |

Managed paths: `src/data/*.json`, `src/i18n/ko.json`, `src/i18n/zh.json`,
`public/**` (lab pieces, `public/lab/**`, included — Profolio's Lab edits
them), excluding `**/backups/**`, `**/.DS_Store` and `public/profolio/**` (the
app's update feed and downloads, published through git). Repo files outside
these are never added, changed or deleted by the app.

## editor/

`vite build --mode app` output, installed by `siteproj.js import` or
`siteproj.js editor`. The app is a generic host: it shows whatever editor the
package brings, so a package for another site carries that site's editor.
In this build, `src/data/*.json` and `src/i18n/*.json` are fetched from the
package at startup rather than bundled, so the editor and its preview always
show the package's current content.

The app serves the package at `siteproj://site/`:

| path | from |
| --- | --- |
| `/api/…` | the editor API (handled by the app) |
| `/src/data/*.json`, `/src/i18n/*.json` | `site/src/…` |
| a file in `site/public` | that file (the site's public path) |
| a file in `editor/` | that file |
| other extensionless paths | `editor/index.html` |

### editor/api/ — the editor API

`server.js` is the site's editor server (`server/index.js`, unchanged)
bundled with stand-ins for express, fs, path and the other Node modules it
uses ([scripts/editor-api](../scripts/editor-api)). The app runs it in
JavaScriptCore and sends it every `/api/…` request. `files.json` holds the
few read-only files from the site code the server reads (the `t('…')` calls
behind the Translations page).

The server sees the repo at `/repo`, mapped into the package (see the header
of [fs.js](../scripts/editor-api/fs.js)); backups land in `backups/`.

The app provides one global, `host`, with paths relative to the package
root (never outside it):

| member | does |
| --- | --- |
| `read(rel)` | UTF-8 text, or `null` |
| `write(rel, text)` / `writeBase64(rel, b64)` | write a file, creating folders → `true`/`false` |
| `stat(rel)` | `{ isDirectory, size, mtimeMs }` or `null` |
| `list(rel)` | `[{ name, isDirectory }]` in directory order, or `null` |
| `mkdir(rel)` | recursive |
| `copy(a, b)` / `move(a, b)` | replace `b` if present |
| `remove(rel)` | file or folder |
| `log(level, text)` | to the app log |
| `setTimeout(fn, ms)` / `clearTimeout(id)` | timers |
| `fetch(url, headersJSON, cb)` | `cb(error)` or `cb(null, status, text)`; body capped at 500 KB |

and calls `handleRequest(method, url, headersJSON, body, done)`, expecting
`done(status, headersJSON, body)` once. Changing a file under `site/src/`
makes the app post `siteproj:content-changed` to the page and its frames, so
public pages (the preview) reload.

`node scripts/editor-api/test.js <pkg>` runs the bundle with a Node copy of
this host and compares every GET route with the running `npm run server`.

## base-index.json

```json
{ "commit": "<sha>", "committedAt": "<ISO date>", "files": { "public/robots.txt": "<git blob sha1>", "…": "…" } }
```

The state of the managed paths at `commit` on `repository.branch`. The git
blob id is `sha1("blob <byte length>\0" + bytes)`, so it can be computed
locally from `site/` without contacting GitHub.

## Publishing

The app signs in to GitHub once (Profolio ▸ GitHub Account…: device flow
with the OAuth App in the `GITHUB_CLIENT_ID` build setting, or a pasted
fine-grained token with Contents read/write) and keeps the token in iCloud
Keychain when the build is team-signed, otherwise in the login keychain.
The editor's Deploy button then runs this in the app
([Publisher.swift](../mac/SiteEditor/Publisher.swift)), streaming progress to
the button as before:

1. Compute the blob id of every file in `site/` (cache by size + mtime).
2. Changes against `base-index.json`: id differs or path new → upload;
   path in the index but missing from `site/` → delete.
3. If `branch` has moved past `base.commit`, compare those commits first.
   A managed path changed on both sides is a conflict for the user to resolve;
   otherwise build on the newer head.
   Changes on GitHub to managed paths not touched here are first written
   into the package.
4. Create blobs → tree (with `base_tree`) → commit → move the branch ref
   (GitHub Git Data API; fast-forward only, retried if the branch moved).
   Vercel's Git integration deploys the push.
5. Write the new commit and ids to `base-index.json` and set `lastPublished`.
6. Follow Vercel's commit status / check run until the deploy finishes.

Before step 1, make sure every file in `site/` is downloaded locally
(iCloud may have evicted some to save space).

## Backups

Before a content document is overwritten, its current version is kept as a
snapshot in `backups/`, at most 20 per document. Two layouts share the folder:

| written by | layout | for |
| --- | --- | --- |
| the editor server | `backups/<dir>/<stamp>.json` | `<dir>/info.json` (project and original pages) |
| the app | `backups/<path>.json/<stamp>.json` | every other JSON document under `site/` (pages, site settings, translations, category pages…) |

`<stamp>` is the ISO time with `:` and `.` replaced by `-`
(`2026-10-04T21-04-38-321Z`). The web editor kept the server's snapshots in a
`backups/` folder next to `info.json`; `siteproj.js import` moves them here:

`public/assets/projects/product/maizy/backups/X.json` →
`backups/public/assets/projects/product/maizy/X.json`

File ▸ Backups… in the app lists every document's snapshots, shows what
restoring one would change, and restores it (keeping the replaced version as
a snapshot too). Backups are never published; they sync with the package
through iCloud Drive.

The backup files already committed in git are left there; publishing neither
adds nor deletes them. Removing them from the repo is a separate decision.

## iCloud Drive

Keep the package in iCloud Drive (in a folder of your choice) and open
it from any Mac with Profolio. Edits are written straight into the package,
so iCloud syncs each save; there is no separate Save step.

Not handled yet: the app writes without `NSFileCoordinator`, so editing the
same project on two Macs at the same moment can leave iCloud conflict copies.
Use one Mac at a time.
