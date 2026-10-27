#!/usr/bin/env node
// Runs the app's editor API bundle outside the app and checks it against the
// real editor server.
//
//   node scripts/editor-api/test.js <pkg.portfolio> [--server http://localhost:3001]
//
// The bundle runs in a bare V8 context (no Node globals — like the app's
// JavaScriptCore) with a host over the package that behaves like the app's
// (mac/SiteEditor/EditorAPI.swift). Every GET route is compared with the
// running `npm run server` (which reads the repo, so import the package
// fresh first); then writes are exercised against the package itself.
// Use a throwaway package: the write tests modify it.

import fs from 'fs'
import os from 'os'
import path from 'path'
import vm from 'vm'
import { buildApi } from '../siteproj.js'

const args = process.argv.slice(2)
const pkg = path.resolve(args.find(a => !a.startsWith('--')) || '')
const serverArg = args.indexOf('--server')
const SERVER = serverArg >= 0 ? args[serverArg + 1] : 'http://localhost:3001'
if (!fs.existsSync(path.join(pkg, 'manifest.json'))) {
  console.error('Usage: node scripts/editor-api/test.js <pkg.portfolio> [--server URL]')
  process.exit(1)
}

// ── Host: same contract as the app's ─────────────────────────────
function makeHost(root) {
  const abs = (rel) => {
    const p = path.resolve(root, rel)
    if (!p.startsWith(root + path.sep)) throw new Error(`outside package: ${rel}`)
    return p
  }
  const tryOk = (fn) => { try { fn(); return true } catch { return false } }
  const timers = new Map()
  let nextTimer = 1
  return {
    read: (rel) => { try { return fs.readFileSync(abs(rel), 'utf-8') } catch { return null } },
    write: (rel, text) => tryOk(() => { fs.mkdirSync(path.dirname(abs(rel)), { recursive: true }); fs.writeFileSync(abs(rel), text) }),
    writeBase64: (rel, b64) => tryOk(() => { fs.mkdirSync(path.dirname(abs(rel)), { recursive: true }); fs.writeFileSync(abs(rel), Buffer.from(b64, 'base64')) }),
    stat: (rel) => { try { const s = fs.statSync(abs(rel)); return { isDirectory: s.isDirectory(), size: s.size, mtimeMs: s.mtimeMs } } catch { return null } },
    list: (rel) => {
      try {
        // Directory order as the OS returns it, like Node's readdirSync.
        return fs.readdirSync(abs(rel), { withFileTypes: true })
          .map(e => ({ name: e.name, isDirectory: e.isDirectory() }))
      } catch { return null }
    },
    mkdir: (rel) => tryOk(() => fs.mkdirSync(abs(rel), { recursive: true })),
    copy: (a, b) => tryOk(() => { fs.mkdirSync(path.dirname(abs(b)), { recursive: true }); fs.copyFileSync(abs(a), abs(b)) }),
    move: (a, b) => tryOk(() => { fs.mkdirSync(path.dirname(abs(b)), { recursive: true }); fs.renameSync(abs(a), abs(b)) }),
    remove: (rel) => tryOk(() => fs.rmSync(abs(rel), { recursive: true })),
    log: (level, msg) => { if (level !== 'log') console.log(`    [api ${level}] ${msg.split('\n')[0]}`) },
    setTimeout: (fn, ms) => { const id = nextTimer++; timers.set(id, setTimeout(() => { timers.delete(id); fn() }, ms)); return id },
    clearTimeout: (id) => { clearTimeout(timers.get(id)); timers.delete(id) },
    fetch: (url, headersJSON, cb) => {
      fetch(url, { headers: JSON.parse(headersJSON) })
        .then(async r => cb(null, r.status, (await r.text()).slice(0, 500_000)))
        .catch(e => cb(String(e.message || e)))
    },
  }
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-api-'))
await buildApi(tmp)
const context = vm.createContext({ host: makeHost(pkg) })
vm.runInContext(fs.readFileSync(path.join(tmp, 'server.js'), 'utf-8'), context, { filename: 'server.js' })
fs.rmSync(tmp, { recursive: true })

const api = (method, url, body, headers = {}) => new Promise(resolve => {
  const h = body !== undefined ? { 'Content-Type': 'application/json', ...headers } : headers
  context.handleRequest(method, url, JSON.stringify(h), body !== undefined ? JSON.stringify(body) : '',
    (status, headersJSON, text) => {
      let json = null
      try { json = JSON.parse(text) } catch {}
      resolve({ status, json, text })
    })
})

const server = async (url, headers = {}) => {
  const r = await fetch(SERVER + url, { headers })
  const text = await r.text()
  let json = null
  try { json = JSON.parse(text) } catch {}
  return { status: r.status, json, text }
}

let failures = 0
const check = (ok, label, detail = '') => {
  if (!ok) failures++
  console.log(`  ${ok ? '✓' : '✗'} ${label}${!ok && detail ? `\n      ${detail}` : ''}`)
}
const firstDiff = (a, b, at = '') => {
  if (JSON.stringify(a) === JSON.stringify(b)) return null
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return `${at || '(root)'}: ${JSON.stringify(a)?.slice(0, 120)} ≠ ${JSON.stringify(b)?.slice(0, 120)}`
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const d = firstDiff(a[k], b[k], `${at}.${k}`)
    if (d) return d
  }
  return null
}

// ── 1. Every GET route vs. the real server ───────────────────────
const expected = await server('/api/projects').catch(() => null)
if (!expected) {
  console.error(`Editor server not reachable at ${SERVER} — start it with: npm run server`)
  process.exit(1)
}
const projects = expected.json
const originals = (await server('/api/originals')).json
const blog = (await server('/api/page/blog')).json
const p = projects[0]
const o = originals[0]
const post = Array.isArray(blog) && blog[0]
const scroll = (await server(`/api/scroll-folder-list/${p.category}/${p.id}`)).json.folders || []
const withBackups = projects.find(x => fs.existsSync(path.join(pkg, 'backups/public/assets/projects', x.category, x.id))) || p
const backupList = (await server(`/api/backups/${withBackups.category}/${withBackups.id}`)).json

// Routes whose answers legitimately differ in the app.
const DIFFERENT = {
  '/api/git-info': 'no git in the app — lastCommit is null',
  '/api/vercel-profiles': 'no Vercel CLI in the app',
  '/api/total-size': 'the repo also counts its legacy backups/ files',
}

const gets = [
  '/api/i18n/status', '/api/i18n/outdated?lang=ko', '/api/i18n/images?lang=ko', '/api/i18n/source?id=ui',
  '/api/i18n/source?id=src/data/home.json',
  '/api/browse?path=assets', '/api/page/home', '/api/page/about', '/api/page/siteConfig', '/api/page/blog', '/api/page/archive',
  '/api/projects', '/api/originals', '/api/all-config', '/api/maintenance', '/api/ai-blocking',
  '/api/blog-landing-info', '/api/blog-landing-images', '/api/about-images', '/api/about-images/mobile',
  '/api/about-images/tablet', '/api/home-images', '/api/home-images/mobile', '/api/home-images/tablet',
  '/api/about-photos', '/api/recent-sections?limit=40', '/api/categories/projects', '/api/categories/originals',
  `/api/info/${p.category}/${p.id}`, `/api/images/${p.category}/${p.id}`, `/api/images/${p.category}/${p.id}/hover`,
  `/api/images/${p.category}/${p.id}/mobile`, `/api/images/${p.category}/${p.id}/tablet`,
  `/api/images/${p.category}/${p.id}/icons`, `/api/videos/${p.category}/${p.id}`,
  `/api/scroll-folder-list/${p.category}/${p.id}`,
  ...scroll.slice(0, 2).map(f => `/api/scroll-frames/${p.category}/${p.id}/${f}`),
  `/api/backups/${withBackups.category}/${withBackups.id}`,
  ...(backupList.length ? [`/api/backups/${withBackups.category}/${withBackups.id}/${backupList[0].name}`] : []),
  `/api/all-thumbnail/projects/${p.category}/${p.id}`, `/api/thumbnail/projects/${p.category}/${p.id}`,
  `/api/category-info/projects/${p.category}`, `/api/category-images/projects/${p.category}`,
  ...(o ? [`/api/original-info/${o.category}/${o.id}`, `/api/original-images/${o.category}/${o.id}`,
    `/api/original-images/${o.category}/${o.id}/hover`, `/api/category-info/originals/${o.category}`] : []),
  ...(post ? [`/api/blog-post-info/${post.id}`, `/api/blog-images/${post.id}`] : []),
  ...Object.keys(DIFFERENT),
]

console.log(`\nGET routes vs ${SERVER}`)
for (const url of gets) {
  const [a, b] = await Promise.all([api('GET', url), server(url)])
  if (DIFFERENT[url]) { console.log(`  · ${url} — skipped: ${DIFFERENT[url]} (app: ${a.status})`); continue }
  // Copying into the package keeps mtimes only to the millisecond, which
  // can reorder files saved in the same instant — compare those as a set.
  const norm = (j) => !url.startsWith('/api/recent-sections') ? j
    : j.map(x => ({ ...x, mtime: Math.round(x.mtime) })).sort((x, y) => y.mtime - x.mtime || `${x.category}/${x.id}`.localeCompare(`${y.category}/${y.id}`))
  const diff = a.status !== b.status ? `status ${a.status} ≠ ${b.status}` : firstDiff(norm(a.json ?? a.text), norm(b.json ?? b.text))
  check(!diff, url, diff)
}
// Language mode goes through the translating middleware.
for (const url of ['/api/page/home', `/api/info/${p.category}/${p.id}`, '/api/projects']) {
  const h = { 'X-Edit-Lang': 'ko' }
  const [a, b] = await Promise.all([api('GET', url, undefined, h), server(url, h)])
  const diff = firstDiff(a.json, b.json)
  check(!diff, `${url} [ko]`, diff)
}

// ── 2. Writes, against the package ───────────────────────────────
console.log('\nWrites (package)')
const site = (rel) => path.join(pkg, 'site', rel)
const infoPath = site(`public/assets/projects/${p.category}/${p.id}/info.json`)
const original = fs.readFileSync(infoPath, 'utf-8')
const backupDir = path.join(pkg, 'backups/public/assets/projects', p.category, p.id)
const backupsBefore = fs.existsSync(backupDir) ? fs.readdirSync(backupDir).length : 0

const edited = { ...JSON.parse(original), __apiTest: true }
let r = await api('POST', `/api/info/${p.category}/${p.id}`, edited)
check(r.status === 200 && JSON.parse(fs.readFileSync(infoPath, 'utf-8')).__apiTest === true, 'save project info.json')
const backupsAfter = fs.readdirSync(backupDir).filter(f => f.endsWith('.json'))
check(backupsAfter.length === Math.min(backupsBefore + 1, 20), 'snapshot written to backups/ (max 20)', `${backupsBefore} → ${backupsAfter.length}`)
check(!fs.existsSync(site(`public/assets/projects/${p.category}/${p.id}/backups`)), 'no backups/ folder inside site/')
r = await api('GET', `/api/backups/${p.category}/${p.id}`)
check(r.json?.[0]?.name === backupsAfter.sort().reverse()[0], 'backup list shows the new snapshot first')
fs.writeFileSync(infoPath, original)

const png1x1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='
r = await api('POST', '/api/about-photos/upload', { name: 'api-test.png', data: png1x1 })
const photo = site('public/assets/about/photos/api-test.png')
check(r.status === 200 && fs.existsSync(photo) && fs.readFileSync(photo).subarray(1, 4).toString() === 'PNG', 'upload (base64) writes a real PNG')
r = await api('DELETE', '/api/about-photos/api-test.png')
check(r.status === 200 && !fs.existsSync(photo), 'delete uploaded file')

const homePath = site('src/data/home.json')
const home = fs.readFileSync(homePath, 'utf-8')
r = await api('POST', '/api/page/home', JSON.parse(home))
check(r.status === 200 && JSON.stringify(JSON.parse(fs.readFileSync(homePath, 'utf-8'))) === JSON.stringify(JSON.parse(home)), 'save src/data/home.json')
fs.writeFileSync(homePath, home)

r = await api('POST', '/api/page/home', { x: 1 }, { 'X-Edit-Lang': 'ko' })
check(r.status === 200 && fs.readFileSync(homePath, 'utf-8') === home, 'language mode never writes the English file')
r = await api('POST', '/api/about-photos/upload', { name: 'x.png', data: png1x1 }, { 'X-Edit-Lang': 'ko' })
check(r.status === 409, 'language mode blocks shared writes')

r = await api('POST', '/api/deploy')
check(r.status === 200 && /not available in the app/.test(r.text), 'deploy reports git is unavailable (publishing is the app\'s job)')
r = await api('GET', '/api/nope')
check(r.status === 404, 'unknown route → 404')
r = await api('POST', '/api/link-preview', { url: 'http://localhost/' })
check(r.status === 400, 'link-preview keeps its private-host guard')

console.log(failures ? `\n${failures} check(s) failed.` : '\nAll checks passed.')
process.exit(failures ? 1 : 0)
