import { useState, useEffect, useRef } from 'react'
import { Link, useLocation } from 'react-router-dom'
import projects from '../data/projects'
import originals from '../data/originals.json'
import siteConfig from '../data/siteConfig.json'
import { autoPx } from '../utils/autoPx'
import { t, LANG, LANGUAGES, langHref, rememberLang } from '../i18n'
import { typo } from '../utils/typography'
import { MINIMAL, minimalAllows } from '../utils/minimal'
import { sectionName } from '../utils/structure'

const projectCategoryLabels = {
  product: 'Product',
  service: 'Service',
}

const originalCategoryLabels = {
  ip: 'IP',
  games: 'Games',
  apps: 'Apps',
}

const blogCategoryLabels = {
  research: 'Research',
  report: 'Report',
  essay: 'Essay',
}

function useBreadcrumb() {
  const { pathname } = useLocation()
  const parts = pathname.split('/').filter(Boolean)
  if (parts.length === 0) return null

  const [section, cat, id] = parts

  const label = (map, c) => t(map[c] || (c === 'ip' ? 'IP' : c.charAt(0).toUpperCase() + c.slice(1)))

  if (section === 'projects') {
    if (!cat) return sectionName('projects')
    const catLabel = label(projectCategoryLabels, cat)
    if (!id) return `${sectionName('projects')} › ${catLabel}`
    const project = projects.find(p => p.id === id)
    return `${sectionName('projects')} › ${catLabel}${project ? ` › ${project.title}` : ''}`
  }

  if (section === 'originals') {
    if (!cat) return sectionName('originals')
    const catLabel = label(originalCategoryLabels, cat)
    if (!id) return `${sectionName('originals')} › ${catLabel}`
    const original = originals.find(o => o.id === id)
    return `${sectionName('originals')} › ${catLabel}${original ? ` › ${original.title}` : ''}`
  }

  if (section === 'about') return t('About')
  if (section === 'contacts') return t('Contacts')
  if (section === 'archive') return sectionName('archive')

  if (section === 'blog') {
    if (!cat) return sectionName('blog')
    return `${sectionName('blog')} › ${label(blogCategoryLabels, cat)}`
  }

  return null
}

const DEFAULT_COLUMNS = [
  { title: 'Projects', items: [
    { label: 'Product', link: '/projects/product' },
    { label: 'Service', link: '/projects/service' },
  ] },
  { title: 'Originals', items: [
    { label: 'IP', link: '/originals/ip' },
    { label: 'Games', link: '/originals/games' },
    { label: 'Apps', link: '/originals/apps' },
  ] },
  { title: 'About', items: [
    { label: 'About', link: '/about' },
    { label: 'Contact', link: '/contacts' },
  ] },
  { title: 'Blog', items: [
    { label: 'Research', link: '/blog/research' },
    { label: 'Report', link: '/blog/report' },
    { label: 'Essay', link: '/blog/essay' },
  ] },
]

function LanguageMenu({ pathname, search, hash }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const current = LANGUAGES.find(l => l.code === LANG)

  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  return (
    <span className="footer-lang" ref={ref} style={siteConfig.footerLangColor ? { color: siteConfig.footerLangColor } : undefined}>
      <button type="button" className="footer-lang-btn" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
          <circle cx="8" cy="8" r="6.5" /><path d="M1.5 8h13M8 1.5c1.8 1.9 2.7 4 2.7 6.5S9.8 12.6 8 14.5M8 1.5C6.2 3.4 5.3 5.5 5.3 8s.9 4.6 2.7 6.5" />
        </svg>
        {current.label}
      </button>
      {open && (
        <ul className="footer-lang-menu" role="menu">
          {LANGUAGES.map(l => (
            <li key={l.code} role="none">
              {l.code === LANG
                ? <span role="menuitem" aria-current="true" className="footer-lang-current">{l.label}</span>
                : <a role="menuitem" href={langHref(l.code, pathname) + search + hash} hrefLang={l.htmlLang} lang={l.htmlLang} onClick={() => rememberLang(l.code)}>{l.label}</a>}
            </li>
          ))}
        </ul>
      )}
    </span>
  )
}

function FooterLink({ link, children, style }) {
  if (/^https?:\/\//.test(link || '')) {
    return <a href={link} target="_blank" rel="noopener noreferrer" style={style}>{children}</a>
  }
  return <Link to={link || '#'} style={style}>{children}</Link>
}

export default function Footer() {
  const breadcrumb = useBreadcrumb()
  const { pathname, search, hash } = useLocation()
  const isHome = pathname === '/'
  // A hidden column keeps its links in the config (editor toggle) but isn't
  // rendered, and doesn't count toward the grid's column count.
  // Minimal mode drops links to pages it leaves out, and any column that
  // ends up empty.
  const columns = (siteConfig.footerColumns || DEFAULT_COLUMNS)
    .filter(col => !col.hidden)
    .map(col => ({ ...col, items: col.items.filter(item => !item.hidden && minimalAllows(item.link)) }))
    .filter(col => !MINIMAL || col.items.length > 0)
  // Mobile: each column collapses/expands independently, Apple-footer style.
  const [openCols, setOpenCols] = useState({})
  const toggleCol = (ci) => setOpenCols(o => ({ ...o, [ci]: !o[ci] }))

  const showLogo = siteConfig.footerLogoHidden !== true && !(isHome && siteConfig.footerLogoHideHome)
  const showBreadcrumb = siteConfig.footerBreadcrumbHidden !== true && !!breadcrumb
  const showLogoRow = showLogo || showBreadcrumb
  // The footer's line: its own setting, else the site's tagline (Navbar ▸
  // Site); none when both are empty.
  const footerTagline = siteConfig.footerTagline || siteConfig.tagline || ''
  const showTagline = siteConfig.footerTaglineHidden !== true && footerTagline !== ''
  const showSitemapLink = siteConfig.footerSitemapLinkHidden !== true && minimalAllows('/archive')
  const showBottomLine = siteConfig.footerBottomLineHidden !== true
  const showCopyright = siteConfig.footerCopyrightHidden !== true
  const showLang = siteConfig.footerLangHidden !== true && LANGUAGES.length > 1

  return (
    <footer className="footer" style={{
      ...(siteConfig.footerBgColor ? { background: siteConfig.footerBgColor } : {}),
      ...(siteConfig.footerAccordionRowPadding ? { '--footer-accordion-pad': siteConfig.footerAccordionRowPadding } : {}),
    }}>
      {showLogoRow && (
        <div className="footer-logo">
          {showLogo && (
            <img
              src={siteConfig.footerIconUrl || '/assets/navbar/logo.svg'}
              alt="logo"
              style={siteConfig.footerLogoSize ? { width: autoPx(siteConfig.footerLogoSize), height: autoPx(siteConfig.footerLogoSize) } : undefined}
            />
          )}
          {showBreadcrumb && (
            <span className="footer-breadcrumb" style={siteConfig.footerBreadcrumbColor ? { color: siteConfig.footerBreadcrumbColor } : undefined}>{breadcrumb}</span>
          )}
        </div>
      )}
      <div className="footer-grid" style={{ '--footer-cols': columns.length, ...(siteConfig.footerColumnGap ? { gap: autoPx(siteConfig.footerColumnGap) } : {}) }}>
        {columns.map((col, ci) => {
          const isOpen = !!openCols[ci]
          return (
            <div className={`footer-col${isOpen ? ' footer-col--open' : ''}`} key={ci}>
              <h4
                className="footer-col-title"
                style={siteConfig.footerTitleSize ? { fontSize: autoPx(siteConfig.footerTitleSize) } : undefined}
                onClick={() => toggleCol(ci)}
              >
                {col.title}
                <span className="footer-col-chevron" aria-hidden="true">›</span>
              </h4>
              <ul>
                {col.items.map((item, ii) => (
                  <li key={ii}>
                    <FooterLink link={item.link} style={siteConfig.footerLinkSize ? { fontSize: autoPx(siteConfig.footerLinkSize) } : undefined}>{item.label}</FooterLink>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </div>
      {(showTagline || showSitemapLink) && (
        <div className="footer-toprow" style={siteConfig.footerBottomSize ? { fontSize: autoPx(siteConfig.footerBottomSize) } : undefined}>
          {showTagline
            ? <span className="footer-tagline" style={{ ...(siteConfig.footerTaglineColor ? { color: siteConfig.footerTaglineColor } : {}), ...typo(siteConfig, 'footerTagline') }}>{footerTagline}</span>
            : <span />}
          {/* Formerly the Sitemap link (that page was removed); it now points
              at the Archive. The footerSitemapLink* config keys keep their old
              names so existing settings carry over. */}
          {showSitemapLink && (
            <Link to="/archive" className="footer-sitemap" style={siteConfig.footerSitemapLinkColor ? { color: siteConfig.footerSitemapLinkColor } : undefined}>
              {siteConfig.footerSitemapLinkLabel || sectionName('archive')}
            </Link>
          )}
        </div>
      )}
      {(showCopyright || showLang) && (
        <div className="footer-bottom" style={{
          ...(siteConfig.footerBottomSize ? { fontSize: autoPx(siteConfig.footerBottomSize) } : {}),
          ...(showBottomLine ? {} : { borderTopWidth: 0 }),
          ...(siteConfig.footerLineColor ? { borderTopColor: siteConfig.footerLineColor } : {}),
        }}>
          {showCopyright
            ? <span style={siteConfig.footerCopyrightColor ? { color: siteConfig.footerCopyrightColor } : undefined}>Copyright © 2026 {siteConfig.name || ''}.<span className="footer-br"> {t('All rights reserved.')}</span></span>
            : <span />}
          {/* Language switcher: shows only the current language; the others
              open in a small menu. Links are plain <a> (full page load),
              since the language is fixed per load — see src/i18n. */}
          {showLang && <LanguageMenu pathname={pathname} search={search} hash={hash} />}
        </div>
      )}
    </footer>
  )
}
