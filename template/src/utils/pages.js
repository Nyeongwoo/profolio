import list from '../data/pages.json'
import { OTHER_LANGUAGE_CODES } from '../i18n/languages'

// The site's own pages (Profolio ▸ Site ▸ +): src/data/pages.json lists
// them as [{ id, title, path }]; each page's content is
// public/assets/pages/<id>/info.json ({ title, description, showHeader,
// sections }). Sites made before pages existed get an empty pages.json from
// Profolio's Update Site.

export const pages = Array.isArray(list) ? list.filter(p => p && p.id && typeof p.path === 'string' && p.path.startsWith('/')) : []

export function pageById(id) {
  return pages.find(p => p.id === id)
}

// Addresses a page can't take: the site's own sections and tools.
export const RESERVED_PATHS = ['projects', 'originals', 'blog', 'about', 'contacts', 'archive', 'sitemap', 'editor', 'lab', 'profolio', 'assets', 'api', ...OTHER_LANGUAGE_CODES]
