import raw from './projects.json'

// A project title may carry a short label in braces, e.g.
// "Data on Older Adults in America {Older Adults}". `title` is the full name
// with the braces stripped (cards, nav, search, breadcrumbs); `shortTitle` is
// the braced part, used under the small category-page icons where a long
// name wraps into a tall stack. No braces → both are the plain title.
const BRACE = /\s*\{([^}]*)\}\s*/g

export function splitTitle(title = '') {
  const m = /\{([^}]*)\}/.exec(title)
  const full = title.replace(BRACE, ' ').trim()
  const short = m && m[1].trim() ? m[1].trim() : full
  return { title: full, shortTitle: short }
}

const projects = raw.map(p => ({ ...p, ...splitTitle(p.title) }))
export default projects
