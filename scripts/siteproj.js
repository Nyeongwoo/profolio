#!/usr/bin/env node
// nnwoo.portfolio — the project package the Mac editor app (Profolio) opens.
// (Its internal format id is still com.nnwoo.siteproj.)
// Format spec: docs/siteproj-format.md
//
//   node scripts/siteproj.js import [out.portfolio] [--force]
//       Builds a package from this repo's working tree (uncommitted edits
//       included). Defaults to iCloud Drive/nnwoo/nnwoo.portfolio.
//   node scripts/siteproj.js editor <pkg.portfolio>
//       Rebuilds the web editor (`vite build --mode app`) and installs it in
//       the package's editor/ folder. Run after changing site/editor code;
//       `import` does it too.
//   node scripts/siteproj.js starter [out.zip]
//       Builds the starter site for Profolio's File ▸ New Site… (see
//       scripts/starter.js); defaults to the app's resources.
//   node scripts/siteproj.js diff <pkg.portfolio>
//       Lists what differs between the package and the repo working tree.
//       Right after an import this must print nothing.
//   node scripts/siteproj.js export <pkg.portfolio> [--dry-run]
//       Writes the package's site content back into the repo working tree
//       (adds/changes/deletes files under the managed paths), so the web
//       editor and the app can be used side by side during the transition.
//
// Nothing here talks to the network; the repo itself is only read, except
// by `export`.

import fs from 'fs'
import os from 'os'
import path from 'path'
import crypto from 'crypto'
import { execFileSync } from 'child_process'
import { fileURLToPath } from 'url'
import { buildStarter } from './starter.js'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const FORMAT = 'com.nnwoo.siteproj'
const FORMAT_VERSION = 1
const DEFAULT_OUT = path.join(os.homedir(), 'Library/Mobile Documents/com~apple~CloudDocs/nnwoo/nnwoo.portfolio')

// Repo paths the package manages. Everything else (site code, server,
// scripts) stays only in git and is never touched by the app.
const INCLUDE = ['src/data/*.json', 'src/i18n/ko.json', 'src/i18n/zh.json', 'public/**']
// Editor backups move out of the site tree into the package's backups/
// folder (and from there into iCloud), so they are not site content.
// public/profolio holds the app's own update feed and downloads, published
// through git with scripts/release-profolio.sh, so the app leaves it alone.
// (Lab pieces, public/lab, are in the package: Profolio's Lab edits them.)
const EXCLUDE = ['**/backups/**', '**/.DS_Store', 'public/profolio/**']

// Minimal glob: `**` spans directories, `*` stays within one segment.
function globRe(glob) {
  const re = glob.split('**').map(part =>
    part.split('*').map(s => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*')
  ).join('.*')
  return new RegExp(`^${re}$`)
}
const INCLUDE_RE = INCLUDE.map(globRe)
const EXCLUDE_RE = EXCLUDE.map(globRe)
const isManaged = (p) => INCLUDE_RE.some(r => r.test(p)) && !EXCLUDE_RE.some(r => r.test(p))
const isBackup = (p) => /(^|\/)backups\/[^/]+\.json$/.test(p)

// `<dir>/backups/<file>.json` → `<dir>/<file>.json` inside backups/.
const backupKey = (p) => p.replace(/\/backups\/([^/]+)$/, '/$1')
const backupRepoPath = (key) => key.replace(/\/([^/]+)$/, '/backups/$1')

const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf-8', maxBuffer: 1024 * 1024 * 64 })

// Same id git gives the file's contents, so a publish can tell what changed
// against the base commit without downloading anything.
function blobSha(file) {
  const data = fs.readFileSync(file)
  return crypto.createHash('sha1').update(`blob ${data.length}\0`).update(data).digest('hex')
}

// APFS clone where possible: instant and takes no extra disk space until
// one side changes.
// Modification times carry over — the editor's "recently edited" list
// sorts by them.
function cloneFile(src, dst) {
  fs.mkdirSync(path.dirname(dst), { recursive: true })
  fs.copyFileSync(src, dst, fs.constants.COPYFILE_FICLONE)
  const { atime, mtime } = fs.statSync(src)
  fs.utimesSync(dst, atime, mtime)
}

function walk(dir, base = dir, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, base, out)
    else if (e.isFile() && e.name !== '.DS_Store') out.push(path.relative(base, p).split(path.sep).join('/'))
  }
  return out.sort()
}

// Working-tree files git would commit (tracked + untracked, minus ignored),
// skipping tracked files that were deleted locally.
function workingFiles() {
  return git('ls-files', '-z', '-c', '-o', '--exclude-standard').split('\0')
    .filter(Boolean)
    .filter((p, i, a) => a.indexOf(p) === i)
    .filter(p => fs.existsSync(path.join(ROOT, p)))
}

function managedDirs(dir = 'public', out = []) {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    if (!e.isDirectory()) continue
    const p = `${dir}/${e.name}`
    if (isManaged(`${p}/x`)) { out.push(p); managedDirs(p, out) }
  }
  return out
}

function repository() {
  const url = git('remote', 'get-url', 'origin').trim()
  const m = url.match(/github\.com[/:]([^/]+)\/(.+?)(\.git)?$/)
  if (!m) throw new Error(`origin is not a GitHub remote: ${url}`)
  return { owner: m[1], name: m[2], branch: git('rev-parse', '--abbrev-ref', 'HEAD').trim() }
}

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')) } catch { return fallback }
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n')
}

function fmtBytes(n) {
  return n >= 1 << 30 ? `${(n / (1 << 30)).toFixed(2)} GB` : `${(n / (1 << 20)).toFixed(1)} MB`
}

// The editor API: server/index.js bundled with stand-ins for express, fs,
// path… (scripts/editor-api) so the app can run it in JavaScriptCore against
// the package. server/index.js itself is used unchanged.
const API_SHIMS = path.join(ROOT, 'scripts/editor-api')
const NODE_ALIASES = Object.fromEntries(['fs', 'path', 'os', 'url', 'util', 'child_process', 'express', 'cors']
  .map(m => [m, path.join(API_SHIMS, `${m}.js`)]))

export async function buildApi(dest) {
  const { rolldown } = await import('rolldown')
  const bundle = await rolldown({
    input: path.join(API_SHIMS, 'entry.js'),
    platform: 'neutral',
    resolve: { alias: NODE_ALIASES },
    transform: { define: { 'import.meta.url': JSON.stringify('file:///repo/server/index.js') } },
    logLevel: 'warn',
  })
  await bundle.write({ file: path.join(dest, 'server.js'), format: 'iife' })
  await bundle.close()

  // The Translations page lists interface text by scanning t('…') calls in
  // the site code, which isn't in the package; ship just those calls.
  const files = {}
  const T_CALL = /\bt\(\s*(['"])((?:\\.|(?!\1).)+?)\1\s*\)/g
  for (const dir of ['src/pages', 'src/components']) {
    fs.readdirSync(path.join(ROOT, dir)).filter(f => f.endsWith('.jsx')).sort().forEach(f => {
      const src = fs.readFileSync(path.join(ROOT, dir, f), 'utf-8')
      files[`/${dir}/${f}`] = [...src.matchAll(T_CALL)].map(m => m[0]).join('\n')
    })
  }
  writeJson(path.join(dest, 'files.json'), files)
}

// The app runs the editor from the package itself, so a package always
// carries the editor built for its site (and other sites can bring their own).
async function installEditor(pkg) {
  console.log('  building editor (vite build --mode app)…')
  execFileSync('npx', ['vite', 'build', '--mode', 'app', '--logLevel', 'error'], { cwd: ROOT, stdio: 'inherit' })
  const built = path.join(ROOT, 'dist-app')
  const dest = path.join(pkg, 'editor')
  fs.rmSync(dest, { recursive: true, force: true })
  walk(built).forEach(p => cloneFile(path.join(built, p), path.join(dest, p)))
  console.log('  building editor API (server/index.js)…')
  await buildApi(path.join(dest, 'api'))
  return {
    commit: git('rev-parse', 'HEAD').trim(),
    // Uncommitted code changes went into this build too.
    dirty: git('status', '--porcelain', '--', 'src', 'server', 'scripts/editor-api', 'index.html', 'vite.config.js').trim() !== '',
    builtAt: new Date().toISOString(),
  }
}

async function cmdImport(out, { force }) {
  out = path.resolve(out || DEFAULT_OUT)
  if (!out.endsWith('.portfolio')) throw new Error('Package path must end in .portfolio')
  if (fs.existsSync(out) && !force) throw new Error(`${out} already exists (use --force to replace it)`)

  const files = workingFiles()
  const site = files.filter(isManaged)
  const backups = files.filter(p => isBackup(p) && INCLUDE_RE.some(r => r.test(p)))

  // Base = what the branch's HEAD holds for the managed paths. Edits not yet
  // committed therefore show up as pending changes on the app's first publish.
  const commit = git('rev-parse', 'HEAD').trim()
  const baseFiles = {}
  git('ls-tree', '-r', '-z', commit).split('\0').filter(Boolean).forEach(line => {
    const [meta, p] = line.split('\t')
    const [, type, sha] = meta.split(' ')
    if (type === 'blob' && isManaged(p)) baseFiles[p] = sha
  })

  const tmp = `${out}.partial`
  fs.rmSync(tmp, { recursive: true, force: true })
  fs.mkdirSync(tmp, { recursive: true })

  let bytes = 0
  site.forEach(p => {
    cloneFile(path.join(ROOT, p), path.join(tmp, 'site', p))
    bytes += fs.statSync(path.join(ROOT, p)).size
  })
  backups.forEach(p => cloneFile(path.join(ROOT, p), path.join(tmp, 'backups', backupKey(p))))
  // Folders git can't hold (empty ones, e.g. a category with nothing in it
  // yet) still exist for the editor, so they come along too.
  managedDirs().forEach(d => fs.mkdirSync(path.join(tmp, 'site', d), { recursive: true }))

  const editor = await installEditor(tmp)

  const lastDeploy = readJson(path.join(ROOT, 'server/last-deploy.json'), {})
  writeJson(path.join(tmp, 'manifest.json'), {
    format: FORMAT,
    formatVersion: FORMAT_VERSION,
    repository: repository(),
    paths: { include: INCLUDE, exclude: EXCLUDE },
    editor,
    lastPublished: lastDeploy.date || null,
    importedAt: new Date().toISOString(),
  })
  const committedAt = git('show', '-s', '--format=%cI', commit).trim()
  writeJson(path.join(tmp, 'base-index.json'), { commit, committedAt, files: baseFiles })

  fs.rmSync(out, { recursive: true, force: true })
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.renameSync(tmp, out)

  const pending = site.filter(p => baseFiles[p] !== blobSha(path.join(out, 'site', p))).length
    + Object.keys(baseFiles).filter(p => !site.includes(p)).length
  console.log(`\n  ${out}`)
  console.log(`  site files: ${site.length} (${fmtBytes(bytes)})`)
  console.log(`  backups:    ${backups.length}`)
  console.log(`  base:       ${commit.slice(0, 7)} on ${repository().branch}`)
  console.log(`  pending:    ${pending} file(s) differ from the base commit\n`)
}

function openPackage(pkg) {
  pkg = path.resolve(pkg || '')
  const manifest = readJson(path.join(pkg, 'manifest.json'), null)
  if (!manifest || manifest.format !== FORMAT) throw new Error(`Not a siteproj package: ${pkg}`)
  if (manifest.formatVersion > FORMAT_VERSION) throw new Error(`Package format v${manifest.formatVersion} is newer than this script (v${FORMAT_VERSION})`)
  return { pkg, manifest }
}

// Changes needed to make the repo working tree match the package.
function compare(pkg) {
  const inPkg = walk(path.join(pkg, 'site'))
  const inRepo = workingFiles().filter(isManaged)
  const repoSet = new Set(inRepo)
  const pkgSet = new Set(inPkg)
  const changes = []
  inPkg.forEach(p => {
    const a = path.join(pkg, 'site', p)
    const b = path.join(ROOT, p)
    if (!repoSet.has(p)) changes.push(['A', p])
    else if (fs.statSync(a).size !== fs.statSync(b).size || blobSha(a) !== blobSha(b)) changes.push(['M', p])
  })
  inRepo.forEach(p => { if (!pkgSet.has(p)) changes.push(['D', p]) })

  // Backups: only ones missing from the repo are reported; the repo copies
  // are legacy and never deleted from here. Snapshots the app takes of other
  // documents (backups/<file>.json/…) have no place in the repo.
  walk(path.join(pkg, 'backups')).filter(key => !/\.json\/[^/]+$/.test(key)).forEach(key => {
    const p = backupRepoPath(key)
    if (!fs.existsSync(path.join(ROOT, p))) changes.push(['B', p, key])
  })
  return changes.sort((x, y) => x[1].localeCompare(y[1]))
}

async function cmdEditor(pkgArg) {
  const { pkg, manifest } = openPackage(pkgArg)
  manifest.editor = await installEditor(pkg)
  writeJson(path.join(pkg, 'manifest.json'), manifest)
  console.log(`  editor installed (${manifest.editor.commit.slice(0, 7)}${manifest.editor.dirty ? ' + local changes' : ''})`)
}

function cmdDiff(pkgArg) {
  const { pkg } = openPackage(pkgArg)
  const changes = compare(pkg)
  changes.forEach(([k, p]) => console.log(`${k} ${p}`))
  if (!changes.length) console.log('Package and repo working tree match.')
}

function cmdExport(pkgArg, { dryRun }) {
  const { pkg } = openPackage(pkgArg)
  const changes = compare(pkg)
  changes.forEach(([k, p, key]) => {
    console.log(`${k} ${p}`)
    if (dryRun) return
    if (k === 'D') fs.rmSync(path.join(ROOT, p))
    else if (k === 'B') cloneFile(path.join(pkg, 'backups', key), path.join(ROOT, p))
    else cloneFile(path.join(pkg, 'site', p), path.join(ROOT, p))
  })
  console.log(changes.length ? `${dryRun ? 'Would apply' : 'Applied'} ${changes.length} change(s).` : 'Nothing to export.')
}

// Run as a command (not when imported, e.g. by the editor API tests).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd, ...rest] = process.argv.slice(2)
  const flags = { force: rest.includes('--force'), dryRun: rest.includes('--dry-run') }
  const arg = rest.find(a => !a.startsWith('--'))
  try {
    if (cmd === 'import') await cmdImport(arg, flags)
    else if (cmd === 'editor') await cmdEditor(arg)
    else if (cmd === 'starter') {
      const r = await buildStarter({ root: ROOT, out: path.resolve(arg || path.join(ROOT, 'mac/SiteEditor/StarterSite.zip')), git, installEditor })
      console.log(`  starter site: ${r.files} files → ${r.out}`)
    }
    else if (cmd === 'diff') cmdDiff(arg)
    else if (cmd === 'export') cmdExport(arg, flags)
    else {
      console.log('Usage: node scripts/siteproj.js import [out.portfolio] [--force]\n       node scripts/siteproj.js editor <pkg.portfolio>\n       node scripts/siteproj.js diff <pkg.portfolio>\n       node scripts/siteproj.js export <pkg.portfolio> [--dry-run]')
      process.exit(cmd ? 1 : 0)
    }
  } catch (e) {
    console.error(`Error: ${e.message}`)
    process.exit(1)
  }
}
