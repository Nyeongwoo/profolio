import siteConfig from '../data/siteConfig.json'
import projects from '../data/projects'
import { structureAllows } from './structure'

// Minimal mode: a site-wide switch (siteConfig.minimal) that trims the site
// down to what a recruiter needs — the chosen projects, About and Contacts.
// Originals, Blog and the Archive drop out of the menus and their URLs go
// home, unless their own minimalShow* switch keeps them. Everything that
// lists or links pages asks minimalAllows(path) instead of knowing the rules.
export const MINIMAL = siteConfig.minimal === true

// "category/id" keys; an empty list means every project that isn't hidden.
const picked = siteConfig.minimalProjects || []
const hiddenProjects = siteConfig.hiddenProjects || []

const showSection = {
  originals: siteConfig.minimalShowOriginals === true,
  blog: siteConfig.minimalShowBlog === true,
  archive: siteConfig.minimalShowArchive === true,
}

export const MINIMAL_REDUCE_MOTION = MINIMAL && siteConfig.minimalReduceMotion !== false

export function minimalProjectShown(category, id) {
  if (!MINIMAL) return true
  const key = `${category}/${id}`
  if (hiddenProjects.includes(key)) return false
  return picked.length === 0 || picked.includes(key)
}

const shownCategories = new Set(
  projects.filter(p => minimalProjectShown(p.category, p.id)).map(p => p.category)
)

export function minimalCategoryShown(category) {
  return !MINIMAL || shownCategories.has(category)
}

// Whether a site path (internal link) stays reachable: not in a part of the
// site switched off in Site Structure, and kept by minimal mode. External
// links and anything unrecognized are always allowed.
export function minimalAllows(path) {
  if (!structureAllows(path)) return false
  if (!MINIMAL || !path || !path.startsWith('/')) return true
  const [section, category, id] = path.split(/[?#]/)[0].split('/').filter(Boolean)
  if (section in showSection) return showSection[section]
  if (section === 'projects') {
    if (id) return minimalProjectShown(category, id)
    if (category && category !== 'all') return minimalCategoryShown(category)
  }
  return true
}
