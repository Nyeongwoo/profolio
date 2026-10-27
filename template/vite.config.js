import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

// https://vite.dev/config/
// Content JSON (src/data, src/i18n) is written by the editor server on every
// save. Left to Vite, each write invalidated modules the whole app imports and
// forced a full reload — the editor itself flashed, lost its scroll position
// and any unsaved edits on other tabs. Instead the update is swallowed here
// and announced as an event; only public pages (the editor's preview iframe,
// or a site tab) reload in response — see src/main.jsx. The editor already
// has the new data, since it's what just saved it.
const contentNoFullReload = {
  name: 'nnwoo-content-no-full-reload',
  handleHotUpdate({ file, server }) {
    if (/[\\/]src[\\/](data|i18n)[\\/][^\\/]+\.json$/.test(file)) {
      server.ws.send({ type: 'custom', event: 'nnwoo:content-changed', data: { file } })
      return []
    }
  },
}

// App build (`vite build --mode app`, used by scripts/siteproj.js): the Mac
// editor app serves this bundle from inside an open .siteproj package whose
// content changes on every save, so content JSON can't be baked in. Each
// src/data or src/i18n JSON import becomes a module that fetches the file
// from the package at startup (top-level await, so importers see the same
// plain object they get from a normal import).
const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), 'src')
const contentFromPackage = {
  name: 'nnwoo-content-from-package',
  enforce: 'pre',
  async resolveId(source, importer, options) {
    if (!source.endsWith('.json')) return
    const resolved = await this.resolve(source, importer, { ...options, skipSelf: true })
    const rel = resolved && path.relative(SRC, resolved.id).split(path.sep).join('/')
    // The id must not end in .json, or Vite's own JSON plugin claims it.
    if (rel && /^(data|i18n)\/[^/]+\.json$/.test(rel)) return `\0package-content:${rel.slice(0, -5)}`
  },
  load(id) {
    if (id.startsWith('\0package-content:')) {
      const url = `/src/${id.slice('\0package-content:'.length)}.json`
      // A file the package doesn't have yet (e.g. pages.json on a site made
      // before pages) reads as null instead of stopping the whole preview.
      return `export default await fetch(${JSON.stringify(url)}, { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null)`
    }
  },
}

// Lab tuning panel (public/lab/tune.js, opened with ?tune): its Save button
// POSTs { path, data } here and the JSON lands in public/<path>. Dev server
// only, from this machine only, and only for JSON files under public/lab/.
// The write itself isn't hot-reloaded, so the page being tuned keeps its
// state; it already shows the values it just saved.
const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public')
const labTuneSave = {
  name: 'nnwoo-lab-tune-save',
  configureServer(server) {
    server.middlewares.use('/__lab/save', (req, res) => {
      const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)
      if (req.method !== 'POST' || !local) { res.statusCode = 403; return res.end() }
      let body = ''
      req.on('data', chunk => { body += chunk })
      req.on('end', async () => {
        try {
          const { path: rel, data, text: given } = JSON.parse(body)
          if (!/^lab\/[\w-]+\/[\w-]+\.json$/.test(rel)) throw new Error(`Not a lab JSON path: ${rel}`)
          const fs = await import('fs/promises')
          // Pretty-printed, but arrays of plain values ([0.3, 0.5, 0.4, 1],
          // keyframe pairs) kept on one line.
          const text = given ? given.replace(/\n$/, '') : JSON.stringify(data, null, 2)
            .replace(/\[\s+([^[\]{}]*?)\s+\]/g, (_, inner) => `[${inner.split(/,\s+/).join(', ')}]`)
          await fs.writeFile(path.join(PUBLIC, rel), text + '\n')
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ ok: true }))
        } catch (e) {
          res.statusCode = 400
          res.end(String(e.message || e))
        }
      })
    })
  },
  handleHotUpdate({ file }) {
    if (/[\\/]public[\\/]lab[\\/].+\.json$/.test(file)) return []
  },
}

export default defineConfig(({ mode }) => mode === 'app' ? {
  plugins: [react(), contentFromPackage],
  // Assets come from the package's site/public, not the bundle.
  publicDir: false,
  build: { outDir: 'dist-app', emptyOutDir: true },
} : {
  plugins: [react(), contentNoFullReload, labTuneSave],
  server: {
    host: true,
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
})
