// The slice of Express 5 server/index.js uses, as an in-process router:
// app.use / get / post / delete, `:param` and `*wildcard` segments,
// req.params / query / body / get(), res.status / json / send / write / end.

const stack = []

function compile(pattern) {
  const keys = []
  const re = pattern.split('/').map(seg => {
    if (seg.startsWith(':')) { keys.push({ name: seg.slice(1), wildcard: false }); return '([^/]+)' }
    if (seg.startsWith('*')) { keys.push({ name: seg.slice(1), wildcard: true }); return '(.+)' }
    return seg.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
  }).join('/')
  return { re: new RegExp(`^${re}/?$`), keys }
}

function addRoute(method, pattern, handlers) {
  const { re, keys } = compile(pattern)
  handlers.forEach(handler => stack.push({ method, re, keys, handler }))
}

const app = {
  use(prefix, ...handlers) {
    if (typeof prefix === 'function') { handlers.unshift(prefix); prefix = '/' }
    handlers.forEach(handler => stack.push({ prefix: prefix.replace(/\/$/, ''), handler }))
  },
  get: (p, ...h) => addRoute('GET', p, h),
  post: (p, ...h) => addRoute('POST', p, h),
  put: (p, ...h) => addRoute('PUT', p, h),
  delete: (p, ...h) => addRoute('DELETE', p, h),
  listen() {},

  // { method, url, headers, body } → Promise<{ status, headers, body }>
  handle({ method, url, headers = {}, body = '' }) {
    return new Promise(resolve => {
      const [pathname, search = ''] = url.split('?')
      const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]))
      let parsed = {}
      if (body && /json/.test(lower['content-type'] || '')) {
        try { parsed = JSON.parse(body) } catch {
          return resolve({ status: 400, headers: { 'Content-Type': 'application/json' }, body: '{"error":"Invalid JSON body"}' })
        }
      }
      const req = {
        method, url, originalUrl: url, path: pathname, params: {}, body: parsed, headers: lower,
        query: parseQuery(search),
        get: (name) => lower[name.toLowerCase()],
        on() {},
      }
      const res = makeResponse(resolve)

      let i = 0
      const next = (err) => {
        if (res.finished) return
        if (err) return fail(res, err)
        while (i < stack.length) {
          const layer = stack[i++]
          if (layer.prefix !== undefined) {
            if (layer.prefix && pathname !== layer.prefix && !pathname.startsWith(`${layer.prefix}/`)) continue
          } else {
            if (layer.method !== method) continue
            const m = pathname.match(layer.re)
            if (!m) continue
            req.params = {}
            layer.keys.forEach((k, j) => {
              const v = decodeURIComponent(m[j + 1])
              req.params[k.name] = k.wildcard ? v.split('/') : v
            })
          }
          try {
            const r = layer.handler(req, res, next)
            if (r && typeof r.catch === 'function') r.catch(e => fail(res, e))
          } catch (e) { fail(res, e) }
          return
        }
        res.status(404).json({ error: `Cannot ${method} ${pathname}` })
      }
      next()
    })
  },
}

function fail(res, err) {
  if (typeof console !== 'undefined') console.error(err && err.stack ? err.stack : String(err))
  if (!res.finished) res.status(500).json({ error: err && err.message ? err.message : String(err) })
}

function parseQuery(search) {
  const q = {}
  for (const pair of search.split('&')) {
    if (!pair) continue
    const [k, v = ''] = pair.split('=').map(s => decodeURIComponent(s.replace(/\+/g, ' ')))
    q[k] = v
  }
  return q
}

function makeResponse(resolve) {
  const chunks = []
  const res = {
    statusCode: 200,
    headers: {},
    finished: false,
    get headersSent() { return res.finished },
    status(code) { res.statusCode = code; return res },
    setHeader(k, v) { res.headers[k] = String(v); return res },
    set(k, v) { return res.setHeader(k, v) },
    json(obj) {
      if (!res.headers['Content-Type']) res.setHeader('Content-Type', 'application/json')
      return res.end(obj === undefined ? '' : JSON.stringify(obj))
    },
    send(x) { return typeof x === 'object' && x !== null ? res.json(x) : res.end(x == null ? '' : String(x)) },
    sendStatus(code) { return res.status(code).end(String(code)) },
    write(chunk) { chunks.push(String(chunk)); return true },
    end(chunk) {
      if (res.finished) return res
      if (chunk != null) chunks.push(String(chunk))
      res.finished = true
      resolve({ status: res.statusCode, headers: res.headers, body: chunks.join('') })
      return res
    },
  }
  return res
}

export default function express() { return app }
express.json = () => (req, res, next) => next()
export { app }
