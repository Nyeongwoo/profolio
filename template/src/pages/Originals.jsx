import { useParams, Link, useNavigate } from 'react-router-dom'
import { useState, useEffect, useRef, useMemo } from 'react'
import originals from '../data/originals.json'
import siteConfig from '../data/siteConfig.json'
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

const hiddenCategories = siteConfig.hiddenOriginalCategories || []
const derivedCats = [...new Set(originals.map(o => o.category))].filter(c => !hiddenCategories.includes(c))
const customOrder = siteConfig.originalCategoryOrder || []
const orderedCats = customOrder.length
  ? [...customOrder.filter(c => derivedCats.includes(c)), ...derivedCats.filter(c => !customOrder.includes(c))]
  : derivedCats
const categories = ['all', ...orderedCats]

const configLabels = siteConfig.originalCategoryLabels || {}
const getLabel = (cat) => t(cat === 'all' ? (configLabels.all || 'All') : (configLabels[cat] || (cat === 'ip' ? 'IP' : cat.charAt(0).toUpperCase() + cat.slice(1))))
const captions = siteConfig.allOriginalsCaptions || {}
const rightCaptions = siteConfig.allOriginalsRightCaptions || {}
const captionSwap = !!siteConfig.allOriginalsCaptionSwap
const desktopImageRatio = siteConfig.allOriginalsImageRatio || '16/9'
// Phones: their own ratio when set, else the same as on larger screens.
const mobileImageRatio = siteConfig.allOriginalsMobileImageRatio || desktopImageRatio
// See Projects.jsx for the meaning of each value; falls back to the legacy allOriginalsCaptionEnabled boolean when unset.
const hoverStyle = siteConfig.allOriginalsHoverStyle || (siteConfig.allOriginalsCaptionEnabled === false ? 'plain' : 'overlay')

function useHoverCaption() {
  const [hovered, setHovered] = useState(false)
  const isMobile = useIsMobile()
  const visible = isMobile || hovered
  return { visible, onMouseEnter: () => setHovered(true), onMouseLeave: () => setHovered(false) }
}

function PlainOriginalCard({ item, aspectRatio }) {
  const [revealRef, revealed] = useRevealOnScroll()
  return (
    <Link ref={revealRef} to={`/originals/${item.category}/${item.id}`} className={`project-card${revealed ? ' revealed' : ''}`} style={{ aspectRatio }}>
      <ImageWithFallback basePath={`/assets/originals/all-thumbnails/${item.category}-${item.id}`} alt={item.title} withHover style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '8px' }} />
    </Link>
  )
}

function OriginalCard({ item, titleSize, tagSize, captionDesc, rightCaption, aspectRatio, hoverStyle: style }) {
  const { visible, onMouseEnter, onMouseLeave } = useHoverCaption()
  const [revealRef, revealed] = useRevealOnScroll()
  const isZoom = style === 'zoom'
  return (
    <Link
      ref={revealRef}
      to={`/originals/${item.category}/${item.id}`}
      className={`project-card${isZoom ? ' project-card--zoom' : ''}${revealed ? ' revealed' : ''}`}
      style={{ aspectRatio }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <ImageWithFallback
        basePath={`/assets/originals/all-thumbnails/${item.category}-${item.id}`}
        alt={item.title}
        withHover
        style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '8px' }}
      />
      {!isZoom && <div className="project-card-gradient" style={{ opacity: visible ? 1 : 0 }} />}
      {item.year && <span className="project-card-year-label" style={{ opacity: visible ? 1 : 0 }}>{item.year}</span>}
      <div className="project-card-caption">
        <p className="project-card-overlay-title" style={titleSize ? {fontSize:titleSize} : {}}>{item.title}</p>
        {captionDesc && <p className="project-card-overlay-desc" style={{ ...(tagSize ? {fontSize:tagSize} : {}), maxHeight: visible ? '3em' : '0', opacity: visible ? 1 : 0 }}>{captionDesc}</p>}
      </div>
      {rightCaption && <span className="project-card-caption-right" style={{ ...(tagSize ? {fontSize:tagSize} : {}), opacity: visible ? 1 : 0 }}>{rightCaption}</span>}
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
        {items.map((item, i) => (
          <Link
            key={item.id}
            to={`/originals/${item.category}/${item.id}`}
            className={`projects-category-icon-item${animDone ? ' anim-done' : ''}`}
            style={{ '--i': i }}
            onClick={e => { if (didDrag.current) { e.preventDefault(); didDrag.current = false } }}
          >
            <ImageWithFallback
              basePath={`/assets/originals/icon-thumbnails/${item.category}-${item.id}`}
              alt={item.title}
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              withHover
            />
            <span>{item.title}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}

function MobileFilterBar({ current, categories, basePath }) {
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
    navigate(cat === 'all' ? basePath : `${basePath}/${cat}`)
  }

  return (
    <div className="mobile-filter-bar" ref={ref}>
      <button className="mobile-filter-trigger" onClick={() => setOpen(o => !o)}>
        <span className="mobile-filter-label">
          <span className="mobile-filter-parent">{sectionName('originals')}</span>
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

export default function Originals() {
  const { category } = useParams()
  const current = category || 'all'
  const hiddenList = siteConfig.hiddenOriginals || []
  const hiddenInAll = siteConfig.hiddenInAllOriginals || []
  const allCols = parseInt(siteConfig.allOriginalsLayout || '3')
  const allMobileCols = parseInt(siteConfig.allOriginalsMobileLayout || '1')
  const allText = siteConfig.allOriginalsText || ''
  const categoryText = (siteConfig.originalsCategoryText || {})[current] || ''
  const titleSize = autoPx(siteConfig.allOriginalsTitleSize) || ''
  const tagSize = autoPx(siteConfig.allOriginalsTagSize) || ''
  const [animDone, setAnimDone] = useState(false)
  const isMobile = useIsMobile()
  const tier = useBreakpointTier()
  const filterHidden = useScrollHidden()
  const [catSections, setCatSections] = useState(null)
  const [showAll, setShowAll] = useState(false)

  const filtered = useMemo(() => (
    current === 'all'
      ? originals.filter(o => !hiddenCategories.includes(o.category) && !hiddenList.includes(`${o.category}/${o.id}`) && !hiddenInAll.includes(`${o.category}/${o.id}`))
      : originals.filter(o => o.category === current && !hiddenList.includes(`${o.category}/${o.id}`))
  ).slice().sort((a, b) => (b.year || 0) - (a.year || 0)), [current])

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

  const visibleOriginals = useMemo(() =>
    (isMobile && current === 'all' && !showAll) ? filtered.slice(0, MOBILE_PREVIEW) : filtered
  , [isMobile, current, showAll, filtered])

  const hasMore = isMobile && current === 'all' && !showAll && filtered.length > MOBILE_PREVIEW

  useEffect(() => {
    if (current === 'all') { setCatSections(null); return }
    fetch(`/assets/originals/${current}/category-info.json`, { cache: 'no-cache' })
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then(d => setCatSections(translateData(d).sections || []))
      .catch(() => setCatSections([]))
  }, [current])
  useProfolioDoc(current !== 'all' && `/assets/originals/${current}/category-info.json`, d => setCatSections(translateData(d).sections || []))

  // The All page's card grid; category pages use it too when the icon
  // strip is switched off in Site Structure (otherwise they'd list nothing).
  const grid = (list) => (
    <div className={`projects-grid-all${(isMobile ? allMobileCols : allCols) === 1 ? ' projects-grid-all--feed' : ''}${captionSwap ? ' projects-grid-all--caption-swap' : ''}`} style={{ gridTemplateColumns: `repeat(${isMobile ? allMobileCols : allCols}, 1fr)` }}>
      {list.map(item => {
        const key = `${item.category}/${item.id}`
        const captionDesc = captions[key] ?? (item.tags || []).join(', ')
        const aspectRatio = isMobile ? mobileImageRatio : desktopImageRatio
        return hoverStyle !== 'plain'
          ? <OriginalCard key={item.id} item={item} titleSize={titleSize} tagSize={tagSize} captionDesc={captionDesc} rightCaption={rightCaptions[key]} aspectRatio={aspectRatio} hoverStyle={hoverStyle} />
          : <PlainOriginalCard key={item.id} item={item} aspectRatio={aspectRatio} />
      })}
    </div>
  )

  return (
    <div className="originals">
      {showCategoryBar && (
        <div className={`filter-bar-fixed filter-bar-desktop${filterHidden ? ' filter-bar-hidden' : ''}`}>
          {categories.map(cat => (
            <Link key={cat} to={cat === 'all' ? '/originals' : `/originals/${cat}`} className={current === cat ? 'filter-item active' : 'filter-item'}>
              {getLabel(cat)}
            </Link>
          ))}
        </div>
      )}
      {showCategoryBar && (
        <div className={`filter-bar-fixed filter-bar-mobile${filterHidden ? ' filter-bar-hidden' : ''}`}>
          <MobileFilterBar current={current} categories={categories} basePath="/originals" />
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
            ...(siteConfig.allOriginalsTitleGap ? { '--category-title-gap': `${siteConfig.allOriginalsTitleGap}px` } : {}),
            ...(siteConfig.allOriginalsTitleGapMobile ? { '--category-title-gap-mobile': `${siteConfig.allOriginalsTitleGapMobile}px` } : {}),
          }
        })()}>
          <h2>{getLabel('all')}</h2>
          {allText && <p className="all-page-desc" style={typo(siteConfig, 'allOriginalsText')} dangerouslySetInnerHTML={{ __html: sanitizeInline(allText) }} />}
          {grid(visibleOriginals)}
          {hasMore && (
            <button className="projects-show-more" onClick={() => setShowAll(true)}>
              {t('Show more')} ({filtered.length - MOBILE_PREVIEW})
            </button>
          )}
        </section>
        {(siteConfig.allOriginalsSections || []).length > 0 && (
          <div className="cat-sections"><CategorySections sections={siteConfig.allOriginalsSections} basePath="/assets/originals/all/sections" /></div>
        )}
        </>
      ) : (
        <>
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
            {showProjectIcons && <IconCarousel items={filtered} current={current} animDone={animDone} gap={resolveTier(tier, siteConfig.categoryIconGap?.[current], siteConfig.categoryIconGapMobile?.[current] || siteConfig.iconCarouselMobileGap || '8px', siteConfig.categoryIconGapTablet?.[current])} />}
          </div>
          {!showProjectIcons && <section className="projects-recent projects-category-list">{grid(filtered)}</section>}
          {catSections && catSections.length > 0 && (
            <div className="cat-sections"><CategorySections sections={catSections} basePath={`/assets/originals/${current}/category`} /></div>
          )}
        </>
      )}
    </div>
  )
}
