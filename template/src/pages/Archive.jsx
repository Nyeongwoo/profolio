import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import archive from '../data/archive.json'
import projects from '../data/projects'
import originals from '../data/originals.json'
import siteConfig from '../data/siteConfig.json'
import { minimalProjectShown, minimalAllows } from '../utils/minimal'
import { ImageWithFallback } from '../utils/getImage'
import { t, LANG, LANGUAGES } from '../i18n'
import { typo } from '../utils/typography'
import { sectionName } from '../utils/structure'

// The complete record behind the curated Featured tab: past portfolio
// versions and news (edited in /editor/archive), plus every project and
// original, listed automatically from projects.json/originals.json by year —
// so taking something out of Featured never makes it unfindable. The filter
// lives in the URL (?type=project) so the footer can link straight to one.
const TYPES = [
  { id: 'all', label: 'All' },
  { id: 'portfolio', label: 'Portfolios' },
  { id: 'news', label: 'News' },
  { id: 'project', label: 'Projects' },
  { id: 'original', label: 'Originals' },
]
const TYPE_LABEL = { portfolio: 'Portfolio', news: 'News', project: 'Project', original: 'Original' }

const hiddenProjects = siteConfig.hiddenProjects || []
const hiddenCategories = siteConfig.hiddenProjectCategories || []
const confidential = siteConfig.confidentialProjects || []
const categoryLabels = siteConfig.projectCategoryLabels || {}
const catLabel = (c) => t(categoryLabels[c] || c.charAt(0).toUpperCase() + c.slice(1))

const projectEntries = projects
  .filter(p => p.year && !hiddenProjects.includes(`${p.category}/${p.id}`) && !hiddenCategories.includes(p.category) && minimalProjectShown(p.category, p.id))
  .map(p => ({
    id: `project-${p.category}-${p.id}`,
    type: 'project',
    date: String(p.year),
    title: p.title,
    description: catLabel(p.category),
    link: `/projects/${p.category}/${p.id}`,
    iconBase: `/assets/projects/icon-thumbnails/${p.category}-${p.id}`,
    confidential: confidential.includes(`${p.category}/${p.id}`),
  }))

const hiddenOriginals = siteConfig.hiddenOriginals || []
const hiddenOriginalCategories = siteConfig.hiddenOriginalCategories || []
const originalLabels = siteConfig.originalCategoryLabels || {}
const originalEntries = originals
  .filter(o => o.year && !hiddenOriginals.includes(`${o.category}/${o.id}`) && !hiddenOriginalCategories.includes(o.category) && minimalAllows('/originals'))
  .map(o => ({
    id: `original-${o.category}-${o.id}`,
    type: 'original',
    date: String(o.year),
    title: o.title,
    description: t(originalLabels[o.category] || (o.category === 'ip' ? 'IP' : o.category.charAt(0).toUpperCase() + o.category.slice(1))),
    link: `/originals/${o.category}/${o.id}`,
    iconBase: `/assets/originals/icon-thumbnails/${o.category}-${o.id}`,
  }))

const entries = [
  ...(archive.items || []).filter(it => !it.hidden && it.title && /^\d{4}/.test(it.date || '')),
  ...projectEntries,
  ...originalEntries,
]

// The year is the group heading, so a row only shows what's finer than it
// (Mar 14 / 3월 14일 / 3月14日).
const htmlLang = LANGUAGES.find(l => l.code === LANG).htmlLang
function formatDate(date) {
  const [y, m, d] = date.split('-').map(n => parseInt(n, 10))
  if (!m) return ''
  const opts = d ? { month: LANG === 'en' ? 'short' : 'long', day: 'numeric' } : { month: LANG === 'en' ? 'short' : 'long' }
  return new Intl.DateTimeFormat(htmlLang, { ...opts, timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d || 1)))
}

function RowLink({ href, className, children }) {
  if (!href) return <div className={className}>{children}</div>
  const internal = href.startsWith('/') && !href.startsWith('/assets/')
  return internal
    ? <Link to={href} className={className}>{children}</Link>
    : <a href={href} target="_blank" rel="noopener noreferrer" className={className}>{children}</a>
}

function ArchiveRow({ item }) {
  const onRequest = item.type === 'portfolio' && item.access === 'request'
  const href = onRequest ? '/contacts' : (item.file || item.link || '')
  const date = formatDate(item.date)
  return (
    <li>
      <RowLink href={href} className={`archive-row${href ? ' archive-row--link' : ''}`}>
        <div className="archive-row-meta">
          <span className={`archive-type archive-type--${item.type}`}>{t(TYPE_LABEL[item.type])}</span>
          {date && <span className="archive-date">{date}</span>}
        </div>
        <div className="archive-row-body">
          <h3>
            {item.title}
            {item.confidential && <span className="archive-flag">{t('Confidential')}</span>}
            {onRequest && <span className="archive-flag">{t('Available on request')}</span>}
          </h3>
          {item.description && <p>{item.description}</p>}
        </div>
        {item.image
          ? <img className="archive-thumb" src={item.image} alt="" loading="lazy" />
          : item.iconBase
            ? <ImageWithFallback className="archive-thumb archive-thumb--icon" basePath={item.iconBase} alt="" />
            : null}
        {href && <span className="archive-arrow" aria-hidden="true">{item.file && !onRequest ? '↓' : '→'}</span>}
      </RowLink>
    </li>
  )
}

export default function Archive() {
  const [params, setParams] = useSearchParams()
  const requested = params.get('type')
  const type = TYPES.some(ty => ty.id === requested) ? requested : 'all'
  const setType = (t) => setParams(t === 'all' ? {} : { type: t }, { replace: true })

  const counts = useMemo(() => {
    const c = { all: entries.length }
    entries.forEach(e => { c[e.type] = (c[e.type] || 0) + 1 })
    return c
  }, [])

  const groups = useMemo(() => {
    const list = entries
      .filter(e => type === 'all' || e.type === type)
      .sort((a, b) => b.date.localeCompare(a.date))
    const byYear = new Map()
    list.forEach(e => {
      const y = e.date.slice(0, 4)
      if (!byYear.has(y)) byYear.set(y, [])
      byYear.get(y).push(e)
    })
    return [...byYear.entries()]
  }, [type])

  return (
    <div className="archive">
      <header className="archive-head">
        <h1 style={typo(archive, 'title')}>{archive.title || sectionName('archive')}</h1>
        {archive.description && <p className="all-page-desc" style={typo(archive, 'description')}>{archive.description}</p>}
      </header>

      <div className="archive-filters" role="group" aria-label="Filter">
        {TYPES.filter(ty => ty.id === 'all' || counts[ty.id]).map(ty => (
          <button key={ty.id} type="button" className={type === ty.id ? 'active' : ''} aria-pressed={type === ty.id} onClick={() => setType(ty.id)}>
            {t(ty.label)} <span className="archive-count">{counts[ty.id] || 0}</span>
          </button>
        ))}
      </div>

      {groups.length === 0 ? (
        <p className="archive-empty">{t('Nothing here yet.')}</p>
      ) : groups.map(([year, items]) => (
        <section key={year} className="archive-year">
          <h2>{year}</h2>
          <ul>{items.map(item => <ArchiveRow key={item.id} item={item} />)}</ul>
        </section>
      ))}
    </div>
  )
}
