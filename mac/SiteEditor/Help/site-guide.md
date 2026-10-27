# Site guide (for coding agents)

This site is a portfolio made with Profolio, a Mac app. It is a React + Vite single-page app deployed by Vercel from GitHub. Profolio edits the site's **content** and publishes it; the **code** comes from Profolio's starter and is updated with Profolio ▸ Update Site. This guide tells an agent (Claude Code, Codex, Profolio's Assistant) where things are and what is safe to change.

## Golden rules
- Change content in the JSON files and assets listed below. Keep JSON valid and keep keys you don't understand.
- Profolio reads the same files, so anything you write shows up in Profolio's editor and preview.
- Code files (`src/**/*.jsx`, `src/**/*.js` other than `src/data/*.json`, `src/index.css`, `vite.config.js`, `server/`, `middleware.js`) belong to Profolio's starter. Changing them works, but Update Site will then ask whether to keep your version of each changed file — prefer settings and content over code edits.
- Never commit secrets. Don't touch `.vercel/`.
- `npm install` then `npm run dev` previews the site; `npm run build` must pass before publishing code.

## Content files
| File | What it holds |
|---|---|
| `src/data/siteConfig.json` | Site-wide settings: name, tagline, contacts, fonts, navbar, footer, page layouts, Site Structure (below), hidden items, category order and labels. |
| `src/data/home.json` | Home: `hero`, `featured` (cards), `sections`, `gridSections`, `originalsSection`. |
| `src/data/about.json` | About page: `intro`, `photos`, `resume`, `sections`. |
| `src/data/projects.json` | Projects list: `{ id, category, title, year, order, description, overview, tags, sections }`. A title may end with `{Short name}` for the small icon labels. |
| `src/data/originals.json` | Originals (personal works), same shape as projects plus `homeThumbnail`. |
| `src/data/blog.json` | Blog posts: `{ id, category, title, date, preview, thumbnail, content }`. |
| `src/data/archive.json` | Archive page: `title`, `description`, `items`. |
| `src/i18n/ko.json`, `zh.json` | Translations: `strings` maps English text to the translation. |
| `public/assets/projects/<category>/<id>/info.json` | A project's page: details (`role`, `team`, `duration`, `overview`…) and `sections`. Images sit beside it (`cover.webp`, `hero.webp`, `sections/…`). |
| `public/assets/projects/<category>/category-info.json` | Sections shown on a category page. |
| `public/assets/originals/…` | The same for Originals. |
| `src/data/pages.json` | The site's own pages: `[{ id, title, path }]` (`path` like `/research`). |
| `public/assets/pages/<id>/info.json` | One own page: `title`, `description`, `showHeader`, `sections`; images in `sections/` beside it. |
| `public/lab/<piece>/` | Lab pieces: small standalone web pages embedded with an Interactive section. |

Don't edit `backups/` folders or `public/profolio/`.

## Sections
Pages are built from `sections`, each `{ id, type, label, … }`. Types: `text`, `images`, `image-text`, `image-text-carousel`, `image-grid`, `image-tab`, `text-columns`, `scroll-animation`, `video-background`, `feature-tabs`, `tab-switcher`, `accordion`, `stats`, `model-viewer`, `interactive`.

People and newest-post sections (organization sites, any page):
- `people`: `{ lines, people: [{ name, role, affiliation, bio, link, photo, featured, hidden }], featuredLabel, columns }`. `photo` is a site path without extension (`/assets/pages/people/sections/x`) or `__placeholder__`; featured people come first with the badge.
- `recent-posts`: `{ lines, count, category, showDate }`: the newest Blog posts, linked.

Text is stored as `lines`: `[{ kind: 'title' | 'subtitle' | 'body' | 'row' | 'spacer', text, size, weight, color, font, gapAfter, maxWidth, textAlign, letterSpacing, lineHeight, italic }]`. `text` may hold simple inline HTML (`<b>`, `<i>`, `<br>`, links). Sizes are CSS lengths (`"32px"`). Conventions used across the site: section label = subtitle 21px/700 `#919191` with `gapAfter: 12`; section title = title 32px/700; body = 17px/500. Don't wrap a whole bold line in `<b>` (it renders heavier).

Cards in `image-text` / carousel sections are `blocks: [{ images, lines, … }]`. Image fields hold file names relative to the page's asset folder.

## Your own pages
Besides Projects, Originals, Blog, About and Contacts, a site can have its own pages (Profolio: the + on the sidebar's Site group). Each is listed in `src/data/pages.json` and built from sections in `public/assets/pages/<id>/info.json`. A page's address can't be one of the site's own (`/projects`, `/about`, `/blog`, `/editor`, `/lab`, …). To add one by hand: add the entry, create its `info.json`, and add `{ "key": "page", "page": "<id>" }` to `structure.nav` to put it in the menu.

## Site Structure (`siteConfig.structure`)
Turns parts of the site on and off and sets the menu. Missing keys mean "on" / "as before".
```json
"structure": {
  "nav": [
    { "key": "projects", "label": "Work" },
    { "key": "about" },
    { "key": "originals", "hidden": true },
    { "key": "link", "label": "Instagram", "path": "/ig", "href": "https://instagram.com/…" }
  ],
  "sections": { "originals": false, "blog": false, "archive": true },
  "projectIcons": false,
  "categoryFilter": false,
  "detailBar": true,
  "search": true,
  "footer": true
}
```
- `nav`: the menu in order. `key` is `about`, `projects`, `originals`, `blog`, `contacts`, `page` (with `page`: an id from `pages.json`) or `link` (with `path` on this site and optional `href` it forwards to). `label` renames; `hidden` keeps it out of the menu. Without `nav`, the menu comes from the older `hiddenBuiltinNav` / `navCustomItems`.
- `sections`: `false` switches Originals, Blog or the Archive off everywhere (menu, search, footer, home); their addresses go to Home.
- `projectIcons`: the strip of project icons on category pages. Off, category pages list cards like the All page.
- `categoryFilter`: the floating pill bar of categories under the navbar on Projects / Originals (and its phone menu).
- `detailBar`: the bar under the navbar on project and original pages (back arrow, title).
- `search`, `footer`: the navbar's search button and the site footer.
- `names`: what parts are called on the site, e.g. `{ "projects": "Events", "blog": "Notices" }` (menu, titles, search, “Other …” rows).

`siteConfig.projectMetaLabels` (`{ team, duration, role }`) renames a project page's detail labels, e.g. ORGANIZER, DATE, VENUE for events.

Minimal mode (`minimal`, `minimalProjects`, `minimalShow*`) trims the site further for recruiters.

## Publishing
Profolio publishes content (the files above) to GitHub; Vercel deploys each push to `main`. When you change files outside Profolio, commit and push them yourself (or let Profolio publish content files: it merges changes made on GitHub). Code changes need `npm run build` to pass first.
