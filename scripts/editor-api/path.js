// POSIX subset of Node's `path`, for the editor server running in the app.

export const sep = '/'

export function normalize(p) {
  const abs = p.startsWith('/')
  const out = []
  for (const s of p.split('/')) {
    if (!s || s === '.') continue
    if (s === '..') {
      if (out.length && out[out.length - 1] !== '..') out.pop()
      else if (!abs) out.push('..')
    } else out.push(s)
  }
  const r = (abs ? '/' : '') + out.join('/')
  return r || (abs ? '/' : '.')
}

export const join = (...parts) => normalize(parts.filter(Boolean).join('/'))

export function resolve(...parts) {
  let r = ''
  for (const p of parts) if (p) r = p.startsWith('/') ? p : `${r}/${p}`
  return normalize(r.startsWith('/') ? r : `/${r}`)
}

export function dirname(p) {
  const n = normalize(p)
  const i = n.lastIndexOf('/')
  return i < 0 ? '.' : i === 0 ? '/' : n.slice(0, i)
}

export function basename(p, ext) {
  let b = p.replace(/\/+$/, '')
  b = b.slice(b.lastIndexOf('/') + 1)
  if (ext && b.endsWith(ext) && b !== ext) b = b.slice(0, -ext.length)
  return b
}

export function extname(p) {
  const b = basename(p)
  const i = b.lastIndexOf('.')
  return i <= 0 ? '' : b.slice(i)
}

export function relative(from, to) {
  const f = resolve(from).split('/').filter(Boolean)
  const t = resolve(to).split('/').filter(Boolean)
  let i = 0
  while (i < f.length && i < t.length && f[i] === t[i]) i++
  return [...Array(f.length - i).fill('..'), ...t.slice(i)].join('/')
}

export default { sep, normalize, join, resolve, dirname, basename, extname, relative }
