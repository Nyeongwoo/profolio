// Which JSON fields are visible text — shared by the site (src/i18n/index.js)
// and the editor server (server/index.js), so both agree on exactly what gets
// translated. Pure: no window/fs access.

// Keys whose string values are visible text. Anything else (ids, paths,
// colors, sizes, enums) is never touched, even if it happens to equal a
// translated word — e.g. a section id "Philosophy" used as a URL anchor.
const TEXT_KEYS = new Set([
  'text', 'title', 'subtitle', 'content', 'label', 'description', 'desc', 'body',
  'caption', 'heading', 'preview', 'tagline', 'overview', 'overviewTitle',
  'overviewSubtitle', 'navLabel', 'role', 'team', 'duration', 'year', 'name',
  'displayName', 'placeholder', 'ogTitle', 'ogDescription', 'ogSiteName', 'tags',
])
const TEXT_SUFFIX = /(Title|Text|Label|Desc|Description|Caption|Subtitle|Content|Tagline|Name)$/
// siteConfig maps whose *values* are text, keyed by category or project key.
export const TEXT_MAPS = new Set([
  'allProjectsCaptions', 'allProjectsRightCaptions', 'allOriginalsCaptions',
  'allOriginalsRightCaptions', 'projectsCategoryText', 'originalsCategoryText',
  'projectCategoryLabels', 'originalCategoryLabels',
])

export const isTextKey = (k) => typeof k === 'string' && (TEXT_KEYS.has(k) || TEXT_SUFFIX.test(k))

// A string worth translating: has letters, and isn't a path/URL/email.
export const isTranslatable = (s) =>
  typeof s === 'string' && /\p{L}/u.test(s) && !/^(\/|https?:|mailto:|tel:|#)/.test(s.trim()) && !/^\S+@\S+\.\S+$/.test(s.trim())

// Calls visit(value, set) for every text string in the tree.
export function walkText(node, visit, key = null) {
  if (node == null) return
  if (Array.isArray(node)) {
    node.forEach((v, i) => {
      if (typeof v === 'string') { if (isTextKey(key) && isTranslatable(v)) visit(v, nv => { node[i] = nv }) }
      else walkText(v, visit, key)
    })
  } else if (typeof node === 'object') {
    for (const k of Object.keys(node)) {
      const v = node[k]
      if (typeof v === 'string') {
        if ((isTextKey(k) || TEXT_MAPS.has(key)) && isTranslatable(v)) visit(v, nv => { node[k] = nv })
      } else {
        walkText(v, visit, k)
      }
    }
  }
}

// Translates text fields in place with `lookup` (string -> translation or
// undefined) and returns the tree.
export function translateTree(node, lookup) {
  walkText(node, (v, set) => {
    const tr = lookup(v)
    if (tr != null && tr !== '') set(tr)
  })
  return node
}

// Every text string in the tree, in document order, de-duplicated.
export function collectText(node) {
  const out = []
  const seen = new Set()
  walkText(node, v => { if (!seen.has(v)) { seen.add(v); out.push(v) } })
  return out
}

// Pairs each source text field with the value at the same place in `edited`
// (an edited copy of the translated tree). Only walks keys that exist in
// `edited`, so partial bodies (e.g. a few siteConfig keys) work too.
// Calls pair(sourceString, editedString).
export function diffText(source, edited, pair, key = null) {
  if (source == null || edited == null) return
  if (Array.isArray(source)) {
    if (!Array.isArray(edited)) return
    source.forEach((v, i) => {
      if (i >= edited.length) return
      if (typeof v === 'string') { if (isTextKey(key) && isTranslatable(v) && typeof edited[i] === 'string') pair(v, edited[i]) }
      else diffText(v, edited[i], pair, key)
    })
  } else if (typeof source === 'object') {
    if (typeof edited !== 'object' || Array.isArray(edited)) return
    for (const k of Object.keys(edited)) {
      if (!(k in source)) continue
      const v = source[k]
      if (typeof v === 'string') {
        if ((isTextKey(k) || TEXT_MAPS.has(key)) && isTranslatable(v) && typeof edited[k] === 'string') pair(v, edited[k])
      } else {
        diffText(v, edited[k], pair, k)
      }
    }
  }
}
