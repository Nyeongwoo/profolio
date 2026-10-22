// Web/Node globals server/index.js relies on that a bare JavaScriptCore
// context lacks (console, timers, Buffer, process, URL, fetch,
// AbortController), built on the app's `host` object.

const h = globalThis.host

const fmt = (args) => args.map(a =>
  a instanceof Error ? (a.stack || a.message) : typeof a === 'object' ? safeJson(a) : String(a)).join(' ')
const safeJson = (a) => { try { return JSON.stringify(a) } catch { return String(a) } }

if (typeof console === 'undefined') {
  globalThis.console = Object.fromEntries(['log', 'info', 'warn', 'error', 'debug'].map(level =>
    [level, (...args) => h.log(level, fmt(args))]))
}

if (typeof setTimeout === 'undefined') {
  globalThis.setTimeout = (fn, ms = 0, ...args) => h.setTimeout(() => fn(...args), ms)
  globalThis.clearTimeout = (id) => { if (id != null) h.clearTimeout(id) }
}

globalThis.process = { env: {}, platform: 'darwin', cwd: () => '/' }

// Only what the server does with Buffers: decode uploaded base64 straight
// into a file (writeFileSync passes it to the host untouched), and turn a
// fetched chunk back into text.
class AppBuffer {
  constructor(base64, text) { this.__base64 = base64; this.__text = text }
  static from(value, encoding) {
    if (typeof value === 'string' && encoding === 'base64') return new AppBuffer(value, undefined)
    return new AppBuffer(undefined, typeof value === 'string' ? value : String(value))
  }
  toString() { return this.__text ?? '' }
}
globalThis.Buffer = AppBuffer

if (typeof URL === 'undefined') {
  globalThis.URL = class URL {
    constructor(input, base) {
      let s = String(input).trim()
      if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) {
        if (base === undefined) throw new TypeError(`Invalid URL: ${input}`)
        const b = new URL(base)
        s = s.startsWith('//') ? b.protocol + s
          : s.startsWith('/') ? b.origin + s
          : s.startsWith('?') ? b.origin + b.pathname + s
          : b.origin + b.pathname.replace(/[^/]*$/, '') + s
      }
      const m = s.match(/^([a-z][a-z0-9+.-]*:)(?:\/\/([^/?#]*))?([^?#]*)(\?[^#]*)?(#.*)?$/i)
      if (!m) throw new TypeError(`Invalid URL: ${input}`)
      this.protocol = m[1].toLowerCase()
      this.host = (m[2] || '').replace(/^.*@/, '').toLowerCase()
      this.hostname = this.host.replace(/:\d+$/, '')
      this.port = (this.host.match(/:(\d+)$/) || [])[1] || ''
      this.pathname = m[3] || (m[2] !== undefined ? '/' : '')
      this.search = m[4] || ''
      this.hash = m[5] || ''
      if (/^https?:$/.test(this.protocol) && !this.hostname) throw new TypeError(`Invalid URL: ${input}`)
    }
    get origin() { return `${this.protocol}//${this.host}` }
    get href() { return `${this.protocol}${this.host || /^https?:$/.test(this.protocol) ? `//${this.host}` : ''}${this.pathname}${this.search}${this.hash}` }
    toString() { return this.href }
  }
}

if (typeof AbortController === 'undefined') {
  globalThis.AbortController = class AbortController {
    constructor() {
      const listeners = []
      this.signal = { aborted: false, addEventListener: (_, fn) => listeners.push(fn) }
      this.abort = () => {
        if (this.signal.aborted) return
        this.signal.aborted = true
        listeners.forEach(fn => fn())
      }
    }
  }
}

// fetch → host.fetch (the app caps the body at 500 KB, enough for a page's
// <head>). The body comes back as text, delivered as a single chunk.
if (typeof fetch === 'undefined') {
  globalThis.fetch = (url, opts = {}) => new Promise((resolve, reject) => {
    const abortError = () => Object.assign(new Error('The operation was aborted'), { name: 'AbortError' })
    if (opts.signal?.aborted) return reject(abortError())
    let settled = false
    opts.signal?.addEventListener('abort', () => { if (!settled) { settled = true; reject(abortError()) } })
    h.fetch(String(url), JSON.stringify(opts.headers || {}), (error, status, text) => {
      if (settled) return
      settled = true
      if (error) return reject(new TypeError(error))
      let sent = false
      resolve({
        ok: status >= 200 && status < 300,
        status,
        text: async () => text,
        json: async () => JSON.parse(text),
        body: {
          getReader: () => ({
            read: async () => sent ? { done: true } : (sent = true, { done: false, value: text }),
            cancel: async () => {},
          }),
        },
      })
    })
  })
}
