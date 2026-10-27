import siteConfig from '../data/siteConfig.json'
import { t } from '../i18n'
import { pageById } from './pages'

// Site structure: which parts of the site exist and what the menu holds,
// from siteConfig.structure (Profolio ▸ Site settings ▸ Site Structure).
// A site without it looks as before: every built-in part on, and the menu
// from the older hiddenBuiltinNav / navCustomItems keys.
//
//   structure: {
//     nav: [{ key: 'about' | 'projects' | 'originals' | 'blog' | 'contacts' | 'page' | 'link',
//             label?: string, hidden?: bool,
//             page?: string,                         // 'page': an id in pages.json
//             path?: string, href?: string }],        // 'link' only
//     sections: { originals?: bool, blog?: bool, archive?: bool },  // false: off
//     projectIcons?: bool,     // the icon strip on project category pages
//     categoryFilter?: bool,   // the category menu on phones (Projects ▸ …)
//     detailBar?: bool,        // the bar under the navbar on project/original pages
//     search?: bool,           // the navbar's search button
//     footer?: bool,
//     names?: { projects?, originals?, blog?, archive? },  // what a part is called
//   }                                                       // ("Events", "Notices"…)
const structure = siteConfig.structure || {}

export const BUILTIN_NAV = [
  { key: 'about', label: 'About', path: '/about' },
  { key: 'projects', label: 'Projects', path: '/projects' },
  { key: 'originals', label: 'Originals', path: '/originals' },
  { key: 'blog', label: 'Blog', path: '/blog' },
  { key: 'contacts', label: 'Contacts', path: '/contacts' },
]

const SECTION_OF_PATH = { originals: 'originals', blog: 'blog', archive: 'archive' }

const DEFAULT_NAMES = { projects: 'Projects', originals: 'Originals', blog: 'Blog', archive: 'Archive' }

// What a part of the site is called on the site: its Site Structure name
// (an organization's "Events" or "Notices"), else the usual one, translated.
export function sectionName(key) {
  return structure.names?.[key] || t(DEFAULT_NAMES[key] || key)
}

// "Other Projects" under a project page, following a renamed part.
export function otherName(key) {
  return structure.names?.[key] ? `${t('Other')} ${structure.names[key]}` : t(`Other ${DEFAULT_NAMES[key]}`)
}

// Whether a part of the site is on (missing settings mean on).
export function sectionOn(name) {
  return structure.sections?.[name] !== false
}

export function structureFlag(name) {
  return structure[name] !== false
}

// Whether a site path belongs to a part that's switched off. External links
// and anything unrecognized stay allowed.
export function structureAllows(path) {
  if (!path || !path.startsWith('/')) return true
  const first = path.split(/[?#]/)[0].split('/').filter(Boolean)[0]
  const section = SECTION_OF_PATH[first]
  return !section || sectionOn(section)
}

// The menu: [{ label, path, href? }] in order, hidden ones and switched-off
// parts left out.
export function navLinks() {
  if (Array.isArray(structure.nav)) {
    return structure.nav
      .filter(item => !item.hidden)
      .map(item => {
        if (item.key === 'link') return item.path ? { label: item.label || item.path, path: item.path, href: item.href } : null
        if (item.key === 'page') {
          const page = pageById(item.page)
          return page ? { label: item.label || page.title, path: page.path } : null
        }
        const builtin = BUILTIN_NAV.find(b => b.key === item.key)
        return builtin ? { label: item.label || (DEFAULT_NAMES[item.key] ? sectionName(item.key) : t(builtin.label)), path: builtin.path } : null
      })
      .filter(l => l && structureAllows(l.path))
  }
  const hidden = siteConfig.hiddenBuiltinNav || []
  return BUILTIN_NAV.filter(b => !hidden.includes(b.path))
    .map(b => ({ label: DEFAULT_NAMES[b.key] ? sectionName(b.key) : t(b.label), path: b.path }))
    .concat(siteConfig.navCustomItems || [])
    .filter(l => structureAllows(l.path))
}

// Menu items that are links elsewhere, given a path on this site that
// redirects there (e.g. /ig → instagram.com).
export function navRedirects() {
  const items = Array.isArray(structure.nav)
    ? structure.nav.filter(item => item.key === 'link')
    : siteConfig.navCustomItems || []
  return items.filter(item => item.href && item.path && !item.path.startsWith('http'))
}
