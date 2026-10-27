import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useState, useEffect, useRef, useMemo } from 'react'
import projects from '../data/projects'
import blogPosts from '../data/blog.json'
import originals from '../data/originals.json'
import siteConfig from '../data/siteConfig.json'
import { t } from '../i18n'
import { MINIMAL, minimalAllows } from '../utils/minimal'
import { navLinks, structureFlag, sectionName } from '../utils/structure'

const hidden = siteConfig.hiddenProjects || []

function SearchOverlay({ onClose }) {
  const [query, setQuery] = useState('')
  const inputRef = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    inputRef.current?.focus()
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return null
    return {
      projects: projects.filter(p =>
        !hidden.includes(`${p.category}/${p.id}`) && minimalAllows(`/projects/${p.category}/${p.id}`) && (
          p.title.toLowerCase().includes(q) ||
          (p.description || '').toLowerCase().includes(q) ||
          (p.tags || []).some(t => t.toLowerCase().includes(q)) ||
          p.category.toLowerCase().includes(q)
        )
      ),
      blog: blogPosts.filter(p => minimalAllows('/blog') && (
        p.title.toLowerCase().includes(q) ||
        (p.preview || '').toLowerCase().includes(q) ||
        (p.category || '').toLowerCase().includes(q)
      )),
      originals: originals.filter(o => minimalAllows('/originals') && (
        o.title.toLowerCase().includes(q) ||
        (o.description || '').toLowerCase().includes(q) ||
        (o.tags || []).some(t => t.toLowerCase().includes(q))
      )),
    }
  }, [query])

  const total = results ? results.projects.length + results.blog.length + results.originals.length : 0

  const go = (path) => { navigate(path); onClose() }

  return (
    <div className="search-overlay" onClick={onClose}>
      <div className="search-box" onClick={e => e.stopPropagation()}>
        <div className="search-input-row">
          <img src="/assets/navbar/search.svg" alt="" width="16" height="16" style={{ opacity: 0.4, flexShrink: 0 }} />
          <input
            ref={inputRef}
            className="search-input"
            placeholder={t(MINIMAL ? 'Search projects…' : 'Search projects, blog, originals…')}
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          <button className="search-close" onClick={onClose}>✕</button>
        </div>

        {results && (
          <div className="search-results">
            {total === 0 && (
              <p className="search-empty">{t('No results for')} "{query}"</p>
            )}

            {results.projects.length > 0 && (
              <div className="search-group">
                <p className="search-group-label">{sectionName('projects')}</p>
                {results.projects.map(p => (
                  <button key={p.id} className="search-result-item" onClick={() => go(`/projects/${p.category}/${p.id}`)}>
                    <span className="search-result-title">{p.title}</span>
                    <span className="search-result-meta">{p.category} · {p.year}</span>
                  </button>
                ))}
              </div>
            )}

            {results.blog.length > 0 && (
              <div className="search-group">
                <p className="search-group-label">{sectionName('blog')}</p>
                {results.blog.map(p => (
                  <button key={p.id} className="search-result-item" onClick={() => go(`/blog/post/${p.id}`)}>
                    <span className="search-result-title">{p.title}</span>
                    <span className="search-result-meta">{p.category} · {p.date}</span>
                  </button>
                ))}
              </div>
            )}

            {results.originals.length > 0 && (
              <div className="search-group">
                <p className="search-group-label">{sectionName('originals')}</p>
                {results.originals.map(o => (
                  <button key={o.id} className="search-result-item" onClick={() => go(`/originals/${o.category}/${o.id}`)}>
                    <span className="search-result-title">{o.title}</span>
                    <span className="search-result-meta">{o.category}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {!results && (
          <p className="search-hint">{t('Type to search…')}</p>
        )}
      </div>
    </div>
  )
}

const DETAIL_PAGE_RE = /^\/(projects|originals)\/[^/]+\/[^/]+/

export default function Navbar() {
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [navHidden, setNavHidden] = useState(false)
  const navRef = useRef(null)
  const isDetailPage = DETAIL_PAGE_RE.test(location.pathname)
  const isHome = location.pathname === '/'

  const links = navLinks().filter(l => minimalAllows(l.path))
  const showSearch = structureFlag('search')

  useEffect(() => {
    setMenuOpen(false)
    setSearchOpen(false)
  }, [location.pathname])

  useEffect(() => {
    document.body.style.overflow = (menuOpen || searchOpen) ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [menuOpen, searchOpen])

  // Sticky bars below the navbar (.detail-nav, mobile filter bar, etc.) need
  // to know its actual rendered height — it isn't a fixed constant since
  // navFontSize/navIconSize are user-configurable. Expose it as a CSS var
  // instead of a hardcoded px offset so those bars sit flush under it at
  // any size, with no gap or overlap.
  useEffect(() => {
    const el = navRef.current
    if (!el) return
    // getBoundingClientRect() (fractional) instead of offsetHeight (always
    // rounded to an integer px) — the rounding was the actual source of the
    // stray ~1px seam: .detail-nav's sticky `top` would land on an integer
    // that didn't quite match the navbar's true fractional rendered height.
    const setH = () => document.documentElement.style.setProperty('--navbar-h', `${el.getBoundingClientRect().height}px`)
    setH()
    const ro = new ResizeObserver(setH)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Both vars go on the shared root rather than this element's own inline
  // style: .detail-nav lives in a sibling component (ProjectDetail/
  // OriginalDetail), so an inline style here wouldn't reach it anyway — and
  // keeping navBgColor on the same root channel (rather than inline, which
  // would always beat an inherited value) lets a per-project override
  // (set by ProjectDetail, mounted/read after this effect) win over this
  // site-wide default while still falling back to it once unmounted.
  useEffect(() => {
    if (siteConfig.navBgColor) document.documentElement.style.setProperty('--navbar-bg-override', siteConfig.navBgColor)
    else document.documentElement.style.removeProperty('--navbar-bg-override')
    if (siteConfig.navBottomBgColor) document.documentElement.style.setProperty('--navbar-bottom-bg-override', siteConfig.navBottomBgColor)
    else document.documentElement.style.removeProperty('--navbar-bottom-bg-override')
    if (siteConfig.navBehindBgColor) document.documentElement.style.setProperty('--navbar-behind-bg-override', siteConfig.navBehindBgColor)
    else document.documentElement.style.removeProperty('--navbar-behind-bg-override')
  }, [siteConfig.navBgColor, siteConfig.navBottomBgColor, siteConfig.navBehindBgColor])

  // .detail-nav (project/original detail pages) isn't always mounted, so its
  // height is tracked separately from the navbar's own — .nav-backdrop reads
  // both to cover exactly the combined bar height, on any page. Navbar and
  // ProjectDetail/OriginalDetail are siblings under the route layout, so on
  // first mount of a detail page .detail-nav may not exist in the DOM yet
  // when this effect runs — a MutationObserver picks it up once it does,
  // instead of this only working correctly from the second render onward.
  useEffect(() => {
    let ro
    let mo
    const setH = (el) => document.documentElement.style.setProperty('--detail-nav-h', el ? `${el.getBoundingClientRect().height}px` : '0px')
    const attach = (el) => {
      setH(el)
      ro = new ResizeObserver(() => setH(el))
      ro.observe(el)
    }
    const existing = document.querySelector('.detail-nav')
    if (existing) {
      attach(existing)
    } else {
      setH(null)
      mo = new MutationObserver(() => {
        const el = document.querySelector('.detail-nav')
        if (el) { mo.disconnect(); mo = null; attach(el) }
      })
      mo.observe(document.body, { childList: true, subtree: true })
    }
    return () => { ro?.disconnect(); mo?.disconnect() }
  }, [location.pathname])

  const handleLogoClick = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Every page except Home hides the navbar on scroll-down and brings it
  // back on scroll-up. On detail pages (project/original) the navbar and
  // .detail-nav are meant to read as one bar: the navbar slides fully
  // offscreen while .detail-nav slides up by the same distance to take its
  // place, landing flush at the top. Since .detail-nav lives in
  // ProjectDetail/OriginalDetail (not this component), that half of the
  // movement is driven purely by CSS off a root class here (`:root.nav-away`).
  // Both bars animate via `transform` (not `top`) so they're both
  // compositor-driven and move in exact lockstep — mixing a `transform` on
  // one with a `top` transition on the other visibly desynced them, since
  // `top` on a sticky element only has any effect once that element has
  // actually reached its pinned position, and its layout recalculation
  // doesn't animate as smoothly as a pure transform. We also only ever
  // engage the hide/show once .detail-nav has actually reached that pinned
  // position — before that its own `top` value (and thus a `translateY`
  // keyed off it) has no visible effect at all, since it's still scrolling
  // normally in the flow rather than stuck, which is what made the earlier
  // transform attempt look like it "did nothing". Pages with no .detail-nav
  // skip that extra gate entirely and just hide/show off scroll direction.
  useEffect(() => {
    if (isHome) { setNavHidden(false); document.documentElement.classList.remove('nav-away'); return }
    let lastY = window.scrollY
    const onScroll = () => {
      const y = window.scrollY
      const navH = navRef.current?.getBoundingClientRect().height || 0
      let gateOk = true
      if (isDetailPage) {
        const detailNavEl = document.querySelector('.detail-nav')
        gateOk = detailNavEl ? detailNavEl.getBoundingClientRect().top <= navH + 1 : false
      }
      let next
      if (!gateOk || y <= navH) next = false
      else if (y > lastY + 2) next = true
      else if (y < lastY - 2) next = false
      else next = undefined
      if (next !== undefined) {
        setNavHidden(next)
        if (isDetailPage) document.documentElement.classList.toggle('nav-away', next)
      }
      lastY = y
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => { window.removeEventListener('scroll', onScroll); document.documentElement.classList.remove('nav-away') }
  }, [isHome, isDetailPage])

  return (
    <>
      <div className="nav-backdrop" />
      <nav ref={navRef} className={`navbar${navHidden ? ' navbar-hidden' : ''}`} style={{
        ...(siteConfig.navFontSize ? { '--navbar-font-size': siteConfig.navFontSize } : {}),
        ...(siteConfig.navIconSize ? { '--navbar-icon-size': siteConfig.navIconSize } : {}),
      }}>
        <Link to="/" className="navbar-logo" onClick={handleLogoClick}>
          <img src="/assets/navbar/logo.svg" alt="logo" className="navbar-logo-light" />
          <img src="/assets/navbar/logo-dark.svg" alt="logo" className="navbar-logo-dark" />
        </Link>
        <div className="navbar-right">
          <ul className="navbar-links">
            {links.map(link => {
              const externalHref = link.href || (link.path.startsWith('http') ? link.path : null)
              return (
                <li key={link.path}>
                  {externalHref ? (
                    <a href={externalHref} target="_blank" rel="noopener noreferrer">{link.label}</a>
                  ) : (
                    <Link to={link.path} className={location.pathname.startsWith(link.path) ? 'active' : ''}>
                      {link.label}
                    </Link>
                  )}
                </li>
              )
            })}
          </ul>
          {showSearch && (
            <button className="navbar-search" aria-label="search" onClick={() => setSearchOpen(true)}>
              <img src="/assets/navbar/search.svg" alt="search" width="16" height="16" className="navbar-search-icon-light" />
              <img src="/assets/navbar/search-dark.svg" alt="search" width="16" height="16" className="navbar-search-icon-dark" />
            </button>
          )}
          <button className="navbar-hamburger" aria-label="menu" onClick={() => setMenuOpen(v => !v)}>
            <span className={`hamburger-icon${menuOpen ? ' open' : ''}`}>
              <span /><span /><span />
            </span>
          </button>
        </div>
      </nav>

      {menuOpen && (
        <div className="navbar-mobile-overlay">
          <ul className="navbar-mobile-links">
            {links.map(link => {
              const externalHref = link.href || (link.path.startsWith('http') ? link.path : null)
              return (
                <li key={link.path}>
                  {externalHref ? (
                    <a href={externalHref} target="_blank" rel="noopener noreferrer" onClick={() => setMenuOpen(false)}>{link.label}</a>
                  ) : (
                    <Link to={link.path} className={location.pathname.startsWith(link.path) ? 'active' : ''} onClick={() => setMenuOpen(false)}>
                      {link.label}
                    </Link>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {searchOpen && <SearchOverlay onClose={() => setSearchOpen(false)} />}
    </>
  )
}
