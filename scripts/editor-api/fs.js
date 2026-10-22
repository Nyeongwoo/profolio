// Node's sync `fs` API, backed by the app's package storage (`host`).
//
// server/index.js addresses files the way it does in the repo, which it
// sees at /repo (its __dirname is /repo/server). Those paths map into the
// .siteproj package:
//
//   /repo/public/…, /repo/src/data|i18n/…  → site/…
//   /repo/public/<dir>/backups[/<file>]    → backups/public/<dir>[/<file>]
//   /repo/server/last-deploy.json          → manifest.json's lastPublished
//   /repo/src/pages|components/*.jsx       → editor/api/files.json (read-only;
//                                            only their t('…') calls, for the
//                                            Translations page)
//
// Anything else (e.g. ~/.vercel-profiles) does not exist.

import path from './path.js'

let overlayCache = null
function overlay() {
  if (!overlayCache) {
    try { overlayCache = JSON.parse(host.read('editor/api/files.json') || '{}') } catch { overlayCache = {} }
  }
  return overlayCache
}
// files.json keys are repo-relative paths with a leading slash.
const overlayDir = (p) => Object.keys(overlay()).some(f => path.dirname(f) === p)

const REPO = '/repo'

function locate(p) {
  p = path.resolve(p)
  if (!p.startsWith(`${REPO}/`)) return {}
  p = p.slice(REPO.length)
  if (p === '/server/last-deploy.json') return { lastDeploy: true }
  if (overlay()[p] !== undefined) return { overlayFile: p }
  if (overlayDir(p)) return { overlayDir: p }
  const b = p.match(/^(\/public(?:\/.*)?)\/backups(\/[^/]+)?$/)
  if (b) return { rel: `backups${b[1]}${b[2] || ''}`, backups: !b[2] }
  if (p === '/public' || p.startsWith('/public/') || /^\/src\/(data|i18n)(\/|$)/.test(p)) return { rel: `site${p}` }
  return {}
}

function fail(code, op, p) {
  const e = new Error(`${code}: ${op} '${p}'`)
  e.code = code
  throw e
}

function writable(p, op) {
  const loc = locate(p)
  if (!loc.rel) fail('EACCES', op, p)
  return loc.rel
}

export function existsSync(p) {
  const loc = locate(p)
  if (loc.lastDeploy || loc.overlayFile || loc.overlayDir) return true
  return !!loc.rel && host.stat(loc.rel) != null
}

export function readFileSync(p) {
  const loc = locate(p)
  if (loc.lastDeploy) {
    let date = null
    try { date = JSON.parse(host.read('manifest.json')).lastPublished ?? null } catch {}
    return JSON.stringify({ date })
  }
  if (loc.overlayFile) return overlay()[loc.overlayFile]
  const text = loc.rel ? host.read(loc.rel) : null
  if (text == null) fail('ENOENT', 'open', p)
  return text
}

export function writeFileSync(p, data) {
  if (locate(p).lastDeploy) return // publish state is owned by the app
  const rel = writable(p, 'open')
  const ok = data && data.__base64 !== undefined
    ? host.writeBase64(rel, data.__base64)
    : host.write(rel, String(data))
  if (!ok) fail('EIO', 'write', p)
}

export function mkdirSync(p) {
  if (!host.mkdir(writable(p, 'mkdir'))) fail('EIO', 'mkdir', p)
}

class Dirent {
  constructor(name, dir) { this.name = name; this._dir = dir }
  isDirectory() { return this._dir }
  isFile() { return !this._dir }
}

export function readdirSync(p, opts) {
  const loc = locate(p)
  let entries
  if (loc.overlayDir) {
    entries = Object.keys(overlay()).filter(f => path.dirname(f) === loc.overlayDir).map(f => ({ name: path.basename(f), isDirectory: false }))
  } else {
    entries = loc.rel ? host.list(loc.rel) : null
    if (entries == null) fail('ENOENT', 'scandir', p)
    // A backups folder holds only its document's snapshots; subfolders
    // there belong to nested documents.
    if (loc.backups) entries = entries.filter(e => !e.isDirectory)
  }
  return opts && opts.withFileTypes
    ? entries.map(e => new Dirent(e.name, e.isDirectory))
    : entries.map(e => e.name)
}

export function statSync(p) {
  const loc = locate(p)
  const s = loc.rel ? host.stat(loc.rel)
    : loc.overlayDir ? { isDirectory: true, size: 0, mtimeMs: 0 }
    : loc.overlayFile || loc.lastDeploy ? { isDirectory: false, size: 0, mtimeMs: 0 }
    : null
  if (s == null) fail('ENOENT', 'stat', p)
  return { size: s.size, mtimeMs: s.mtimeMs, mtime: new Date(s.mtimeMs), isDirectory: () => s.isDirectory, isFile: () => !s.isDirectory }
}

export function copyFileSync(a, b) {
  const from = locate(a).rel
  if (!from || host.stat(from) == null) fail('ENOENT', 'copyfile', a)
  if (!host.copy(from, writable(b, 'copyfile'))) fail('EIO', 'copyfile', b)
}

export function renameSync(a, b) {
  const from = writable(a, 'rename')
  if (host.stat(from) == null) fail('ENOENT', 'rename', a)
  if (!host.move(from, writable(b, 'rename'))) fail('EIO', 'rename', b)
}

export function unlinkSync(p) {
  const rel = writable(p, 'unlink')
  if (host.stat(rel) == null) fail('ENOENT', 'unlink', p)
  if (!host.remove(rel)) fail('EIO', 'unlink', p)
}

export function rmSync(p, opts = {}) {
  const rel = writable(p, 'rm')
  if (host.stat(rel) == null) { if (!opts.force) fail('ENOENT', 'rm', p); return }
  if (!host.remove(rel)) fail('EIO', 'rm', p)
}

export default { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, copyFileSync, renameSync, unlinkSync, rmSync }
