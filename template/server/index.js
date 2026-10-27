import express from 'express'
import cors from 'cors'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { fileURLToPath } from 'url'
import { exec, execFile, spawn } from 'child_process'
import { promisify } from 'util'
import { translateTree, diffText, collectText } from '../src/i18n/rules.js'
import { ALL_LANGUAGES, OTHER_LANGUAGE_CODES, enabledLanguages } from '../src/i18n/languages.js'

const execAsync = promisify(exec)
const execFileAsync = promisify(execFile)

const VERCEL_PROFILES_DIR = path.join(os.homedir(), '.vercel-profiles')
const VERCEL_AUTH_FILE = path.join(os.homedir(), 'Library/Application Support/com.vercel.cli/auth.json')
const VERCEL_ACTIVE_FILE = path.join(VERCEL_PROFILES_DIR, '.active')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PUBLIC = path.join(__dirname, '../public')
const LAST_DEPLOY_PATH = path.join(__dirname, 'last-deploy.json')
const SITE_CONFIG_PATH = path.join(__dirname, '../src/data/siteConfig.json')
const DATA_DIR = path.join(__dirname, '../src/data')
const PROJECTS_DATA_PATH = path.join(__dirname, '../src/data/projects.json')
const ORIGINALS_DATA_PATH = path.join(__dirname, '../src/data/originals.json')
const PAGE_FILES = { home: 'home.json', about: 'about.json', siteConfig: 'siteConfig.json', blog: 'blog.json', archive: 'archive.json' }

// Restrict CORS to local editor origins only
app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:3001'] }))
app.use(express.json({ limit: '50mb' }))

// PNG uploads ({ name: 'x.png', data: base64 }) are stored as lossless WebP,
// like the rest of the site's images. Profolio converts them before they get
// here; for the web editor, cwebp does it when installed (brew install
// webp) — without it the PNG is kept.
app.use('/api', (req, res, next) => {
  const { name, data } = req.body || {}
  if (req.method !== 'POST' || typeof name !== 'string' || !/\.png$/i.test(name) || typeof data !== 'string') return next()
  const tmp = path.join(os.tmpdir(), `nnwoo-upload-${process.pid}-${Date.now()}`)
  try { fs.writeFileSync(`${tmp}.png`, Buffer.from(data, 'base64')) } catch { return next() }
  const cleanUp = () => [`${tmp}.png`, `${tmp}.webp`].forEach(f => { try { fs.unlinkSync(f) } catch {} })
  execFile('cwebp', ['-quiet', '-lossless', '-z', '6', '-metadata', 'icc', `${tmp}.png`, '-o', `${tmp}.webp`], (err) => {
    try {
      if (!err) req.body = { ...req.body, name: name.replace(/\.png$/i, '.webp'), data: fs.readFileSync(`${tmp}.webp`).toString('base64') }
    } catch {}
    cleanUp()
    next()
  })
})

// Validate route params to prevent path traversal
const SAFE_PARAM = /^[a-zA-Z0-9_-]+$/
function safeParam(...params) {
  return params.every(p => typeof p === 'string' && SAFE_PARAM.test(p))
}

// Safe JSON file reader — returns fallback instead of crashing on corrupt/missing files
function readJson(filePath, fallback = {}) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf-8')) } catch { return fallback }
}

// ── Localization (editor language mode) ──────────────────────────
// The site's other languages (siteConfig.languages, see src/i18n/languages.js)
// are dictionaries keyed by the English text (src/i18n/<lang>.json, see
// src/i18n/index.js). When the editor runs in one of them it sends
// `X-Edit-Lang`, and this middleware makes every existing page editor work as
// a translation editor without changing it:
//   - GET of a content document returns it with text fields translated;
//   - POST of that document diffs it against the English source and writes
//     only the changed text into the dictionary — the English file is never
//     touched, and structural/style edits are dropped;
//   - any other write (uploads, create/delete, hide, settings of shared data)
//     is refused, since it would change the English site too.
const I18N_DIR = path.join(__dirname, '../src/i18n')
/** The site's languages other than English, which the editor can translate into. */
const editLangs = () => enabledLanguages(readJson(SITE_CONFIG_PATH)).filter(l => l.code !== 'en').map(l => l.code)
const dictPath = (lang) => path.join(I18N_DIR, `${lang}.json`)
function readDict(lang) {
  const d = readJson(dictPath(lang), {})
  return { strings: d.strings || {}, images: d.images || {} }
}
function writeDict(lang, dict) {
  const sorted = (o) => Object.fromEntries(Object.keys(o).sort((a, b) => a.localeCompare(b)).map(k => [k, o[k]]))
  fs.writeFileSync(dictPath(lang), JSON.stringify({ strings: sorted(dict.strings), images: sorted(dict.images) }, null, 2) + '\n')
}

// Content documents the page editors load/save, by API route.
const CONTENT_ROUTES = [
  [/^\/api\/page\/([\w-]+)$/, m => PAGE_FILES[m[1]] && path.join(DATA_DIR, PAGE_FILES[m[1]])],
  [/^\/api\/info\/([\w-]+)\/([\w-]+)$/, m => path.join(PUBLIC, 'assets/projects', m[1], m[2], 'info.json')],
  [/^\/api\/original-info\/([\w-]+)\/([\w-]+)$/, m => path.join(PUBLIC, 'assets/originals', m[1], m[2], 'info.json')],
  [/^\/api\/category-info\/(projects|originals)\/([\w-]+)$/, m => path.join(PUBLIC, `assets/${m[1]}`, m[2], 'category-info.json')],
  [/^\/api\/blog-landing-info$/, () => path.join(PUBLIC, 'assets/blog/landing-info.json')],
  [/^\/api\/blog-post-info\/([\w-]+)$/, m => path.join(PUBLIC, 'assets/blog', m[1], 'info.json')],
  [/^\/api\/all-config$/, () => SITE_CONFIG_PATH],
]
// Single entries inside a list file, saved as a partial body alongside a
// page's main document (e.g. a project editor's Save also posts its tags).
const ENTRY_ROUTES = [
  [/^\/api\/project-tags\/([\w-]+)\/([\w-]+)$/, m => readJson(PROJECTS_DATA_PATH, []).find(p => p.category === m[1] && p.id === m[2])],
  [/^\/api\/original-tags\/([\w-]+)\/([\w-]+)$/, m => readJson(ORIGINALS_DATA_PATH, []).find(o => o.category === m[1] && o.id === m[2])],
  [/^\/api\/blog-post-meta\/([\w-]+)$/, m => readJson(path.join(DATA_DIR, 'blog.json'), []).find(p => p.id === m[1])],
]
// Saved alongside a page but never translated (project names, years):
// acknowledged without doing anything, so the page's Save doesn't error.
const LANG_MODE_IGNORED = /^\/api\/(project-title|project-year|original-year)\//
// Writes that don't touch shared content and stay allowed in language mode.
const LANG_MODE_ALLOWED = /^\/api\/(deploy|vercel-|maintenance|ai-blocking|link-preview|languages$|i18n\/)/

// Applies edited translations from (source, edited) pairs. A string can
// appear in several fields; only a field whose value actually changed (vs.
// the translation it was shown) counts, so untouched duplicates can't undo
// an edit made elsewhere. Clearing a field, or setting it back to the
// English, removes the translation.
function applyPairs(dict, pairs) {
  const bySrc = new Map()
  pairs.forEach(([src, val]) => { if (!bySrc.has(src)) bySrc.set(src, []); bySrc.get(src).push(val) })
  let changed = 0
  bySrc.forEach((vals, src) => {
    const shown = dict.strings[src] ?? src
    const edited = vals.filter(v => v !== shown)
    if (!edited.length) return
    const v = edited[edited.length - 1].trim() === '' ? '' : edited[edited.length - 1]
    if (v === '' || v === src) delete dict.strings[src]
    else dict.strings[src] = v
    changed++
  })
  return changed
}

app.use('/api', (req, res, next) => {
  const lang = req.get('X-Edit-Lang')
  if (!lang || lang === 'en') return next()
  if (!editLangs().includes(lang)) return res.status(400).json({ error: `Unknown language: ${lang}` })
  const p = req.originalUrl.split('?')[0]
  const hit = CONTENT_ROUTES.map(([re, file]) => { const m = p.match(re); return m && file(m) }).find(Boolean)

  if (req.method === 'GET') {
    // Project/original lists feed the editors' Tags field; titles there are
    // project names and stay untranslated.
    if (/^\/api\/(projects|originals)$/.test(p)) {
      const { strings } = readDict(lang)
      const send = res.json.bind(res)
      res.json = (list) => send(Array.isArray(list) ? list.map(x => x.tags ? { ...x, tags: x.tags.map(t => strings[t] || t) } : x) : list)
      return next()
    }
    if (!hit) return next()
    const { strings } = readDict(lang)
    const send = res.json.bind(res)
    res.json = (body) => send(translateTree(body, v => strings[v]))
    return next()
  }

  const entry = req.method === 'POST' && ENTRY_ROUTES.map(([re, find]) => { const m = p.match(re); return m && (find(m) || {}) }).find(Boolean)
  if ((hit || entry) && req.method === 'POST') {
    const source = hit ? readJson(hit, null) : entry
    if (!source) return res.status(404).json({ error: 'Source document not found' })
    const pairs = []
    diffText(source, req.body, (src, val) => pairs.push([src, val]))
    const dict = readDict(lang)
    const changed = applyPairs(dict, pairs)
    if (changed) writeDict(lang, dict)
    return res.json({ ok: true, translated: changed })
  }

  if (LANG_MODE_IGNORED.test(p)) return res.json({ ok: true, ignored: true })
  if (LANG_MODE_ALLOWED.test(p)) return next()
  return res.status(409).json({
    langBlocked: true,
    error: `Not available while editing ${lang.toUpperCase()}: this changes content shared by every language. Switch the editor to EN to do it. (Per-language images are replaced on the Translations page.)`,
  })
})

// Every translatable document, for the Translations page. `assets` is the
// folder whose images can get per-language replacements.
function i18nSources() {
  const rel = (f) => path.relative(path.join(__dirname, '..'), f)
  const out = [
    { id: 'ui', group: 'Site', label: 'Interface text (buttons, labels, menus)' },
    { id: rel(path.join(DATA_DIR, 'siteConfig.json')), group: 'Site', label: 'Site settings (nav, footer, contacts, captions)', assets: 'assets/footer' },
    { id: rel(path.join(DATA_DIR, 'home.json')), group: 'Pages', label: 'Home', assets: 'assets/home' },
    { id: rel(path.join(DATA_DIR, 'about.json')), group: 'Pages', label: 'About', assets: 'assets/about' },
    { id: rel(path.join(DATA_DIR, 'archive.json')), group: 'Pages', label: 'Archive', assets: 'assets/archive' },
    { id: rel(path.join(DATA_DIR, 'projects.json')), group: 'Pages', label: 'Project list (tags)' },
    { id: rel(path.join(DATA_DIR, 'originals.json')), group: 'Pages', label: 'Original list' },
    { id: rel(path.join(DATA_DIR, 'blog.json')), group: 'Blog', label: 'Blog post list', assets: 'assets/blog' },
  ]
  const blogLanding = path.join(PUBLIC, 'assets/blog/landing-info.json')
  if (fs.existsSync(blogLanding)) out.push({ id: rel(blogLanding), group: 'Blog', label: 'Blog landing', assets: 'assets/blog/landing' })
  for (const type of ['projects', 'originals']) {
    const base = path.join(PUBLIC, 'assets', type)
    if (!fs.existsSync(base)) continue
    for (const cat of fs.readdirSync(base).sort()) {
      const catDir = path.join(base, cat)
      if (!fs.statSync(catDir).isDirectory() || /thumbnails$/.test(cat)) continue
      const ci = path.join(catDir, 'category-info.json')
      if (fs.existsSync(ci)) out.push({ id: rel(ci), group: type === 'projects' ? 'Projects' : 'Originals', label: `${cat} — category page`, assets: `assets/${type}/${cat}/category` })
      for (const item of fs.readdirSync(catDir).sort()) {
        const f = path.join(catDir, item, 'info.json')
        if (fs.existsSync(f)) out.push({ id: rel(f), group: type === 'projects' ? 'Projects' : 'Originals', label: `${cat}/${item}`, assets: `assets/${type}/${cat}/${item}` })
      }
    }
  }
  const blogDir = path.join(PUBLIC, 'assets/blog')
  if (fs.existsSync(blogDir)) {
    for (const id of fs.readdirSync(blogDir).sort()) {
      const f = path.join(blogDir, id, 'info.json')
      if (fs.existsSync(f)) out.push({ id: rel(f), group: 'Blog', label: `Post ${id}`, assets: `assets/blog/${id}` })
    }
  }
  return out
}

// Interface strings: t('…') literals in the public pages/components, plus
// labels the code builds at runtime (category names, filter chips).
function uiStrings() {
  const out = new Set(['All', 'IP', 'Portfolios', 'News', 'Projects', 'Originals', 'Portfolio', 'Project', 'Original', 'Research', 'Report', 'Essay', 'Others'])
  const cap = (c) => c.charAt(0).toUpperCase() + c.slice(1)
  readJson(PROJECTS_DATA_PATH, []).forEach(p => out.add(cap(p.category)))
  readJson(ORIGINALS_DATA_PATH, []).forEach(o => o.category !== 'ip' && out.add(cap(o.category)))
  const dirs = [path.join(__dirname, '../src/pages'), path.join(__dirname, '../src/components')]
  const re = /\bt\(\s*(['"])((?:\\.|(?!\1).)+?)\1\s*\)/g
  dirs.forEach(d => fs.readdirSync(d).filter(f => f.endsWith('.jsx')).forEach(f => {
    const src = fs.readFileSync(path.join(d, f), 'utf-8')
    for (const m of src.matchAll(re)) out.add(m[2].replace(/\\(['"])/g, '$1'))
  }))
  return [...out]
}

function sourceStrings(id) {
  if (id === 'ui') return uiStrings()
  const file = path.resolve(path.join(__dirname, '..'), id)
  if (!file.startsWith(path.join(__dirname, '..') + path.sep) || !file.endsWith('.json')) return null
  if (!i18nSources().some(s => s.id === id)) return null
  return collectText(readJson(file, {}))
}

app.get('/api/i18n/status', (req, res) => {
  const langs = editLangs()
  const dicts = Object.fromEntries(langs.map(l => [l, readDict(l).strings]))
  const all = new Set()
  const sources = i18nSources().map(s => {
    const list = sourceStrings(s.id) || []
    list.forEach(v => all.add(v))
    return { ...s, total: list.length, done: Object.fromEntries(langs.map(l => [l, list.filter(v => dicts[l][v]).length])) }
  })
  // Dictionary entries whose English no longer appears anywhere — usually
  // the English was edited after it was translated.
  const outdated = Object.fromEntries(langs.map(l => [l, Object.keys(dicts[l]).filter(k => !all.has(k)).length]))
  res.json({ languages: langs, sources, outdated })
})

app.get('/api/i18n/source', (req, res) => {
  const list = sourceStrings(String(req.query.id || ''))
  if (!list) return res.status(404).json({ error: 'Unknown source' })
  const langs = editLangs()
  const dicts = Object.fromEntries(langs.map(l => [l, readDict(l).strings]))
  res.json({ strings: list.map(src => ({ src, ...Object.fromEntries(langs.map(l => [l, dicts[l][src] ?? ''])) })) })
})

app.get('/api/i18n/outdated', (req, res) => {
  const all = new Set(i18nSources().flatMap(s => sourceStrings(s.id) || []))
  res.json(Object.fromEntries(editLangs().map(l => {
    const d = readDict(l).strings
    return [l, Object.keys(d).filter(k => !all.has(k)).map(src => ({ src, value: d[src] }))]
  })))
})

// { lang, entries: { english: translation } } — '' removes a translation;
// `rename: { from, to }` moves an outdated entry onto new English text.
app.post('/api/i18n/strings', (req, res) => {
  const { lang, entries = {}, rename } = req.body
  if (!editLangs().includes(lang)) return res.status(400).json({ error: 'Unknown language' })
  const dict = readDict(lang)
  Object.entries(entries).forEach(([src, v]) => {
    if (typeof v !== 'string' || v.trim() === '') delete dict.strings[src]
    else dict.strings[src] = v
  })
  if (rename?.from && rename?.to && dict.strings[rename.from] != null) {
    dict.strings[rename.to] = dict.strings[rename.from]
    delete dict.strings[rename.from]
  }
  writeDict(lang, dict)
  res.json({ ok: true })
})

// Images under a source's asset folder, with any per-language replacement.
const I18N_IMAGE_EXT = /\.(png|jpg|jpeg|gif|webp|svg)$/i
app.get('/api/i18n/images', (req, res) => {
  const dir = String(req.query.dir || '').replace(/\.\./g, '').replace(/^\/+/, '')
  const full = path.join(PUBLIC, dir)
  if (!dir.startsWith('assets/') || !full.startsWith(PUBLIC) || !fs.existsSync(full)) return res.json({ images: [] })
  const langs = editLangs()
  const dicts = Object.fromEntries(langs.map(l => [l, readDict(l).images]))
  const images = []
  const walk = (d, depth) => {
    for (const f of fs.readdirSync(d).sort()) {
      const fp = path.join(d, f)
      const st = fs.statSync(fp)
      if (st.isDirectory()) {
        if (depth < 3 && !['backups', ...OTHER_LANGUAGE_CODES].includes(f) && !/^scroll/.test(f)) walk(fp, depth + 1)
      } else if (I18N_IMAGE_EXT.test(f)) {
        const basePath = '/' + path.relative(PUBLIC, fp).replace(I18N_IMAGE_EXT, '')
        images.push({ basePath, src: '/' + path.relative(PUBLIC, fp), ...Object.fromEntries(langs.map(l => [l, dicts[l][basePath] || null])) })
      }
    }
  }
  walk(full, 0)
  res.json({ images: images.slice(0, 400) })
})

// { lang, basePath, name, data } — stored next to the original, in a
// <lang>/ subfolder, and mapped in the dictionary's `images`.
app.post('/api/i18n/image', (req, res) => {
  const { lang, basePath, name, data } = req.body
  if (!editLangs().includes(lang)) return res.status(400).json({ error: 'Unknown language' })
  if (typeof basePath !== 'string' || !basePath.startsWith('/assets/') || basePath.includes('..')) return res.status(400).json({ error: 'Invalid basePath' })
  const ext = path.extname(name || '').slice(1).toLowerCase()
  if (!I18N_IMAGE_EXT.test(`.${ext}`) || !data) return res.status(400).json({ error: 'Image file required' })
  const dir = path.join(PUBLIC, path.dirname(basePath), lang)
  fs.mkdirSync(dir, { recursive: true })
  const base = path.basename(basePath)
  fs.readdirSync(dir).filter(f => f.replace(I18N_IMAGE_EXT, '') === base).forEach(f => fs.unlinkSync(path.join(dir, f)))
  fs.writeFileSync(path.join(dir, `${base}.${ext}`), Buffer.from(data, 'base64'))
  const dict = readDict(lang)
  dict.images[basePath] = `${path.dirname(basePath)}/${lang}/${base}`
  writeDict(lang, dict)
  res.json({ ok: true, src: `${dict.images[basePath]}.${ext}` })
})

app.delete('/api/i18n/image', (req, res) => {
  const { lang, basePath } = req.body || {}
  if (!editLangs().includes(lang)) return res.status(400).json({ error: 'Unknown language' })
  const dict = readDict(lang)
  const target = dict.images[basePath]
  if (target) {
    const dir = path.join(PUBLIC, path.dirname(target))
    if (fs.existsSync(dir)) fs.readdirSync(dir).filter(f => f.replace(I18N_IMAGE_EXT, '') === path.basename(target)).forEach(f => fs.unlinkSync(path.join(dir, f)))
    delete dict.images[basePath]
    writeDict(lang, dict)
  }
  res.json({ ok: true })
})

app.get('/api/browse', (req, res) => {
  const IMAGE_EXT = /\.(gif|webp|png|jpg|jpeg|svg)$/i
  const rel = (req.query.dir || '').replace(/^\/+/, '').replace(/\.\./g, '').replace(/\/+/g, '/')
  const fullPath = path.join(PUBLIC, rel)
  if (!fullPath.startsWith(PUBLIC)) return res.status(403).json({})
  if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isDirectory()) return res.json({ dirs: [], files: [] })

  const entries = fs.readdirSync(fullPath)
  const dirs = entries.filter(f => { try { return fs.statSync(path.join(fullPath, f)).isDirectory() } catch { return false } }).sort()
  const files = entries
    .filter(f => { try { return IMAGE_EXT.test(f) && fs.statSync(path.join(fullPath, f)).isFile() } catch { return false } })
    .map(f => ({
      name: f,
      ext: (f.match(IMAGE_EXT)?.[0] || '').toLowerCase(),
      basePath: `/${[rel, f.replace(IMAGE_EXT, '')].filter(Boolean).join('/')}`,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))

  res.json({ dirs, files, current: rel })
})

app.get('/api/page/:page', (req, res) => {
  const file = PAGE_FILES[req.params.page]
  if (!file) return res.status(404).json({})
  res.json(readJson(path.join(DATA_DIR, file)))
})

app.post('/api/page/:page', (req, res) => {
  const file = PAGE_FILES[req.params.page]
  if (!file) return res.status(404).json({})
  const filePath = path.join(DATA_DIR, file)
  // `X-Merge: 1` — the editor sends only the top-level keys that page
  // actually changed ({ set, unset }), applied onto the file as it is now.
  // Without it, a page saving the whole document it loaded earlier would
  // silently revert anything another page changed in the meantime (see the
  // fetch wrapper in src/pages/editor/EditorLayout.jsx).
  if (req.get('X-Merge') === '1') {
    const current = readJson(filePath, {})
    const { set = {}, unset = [] } = req.body || {}
    Object.assign(current, set)
    unset.forEach(k => { delete current[k] })
    fs.writeFileSync(filePath, JSON.stringify(current, null, 2))
    return res.json({ ok: true, merged: Object.keys(set).length + unset.length })
  }
  fs.writeFileSync(filePath, JSON.stringify(req.body, null, 2))
  res.json({ ok: true })
})

app.get('/api/projects', (req, res) => {
  const base = path.join(PUBLIC, 'assets/projects')
  const config = readJson(SITE_CONFIG_PATH)
  const hiddenProjects = config.hiddenProjects || []
  const hiddenInAll = config.hiddenInAllProjects || []
  // The project editor seeds its Title/Year/Tags fields from this list, so
  // they have to come along — without them every project opened blank, and
  // Save then failed on the empty title (and would have wiped tags).
  const projectsData = readJson(PROJECTS_DATA_PATH, [])
  const categories = fs.readdirSync(base).filter(f => fs.statSync(path.join(base, f)).isDirectory())
  const result = []
  categories.forEach(cat => {
    const catPath = path.join(base, cat)
    fs.readdirSync(catPath).forEach(item => {
      const infoPath = path.join(catPath, item, 'info.json')
      if (fs.existsSync(infoPath)) {
        const entry = projectsData.find(p => p.category === cat && p.id === item) || {}
        result.push({ category: cat, id: item, hidden: hiddenProjects.includes(`${cat}/${item}`), featured: !hiddenInAll.includes(`${cat}/${item}`), order: entry.order, title: entry.title, year: entry.year, tags: entry.tags })
      }
    })
  })
  res.json(result)
})

app.get('/api/originals', (req, res) => {
  const originals = readJson(ORIGINALS_DATA_PATH, [])
  const config = readJson(SITE_CONFIG_PATH)
  const hiddenOriginals = config.hiddenOriginals || []
  res.json(originals.map(o => ({ category: o.category, id: o.id, hidden: hiddenOriginals.includes(`${o.category}/${o.id}`) })))
})

app.post('/api/project-hidden/:category/:id', (req, res) => {
  const { category, id } = req.params
  if (!safeParam(category, id)) return res.status(400).json({ error: 'Invalid params' })
  const key = `${category}/${id}`
  const config = readJson(SITE_CONFIG_PATH)
  const list = config.hiddenProjects || []
  config.hiddenProjects = req.body.hidden
    ? [...new Set([...list, key])]
    : list.filter(k => k !== key)
  fs.writeFileSync(SITE_CONFIG_PATH, JSON.stringify(config, null, 2))
  res.json({ ok: true })
})

// Featured = shown in the Projects landing tab (the "All" grid, labeled
// Featured). Stored inverted, as hiddenInAllProjects, which the All Projects
// editor page also edits.
app.post('/api/project-featured/:category/:id', (req, res) => {
  const { category, id } = req.params
  if (!safeParam(category, id)) return res.status(400).json({ error: 'Invalid params' })
  const key = `${category}/${id}`
  const config = readJson(SITE_CONFIG_PATH)
  const list = config.hiddenInAllProjects || []
  config.hiddenInAllProjects = req.body.featured
    ? list.filter(k => k !== key)
    : [...new Set([...list, key])]
  fs.writeFileSync(SITE_CONFIG_PATH, JSON.stringify(config, null, 2))
  res.json({ ok: true })
})

// Permanently removes a project: its entry in projects.json, its hidden
// flag in siteConfig, and its entire asset folder (images, video, scroll
// frames, info.json — including its per-project maintenance flag —
// everything under public/assets/projects/:category/:id). Unlike hiding,
// this can't be undone from the editor — the repo's own auto-commit
// history is the only way back if something was deleted by mistake.
app.delete('/api/project-delete/:category/:id', (req, res) => {
  const { category, id } = req.params
  if (!safeParam(category, id)) return res.status(400).json({ error: 'Invalid params' })
  const key = `${category}/${id}`

  const projects = readJson(PROJECTS_DATA_PATH, [])
  const filtered = projects.filter(p => !(p.category === category && p.id === id))
  fs.writeFileSync(PROJECTS_DATA_PATH, JSON.stringify(filtered, null, 2))

  const config = readJson(SITE_CONFIG_PATH)
  if (config.hiddenProjects) {
    config.hiddenProjects = config.hiddenProjects.filter(k => k !== key)
    fs.writeFileSync(SITE_CONFIG_PATH, JSON.stringify(config, null, 2))
  }

  const dir = path.join(PUBLIC, 'assets/projects', category, id)
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true })

  res.json({ ok: true })
})

app.post('/api/project-tags/:category/:id', (req, res) => {
  const { category, id } = req.params
  if (!safeParam(category, id)) return res.status(400).json({ error: 'Invalid params' })
  const projects = readJson(PROJECTS_DATA_PATH, [])
  const proj = projects.find(p => p.category === category && p.id === id)
  if (!proj) return res.status(404).json({ error: 'not found' })
  proj.tags = Array.isArray(req.body.tags) ? req.body.tags : []
  fs.writeFileSync(PROJECTS_DATA_PATH, JSON.stringify(projects, null, 2))
  res.json({ ok: true })
})

app.post('/api/project-year/:category/:id', (req, res) => {
  const { category, id } = req.params
  if (!safeParam(category, id)) return res.status(400).json({ error: 'Invalid params' })
  const projects = readJson(PROJECTS_DATA_PATH, [])
  const proj = projects.find(p => p.category === category && p.id === id)
  if (!proj) return res.status(404).json({ error: 'not found' })
  const year = parseInt(req.body.year, 10)
  if (!Number.isFinite(year)) return res.status(400).json({ error: 'Invalid year' })
  proj.year = year
  fs.writeFileSync(PROJECTS_DATA_PATH, JSON.stringify(projects, null, 2))
  res.json({ ok: true })
})

app.post('/api/project-title/:category/:id', (req, res) => {
  const { category, id } = req.params
  if (!safeParam(category, id)) return res.status(400).json({ error: 'Invalid params' })
  const projects = readJson(PROJECTS_DATA_PATH, [])
  const proj = projects.find(p => p.category === category && p.id === id)
  if (!proj) return res.status(404).json({ error: 'not found' })
  const title = typeof req.body.title === 'string' ? req.body.title.trim() : ''
  if (!title) return res.status(400).json({ error: 'Title is required' })
  proj.title = title
  fs.writeFileSync(PROJECTS_DATA_PATH, JSON.stringify(projects, null, 2))
  res.json({ ok: true })
})

app.post('/api/original-tags/:category/:id', (req, res) => {
  const { category, id } = req.params
  if (!safeParam(category, id)) return res.status(400).json({ error: 'Invalid params' })
  const originals = readJson(ORIGINALS_DATA_PATH, [])
  const orig = originals.find(o => o.category === category && o.id === id)
  if (!orig) return res.status(404).json({ error: 'not found' })
  orig.tags = Array.isArray(req.body.tags) ? req.body.tags : []
  fs.writeFileSync(ORIGINALS_DATA_PATH, JSON.stringify(originals, null, 2))
  res.json({ ok: true })
})

app.post('/api/original-year/:category/:id', (req, res) => {
  const { category, id } = req.params
  if (!safeParam(category, id)) return res.status(400).json({ error: 'Invalid params' })
  const originals = readJson(ORIGINALS_DATA_PATH, [])
  const orig = originals.find(o => o.category === category && o.id === id)
  if (!orig) return res.status(404).json({ error: 'not found' })
  const year = parseInt(req.body.year, 10)
  if (!Number.isFinite(year)) return res.status(400).json({ error: 'Invalid year' })
  orig.year = year
  fs.writeFileSync(ORIGINALS_DATA_PATH, JSON.stringify(originals, null, 2))
  res.json({ ok: true })
})

app.post('/api/original-hidden/:category/:id', (req, res) => {
  const { category, id } = req.params
  if (!safeParam(category, id)) return res.status(400).json({ error: 'Invalid params' })
  const key = `${category}/${id}`
  const config = readJson(SITE_CONFIG_PATH)
  const list = config.hiddenOriginals || []
  config.hiddenOriginals = req.body.hidden
    ? [...new Set([...list, key])]
    : list.filter(k => k !== key)
  fs.writeFileSync(SITE_CONFIG_PATH, JSON.stringify(config, null, 2))
  res.json({ ok: true })
})

app.get('/api/info/:category/:id', (req, res) => {
  const { category, id } = req.params
  if (!safeParam(category, id)) return res.status(400).json({ error: 'Invalid params' })
  const filePath = path.join(PUBLIC, 'assets/projects', category, id, 'info.json')
  if (!fs.existsSync(filePath)) return res.json({})
  res.json(readJson(filePath))
})

app.post('/api/info/:category/:id', (req, res) => {
  const { category, id } = req.params
  if (!safeParam(category, id)) return res.status(400).json({ error: 'Invalid params' })
  const filePath = path.join(PUBLIC, 'assets/projects', category, id, 'info.json')

  // 저장 전 현재 파일을 백업
  if (fs.existsSync(filePath)) {
    const backupDir = path.join(PUBLIC, 'assets/projects', category, id, 'backups')
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir)
    const ts = new Date().toISOString().replace(/[:.]/g, '-')
    fs.copyFileSync(filePath, path.join(backupDir, `${ts}.json`))
    // 최대 20개 유지
    const all = fs.readdirSync(backupDir).filter(f => f.endsWith('.json')).sort()
    if (all.length > 20) all.slice(0, all.length - 20).forEach(f => fs.unlinkSync(path.join(backupDir, f)))
  }

  fs.writeFileSync(filePath, JSON.stringify(req.body, null, 2))
  res.json({ ok: true })
})

app.get('/api/backups/:category/:id', (req, res) => {
  const { category, id } = req.params
  if (!safeParam(category, id)) return res.status(400).json({ error: 'Invalid params' })
  const backupDir = path.join(PUBLIC, 'assets/projects', category, id, 'backups')
  if (!fs.existsSync(backupDir)) return res.json([])
  const files = fs.readdirSync(backupDir)
    .filter(f => f.endsWith('.json'))
    .sort().reverse()
    .map(f => ({ name: f }))
  res.json(files)
})

app.get('/api/backups/:category/:id/:filename', (req, res) => {
  const { category, id, filename } = req.params
  if (!safeParam(category, id)) return res.status(400).json({ error: 'Invalid params' })
  // filename is a timestamp like 2026-07-01T12-00-00-000Z.json — allow hyphens and dots
  if (!/^[a-zA-Z0-9._-]+\.json$/.test(filename)) return res.status(400).json({ error: 'Invalid filename' })
  const filePath = path.join(PUBLIC, 'assets/projects', category, id, 'backups', filename)
  if (!fs.existsSync(filePath)) return res.status(404).json({})
  res.json(readJson(filePath))
})

function readImageDir(dir) {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir)
    .filter(f => /\.(png|jpg|jpeg|gif|webp|svg)$/i.test(f))
    .map(f => {
      const stat = fs.statSync(path.join(dir, f))
      const sizeKB = Math.round(stat.size / 1024)
      return { name: f, size: sizeKB >= 1024 ? `${(sizeKB / 1024).toFixed(1)}MB` : `${sizeKB}KB` }
    })
}

function readVideoDir(dir) {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir)
    .filter(f => /\.(mp4|webm|mov|m4v)$/i.test(f))
    .map(f => {
      const stat = fs.statSync(path.join(dir, f))
      const sizeKB = Math.round(stat.size / 1024)
      return { name: f, size: sizeKB >= 1024 ? `${(sizeKB / 1024).toFixed(1)}MB` : `${sizeKB}KB` }
    })
}

app.get('/api/videos/:category/:id', (req, res) => {
  const { category, id } = req.params
  if (!safeParam(category, id)) return res.status(400).json({ error: 'Invalid params' })
  res.json(readVideoDir(path.join(PUBLIC, 'assets/projects', category, id, 'sections')))
})

app.get('/api/images/:category/:id', (req, res) => {
  const { category, id } = req.params
  if (!safeParam(category, id)) return res.status(400).json({ error: 'Invalid params' })
  res.json(readImageDir(path.join(PUBLIC, 'assets/projects', category, id, 'sections')))
})

app.get('/api/images/:category/:id/hover', (req, res) => {
  const { category, id } = req.params
  if (!safeParam(category, id)) return res.status(400).json({ error: 'Invalid params' })
  res.json(readImageDir(path.join(PUBLIC, 'assets/projects', category, id, 'hover')))
})

app.get('/api/images/:category/:id/mobile', (req, res) => {
  const { category, id } = req.params
  if (!safeParam(category, id)) return res.status(400).json({ error: 'Invalid params' })
  res.json(readImageDir(path.join(PUBLIC, 'assets/projects', category, id, 'mobile')))
})

app.get('/api/images/:category/:id/tablet', (req, res) => {
  const { category, id } = req.params
  if (!safeParam(category, id)) return res.status(400).json({ error: 'Invalid params' })
  res.json(readImageDir(path.join(PUBLIC, 'assets/projects', category, id, 'tablet')))
})

app.get('/api/images/:category/:id/icons', (req, res) => {
  const { category, id } = req.params
  if (!safeParam(category, id)) return res.status(400).json({ error: 'Invalid params' })
  const dir = path.join(PUBLIC, 'assets/projects', category, id, 'icons')
  try {
    const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => /\.(svg|png|webp|jpg|jpeg|gif)$/i.test(f)).sort() : []
    res.json(files)
  } catch { res.json([]) }
})

// POST /api/images/:category/:id/:folder/upload
// Body: { name: string, data: base64, targetNum?: number }
app.post('/api/images/:category/:id/:folder/upload', (req, res) => {
  const { category, id, folder } = req.params
  if (!safeParam(category, id)) return res.status(400).json({ error: 'Invalid params' })
  if (!['sections', 'hover', 'mobile', 'tablet'].includes(folder)) {
    return res.status(400).json({ error: 'Invalid folder' })
  }
  const { name, data, targetNum } = req.body
  if (!name || !data) return res.status(400).json({ error: 'name and data required' })
  const ext = path.extname(name).slice(1).toLowerCase()
  if (!ext) return res.status(400).json({ error: 'Missing file extension' })

  const dir = path.join(PUBLIC, 'assets/projects', category, id, folder)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  let num
  if (targetNum != null && !isNaN(parseInt(targetNum))) {
    num = parseInt(targetNum)
  } else {
    const existing = readImageDir(dir).map(f => parseInt(f.name)).filter(n => !isNaN(n))
    num = existing.length > 0 ? Math.max(...existing) + 1 : 1
  }

  const padded = String(num).padStart(2, '0')
  const IMAGE_EXTS = ['gif', 'webp', 'png', 'jpg', 'jpeg', 'svg']
  IMAGE_EXTS.forEach(e => { const f = path.join(dir, `${padded}.${e}`); if (fs.existsSync(f)) fs.unlinkSync(f) })

  fs.writeFileSync(path.join(dir, `${padded}.${ext}`), Buffer.from(data, 'base64'))
  res.json({ ok: true, num, filename: `${padded}.${ext}` })
})

// GET /api/scroll-folder-list/:category/:id — list all subdirs containing frame files
app.get('/api/scroll-folder-list/:category/:id', (req, res) => {
  const { category, id } = req.params
  if (!safeParam(category, id)) return res.status(400).json({ error: 'Invalid params' })
  const base = path.join(PUBLIC, 'assets/projects', category, id)
  if (!fs.existsSync(base)) return res.json({ folders: [] })
  const FRAME_RE = /^frame-\d+\.(webp|png|jpe?g)$/i
  const results = []
  const scanDir = (dir, rel) => {
    let entries
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    const hasFrames = entries.some(e => e.isFile() && FRAME_RE.test(e.name))
    if (hasFrames) results.push(rel)
    for (const e of entries) {
      if (e.isDirectory()) scanDir(path.join(dir, e.name), rel ? `${rel}/${e.name}` : e.name)
    }
  }
  scanDir(base, '')
  res.json({ folders: results })
})

// GET /api/scroll-frames/:category/:id/:folder — list frames
app.get('/api/scroll-frames/:category/:id/*folder', (req, res) => {
  const { category, id } = req.params
  if (!safeParam(category, id)) return res.status(400).json({ error: 'Invalid params' })
  const raw = req.params.folder
  const folder = Array.isArray(raw) ? raw.join('/') : raw
  if (!folder || folder.includes('..')) return res.status(400).json({ error: 'Invalid folder name' })
  const dir = path.join(PUBLIC, 'assets/projects', category, id, folder)
  if (!fs.existsSync(dir)) return res.json({ frames: [], folder })
  const FRAME_EXTS = ['webp', 'png', 'jpg', 'jpeg']
  const files = fs.readdirSync(dir)
    .filter(f => { const e = path.extname(f).slice(1).toLowerCase(); return FRAME_EXTS.includes(e) && /^frame-\d+/.test(f) })
    .sort()
  res.json({ frames: files, folder, count: files.length })
})

// POST /api/scroll-frames/:category/:id/:folder/upload — upload a frame file
// Body: { name: string (original filename), data: base64, frameNum: number }
app.post('/api/scroll-frames/:category/:id/*folder/upload', (req, res) => {
  const { category, id } = req.params
  if (!safeParam(category, id)) return res.status(400).json({ error: 'Invalid params' })
  const raw = req.params.folder
  const folder = Array.isArray(raw) ? raw.join('/') : raw
  if (!folder || folder.includes('..')) return res.status(400).json({ error: 'Invalid folder name' })
  const { name, data, frameNum } = req.body
  if (!name || !data) return res.status(400).json({ error: 'name and data required' })
  const ext = path.extname(name).slice(1).toLowerCase()
  const FRAME_EXTS = ['webp', 'png', 'jpg', 'jpeg']
  if (!FRAME_EXTS.includes(ext)) return res.status(400).json({ error: 'Invalid file type' })

  const dir = path.join(PUBLIC, 'assets/projects', category, id, folder)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  const num = parseInt(frameNum)
  if (isNaN(num) || num < 1) return res.status(400).json({ error: 'Invalid frameNum' })
  const padded = String(num).padStart(4, '0')

  // Remove any existing frame-XXXX.* with same number
  FRAME_EXTS.forEach(e => { const f = path.join(dir, `frame-${padded}.${e}`); if (fs.existsSync(f)) fs.unlinkSync(f) })
  fs.writeFileSync(path.join(dir, `frame-${padded}.${ext}`), Buffer.from(data, 'base64'))
  res.json({ ok: true, frameNum: num, filename: `frame-${padded}.${ext}` })
})

function findThumbnail(base, name) {
  const exts = ['webp', 'png', 'jpg', 'jpeg', 'gif', 'svg']
  for (const ext of exts) {
    const f = path.join(base, `${name}.${ext}`)
    if (fs.existsSync(f)) return { file: `${name}.${ext}`, path: null }
  }
  return { file: null, path: null }
}

app.get('/api/all-thumbnail/:type/:category/:id', (req, res) => {
  const { type, category, id } = req.params
  if (!safeParam(category, id)) return res.status(400).json({ error: 'Invalid params' })
  const base = path.join(PUBLIC, `assets/${type}`, 'all-thumbnails')
  const main = findThumbnail(base, `${category}-${id}`)
  const hover = findThumbnail(base, `${category}-${id}-hover`)
  res.json({
    src: main.file ? `/assets/${type}/all-thumbnails/${main.file}` : null,
    hoverSrc: hover.file ? `/assets/${type}/all-thumbnails/${hover.file}` : null,
  })
})

app.post('/api/all-thumbnail/:type/:category/:id', (req, res) => {
  const { type, category, id } = req.params
  if (!safeParam(category, id)) return res.status(400).json({ error: 'Invalid params' })
  const { slot, name, data } = req.body
  if (!name || !data) return res.status(400).json({ error: 'name and data required' })
  const ext = path.extname(name).slice(1).toLowerCase()
  if (!ext) return res.status(400).json({ error: 'Missing file extension' })
  const suffix = slot === 'hover' ? `${category}-${id}-hover` : `${category}-${id}`
  const destDir = path.join(PUBLIC, `assets/${type}`, 'all-thumbnails')
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true })
  const exts = ['webp', 'png', 'jpg', 'jpeg', 'gif', 'svg']
  exts.forEach(e => { const f = path.join(destDir, `${suffix}.${e}`); if (fs.existsSync(f)) fs.unlinkSync(f) })
  fs.writeFileSync(path.join(destDir, `${suffix}.${ext}`), Buffer.from(data, 'base64'))
  res.json({ ok: true, src: `/assets/${type}/all-thumbnails/${suffix}.${ext}` })
})

app.get('/api/thumbnail/:type/:category/:id', (req, res) => {
  const { type, category, id } = req.params
  if (!safeParam(category, id)) return res.status(400).json({ error: 'Invalid params' })
  const base = path.join(PUBLIC, `assets/${type}`, 'icon-thumbnails')
  const main = findThumbnail(base, `${category}-${id}`)
  const hover = findThumbnail(base, `${category}-${id}-hover`)
  res.json({
    main:  main.file  ? `/assets/${type}/icon-thumbnails/${main.file}`  : null,
    hover: hover.file ? `/assets/${type}/icon-thumbnails/${hover.file}` : null,
  })
})

app.post('/api/thumbnail/:type/:category/:id', (req, res) => {
  const { type, category, id } = req.params
  if (!safeParam(category, id)) return res.status(400).json({ error: 'Invalid params' })
  const { slot, name, data } = req.body
  if (!slot || !name || !data) return res.status(400).json({ error: 'slot, name and data required' })
  const ext = path.extname(name).slice(1).toLowerCase()
  if (!ext) return res.status(400).json({ error: 'Missing file extension' })
  const suffix = slot === 'hover' ? `${category}-${id}-hover` : `${category}-${id}`
  const destDir = path.join(PUBLIC, `assets/${type}`, 'icon-thumbnails')
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true })
  const exts = ['webp', 'png', 'jpg', 'jpeg', 'gif', 'svg']
  exts.forEach(e => { const f = path.join(destDir, `${suffix}.${e}`); if (fs.existsSync(f)) fs.unlinkSync(f) })
  const buf = Buffer.from(data, 'base64')
  const dest = path.join(destDir, `${suffix}.${ext}`)
  fs.writeFileSync(dest, buf)
  res.json({ ok: true, path: `/assets/${type}/icon-thumbnails/${suffix}.${ext}` })
})

app.post('/api/project-create', (req, res) => {
  const { category, id, title } = req.body
  if (!category || !id || !title) return res.status(400).json({ error: 'category, id, title required' })
  if (!safeParam(category, id)) return res.status(400).json({ error: 'Invalid params' })

  const projects = readJson(PROJECTS_DATA_PATH, [])
  if (projects.find(p => p.id === id)) return res.status(409).json({ error: 'ID already exists' })

  const maxOrder = projects.reduce((m, p) => Math.max(m, p.order || 0), 0)
  projects.push({ id, category, title, description: '', year: new Date().getFullYear(), order: maxOrder + 1, overview: '', sections: [] })
  fs.writeFileSync(PROJECTS_DATA_PATH, JSON.stringify(projects, null, 2))

  const dir = path.join(PUBLIC, 'assets/projects', category, id)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'info.json'), JSON.stringify({ overview: '', type: '', duration: '', team: '', role: '', sections: [] }, null, 2))

  res.json({ ok: true })
})

app.post('/api/original-create', (req, res) => {
  const { category, id, title } = req.body
  if (!category || !id || !title) return res.status(400).json({ error: 'category, id, title required' })
  if (!safeParam(category, id)) return res.status(400).json({ error: 'Invalid params' })

  const originals = readJson(ORIGINALS_DATA_PATH, [])
  if (originals.find(o => o.id === id)) return res.status(409).json({ error: 'ID already exists' })

  const maxOrder = originals.reduce((m, o) => Math.max(m, o.order || 0), 0)
  originals.push({ id, category, title, description: '', homeThumbnail: `/assets/home/originals/${id}`, year: new Date().getFullYear(), order: maxOrder + 1 })
  fs.writeFileSync(ORIGINALS_DATA_PATH, JSON.stringify(originals, null, 2))

  const dir = path.join(PUBLIC, 'assets/originals', category, id)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'info.json'), JSON.stringify({ overview: '', type: '', duration: '', team: '', role: '', sections: [] }, null, 2))

  res.json({ ok: true })
})

app.post('/api/project-category/:category/:id', (req, res) => {
  const { category, id } = req.params
  const { newCategory } = req.body
  if (!newCategory || newCategory === category) return res.json({ ok: true })
  if (!safeParam(category, id, newCategory)) return res.status(400).json({ error: 'Invalid params' })

  const projects = readJson(PROJECTS_DATA_PATH, [])
  const idx = projects.findIndex(p => p.category === category && p.id === id)
  if (idx === -1) return res.status(404).json({ error: 'Project not found' })

  const oldDir = path.join(PUBLIC, 'assets/projects', category, id)
  const newDir = path.join(PUBLIC, 'assets/projects', newCategory, id)
  if (fs.existsSync(oldDir)) {
    fs.mkdirSync(path.join(PUBLIC, 'assets/projects', newCategory), { recursive: true })
    fs.renameSync(oldDir, newDir)
  }

  const exts = ['webp', 'png', 'jpg', 'jpeg', 'gif', 'svg']
  const iconThumbDir = path.join(PUBLIC, 'assets/projects/icon-thumbnails')
  const allThumbDir = path.join(PUBLIC, 'assets/projects/all-thumbnails')
  exts.forEach(ext => {
    ;[`${category}-${id}`, `${category}-${id}-hover`].forEach(suffix => {
      const src = path.join(iconThumbDir, `${suffix}.${ext}`)
      const newSuffix = suffix.replace(`${category}-`, `${newCategory}-`)
      if (fs.existsSync(src)) fs.renameSync(src, path.join(iconThumbDir, `${newSuffix}.${ext}`))
    })
    const allSrc = path.join(allThumbDir, `${category}-${id}.${ext}`)
    if (fs.existsSync(allSrc)) fs.renameSync(allSrc, path.join(allThumbDir, `${newCategory}-${id}.${ext}`))
  })

  projects[idx] = { ...projects[idx], category: newCategory }
  fs.writeFileSync(PROJECTS_DATA_PATH, JSON.stringify(projects, null, 2))
  res.json({ ok: true })
})

app.post('/api/original-category/:category/:id', (req, res) => {
  const { category, id } = req.params
  const { newCategory } = req.body
  if (!newCategory || newCategory === category) return res.json({ ok: true })
  if (!safeParam(category, id, newCategory)) return res.status(400).json({ error: 'Invalid params' })

  const originals = readJson(ORIGINALS_DATA_PATH, [])
  const idx = originals.findIndex(o => o.category === category && o.id === id)
  if (idx === -1) return res.status(404).json({ error: 'Original not found' })

  const oldDir = path.join(PUBLIC, 'assets/originals', category, id)
  const newDir = path.join(PUBLIC, 'assets/originals', newCategory, id)
  if (fs.existsSync(oldDir)) {
    fs.mkdirSync(path.join(PUBLIC, 'assets/originals', newCategory), { recursive: true })
    fs.renameSync(oldDir, newDir)
  }

  const exts = ['webp', 'png', 'jpg', 'jpeg', 'gif', 'svg']
  const iconThumbDir = path.join(PUBLIC, 'assets/originals/icon-thumbnails')
  const allThumbDir = path.join(PUBLIC, 'assets/originals/all-thumbnails')
  exts.forEach(ext => {
    ;[`${category}-${id}`, `${category}-${id}-hover`].forEach(suffix => {
      const src = path.join(iconThumbDir, `${suffix}.${ext}`)
      const newSuffix = suffix.replace(`${category}-`, `${newCategory}-`)
      if (fs.existsSync(src)) fs.renameSync(src, path.join(iconThumbDir, `${newSuffix}.${ext}`))
    })
    const allSrc = path.join(allThumbDir, `${category}-${id}.${ext}`)
    if (fs.existsSync(allSrc)) fs.renameSync(allSrc, path.join(allThumbDir, `${newCategory}-${id}.${ext}`))
  })

  originals[idx] = { ...originals[idx], category: newCategory }
  fs.writeFileSync(ORIGINALS_DATA_PATH, JSON.stringify(originals, null, 2))
  res.json({ ok: true })
})

// Moves a project to Originals or an original to Projects (into one of the
// other side's categories): its list entry, folder and thumbnails, and every
// setting that names it by "category/id" — hidden lists, captions, card
// text, Home's cards. Settings only one side has (minimal mode's picks,
// confidential, featured order; Home's Originals row) let it go.
const ITEM_TYPE = {
  projects: { list: () => PROJECTS_DATA_PATH, hidden: 'hiddenProjects', hiddenInAll: 'hiddenInAllProjects',
              captions: 'allProjectsCaptions', rightCaptions: 'allProjectsRightCaptions', cardText: 'allProjectsCardText',
              only: ['minimalProjects', 'confidentialProjects', 'featuredOrder'] },
  originals: { list: () => ORIGINALS_DATA_PATH, hidden: 'hiddenOriginals', hiddenInAll: 'hiddenInAllOriginals',
               captions: 'allOriginalsCaptions', rightCaptions: 'allOriginalsRightCaptions', cardText: 'allOriginalsCardText',
               only: [] },
}

app.post('/api/item-move-type', (req, res) => {
  const { from, category, id, toCategory } = req.body
  const to = from === 'projects' ? 'originals' : from === 'originals' ? 'projects' : null
  if (!to) return res.status(400).json({ error: 'from must be projects or originals' })
  if (!safeParam(category, id, toCategory)) return res.status(400).json({ error: 'Invalid params' })
  const A = ITEM_TYPE[from], B = ITEM_TYPE[to]
  const source = readJson(A.list(), [])
  const target = readJson(B.list(), [])
  const idx = source.findIndex(p => p.category === category && p.id === id)
  if (idx === -1) return res.status(404).json({ error: 'Not found' })
  const newDir = path.join(PUBLIC, 'assets', to, toCategory, id)
  if (target.some(p => p.category === toCategory && p.id === id) || fs.existsSync(newDir)) {
    return res.status(409).json({ error: `${to === 'projects' ? 'Projects' : 'Originals'} already has “${id}” in ${toCategory}.` })
  }

  const oldDir = path.join(PUBLIC, 'assets', from, category, id)
  if (fs.existsSync(oldDir)) {
    fs.mkdirSync(path.dirname(newDir), { recursive: true })
    fs.renameSync(oldDir, newDir)
  }
  const exts = ['webp', 'png', 'jpg', 'jpeg', 'gif', 'svg']
  for (const kind of ['icon-thumbnails', 'all-thumbnails']) {
    const fromDir = path.join(PUBLIC, 'assets', from, kind)
    const toDir = path.join(PUBLIC, 'assets', to, kind)
    for (const ext of exts) for (const tail of ['', '-hover']) {
      const src = path.join(fromDir, `${category}-${id}${tail}.${ext}`)
      if (!fs.existsSync(src)) continue
      fs.mkdirSync(toDir, { recursive: true })
      fs.renameSync(src, path.join(toDir, `${toCategory}-${id}${tail}.${ext}`))
    }
  }

  const entry = { ...source[idx], category: toCategory }
  entry.order = Math.max(0, ...target.map(p => Number(p.order) || 0)) + 1
  source.splice(idx, 1)
  target.push(entry)
  fs.writeFileSync(A.list(), JSON.stringify(source, null, 2))
  fs.writeFileSync(B.list(), JSON.stringify(target, null, 2))

  const oldKey = `${category}/${id}`, newKey = `${toCategory}/${id}`
  const config = readJson(SITE_CONFIG_PATH)
  for (const k of ['hidden', 'hiddenInAll']) {
    if (Array.isArray(config[A[k]]) && config[A[k]].includes(oldKey)) {
      config[A[k]] = config[A[k]].filter(x => x !== oldKey)
      config[B[k]] = [...new Set([...(config[B[k]] || []), newKey])]
    }
  }
  for (const k of ['captions', 'rightCaptions']) {
    if (config[A[k]] && oldKey in config[A[k]]) {
      config[B[k]] = { ...(config[B[k]] || {}), [newKey]: config[A[k]][oldKey] }
      delete config[A[k]][oldKey]
    }
  }
  const cardItems = config[A.cardText]?.items
  if (cardItems && oldKey in cardItems) {
    config[B.cardText] = { ...(config[B.cardText] || {}), items: { ...(config[B.cardText]?.items || {}), [newKey]: cardItems[oldKey] } }
    delete cardItems[oldKey]
    if (Object.keys(cardItems).length === 0 && Object.keys(config[A.cardText]).length === 1) delete config[A.cardText]
  }
  for (const k of A.only) if (Array.isArray(config[k])) config[k] = config[k].filter(x => x !== oldKey)
  fs.writeFileSync(SITE_CONFIG_PATH, JSON.stringify(config, null, 2))

  const homePath = path.join(DATA_DIR, 'home.json')
  const home = readJson(homePath, null)
  if (home) {
    const retarget = (card) => {
      if (card && card.id === id && card.category === category && (card.linkType || 'projects') === from) {
        card.linkType = to
        card.category = toCategory
      }
    }
    ;(home.featured || []).forEach(retarget)
    ;(home.gridSections || []).forEach(g => (g.items || []).forEach(retarget))
    if (from === 'originals' && Array.isArray(home.homeOriginals)) {
      home.homeOriginals = home.homeOriginals.filter(o => !(o.id === id && o.category === category))
    }
    fs.writeFileSync(homePath, JSON.stringify(home, null, 2))
  }
  res.json({ ok: true })
})

app.get('/api/original-info/:category/:id', (req, res) => {
  const { category, id } = req.params
  if (!safeParam(category, id)) return res.status(400).json({ error: 'Invalid params' })
  const filePath = path.join(PUBLIC, 'assets/originals', category, id, 'info.json')
  if (!fs.existsSync(filePath)) return res.json({})
  res.json(readJson(filePath))
})

app.post('/api/original-info/:category/:id', (req, res) => {
  const { category, id } = req.params
  if (!safeParam(category, id)) return res.status(400).json({ error: 'Invalid params' })
  const dir = path.join(PUBLIC, 'assets/originals', category, id)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const filePath = path.join(dir, 'info.json')

  if (fs.existsSync(filePath)) {
    const backupDir = path.join(dir, 'backups')
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir)
    const ts = new Date().toISOString().replace(/[:.]/g, '-')
    fs.copyFileSync(filePath, path.join(backupDir, `${ts}.json`))
    const all = fs.readdirSync(backupDir).filter(f => f.endsWith('.json')).sort()
    if (all.length > 20) all.slice(0, all.length - 20).forEach(f => fs.unlinkSync(path.join(backupDir, f)))
  }

  fs.writeFileSync(filePath, JSON.stringify(req.body, null, 2))
  res.json({ ok: true })
})

app.get('/api/original-images/:category/:id', (req, res) => {
  const { category, id } = req.params
  if (!safeParam(category, id)) return res.status(400).json({ error: 'Invalid params' })
  res.json(readImageDir(path.join(PUBLIC, 'assets/originals', category, id, 'sections')))
})

app.post('/api/original-images/:category/:id/upload', (req, res) => {
  const { category, id } = req.params
  if (!safeParam(category, id)) return res.status(400).json({ error: 'Invalid params' })
  const { name, data, targetNum } = req.body
  if (!name || !data) return res.status(400).json({ error: 'name and data required' })
  const ext = path.extname(name).slice(1).toLowerCase()
  if (!ext) return res.status(400).json({ error: 'Missing file extension' })

  const dir = path.join(PUBLIC, 'assets/originals', category, id, 'sections')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  let num
  if (targetNum != null && !isNaN(parseInt(targetNum))) {
    num = parseInt(targetNum)
  } else {
    const existing = readImageDir(dir).map(f => parseInt(f.name)).filter(n => !isNaN(n))
    num = existing.length > 0 ? Math.max(...existing) + 1 : 1
  }

  const padded = String(num).padStart(2, '0')
  const IMAGE_EXTS = ['gif', 'webp', 'png', 'jpg', 'jpeg', 'svg']
  IMAGE_EXTS.forEach(e => { const f = path.join(dir, `${padded}.${e}`); if (fs.existsSync(f)) fs.unlinkSync(f) })
  fs.writeFileSync(path.join(dir, `${padded}.${ext}`), Buffer.from(data, 'base64'))
  res.json({ ok: true, num, filename: `${padded}.${ext}` })
})

// Dedicated hover/mobile folders for originals (mirrors the projects endpoints above).
app.get('/api/original-images/:category/:id/:folder', (req, res) => {
  const { category, id, folder } = req.params
  if (!safeParam(category, id)) return res.status(400).json({ error: 'Invalid params' })
  if (!['hover', 'mobile'].includes(folder)) return res.status(400).json({ error: 'Invalid folder' })
  res.json(readImageDir(path.join(PUBLIC, 'assets/originals', category, id, folder)))
})

app.post('/api/original-images/:category/:id/:folder/upload', (req, res) => {
  const { category, id, folder } = req.params
  if (!safeParam(category, id)) return res.status(400).json({ error: 'Invalid params' })
  if (!['hover', 'mobile'].includes(folder)) return res.status(400).json({ error: 'Invalid folder' })
  const { name, data, targetNum } = req.body
  if (!name || !data) return res.status(400).json({ error: 'name and data required' })
  const ext = path.extname(name).slice(1).toLowerCase()
  if (!ext) return res.status(400).json({ error: 'Missing file extension' })

  const dir = path.join(PUBLIC, 'assets/originals', category, id, folder)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  let num
  if (targetNum != null && !isNaN(parseInt(targetNum))) {
    num = parseInt(targetNum)
  } else {
    const existing = readImageDir(dir).map(f => parseInt(f.name)).filter(n => !isNaN(n))
    num = existing.length > 0 ? Math.max(...existing) + 1 : 1
  }

  const padded = String(num).padStart(2, '0')
  const IMAGE_EXTS = ['gif', 'webp', 'png', 'jpg', 'jpeg', 'svg']
  IMAGE_EXTS.forEach(e => { const f = path.join(dir, `${padded}.${e}`); if (fs.existsSync(f)) fs.unlinkSync(f) })
  fs.writeFileSync(path.join(dir, `${padded}.${ext}`), Buffer.from(data, 'base64'))
  res.json({ ok: true, num, filename: `${padded}.${ext}` })
})

app.get('/api/all-config', (req, res) => {
  const config = readJson(SITE_CONFIG_PATH)
  res.json({
    confidentialProjects:      config.confidentialProjects      || [],
    hiddenInAllProjects:       config.hiddenInAllProjects       || [],
    featuredOrder:             config.featuredOrder             || [],
    hiddenInAllOriginals:      config.hiddenInAllOriginals      || [],
    allProjectsLayout:         config.allProjectsLayout         || '3',
    allProjectsMobileLayout:   config.allProjectsMobileLayout   || '1',
    allOriginalsLayout:        config.allOriginalsLayout        || '3',
    allOriginalsMobileLayout:  config.allOriginalsMobileLayout  || '1',
    allProjectsText:           config.allProjectsText           || '',
    allOriginalsText:          config.allOriginalsText          || '',
    projectsCategoryText:      config.projectsCategoryText      || {},
    originalsCategoryText:     config.originalsCategoryText     || {},
    projectCategoryLabels:     config.projectCategoryLabels     || {},
    originalCategoryLabels:    config.originalCategoryLabels    || {},
    allProjectsTitleSize:      config.allProjectsTitleSize      || '',
    allProjectsTagSize:        config.allProjectsTagSize        || '',
    allOriginalsTitleSize:     config.allOriginalsTitleSize     || '',
    allOriginalsTagSize:       config.allOriginalsTagSize       || '',
    allProjectsCaptionEnabled: config.allProjectsCaptionEnabled !== false,
    allProjectsCaptions:       config.allProjectsCaptions       || {},
    allProjectsRightCaptions:  config.allProjectsRightCaptions  || {},
    allOriginalsRightCaptions: config.allOriginalsRightCaptions || {},
    allProjectsCaptionSwap:    !!config.allProjectsCaptionSwap,
    allProjectsCardText:       config.allProjectsCardText       || {},
    allOriginalsCaptionSwap:   !!config.allOriginalsCaptionSwap,
    allProjectsTitleGap:        config.allProjectsTitleGap        || '',
    allProjectsTitleGapMobile:  config.allProjectsTitleGapMobile  || '',
    allOriginalsTitleGap:       config.allOriginalsTitleGap       || '',
    allOriginalsTitleGapMobile: config.allOriginalsTitleGapMobile || '',
    blogTitleSize:        config.blogTitleSize        || '',
    blogTitleSizeMobile:  config.blogTitleSizeMobile  || '',
    blogTitleTopGap:      config.blogTitleTopGap      || '',
    blogTitleTopGapMobile: config.blogTitleTopGapMobile || '',
    blogTitleGap:         config.blogTitleGap         || '',
    blogTitleGapMobile:   config.blogTitleGapMobile   || '',
    allOriginalsCaptionEnabled: config.allOriginalsCaptionEnabled !== false,
    allOriginalsCaptions:      config.allOriginalsCaptions      || {},
    allProjectsImageRatio:  config.allProjectsImageRatio  || '16/9',
    allOriginalsImageRatio: config.allOriginalsImageRatio || '16/9',
    allProjectsHoverStyle:  config.allProjectsHoverStyle  || (config.allProjectsCaptionEnabled === false ? 'plain' : 'overlay'),
    allOriginalsHoverStyle: config.allOriginalsHoverStyle || (config.allOriginalsCaptionEnabled === false ? 'plain' : 'overlay'),
    allProjectsSections:    config.allProjectsSections    || [],
    allOriginalsSections:   config.allOriginalsSections   || [],
  })
})

app.post('/api/all-config', (req, res) => {
  const config = readJson(SITE_CONFIG_PATH)
  const keys = [
    'confidentialProjects',
    'hiddenInAllProjects', 'hiddenInAllOriginals', 'featuredOrder',
    'allProjectsLayout', 'allProjectsMobileLayout',
    'allOriginalsLayout', 'allOriginalsMobileLayout',
    'allProjectsText', 'allOriginalsText',
    'projectsCategoryText', 'originalsCategoryText',
    'projectCategoryLabels', 'originalCategoryLabels',
    'allProjectsTitleSize', 'allProjectsTagSize',
    'allOriginalsTitleSize', 'allOriginalsTagSize',
    'allProjectsCaptionEnabled', 'allProjectsCaptions',
    'allOriginalsCaptionEnabled', 'allOriginalsCaptions',
    'allProjectsImageRatio', 'allOriginalsImageRatio',
    'allProjectsHoverStyle', 'allOriginalsHoverStyle',
    'allProjectsSections', 'allOriginalsSections',
    'allProjectsRightCaptions', 'allOriginalsRightCaptions',
    'allProjectsCaptionSwap', 'allOriginalsCaptionSwap', 'allProjectsCardText',
    'allProjectsTitleGap', 'allProjectsTitleGapMobile',
    'allOriginalsTitleGap', 'allOriginalsTitleGapMobile',
    'blogTitleSize', 'blogTitleSizeMobile',
    'blogTitleTopGap', 'blogTitleTopGapMobile',
    'blogTitleGap', 'blogTitleGapMobile',
  ]
  keys.forEach(k => { if (req.body[k] !== undefined) config[k] = req.body[k] })
  fs.writeFileSync(SITE_CONFIG_PATH, JSON.stringify(config, null, 2))
  res.json({ ok: true })
})

app.get('/api/maintenance', (req, res) => {
  const config = readJson(SITE_CONFIG_PATH)
  res.json({ maintenance: !!config.maintenance })
})

app.post('/api/maintenance', (req, res) => {
  const config = readJson(SITE_CONFIG_PATH)
  config.maintenance = !!req.body.maintenance
  fs.writeFileSync(SITE_CONFIG_PATH, JSON.stringify(config, null, 2))
  res.json({ ok: true })
})

const ROBOTS_BLOCK = `User-agent: *
Allow: /

# AI crawlers
User-agent: GPTBot
Disallow: /

User-agent: ChatGPT-User
Disallow: /

User-agent: OAI-SearchBot
Disallow: /

User-agent: ClaudeBot
Disallow: /

User-agent: Claude-Web
Disallow: /

User-agent: anthropic-ai
Disallow: /

User-agent: Google-Extended
Disallow: /

User-agent: CCBot
Disallow: /

User-agent: PerplexityBot
Disallow: /

User-agent: Applebot-Extended
Disallow: /

User-agent: FacebookBot
Disallow: /

User-agent: Bytespider
Disallow: /

User-agent: Amazonbot
Disallow: /
`

const ROBOTS_ALLOW = `User-agent: *
Allow: /
`

const ROBOTS_PATH = path.join(PUBLIC, 'robots.txt')

// ── Languages ─────────────────────────────────────────────────────
// siteConfig.languages lists the languages besides English. Turning one on
// starts its dictionary; turning it off keeps the dictionary, so its
// translations come back with it. The site sends visitors of a language
// that's off to the English page (src/i18n/index.js).
app.get('/api/languages', (req, res) => {
  const on = enabledLanguages(readJson(SITE_CONFIG_PATH)).map(l => l.code)
  res.json({ languages: ALL_LANGUAGES.map(l => ({ ...l, enabled: on.includes(l.code) })) })
})

// { languages: ['ko', …] } — the languages besides English, in any order.
app.post('/api/languages', (req, res) => {
  const wanted = Array.isArray(req.body?.languages) ? req.body.languages : null
  if (!wanted) return res.status(400).json({ error: 'languages must be a list' })
  const codes = OTHER_LANGUAGE_CODES.filter(c => wanted.includes(c))
  const config = readJson(SITE_CONFIG_PATH)
  config.languages = codes
  fs.writeFileSync(SITE_CONFIG_PATH, JSON.stringify(config, null, 2))
  codes.forEach(c => { if (!fs.existsSync(dictPath(c))) writeDict(c, { strings: {}, images: {} }) })
  res.json({ ok: true, languages: codes })
})

app.get('/api/ai-blocking', (req, res) => {
  const config = readJson(SITE_CONFIG_PATH)
  res.json({ enabled: !!config.aiBlockingEnabled })
})

app.post('/api/ai-blocking', (req, res) => {
  const { enabled } = req.body
  const config = readJson(SITE_CONFIG_PATH)
  config.aiBlockingEnabled = !!enabled
  fs.writeFileSync(SITE_CONFIG_PATH, JSON.stringify(config, null, 2))
  fs.writeFileSync(ROBOTS_PATH, enabled ? ROBOTS_BLOCK : ROBOTS_ALLOW)
  res.json({ ok: true })
})

app.get('/api/vercel-profiles', (req, res) => {
  let active = ''
  try { active = fs.readFileSync(VERCEL_ACTIVE_FILE, 'utf-8').trim() } catch {}
  let profiles = []
  try {
    profiles = fs.readdirSync(VERCEL_PROFILES_DIR)
      .filter(f => f.endsWith('.json') && !f.startsWith('.'))
      .map(f => f.replace('.json', ''))
      .sort()
  } catch {}
  res.json({ active, profiles })
})

app.post('/api/vercel-switch', (req, res) => {
  const { profile } = req.body
  const profileFile = path.join(VERCEL_PROFILES_DIR, `${profile}.json`)
  if (!fs.existsSync(profileFile)) return res.status(404).json({ error: 'Profile not found' })
  fs.copyFileSync(profileFile, VERCEL_AUTH_FILE)
  fs.writeFileSync(VERCEL_ACTIVE_FILE, profile)
  res.json({ ok: true, active: profile })
})

app.post('/api/deploy', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`)

  const root = path.join(__dirname, '..')
  const now = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
  const msg = `content: update via editor (${now})`

  // A credential helper that can't produce a token (expired/misconfigured,
  // no TTY to prompt) doesn't always fail fast — `git push` hit exactly this
  // once and hung indefinitely, leaving the SSE stream (and the editor's
  // progress UI) stuck forever with no error and no way to cancel. A finite
  // timeout on every git step turns that into a clear, recoverable error.
  const GIT_TIMEOUT = 60000

  try {
    send({ step: 'git-add', progress: 5 })
    // Content only: a bare `git add -A` also swept up whatever code was
    // mid-edit in the repo (it once shipped half-done app changes).
    await execFileAsync('git', ['add', '-A', '--', 'public', 'src/data', 'src/i18n', 'server/last-deploy.json'],
      { cwd: root, timeout: GIT_TIMEOUT, maxBuffer: 1024 * 1024 * 10 })
    send({ log: 'git add ✓', progress: 15 })

    send({ step: 'git-commit', progress: 20 })
    try {
      await execFileAsync('git', ['commit', '-m', msg], { cwd: root, timeout: GIT_TIMEOUT, maxBuffer: 1024 * 1024 * 10 })
      send({ log: 'git commit ✓', progress: 30 })
    } catch (e) {
      if (e.stdout?.includes('nothing to commit') || e.message?.includes('nothing to commit')) {
        send({ log: 'nothing to commit — skipped', progress: 30 })
      } else throw e
    }

    send({ step: 'git-push', progress: 35 })
    await execAsync('git push', { cwd: root, timeout: GIT_TIMEOUT, maxBuffer: 1024 * 1024 * 10 })
    send({ log: 'git push ✓', progress: 50 })

    send({ step: 'vercel', progress: 55 })
    // Node's exec() defaults maxBuffer to 1MB of combined stdout — `vercel
    // --prod` easily exceeds that (per-asset build size table, plus
    // ANSI-heavy progress-spinner frames during "Deploying outputs…"),
    // which silently rejects the promise with "stdout maxBuffer exceeded"
    // even though the deploy itself succeeds against the Vercel API.
    await execAsync('vercel --prod', { cwd: root, timeout: 300000, maxBuffer: 1024 * 1024 * 20 })
    send({ log: 'vercel deploy ✓', progress: 100 })

    fs.writeFileSync(LAST_DEPLOY_PATH, JSON.stringify({ date: new Date().toISOString() }))
    send({ done: true, ok: true })
  } catch (err) {
    const msg = err.killed && err.signal ? `Timed out (killed with ${err.signal}) — check git credentials / network` : err.message
    send({ log: `Error: ${msg}`, done: true, ok: false })
  }

  res.end()
})

app.post('/api/vercel-reauth', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`)

  const child = spawn('vercel', ['login'], {
    env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
  })

  const processLine = (text) => {
    const clean = text.replace(/\x1B\[[0-9;]*m/g, '').trim()
    if (!clean) return
    const urlMatch = clean.match(/https:\/\/vercel\.com\/\S+/)
    if (urlMatch) send({ url: urlMatch[0], log: clean })
    else send({ log: clean })
  }

  child.stdout.on('data', (chunk) => chunk.toString().split('\n').forEach(processLine))
  child.stderr.on('data', (chunk) => chunk.toString().split('\n').forEach(processLine))

  child.on('close', (code) => {
    if (code === 0) {
      try {
        const active = fs.existsSync(VERCEL_ACTIVE_FILE) ? fs.readFileSync(VERCEL_ACTIVE_FILE, 'utf-8').trim() : null
        if (active) fs.copyFileSync(VERCEL_AUTH_FILE, path.join(VERCEL_PROFILES_DIR, `${active}.json`))
      } catch {}
    }
    send({ done: true, ok: code === 0 })
    res.end()
  })

  req.on('close', () => child.kill())
})

// ── Blog landing page info ──────────────────────────────────────
app.get('/api/blog-landing-info', (req, res) => {
  const filePath = path.join(PUBLIC, 'assets/blog/landing-info.json')
  if (!fs.existsSync(filePath)) return res.json({ sections: [] })
  res.json(readJson(filePath, { sections: [] }))
})

app.post('/api/blog-landing-info', (req, res) => {
  const dir = path.join(PUBLIC, 'assets/blog')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'landing-info.json'), JSON.stringify(req.body, null, 2))
  res.json({ ok: true })
})

app.get('/api/blog-landing-images', (req, res) => {
  res.json(readImageDir(path.join(PUBLIC, 'assets/blog/landing')))
})

app.post('/api/blog-landing-images/upload', (req, res) => {
  const { name, data, targetNum } = req.body
  if (!name || !data) return res.status(400).json({ error: 'name and data required' })
  const ext = path.extname(name).slice(1).toLowerCase()
  if (!ext) return res.status(400).json({ error: 'Missing file extension' })

  const dir = path.join(PUBLIC, 'assets/blog/landing')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  let num
  if (targetNum != null && !isNaN(parseInt(targetNum))) {
    num = parseInt(targetNum)
  } else {
    const existing = readImageDir(dir).map(f => parseInt(f.name)).filter(n => !isNaN(n))
    num = existing.length > 0 ? Math.max(...existing) + 1 : 1
  }

  const padded = String(num).padStart(2, '0')
  const IMAGE_EXTS = ['gif', 'webp', 'png', 'jpg', 'jpeg', 'svg']
  IMAGE_EXTS.forEach(e => { const f = path.join(dir, `${padded}.${e}`); if (fs.existsSync(f)) fs.unlinkSync(f) })
  fs.writeFileSync(path.join(dir, `${padded}.${ext}`), Buffer.from(data, 'base64'))
  res.json({ ok: true, num, filename: `${padded}.${ext}` })
})

// ── Archive files (portfolio PDFs, news images) ──────────────────
// Stored flat under public/assets/archive with a timestamp prefix so a
// re-upload never overwrites a file an older entry still points to.
const ARCHIVE_DIR = path.join(PUBLIC, 'assets/archive')
const ARCHIVE_EXTS = ['pdf', 'gif', 'webp', 'png', 'jpg', 'jpeg', 'svg']
app.post('/api/archive/upload', (req, res) => {
  const { name, data } = req.body
  if (!name || !data) return res.status(400).json({ error: 'name and data required' })
  const ext = path.extname(name).slice(1).toLowerCase()
  if (!ARCHIVE_EXTS.includes(ext)) return res.status(400).json({ error: `Unsupported file type: .${ext}` })
  const base = path.basename(name, path.extname(name)).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'file'
  const filename = `${Date.now()}-${base}.${ext}`
  if (!fs.existsSync(ARCHIVE_DIR)) fs.mkdirSync(ARCHIVE_DIR, { recursive: true })
  fs.writeFileSync(path.join(ARCHIVE_DIR, filename), Buffer.from(data, 'base64'))
  res.json({ ok: true, src: `/assets/archive/${filename}` })
})

// ── Blog post info (sections) ────────────────────────────────────
app.get('/api/blog-post-info/:id', (req, res) => {
  const { id } = req.params
  if (!safeParam(id)) return res.status(400).json({ error: 'Invalid params' })
  const filePath = path.join(PUBLIC, 'assets/blog', id, 'info.json')
  if (!fs.existsSync(filePath)) return res.json({ sections: [] })
  res.json(readJson(filePath, { sections: [] }))
})

app.post('/api/blog-post-info/:id', (req, res) => {
  const { id } = req.params
  if (!safeParam(id)) return res.status(400).json({ error: 'Invalid params' })
  const dir = path.join(PUBLIC, 'assets/blog', id)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'info.json'), JSON.stringify(req.body, null, 2))
  res.json({ ok: true })
})

app.get('/api/blog-images/:id', (req, res) => {
  const { id } = req.params
  if (!safeParam(id)) return res.status(400).json({ error: 'Invalid params' })
  res.json(readImageDir(path.join(PUBLIC, 'assets/blog', id, 'sections')))
})

app.post('/api/blog-images/:id/upload', (req, res) => {
  const { id } = req.params
  if (!safeParam(id)) return res.status(400).json({ error: 'Invalid params' })
  const { name, data, targetNum } = req.body
  if (!name || !data) return res.status(400).json({ error: 'name and data required' })
  const ext = path.extname(name).slice(1).toLowerCase()
  if (!ext) return res.status(400).json({ error: 'Missing file extension' })

  const dir = path.join(PUBLIC, 'assets/blog', id, 'sections')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  let num
  if (targetNum != null && !isNaN(parseInt(targetNum))) {
    num = parseInt(targetNum)
  } else {
    const existing = readImageDir(dir).map(f => parseInt(f.name)).filter(n => !isNaN(n))
    num = existing.length > 0 ? Math.max(...existing) + 1 : 1
  }

  const padded = String(num).padStart(2, '0')
  const IMAGE_EXTS = ['gif', 'webp', 'png', 'jpg', 'jpeg', 'svg']
  IMAGE_EXTS.forEach(e => { const f = path.join(dir, `${padded}.${e}`); if (fs.existsSync(f)) fs.unlinkSync(f) })
  fs.writeFileSync(path.join(dir, `${padded}.${ext}`), Buffer.from(data, 'base64'))
  res.json({ ok: true, num, filename: `${padded}.${ext}` })
})

app.post('/api/blog-post-meta/:id', (req, res) => {
  const { id } = req.params
  if (!safeParam(id)) return res.status(400).json({ error: 'Invalid params' })
  const posts = readJson(path.join(DATA_DIR, 'blog.json'), [])
  const idx = posts.findIndex(p => p.id === id)
  if (idx === -1) return res.status(404).json({ error: 'not found' })
  posts[idx] = { ...posts[idx], ...req.body }
  fs.writeFileSync(path.join(DATA_DIR, 'blog.json'), JSON.stringify(posts, null, 2))
  res.json({ ok: true })
})

app.post('/api/blog-post-create', (req, res) => {
  const { id, title, category } = req.body
  if (!id || !title) return res.status(400).json({ error: 'id and title required' })
  if (!safeParam(id)) return res.status(400).json({ error: 'Invalid params' })
  const posts = readJson(path.join(DATA_DIR, 'blog.json'), [])
  if (posts.find(p => p.id === id)) return res.status(409).json({ error: 'ID already exists' })
  posts.push({ id, title, category: category || 'others', date: new Date().toISOString().slice(0, 10).replace(/-/g, '/'), thumbnail: '', preview: '', content: '' })
  fs.writeFileSync(path.join(DATA_DIR, 'blog.json'), JSON.stringify(posts, null, 2))
  const dir = path.join(PUBLIC, 'assets/blog', id)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'info.json'), JSON.stringify({ sections: [] }, null, 2))
  res.json({ ok: true })
})

app.delete('/api/blog-post-delete/:id', (req, res) => {
  const { id } = req.params
  if (!safeParam(id)) return res.status(400).json({ error: 'Invalid params' })
  const posts = readJson(path.join(DATA_DIR, 'blog.json'), [])
  const filtered = posts.filter(p => p.id !== id)
  fs.writeFileSync(path.join(DATA_DIR, 'blog.json'), JSON.stringify(filtered, null, 2))
  res.json({ ok: true })
})

// ── The site's own pages (src/data/pages.json, src/utils/pages.js) ──
const PAGES_PATH = path.join(DATA_DIR, 'pages.json')
const RESERVED_PAGE_PATHS = ['projects', 'originals', 'blog', 'about', 'contacts', 'archive', 'sitemap', 'editor', 'lab', 'profolio', 'assets', 'api', ...OTHER_LANGUAGE_CODES]
const BUILTIN_NAV = [['about', '/about'], ['projects', '/projects'], ['originals', '/originals'], ['blog', '/blog'], ['contacts', '/contacts']]

// The menu as siteConfig.structure.nav, made from the older keys the first
// time (as src/utils/structure.js reads them).
function navOf(config) {
  if (Array.isArray(config.structure?.nav)) return config.structure.nav
  const hidden = config.hiddenBuiltinNav || []
  return BUILTIN_NAV.map(([key, p]) => hidden.includes(p) ? { key, hidden: true } : { key })
    .concat((config.navCustomItems || []).map(l => ({ key: 'link', label: l.label || '', path: l.path || '', href: l.href || '' })))
}

app.post('/api/page-create', (req, res) => {
  const { id, title } = req.body
  const pagePath = req.body.path || `/${id}`
  if (!id || !title) return res.status(400).json({ error: 'id and title required' })
  if (!safeParam(id) || !/^\/[a-z0-9-]+$/.test(pagePath)) return res.status(400).json({ error: 'The address may use lowercase letters, numbers and -.' })
  if (RESERVED_PAGE_PATHS.includes(pagePath.slice(1))) return res.status(409).json({ error: `${pagePath} is one of the site's own addresses. Pick another.` })
  const pages = readJson(PAGES_PATH, [])
  if (pages.find(p => p.id === id)) return res.status(409).json({ error: 'A page with that ID already exists.' })
  if (pages.find(p => p.path === pagePath)) return res.status(409).json({ error: `${pagePath} is already a page's address.` })
  pages.push({ id, title, path: pagePath })
  fs.writeFileSync(PAGES_PATH, JSON.stringify(pages, null, 2))
  const dir = path.join(PUBLIC, 'assets/pages', id)
  fs.mkdirSync(path.join(dir, 'sections'), { recursive: true })
  if (!fs.existsSync(path.join(dir, 'info.json'))) {
    fs.writeFileSync(path.join(dir, 'info.json'), JSON.stringify({ title, description: '', sections: [] }, null, 2))
  }
  const config = readJson(SITE_CONFIG_PATH)
  config.structure = { ...(config.structure || {}), nav: [...navOf(config), { key: 'page', page: id }] }
  fs.writeFileSync(SITE_CONFIG_PATH, JSON.stringify(config, null, 2))
  res.json({ ok: true })
})

app.delete('/api/page-delete/:id', (req, res) => {
  const { id } = req.params
  if (!safeParam(id)) return res.status(400).json({ error: 'Invalid params' })
  const pages = readJson(PAGES_PATH, [])
  fs.writeFileSync(PAGES_PATH, JSON.stringify(pages.filter(p => p.id !== id), null, 2))
  const config = readJson(SITE_CONFIG_PATH)
  if (Array.isArray(config.structure?.nav)) {
    config.structure.nav = config.structure.nav.filter(item => !(item.key === 'page' && item.page === id))
    fs.writeFileSync(SITE_CONFIG_PATH, JSON.stringify(config, null, 2))
  }
  const dir = path.join(PUBLIC, 'assets/pages', id)
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true })
  res.json({ ok: true })
})

// ── About page images ───────────────────────────────────────────
app.get('/api/about-images', (req, res) => {
  res.json(readImageDir(path.join(PUBLIC, 'assets/about/sections')))
})

app.post('/api/about-images/upload', (req, res) => {
  const { name, data, targetNum } = req.body
  if (!name || !data) return res.status(400).json({ error: 'name and data required' })
  const ext = path.extname(name).slice(1).toLowerCase()
  if (!ext) return res.status(400).json({ error: 'Missing file extension' })

  const dir = path.join(PUBLIC, 'assets/about/sections')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  let num
  if (targetNum != null && !isNaN(parseInt(targetNum))) {
    num = parseInt(targetNum)
  } else {
    const existing = readImageDir(dir).map(f => parseInt(f.name)).filter(n => !isNaN(n))
    num = existing.length > 0 ? Math.max(...existing) + 1 : 1
  }

  const padded = String(num).padStart(2, '0')
  const IMAGE_EXTS = ['gif', 'webp', 'png', 'jpg', 'jpeg', 'svg']
  IMAGE_EXTS.forEach(e => { const f = path.join(dir, `${padded}.${e}`); if (fs.existsSync(f)) fs.unlinkSync(f) })
  fs.writeFileSync(path.join(dir, `${padded}.${ext}`), Buffer.from(data, 'base64'))
  res.json({ ok: true, num, filename: `${padded}.${ext}` })
})

app.get('/api/about-images/mobile', (req, res) => {
  res.json(readImageDir(path.join(PUBLIC, 'assets/about/sections/mobile')))
})

app.post('/api/about-images/mobile/upload', (req, res) => {
  const { name, data, targetNum } = req.body
  if (!name || !data) return res.status(400).json({ error: 'name and data required' })
  const ext = path.extname(name).slice(1).toLowerCase()
  if (!ext) return res.status(400).json({ error: 'Missing file extension' })

  const dir = path.join(PUBLIC, 'assets/about/sections/mobile')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  let num
  if (targetNum != null && !isNaN(parseInt(targetNum))) {
    num = parseInt(targetNum)
  } else {
    const existing = readImageDir(dir).map(f => parseInt(f.name)).filter(n => !isNaN(n))
    num = existing.length > 0 ? Math.max(...existing) + 1 : 1
  }

  const padded = String(num).padStart(2, '0')
  const IMAGE_EXTS = ['gif', 'webp', 'png', 'jpg', 'jpeg', 'svg']
  IMAGE_EXTS.forEach(e => { const f = path.join(dir, `${padded}.${e}`); if (fs.existsSync(f)) fs.unlinkSync(f) })
  fs.writeFileSync(path.join(dir, `${padded}.${ext}`), Buffer.from(data, 'base64'))
  res.json({ ok: true, num, filename: `${padded}.${ext}` })
})

app.get('/api/about-images/tablet', (req, res) => {
  res.json(readImageDir(path.join(PUBLIC, 'assets/about/sections/tablet')))
})

app.post('/api/about-images/tablet/upload', (req, res) => {
  const { name, data, targetNum } = req.body
  if (!name || !data) return res.status(400).json({ error: 'name and data required' })
  const ext = path.extname(name).slice(1).toLowerCase()
  if (!ext) return res.status(400).json({ error: 'Missing file extension' })

  const dir = path.join(PUBLIC, 'assets/about/sections/tablet')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  let num
  if (targetNum != null && !isNaN(parseInt(targetNum))) {
    num = parseInt(targetNum)
  } else {
    const existing = readImageDir(dir).map(f => parseInt(f.name)).filter(n => !isNaN(n))
    num = existing.length > 0 ? Math.max(...existing) + 1 : 1
  }

  const padded = String(num).padStart(2, '0')
  const IMAGE_EXTS = ['gif', 'webp', 'png', 'jpg', 'jpeg', 'svg']
  IMAGE_EXTS.forEach(e => { const f = path.join(dir, `${padded}.${e}`); if (fs.existsSync(f)) fs.unlinkSync(f) })
  fs.writeFileSync(path.join(dir, `${padded}.${ext}`), Buffer.from(data, 'base64'))
  res.json({ ok: true, num, filename: `${padded}.${ext}` })
})

// ── Home page section images ────────────────────────────────────
app.get('/api/home-images', (req, res) => {
  res.json(readImageDir(path.join(PUBLIC, 'assets/home/sections')))
})

app.post('/api/home-images/upload', (req, res) => {
  const { name, data, targetNum } = req.body
  if (!name || !data) return res.status(400).json({ error: 'name and data required' })
  const ext = path.extname(name).slice(1).toLowerCase()
  if (!ext) return res.status(400).json({ error: 'Missing file extension' })

  const dir = path.join(PUBLIC, 'assets/home/sections')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  let num
  if (targetNum != null && !isNaN(parseInt(targetNum))) {
    num = parseInt(targetNum)
  } else {
    const existing = readImageDir(dir).map(f => parseInt(f.name)).filter(n => !isNaN(n))
    num = existing.length > 0 ? Math.max(...existing) + 1 : 1
  }

  const padded = String(num).padStart(2, '0')
  const IMAGE_EXTS = ['gif', 'webp', 'png', 'jpg', 'jpeg', 'svg']
  IMAGE_EXTS.forEach(e => { const f = path.join(dir, `${padded}.${e}`); if (fs.existsSync(f)) fs.unlinkSync(f) })
  fs.writeFileSync(path.join(dir, `${padded}.${ext}`), Buffer.from(data, 'base64'))
  res.json({ ok: true, num, filename: `${padded}.${ext}` })
})

app.post('/api/footer-images/upload', (req, res) => {
  const { name, data } = req.body
  if (!name || !data) return res.status(400).json({ error: 'name and data required' })
  const ext = path.extname(name).slice(1).toLowerCase()
  if (!ext) return res.status(400).json({ error: 'Missing file extension' })

  const dir = path.join(PUBLIC, 'assets/footer')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  const IMAGE_EXTS = ['gif', 'webp', 'png', 'jpg', 'jpeg', 'svg']
  IMAGE_EXTS.forEach(e => { const f = path.join(dir, `icon.${e}`); if (fs.existsSync(f)) fs.unlinkSync(f) })
  fs.writeFileSync(path.join(dir, `icon.${ext}`), Buffer.from(data, 'base64'))
  res.json({ ok: true, url: `/assets/footer/icon.${ext}` })
})

app.get('/api/home-images/mobile', (req, res) => {
  res.json(readImageDir(path.join(PUBLIC, 'assets/home/sections/mobile')))
})

app.post('/api/home-images/mobile/upload', (req, res) => {
  const { name, data, targetNum } = req.body
  if (!name || !data) return res.status(400).json({ error: 'name and data required' })
  const ext = path.extname(name).slice(1).toLowerCase()
  if (!ext) return res.status(400).json({ error: 'Missing file extension' })

  const dir = path.join(PUBLIC, 'assets/home/sections/mobile')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  let num
  if (targetNum != null && !isNaN(parseInt(targetNum))) {
    num = parseInt(targetNum)
  } else {
    const existing = readImageDir(dir).map(f => parseInt(f.name)).filter(n => !isNaN(n))
    num = existing.length > 0 ? Math.max(...existing) + 1 : 1
  }

  const padded = String(num).padStart(2, '0')
  const IMAGE_EXTS = ['gif', 'webp', 'png', 'jpg', 'jpeg', 'svg']
  IMAGE_EXTS.forEach(e => { const f = path.join(dir, `${padded}.${e}`); if (fs.existsSync(f)) fs.unlinkSync(f) })
  fs.writeFileSync(path.join(dir, `${padded}.${ext}`), Buffer.from(data, 'base64'))
  res.json({ ok: true, num, filename: `${padded}.${ext}` })
})

app.get('/api/home-images/tablet', (req, res) => {
  res.json(readImageDir(path.join(PUBLIC, 'assets/home/sections/tablet')))
})

app.post('/api/home-images/tablet/upload', (req, res) => {
  const { name, data, targetNum } = req.body
  if (!name || !data) return res.status(400).json({ error: 'name and data required' })
  const ext = path.extname(name).slice(1).toLowerCase()
  if (!ext) return res.status(400).json({ error: 'Missing file extension' })

  const dir = path.join(PUBLIC, 'assets/home/sections/tablet')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  let num
  if (targetNum != null && !isNaN(parseInt(targetNum))) {
    num = parseInt(targetNum)
  } else {
    const existing = readImageDir(dir).map(f => parseInt(f.name)).filter(n => !isNaN(n))
    num = existing.length > 0 ? Math.max(...existing) + 1 : 1
  }

  const padded = String(num).padStart(2, '0')
  const IMAGE_EXTS = ['gif', 'webp', 'png', 'jpg', 'jpeg', 'svg']
  IMAGE_EXTS.forEach(e => { const f = path.join(dir, `${padded}.${e}`); if (fs.existsSync(f)) fs.unlinkSync(f) })
  fs.writeFileSync(path.join(dir, `${padded}.${ext}`), Buffer.from(data, 'base64'))
  res.json({ ok: true, num, filename: `${padded}.${ext}` })
})

// Registers the desktop/mobile/tablet image list+upload routes for a page's
// "Additional Sections" — same shape as the home-images routes above, just
// parameterized so All Projects / All Originals don't need it hand-copied.
function registerSectionImageRoutes(apiPrefix, baseDir) {
  const tiers = [{ seg: '', dir: baseDir }, { seg: '/mobile', dir: path.join(baseDir, 'mobile') }, { seg: '/tablet', dir: path.join(baseDir, 'tablet') }]
  tiers.forEach(({ seg, dir }) => {
    app.get(`/api${apiPrefix}${seg}`, (req, res) => {
      res.json(readImageDir(dir))
    })
    app.post(`/api${apiPrefix}${seg}/upload`, (req, res) => {
      const { name, data, targetNum } = req.body
      if (!name || !data) return res.status(400).json({ error: 'name and data required' })
      const ext = path.extname(name).slice(1).toLowerCase()
      if (!ext) return res.status(400).json({ error: 'Missing file extension' })
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      let num
      if (targetNum != null && !isNaN(parseInt(targetNum))) {
        num = parseInt(targetNum)
      } else {
        const existing = readImageDir(dir).map(f => parseInt(f.name)).filter(n => !isNaN(n))
        num = existing.length > 0 ? Math.max(...existing) + 1 : 1
      }
      const padded = String(num).padStart(2, '0')
      const IMAGE_EXTS = ['gif', 'webp', 'png', 'jpg', 'jpeg', 'svg']
      IMAGE_EXTS.forEach(e => { const f = path.join(dir, `${padded}.${e}`); if (fs.existsSync(f)) fs.unlinkSync(f) })
      fs.writeFileSync(path.join(dir, `${padded}.${ext}`), Buffer.from(data, 'base64'))
      res.json({ ok: true, num, filename: `${padded}.${ext}` })
    })
  })
}
registerSectionImageRoutes('/all-projects-images', path.join(PUBLIC, 'assets/projects/all/sections'))
registerSectionImageRoutes('/all-originals-images', path.join(PUBLIC, 'assets/originals/all/sections'))
registerSectionImageRoutes('/contacts-images', path.join(PUBLIC, 'assets/contacts/sections'))

// ── Category page info ──────────────────────────────────────────
app.get('/api/category-info/:type/:category', (req, res) => {
  const { type, category } = req.params
  if (!['projects', 'originals'].includes(type)) return res.status(400).json({})
  if (!safeParam(category)) return res.status(400).json({ error: 'Invalid params' })
  const filePath = path.join(PUBLIC, `assets/${type}`, category, 'category-info.json')
  if (!fs.existsSync(filePath)) return res.json({ sections: [] })
  res.json(readJson(filePath, { sections: [] }))
})

app.post('/api/category-info/:type/:category', (req, res) => {
  const { type, category } = req.params
  if (!['projects', 'originals'].includes(type)) return res.status(400).json({})
  if (!safeParam(category)) return res.status(400).json({ error: 'Invalid params' })
  const dir = path.join(PUBLIC, `assets/${type}`, category)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'category-info.json'), JSON.stringify(req.body, null, 2))
  res.json({ ok: true })
})

// Also the site's own pages' section images: type "pages", in
// assets/pages/<id>/sections.
const sectionFolder = (type) => type === 'pages' ? 'sections' : 'category'

app.get('/api/category-images/:type/:category', (req, res) => {
  const { type, category } = req.params
  if (!['projects', 'originals', 'pages'].includes(type)) return res.status(400).json([])
  if (!safeParam(category)) return res.status(400).json({ error: 'Invalid params' })
  res.json(readImageDir(path.join(PUBLIC, `assets/${type}`, category, sectionFolder(type))))
})

app.post('/api/category-images/:type/:category/upload', (req, res) => {
  const { type, category } = req.params
  if (!['projects', 'originals', 'pages'].includes(type)) return res.status(400).json({ error: 'Invalid type' })
  if (!safeParam(category)) return res.status(400).json({ error: 'Invalid params' })
  const { name, data, targetNum } = req.body
  if (!name || !data) return res.status(400).json({ error: 'name and data required' })
  const ext = path.extname(name).slice(1).toLowerCase()
  if (!ext) return res.status(400).json({ error: 'Missing file extension' })

  const dir = path.join(PUBLIC, `assets/${type}`, category, sectionFolder(type))
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  let num
  if (targetNum != null && !isNaN(parseInt(targetNum))) {
    num = parseInt(targetNum)
  } else {
    const existing = readImageDir(dir).map(f => parseInt(f.name)).filter(n => !isNaN(n))
    num = existing.length > 0 ? Math.max(...existing) + 1 : 1
  }

  const padded = String(num).padStart(2, '0')
  const IMAGE_EXTS = ['gif', 'webp', 'png', 'jpg', 'jpeg', 'svg']
  IMAGE_EXTS.forEach(e => { const f = path.join(dir, `${padded}.${e}`); if (fs.existsSync(f)) fs.unlinkSync(f) })
  fs.writeFileSync(path.join(dir, `${padded}.${ext}`), Buffer.from(data, 'base64'))
  res.json({ ok: true, num, filename: `${padded}.${ext}` })
})

app.get('/api/categories/:type', (req, res) => {
  const { type } = req.params
  if (!['projects', 'originals'].includes(type)) return res.status(400).json({})
  const base = path.join(PUBLIC, 'assets', type)
  if (!fs.existsSync(base)) return res.json([])
  const cats = fs.readdirSync(base)
    .filter(f => { try { return fs.statSync(path.join(base, f)).isDirectory() } catch { return false } })
    .sort()
  res.json(cats)
})

app.post('/api/rename-category', (req, res) => {
  const { type, from, to } = req.body
  if (!type || !from || !to) return res.status(400).json({ error: 'type, from, to required' })
  if (!['projects', 'originals'].includes(type)) return res.status(400).json({ error: 'Invalid type' })
  if (from === to) return res.json({ ok: true })
  if (!/^[a-z0-9-]+$/.test(to)) return res.status(400).json({ error: 'Category name must only contain lowercase letters, numbers, and hyphens' })

  const assetsBase = path.join(PUBLIC, 'assets', type)
  const oldDir = path.join(assetsBase, from)
  const newDir = path.join(assetsBase, to)
  if (fs.existsSync(newDir)) return res.status(409).json({ error: `"${to}" category already exists` })

  if (fs.existsSync(oldDir)) fs.renameSync(oldDir, newDir)

  const exts = ['webp', 'png', 'jpg', 'jpeg', 'gif', 'svg']
  const iconThumbDir = path.join(assetsBase, 'icon-thumbnails')
  const allThumbDir = path.join(assetsBase, 'all-thumbnails')
  if (fs.existsSync(iconThumbDir)) {
    fs.readdirSync(iconThumbDir).forEach(file => {
      if (file.startsWith(`${from}-`)) {
        fs.renameSync(path.join(iconThumbDir, file), path.join(iconThumbDir, `${to}-${file.slice(from.length + 1)}`))
      }
    })
  }
  if (fs.existsSync(allThumbDir)) {
    fs.readdirSync(allThumbDir).forEach(file => {
      if (file.startsWith(`${from}-`)) {
        fs.renameSync(path.join(allThumbDir, file), path.join(allThumbDir, `${to}-${file.slice(from.length + 1)}`))
      }
    })
  }

  const dataPath = type === 'projects' ? PROJECTS_DATA_PATH : ORIGINALS_DATA_PATH
  const data = readJson(dataPath, [])
  fs.writeFileSync(dataPath, JSON.stringify(data.map(item => item.category === from ? { ...item, category: to } : item), null, 2))

  const config = readJson(SITE_CONFIG_PATH)
  const renameKeys = arr => (arr || []).map(k => k.startsWith(`${from}/`) ? `${to}/${k.slice(from.length + 1)}` : k)

  if (type === 'projects') {
    config.hiddenProjects = renameKeys(config.hiddenProjects)
    config.hiddenInAllProjects = renameKeys(config.hiddenInAllProjects)
    if (config.projectsCategoryText?.[from] !== undefined) {
      config.projectsCategoryText[to] = config.projectsCategoryText[from]
      delete config.projectsCategoryText[from]
    }
  } else {
    config.hiddenOriginals = renameKeys(config.hiddenOriginals)
    config.hiddenInAllOriginals = renameKeys(config.hiddenInAllOriginals)
    if (config.originalsCategoryText?.[from] !== undefined) {
      config.originalsCategoryText[to] = config.originalsCategoryText[from]
      delete config.originalsCategoryText[from]
    }
  }
  fs.writeFileSync(SITE_CONFIG_PATH, JSON.stringify(config, null, 2))
  res.json({ ok: true })
})

app.post('/api/add-category', (req, res) => {
  const { type, name } = req.body
  if (!type || !name) return res.status(400).json({ error: 'type and name required' })
  if (!['projects', 'originals'].includes(type)) return res.status(400).json({ error: 'Invalid type' })
  if (!/^[a-z0-9-]+$/.test(name)) return res.status(400).json({ error: 'Category name must only contain lowercase letters, numbers, and hyphens' })
  const dir = path.join(PUBLIC, 'assets', type, name)
  if (fs.existsSync(dir)) return res.status(409).json({ error: `"${name}" category already exists` })
  fs.mkdirSync(dir, { recursive: true })
  const config = readJson(SITE_CONFIG_PATH)
  const textKey = type === 'projects' ? 'projectsCategoryText' : 'originalsCategoryText'
  if (!config[textKey]) config[textKey] = {}
  if (config[textKey][name] === undefined) config[textKey][name] = ''
  fs.writeFileSync(SITE_CONFIG_PATH, JSON.stringify(config, null, 2))
  res.json({ ok: true })
})

app.post('/api/delete-category', (req, res) => {
  const { type, name } = req.body
  if (!type || !name) return res.status(400).json({ error: 'type and name required' })
  if (!['projects', 'originals'].includes(type)) return res.status(400).json({ error: 'Invalid type' })
  const dataPath = type === 'projects' ? PROJECTS_DATA_PATH : ORIGINALS_DATA_PATH
  const data = readJson(dataPath, [])
  const count = data.filter(item => item.category === name).length
  if (count > 0) return res.status(409).json({ error: `This category has ${count} item(s). Remove them first.` })
  const dir = path.join(PUBLIC, 'assets', type, name)
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true })
  const config = readJson(SITE_CONFIG_PATH)
  const textKey = type === 'projects' ? 'projectsCategoryText' : 'originalsCategoryText'
  const orderKey = type === 'projects' ? 'projectCategoryOrder' : 'originalCategoryOrder'
  if (config[textKey]) delete config[textKey][name]
  if (config[orderKey]) config[orderKey] = config[orderKey].filter(c => c !== name)
  fs.writeFileSync(SITE_CONFIG_PATH, JSON.stringify(config, null, 2))
  res.json({ ok: true })
})

app.get('/api/git-info', async (req, res) => {
  try {
    const root = path.join(__dirname, '..')
    const { stdout } = await execAsync('git log -1 --format=%cI', { cwd: root })
    const lastCommit = stdout.trim()
    let lastDeploy = null
    if (fs.existsSync(LAST_DEPLOY_PATH)) {
      lastDeploy = readJson(LAST_DEPLOY_PATH).date ?? null
    }
    res.json({ lastCommit, lastDeploy })
  } catch {
    res.json({ lastCommit: null, lastDeploy: null })
  }
})

// ── About Photos ──────────────────────────────────────────────
const ABOUT_PHOTOS_DIR = path.join(PUBLIC, 'assets/about/photos')

app.get('/api/about-photos', (req, res) => {
  if (!fs.existsSync(ABOUT_PHOTOS_DIR)) return res.json([])
  const IMAGE_EXTS = ['gif','webp','png','jpg','jpeg','svg']
  const files = fs.readdirSync(ABOUT_PHOTOS_DIR)
    .filter(f => IMAGE_EXTS.includes(path.extname(f).slice(1).toLowerCase()))
    .sort()
  res.json(files)
})

// Server-side fetch avoids CORS and keeps the target URL out of the browser's
// network tab. Blocks private/loopback hosts since this hits arbitrary
// user-supplied URLs (basic SSRF guard — this editor is localhost-only anyway).
const PRIVATE_HOST_RE = /^(localhost|127\.|0\.|10\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[::1\]|\[fc|\[fd)/i
app.post('/api/link-preview', async (req, res) => {
  const { url } = req.body
  if (!url || typeof url !== 'string') return res.status(400).json({ error: 'url required' })
  let parsed
  try { parsed = new URL(url) } catch { return res.status(400).json({ error: 'Invalid URL' }) }
  if (!['http:', 'https:'].includes(parsed.protocol)) return res.status(400).json({ error: 'Invalid URL' })
  if (PRIVATE_HOST_RE.test(parsed.hostname)) return res.status(400).json({ error: 'URL not allowed' })

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)
    const r = await fetch(parsed.href, { signal: controller.signal, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LinkPreviewBot/1.0)' } })
    clearTimeout(timeout)
    if (!r.ok) return res.status(502).json({ error: `Fetch failed (${r.status})` })
    const reader = r.body.getReader()
    let html = '', total = 0
    const MAX = 500_000
    while (total < MAX) {
      const { done, value } = await reader.read()
      if (done) break
      html += Buffer.from(value).toString('utf-8')
      total += value.length
    }
    reader.cancel().catch(() => {})

    const meta = (prop) => {
      const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']*)["']`, 'i')
      const m = html.match(re) || html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${prop}["']`, 'i'))
      return m ? m[1] : ''
    }
    const titleTag = (html.match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1] || ''
    const decode = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')

    let image = meta('og:image') || meta('twitter:image')
    if (image && !/^https?:\/\//i.test(image)) image = new URL(image, parsed.href).href

    res.json({
      title: decode(meta('og:title') || titleTag).trim(),
      description: decode(meta('og:description') || meta('description')).trim(),
      image,
      siteName: decode(meta('og:site_name')).trim() || parsed.hostname,
    })
  } catch (e) {
    res.status(502).json({ error: e.name === 'AbortError' ? 'Timed out' : 'Fetch failed' })
  }
})

app.post('/api/about-photos/upload', (req, res) => {
  const { name, data } = req.body
  if (!name || !data) return res.status(400).json({ error: 'name and data required' })
  const ext = path.extname(name).slice(1).toLowerCase()
  if (!fs.existsSync(ABOUT_PHOTOS_DIR)) fs.mkdirSync(ABOUT_PHOTOS_DIR, { recursive: true })
  const base = path.basename(name, path.extname(name))
  const filePath = path.join(ABOUT_PHOTOS_DIR, `${base}.${ext}`)
  fs.writeFileSync(filePath, Buffer.from(data, 'base64'))
  res.json({ ok: true, file: `${base}.${ext}`, baseName: base })
})

app.delete('/api/about-photos/:filename', (req, res) => {
  const { filename } = req.params
  if (!/^[a-zA-Z0-9._-]+$/.test(filename)) return res.status(400).json({ error: 'Invalid filename' })
  const filePath = path.join(ABOUT_PHOTOS_DIR, filename)
  if (!filePath.startsWith(ABOUT_PHOTOS_DIR)) return res.status(400).json({ error: 'Invalid filename' })
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Not found' })
  fs.unlinkSync(filePath)
  res.json({ ok: true })
})

function getDirSize(dir) {
  let total = 0
  if (!fs.existsSync(dir)) return 0
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) total += getDirSize(full)
    else try { total += fs.statSync(full).size } catch {}
  }
  return total
}

app.get('/api/total-size', (req, res) => {
  const bytes = getDirSize(PUBLIC)
  res.json({ bytes })
})

app.get('/api/recent-sections', (req, res) => {
  const limit = parseInt(req.query.limit) || 12
  const projectsDir = path.join(PUBLIC, 'assets/projects')
  const results = []
  if (!fs.existsSync(projectsDir)) return res.json([])
  for (const cat of fs.readdirSync(projectsDir)) {
    const catDir = path.join(projectsDir, cat)
    if (!fs.statSync(catDir).isDirectory()) continue
    for (const id of fs.readdirSync(catDir)) {
      const infoPath = path.join(catDir, id, 'info.json')
      if (!fs.existsSync(infoPath)) continue
      try {
        const stat = fs.statSync(infoPath)
        const info = JSON.parse(fs.readFileSync(infoPath, 'utf-8'))
        results.push({ category: cat, id, title: info.title || id, mtime: stat.mtimeMs })
      } catch {}
    }
  }
  results.sort((a, b) => b.mtime - a.mtime)
  res.json(results.slice(0, limit))
})

app.listen(3001, () => console.log('Editor server running on http://localhost:3001'))
