import { useParams, Link, useNavigate } from 'react-router-dom'
import { useState, useEffect, useRef, useMemo } from 'react'
import projects from '../data/projects'
import siteConfig from '../data/siteConfig.json'
import { MINIMAL, minimalProjectShown, minimalCategoryShown, minimalAllows } from '../utils/minimal'
import { ImageWithFallback } from '../utils/getImage'
import { useIsMobile, useBreakpointTier, useScrollHidden, useRevealOnScroll } from '../utils/useIsMobile'
import CategorySections from './CategorySections'
import { autoPx } from '../utils/autoPx'
import { translateData, t } from '../i18n'
import { useProfolioDoc } from '../utils/pofoleLive'
import { sanitizeInline } from '../utils/sanitizeInline'
import { typo } from '../utils/typography'
import { structureFlag, sectionName } from '../utils/structure'

// Site Structure switches (the category pill bar, the icon strip).
const showCategoryBar = structureFlag('categoryFilter')
const showProjectIcons = structureFlag('projectIcons')

// mobile/tablet override falls back to the desktop value when unset.
const resolveTier = (tier, base, mobile, tablet) => {
  if (tier === 'mobile') return mobile || base
  if (tier === 'tablet') return tablet || base
  return base
}

// Categories excluded here have no nav tab and are hidden from the "All" tab —
// their project pages still exist and are reachable directly by URL/link.
const hiddenCategories = siteConfig.hiddenProjectCategories || []
const derivedCats = [...new Set(projects.map(p => p.category))].filter(c => !hiddenCategories.includes(c) && minimalCategoryShown(c))
const customOrder = siteConfig.projectCategoryOrder || []
const orderedCats = customOrder.length
  ? [...customOrder.filter(c => derivedCats.includes(c)), ...derivedCats.filter(c => !customOrder.includes(c))]
  : derivedCats
const categories = ['all', ...orderedCats]

// Featured ("all") tab order is hand-set in the editor; projects not in the
// list yet fall in after, by their own `order`.
const featuredOrder = siteConfig.featuredOrder || []
const featuredRank = (p) => {
  const i = featuredOrder.indexOf(`${p.category}/${p.id}`)
  return i === -1 ? Infinity : i
}
const byFeatured = (a, b) => (featuredRank(a) - featuredRank(b)) || (a.order - b.order)

// A category page's icon order is hand-set too (All Projects ▸ Order in each
// category, project ids per category); the rest fall in after, by `order`.
const categoryProjectOrder = siteConfig.categoryProjectOrder || {}
const byCategoryOrder = (cat) => {
  const list = categoryProjectOrder[cat] || []
  const rank = (p) => { const i = list.indexOf(p.id); return i === -1 ? Infinity : i }
  return (a, b) => (rank(a) - rank(b)) || (a.order - b.order)
}

// Minimal mode with hand-picked projects: "All" shows exactly those, in the
// picked order (even ones normally left out of "All").
const minimalPicks = MINIMAL ? siteConfig.minimalProjects || [] : []
const byMinimalPick = (a, b) => minimalPicks.indexOf(`${a.category}/${a.id}`) - minimalPicks.indexOf(`${b.category}/${b.id}`)

const configLabels = siteConfig.projectCategoryLabels || {}
const getLabel = (cat) => t(cat === 'all' ? (configLabels.all || 'All') : (configLabels[cat] || (cat === 'ip' ? 'IP' : cat.charAt(0).toUpperCase() + cat.slice(1))))
const captions = siteConfig.allProjectsCaptions || {}
// "See all work in the Archive" under the grid: hidden by hand (All Projects
// ▸ Text), or when minimal mode leaves the Archive out.
const showArchiveLink = siteConfig.allProjectsArchiveLinkHidden !== true && minimalAllows('/archive')
const rightCaptions = siteConfig.allProjectsRightCaptions || {}
const captionSwap = !!siteConfig.allProjectsCaptionSwap
// Featured-card text: title/caption colors and an optional drop shadow
// (on by default, matching the original look), set in the All Projects editor.
const hexToRgba = (hex, a) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '')
  if (!m) return hex
  const n = parseInt(m[1], 16)
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}
const { items: cardTextItems = {}, ...cardTextDefaults } = siteConfig.allProjectsCardText || {}
// CSS variables for one card: its own overrides on top of the defaults.
function cardTextVars(key) {
  const c = { ...cardTextDefaults, ...(cardTextItems[key] || {}) }
  return {
    ...(c.titleColor ? { '--card-title-color': c.titleColor } : {}),
    ...(c.captionColor ? { '--card-caption-color': c.captionColor } : {}),
    ...(c.shadow === false
      ? { '--card-text-shadow': 'none' }
      : c.shadowColor || c.shadowOpacity != null
        ? { '--card-text-shadow': `0 1px 5px ${hexToRgba(c.shadowColor || '#000000', (c.shadowOpacity ?? 50) / 100)}` }
        : {}),
  }
}
const desktopImageRatio = siteConfig.allProjectsImageRatio || '16/9'
// Phones: their own ratio when set, else the same as on larger screens.
const mobileImageRatio = siteConfig.allProjectsMobileImageRatio || desktopImageRatio
// allProjectsHoverStyle: 'overlay' (blue tint + caption), 'plain' (image only), 'zoom' (image scales, caption slides in — no color layer).
// Falls back to the legacy allProjectsCaptionEnabled boolean when unset.
const hoverStyle = siteConfig.allProjectsHoverStyle || (siteConfig.allProjectsCaptionEnabled === false ? 'plain' : 'overlay')

function useHoverCaption() {
  const [hovered, setHovered] = useState(false)
  const isMobile = useIsMobile()
  const visible = isMobile || hovered
  return { visible, onMouseEnter: () => setHovered(true), onMouseLeave: () => setHovered(false) }
}

function CardCaption({ project, titleSize, tagSize, captionDesc, rightCaption, aspectRatio, confidential, hoverStyle: style }) {
  const { visible, onMouseEnter, onMouseLeave } = useHoverCaption()
  const [revealRef, revealed] = useRevealOnScroll()
  const isZoom = style === 'zoom'
  return (
    <Link
      ref={revealRef}
      to={`/projects/${project.category}/${project.id}`}
      className={`project-card${isZoom ? ' project-card--zoom' : ''}${confidential ? ' project-card--confidential' : ''}${revealed ? ' revealed' : ''}`}
      style={{ aspectRatio, ...cardTextVars(`${project.category}/${project.id}`) }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <ImageWithFallback
        basePath={`/assets/projects/all-thumbnails/${project.category}-${project.id}`}
        alt={project.title}
        withHover
        style={{width:'100%', height:'100%', objectFit:'cover', borderRadius:'8px'}}
      />
      {!isZoom && <div className="project-card-gradient" style={{ opacity: visible ? 1 : 0 }} />}
      {confidential && <span className="project-card-confidential-label" style={tagSize ? {fontSize:tagSize} : {}}>{t('Confidential')}</span>}
      {project.year && <span className="project-card-year-label" style={{ opacity: visible ? 1 : 0 }}>{project.year}</span>}
      <div className="project-card-caption">
        <p className="project-card-overlay-title" style={titleSize ? {fontSize:titleSize} : {}}>{project.title}</p>
        {captionDesc && <p className="project-card-overlay-desc" style={{ ...(tagSize ? {fontSize:tagSize} : {}), maxHeight: visible ? '3em' : '0', opacity: visible ? 1 : 0 }}>{captionDesc}</p>}
      </div>
      {rightCaption && <span className="project-card-caption-right" style={{ ...(tagSize ? {fontSize:tagSize} : {}), opacity: visible ? 1 : 0 }}>{rightCaption}</span>}
    </Link>
  )
}

function PlainCard({ project, aspectRatio, confidential }) {
  const [revealRef, revealed] = useRevealOnScroll()
  return (
    <Link ref={revealRef} to={`/projects/${project.category}/${project.id}`} className={`project-card${confidential ? ' project-card--confidential' : ''}${revealed ? ' revealed' : ''}`} style={{ aspectRatio }}>
      <ImageWithFallback basePath={`/assets/projects/all-thumbnails/${project.category}-${project.id}`} alt={project.title} withHover style={{width:'100%', height:'100%', objectFit:'cover', borderRadius:'8px'}} />
    </Link>
  )
}

function IconCarousel({ items, current, animDone, gap }) {
  const wrapRef = useRef(null)
  const trackRef = useRef(null)
  const [offset, setOffset] = useState(0)
  const [maxOffset, setMaxOffset] = useState(0)
  const dragStartX = useRef(null)
  const dragStartOffset = useRef(0)
  const isDragging = useRef(false)
  const didDrag = useRef(false)

  useEffect(() => {
    const measure = () => {
      if (!trackRef.current || !wrapRef.current) return
      setMaxOffset(Math.max(0, trackRef.current.scrollWidth - wrapRef.current.clientWidth))
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [items])

  useEffect(() => { setOffset(0) }, [current])

  const clamp = (val) => Math.max(0, Math.min(maxOffset, val))

  const handleMouseDown = (e) => {
    isDragging.current = true; didDrag.current = false
    dragStartX.current = e.clientX; dragStartOffset.current = offset
  }
  const handleMouseMove = (e) => {
    if (!isDragging.current) return
    const diff = dragStartX.current - e.clientX
    if (Math.abs(diff) > 4) didDrag.current = true
    setOffset(clamp(dragStartOffset.current + diff))
  }
  const handleMouseUp = () => { isDragging.current = false }

  const handleTouchStart = (e) => {
    isDragging.current = true; didDrag.current = false
    dragStartX.current = e.touches[0].clientX; dragStartOffset.current = offset
  }
  const handleTouchMove = (e) => {
    if (!isDragging.current) return
    const diff = dragStartX.current - e.touches[0].clientX
    if (Math.abs(diff) > 4) didDrag.current = true
    setOffset(clamp(dragStartOffset.current + diff))
  }

  return (
    <div className="icon-carousel-wrap" ref={wrapRef}>
      <div
        className="icon-carousel-track"
        ref={trackRef}
        style={{ transform: `translateX(-${offset}px)`, ...(gap ? { gap } : {}) }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleMouseUp}
      >
        {items.map((project, i) => (
          <Link
            key={project.id}
            to={`/projects/${project.category}/${project.id}`}
            className={`projects-category-icon-item${animDone ? ' anim-done' : ''}`}
            style={{ '--i': i }}
            onClick={e => { if (didDrag.current) { e.preventDefault(); didDrag.current = false } }}
          >
            <ImageWithFallback
              basePath={`/assets/projects/icon-thumbnails/${project.category}-${project.id}`}
              alt={project.title}
              style={{width:'100%', height:'100%', objectFit:'contain'}}
              withHover
            />
            <span>{project.id.startsWith('9px') ? '9px Design' : project.shortTitle}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}

function MobileFilterBar({ current }) {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const ref = useRef(null)

  const currentLabel = getLabel(current)

  useEffect(() => {
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const handleSelect = (cat) => {
    setOpen(false)
    navigate(cat === 'all' ? '/projects' : `/projects/${cat}`)
  }

  return (
    <div className="mobile-filter-bar" ref={ref}>
      <button className="mobile-filter-trigger" onClick={() => setOpen(o => !o)}>
        <span className="mobile-filter-label">
          <span className="mobile-filter-parent">{sectionName('projects')}</span>
          <span className="mobile-filter-sep">›</span>
          <span className="mobile-filter-current">{currentLabel}</span>
        </span>
        <span className={`mobile-filter-chevron${open ? ' open' : ''}`}>›</span>
      </button>
      {open && (
        <ul className="mobile-filter-list">
          {categories.map(cat => {
            const label = getLabel(cat)
            return (
              <li key={cat}>
                <button
                  className={`mobile-filter-option${current === cat ? ' active' : ''}`}
                  onClick={() => handleSelect(cat)}
                >
                  {label}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

const MOBILE_PREVIEW = 5

export default function Projects() {
  const { category } = useParams()
  const current = category || 'all'
  const hidden = siteConfig.hiddenProjects || []
  const hiddenInAll = siteConfig.hiddenInAllProjects || []
  const allCols = parseInt(siteConfig.allProjectsLayout || '3')
  const allMobileCols = parseInt(siteConfig.allProjectsMobileLayout || '1')
  const allText = siteConfig.allProjectsText || ''
  const categoryText = (siteConfig.projectsCategoryText || {})[current] || ''
  const titleSize = autoPx(siteConfig.allProjectsTitleSize) || ''
  const tagSize = autoPx(siteConfig.allProjectsTagSize) || ''
  const [animDone, setAnimDone] = useState(false)
  const isMobile = useIsMobile()
  const tier = useBreakpointTier()
  const filterHidden = useScrollHidden()
  const [showAll, setShowAll] = useState(false)
  const [catSections, setCatSections] = useState(null)
  const [confidentialProjects, setConfidentialProjects] = useState([])

  const filtered = useMemo(() => {
    if (current !== 'all') {
      return projects.filter(p => p.category === current && !hidden.includes(`${p.category}/${p.id}`) && minimalProjectShown(p.category, p.id)).sort(byCategoryOrder(current))
    }
    if (minimalPicks.length) {
      return projects.filter(p => minimalProjectShown(p.category, p.id)).sort(byMinimalPick)
    }
    return projects
      .filter(p => !hiddenCategories.includes(p.category) && !hidden.includes(`${p.category}/${p.id}`) && !hiddenInAll.includes(`${p.category}/${p.id}`) && minimalProjectShown(p.category, p.id))
      .sort(byFeatured)
  }, [current])

  useEffect(() => {
    setAnimDone(false)
    // Matches the CSS reveal animation (duration + per-icon stagger) so icons
    // become clickable right as their fade-in finishes, not noticeably before/after.
    const duration = parseFloat(siteConfig.categoryAnimDuration?.[current] ?? 0.5)
    const stagger = parseFloat(siteConfig.categoryAnimStagger?.[current] ?? 0.08)
    const revealMs = (duration + stagger * Math.max(0, filtered.length - 1)) * 1000
    const timer = setTimeout(() => setAnimDone(true), revealMs)
    return () => clearTimeout(timer)
  }, [current, filtered.length])

  useEffect(() => { setShowAll(false) }, [current])

  useEffect(() => {
    const fetchConfidential = () => {
      fetch('/api/all-config')
        .then(r => r.json())
        .then(d => { setConfidentialProjects(d.confidentialProjects || []) })
        .catch(() => {})
    }
    fetchConfidential()
    document.addEventListener('visibilitychange', fetchConfidential)
    return () => document.removeEventListener('visibilitychange', fetchConfidential)
  }, [])

  useEffect(() => {
    if (current === 'all') { setCatSections(null); return }
    fetch(`/assets/projects/${current}/category-info.json`, { cache: 'no-cache' })
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then(d => setCatSections(translateData(d).sections || []))
      .catch(() => setCatSections([]))
  }, [current])
  useProfolioDoc(current !== 'all' && `/assets/projects/${current}/category-info.json`, d => setCatSections(translateData(d).sections || []))


  const heroItems = filtered

  const visibleProjects = useMemo(() =>
    (isMobile && current === 'all' && !showAll) ? filtered.slice(0, MOBILE_PREVIEW) : filtered
  , [isMobile, current, showAll, filtered])

  const hasMore = isMobile && current === 'all' && !showAll && filtered.length > MOBILE_PREVIEW

  // The All page's card grid; category pages use it too when the icon
  // strip is switched off in Site Structure (otherwise they'd list nothing).
  const grid = (list) => (
    <div
      className={`projects-grid-all${(isMobile ? allMobileCols : allCols) === 1 ? ' projects-grid-all--feed' : ''}${captionSwap ? ' projects-grid-all--caption-swap' : ''}`}
      style={{ gridTemplateColumns: `repeat(${isMobile ? allMobileCols : allCols}, 1fr)` }}
    >
      {list.map(project => {
        const key = `${project.category}/${project.id}`
        const captionDesc = captions[key] ?? (project.tags || []).join(', ')
        const aspectRatio = isMobile ? mobileImageRatio : desktopImageRatio
        const confidential = confidentialProjects.includes(key)
        return hoverStyle !== 'plain'
          ? <CardCaption key={project.id} project={project} titleSize={titleSize} tagSize={tagSize} captionDesc={captionDesc} rightCaption={rightCaptions[key]} aspectRatio={aspectRatio} confidential={confidential} hoverStyle={hoverStyle} />
          : <PlainCard key={project.id} project={project} aspectRatio={aspectRatio} confidential={confidential} />
      })}
    </div>
  )

  return (
    <div className="projects">
      {showCategoryBar && (
        <div className={`filter-bar-fixed filter-bar-desktop${filterHidden ? ' filter-bar-hidden' : ''}`}>
          {categories.map(cat => (
            <Link key={cat} to={cat === 'all' ? '/projects' : `/projects/${cat}`} className={current === cat ? 'filter-item active' : 'filter-item'}>
              {getLabel(cat)}
            </Link>
          ))}
        </div>
      )}
      {showCategoryBar && (
        <div className={`filter-bar-fixed filter-bar-mobile${filterHidden ? ' filter-bar-hidden' : ''}`}>
          <MobileFilterBar current={current} />
        </div>
      )}

      {current === 'all' ? (
        <div className="page-hero"><ImageWithFallback basePath="/assets/projects/hero" alt="projects hero" style={{width:'100%', height:'400px', objectFit:'cover'}} lazy={false} /></div>
      ) : (
        <div className={`projects-category-hero${showProjectIcons ? '' : ' projects-category-hero--no-icons'}`} style={{
          ...(() => {
            const iconSize = resolveTier(tier, siteConfig.categoryIconSize?.[current], siteConfig.categoryIconSizeMobile?.[current], siteConfig.categoryIconSizeTablet?.[current])
            const titleSize = autoPx(resolveTier(tier, siteConfig.categoryHeroTitleSize?.[current], siteConfig.categoryHeroTitleSizeMobile?.[current], siteConfig.categoryHeroTitleSizeTablet?.[current]))
            const heroGap = resolveTier(tier, siteConfig.categoryHeroGap?.[current], siteConfig.categoryHeroGapMobile?.[current], siteConfig.categoryHeroGapTablet?.[current])
            const titleTopGap = resolveTier(tier, siteConfig.categoryTitleTopGap?.[current], siteConfig.categoryTitleTopGapMobile?.[current], siteConfig.categoryTitleTopGapTablet?.[current])
            return {
              ...(iconSize ? { '--icon-size': iconSize } : {}),
              ...(titleSize ? { '--category-title-size': titleSize } : {}),
              ...(heroGap ? { '--category-hero-gap': heroGap } : {}),
              ...(titleTopGap ? { '--category-title-top-gap': titleTopGap } : {}),
            }
          })(),
          ...(siteConfig.categoryAnimDuration?.[current] ? { '--category-anim-duration': `${siteConfig.categoryAnimDuration[current]}s` } : {}),
          ...(siteConfig.categoryAnimStagger?.[current] ? { '--category-anim-stagger': `${siteConfig.categoryAnimStagger[current]}s` } : {}),
        }}>
          <h2>{getLabel(current)}</h2>
          {categoryText && <p className="all-page-desc">{categoryText}</p>}
          {showProjectIcons && <IconCarousel items={heroItems} current={current} animDone={animDone} gap={resolveTier(tier, siteConfig.categoryIconGap?.[current], siteConfig.categoryIconGapMobile?.[current] || siteConfig.iconCarouselMobileGap || '8px', siteConfig.categoryIconGapTablet?.[current])} />}
        </div>
      )}

      {current === 'all' ? (
        <>
        <section className="projects-recent" style={(() => {
          const t = resolveTier(tier, siteConfig.categoryHeroTitleSize?.all, siteConfig.categoryHeroTitleSizeMobile?.all, siteConfig.categoryHeroTitleSizeTablet?.all)
          const g = resolveTier(tier, siteConfig.categoryTitleTopGap?.all, siteConfig.categoryTitleTopGapMobile?.all, siteConfig.categoryTitleTopGapTablet?.all)
          return {
            ...(t ? { '--category-title-size': t } : {}),
            ...(g ? { '--category-title-top-gap': g } : {}),
            ...(siteConfig.allProjectsTitleGap ? { '--category-title-gap': `${siteConfig.allProjectsTitleGap}px` } : {}),
            ...(siteConfig.allProjectsTitleGapMobile ? { '--category-title-gap-mobile': `${siteConfig.allProjectsTitleGapMobile}px` } : {}),
          }
        })()}>
          <h2>{getLabel('all')}</h2>
          {allText && <p className="all-page-desc" style={typo(siteConfig, 'allProjectsText')} dangerouslySetInnerHTML={{ __html: sanitizeInline(allText) }} />}
          {grid(visibleProjects)}
          {hasMore && (
            <button className="projects-show-more" onClick={() => setShowAll(true)}>
              {t('Show more')} ({filtered.length - MOBILE_PREVIEW})
            </button>
          )}
          {showArchiveLink && <Link to="/archive" className="archive-cta">{t('See all work in the Archive')} <span aria-hidden="true">→</span></Link>}
        </section>
        {(siteConfig.allProjectsSections || []).length > 0 && (
          <div className="cat-sections"><CategorySections sections={siteConfig.allProjectsSections} basePath="/assets/projects/all/sections" /></div>
        )}
        </>
      ) : (
        <>
          {!showProjectIcons && <section className="projects-recent projects-category-list">{grid(filtered)}</section>}
          {catSections && catSections.length > 0 && (
            <div className="cat-sections"><CategorySections sections={catSections} basePath={`/assets/projects/${current}/category`} /></div>
          )}
        </>
      )}
    </div>
  )
}
