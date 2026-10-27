import { Link, useNavigate } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
import allOriginals from '../data/originals.json'
import homeData from '../data/home.json'
import { ImageWithFallback } from '../utils/getImage'
import { sanitizeInline } from '../utils/sanitizeInline'
import { useIsMobile, useBreakpointTier } from '../utils/useIsMobile'
import CategorySections from './CategorySections'
import { autoPx } from '../utils/autoPx'
import { typo } from '../utils/typography'
import { minimalAllows } from '../utils/minimal'
import { sectionName } from '../utils/structure'

function rs(ratio) {
  if (!ratio || ratio === 'full') return {}
  return { aspectRatio: ratio, height: 'auto', maxHeight: 'none', minHeight: 0 }
}

// When a card is inset, its image sits inside horizontal padding — but the
// image (or its wrapper) is normally position:absolute + inset:0, sized off
// the OUTER box. Putting aspect-ratio on that outer box (rs() above) computes
// the ratio against the full pre-padding width, so a "16:9" image would
// render squished relative to its actual padded width. Instead, for
// inset + a real ratio (not 'full'), the ratio moves to the INNER image box
// (normal flow, width:100%) and the outer card just wraps it (height:auto);
// for ratio:'full' there's no conflict since the outer already has an
// explicit height (e.g. 100vh) independent of width.
function outerRs(ratio, inset) {
  if (inset && ratio && ratio !== 'full') return { height: 'auto', maxHeight: 'none', minHeight: 0 }
  return rs(ratio)
}
function innerRs(ratio, inset) {
  if (inset && ratio && ratio !== 'full') return { position: 'relative', inset: 'auto', width: '100%', aspectRatio: ratio }
  return {}
}

// Minimal mode can leave Originals out, or the carousel can be hidden by hand
// (Home ▸ Originals on Home); then it doesn't render.
const originals = !minimalAllows('/originals') || homeData.originalsSection?.hidden === true ? []
  : homeData.homeOriginals
  ? homeData.homeOriginals
      .filter(ref => !ref.hidden)
      .map(ref => allOriginals.find(o => o.id === ref.id && o.category === ref.category))
      .filter(Boolean)
  : allOriginals

// A card stays only if minimal mode (when on) keeps the page it links to.
const cardShown = (item) => !item.hidden && minimalAllows(`/${item.linkType || 'projects'}/${item.category}/${item.id}`)

const infiniteOriginals = [...originals, ...originals, ...originals]

export default function Home() {
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const tier = useBreakpointTier()
  const stripExt = (p) => p ? p.replace(/\.(gif|webp|png|jpg|jpeg|svg)$/i, '') : p
  const heroImg = stripExt(homeData.hero.image || '/assets/home/hero')
  const heroImgMobile = stripExt(homeData.hero.mobileImage)
  const heroImgTablet = stripExt(homeData.hero.tabletImage)
  // Tablet falls back to the desktop ratio when no tablet-specific one is set,
  // rather than to mobile's — a tablet screen is much closer to desktop.
  const tierRatio = (tabletVal, mobileVal, desktopVal) =>
    tier === 'mobile' ? mobileVal : tier === 'tablet' ? (tabletVal || desktopVal) : desktopVal
  const heroRatio = tierRatio(homeData.hero.tabletRatio, homeData.hero.mobileRatio || '5/4', homeData.hero.desktopRatio || 'full')
  const featuredRatio = tierRatio(homeData.featuredSection?.tabletRatio, homeData.featuredSection?.mobileRatio || '16/9', homeData.featuredSection?.desktopRatio || '16/9')
  // Grid Cards can be split into multiple independently-configured sections
  // (see Home.jsx render below) instead of one section holding every card,
  // so these are computed per-section rather than once from a single
  // homeData.gridSection.
  const gridRatioFor = (section) => tierRatio(section?.tabletRatio, section?.mobileRatio || '5/4', section?.desktopRatio || '5/4')
  const gridGapFor = (section) => isMobile ? section?.mobileGap : section?.desktopGap
  const heroInset = homeData.hero?.inset
    ? (isMobile ? (homeData.hero?.insetAmountMobile ?? homeData.hero?.insetAmount) : homeData.hero?.insetAmount) || '12%'
    : null
  const featuredInset = homeData.featuredSection?.inset
    ? (isMobile ? (homeData.featuredSection?.insetAmountMobile ?? homeData.featuredSection?.insetAmount) : homeData.featuredSection?.insetAmount) || '12%'
    : null
  const gridInsetFor = (section) => section?.inset
    ? (isMobile ? (section?.insetAmountMobile ?? section?.insetAmount) : section?.insetAmount) || '8%'
    : null
  const originalsInset = homeData.originalsSection?.inset
    ? (isMobile ? (homeData.originalsSection?.insetAmountMobile ?? homeData.originalsSection?.insetAmount) : homeData.originalsSection?.insetAmount) || '8%'
    : null
  // Each slide keeps the same 16:9 (or whatever desktopRatio is set to)
  // shape regardless of how many are showing — going narrower at 45%
  // flex-basis just makes it shorter too, same ratio.
  const slideRatio = isMobile ? (homeData.originalsSection?.mobileRatio || '5/4') : (homeData.originalsSection?.desktopRatio || '16/9')
  const [mountTime] = useState(() => Date.now())
  const [current, setCurrent] = useState(originals.length)
  const [isTransitioning, setIsTransitioning] = useState(true)
  const [showScrollHint, setShowScrollHint] = useState(false)
  const dragStartX = useRef(null)
  const isDragging = useRef(false)
  const originalsBannerRef = useRef(null)
  const originalsSlideRef = useRef(null)
  const [bannerWidth, setBannerWidth] = useState(0)
  const [slideWidth, setSlideWidth] = useState(0)

  // The carousel's slide-to-slide gap is a fixed 10px (same rhythm as the
  // Featured/Grid cards' own 10px spacing), but slides themselves are sized
  // in %, so the track's translateX — expressed as a %, resolved against the
  // track's own width — can't just add a flat px gap on top; we need that
  // 10px re-expressed as a % of one slide's actual rendered width, which
  // changes with viewport. Measuring it directly (rather than assuming a
  // fixed vw-based gap that scales in lockstep with slide width, as before)
  // keeps this accurate at every viewport width, not just the one it was
  // tuned against.
  //
  // Slide width is measured the same way (ResizeObserver on the actual
  // rendered box), rather than assumed from a window.matchMedia breakpoint
  // mirroring the CSS's own `@media (min-width: 1440px)` switch — those two
  // independent listeners could momentarily disagree right after a big/fast
  // window resize (CSS reflows immediately; the matchMedia 'change' handler
  // fires a render on its own schedule), leaving the translateX math built
  // for one slide width while the boxes had already reflowed to the other,
  // which is what produced the huge dead gap/misaligned slide on a sudden
  // resize. Deriving everything from one measurement keeps them in lockstep.
  useEffect(() => {
    const bannerEl = originalsBannerRef.current
    const slideEl = originalsSlideRef.current
    if (!bannerEl || !slideEl) return
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        if (entry.target === bannerEl) setBannerWidth(entry.contentRect.width)
        else if (entry.target === slideEl) setSlideWidth(entry.contentRect.width)
      }
    })
    ro.observe(bannerEl)
    ro.observe(slideEl)
    return () => ro.disconnect()
  }, [])
  // The fraction of the banner's width one slide actually renders at (90%
  // normally, 45% past the CSS's own 1440px breakpoint) — read back from the
  // real boxes instead of re-deriving it from a viewport breakpoint, so it's
  // never out of sync with what's actually on screen.
  const slideFraction = bannerWidth > 0 && slideWidth > 0 ? (slideWidth / bannerWidth) * 100 : 90
  const isWideCarousel = slideFraction < 70

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrent(prev => prev + 1)
      setIsTransitioning(true)
    }, (homeData.originalsSection?.rotationInterval ?? 4) * 1000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (current >= originals.length * 2) {
      setTimeout(() => { setIsTransitioning(false); setCurrent(originals.length) }, 600)
    }
    if (current < originals.length) {
      setTimeout(() => { setIsTransitioning(false); setCurrent(originals.length * 2 - 1) }, 600)
    }
  }, [current])

  useEffect(() => {
    const timer = setTimeout(() => { if (window.scrollY === 0) setShowScrollHint(true) }, (homeData.hero.scrollHintDelay ?? 5) * 1000)
    const onScroll = () => { if (window.scrollY > 0) setShowScrollHint(false) }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => { clearTimeout(timer); window.removeEventListener('scroll', onScroll) }
  }, [])

  const handleDragStart = (e) => {
    dragStartX.current = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX
    isDragging.current = true
  }

  const handleDragEnd = (e) => {
    if (!isDragging.current) return
    const endX = e.type === 'touchend' ? e.changedTouches[0].clientX : e.clientX
    const diff = dragStartX.current - endX
    if (Math.abs(diff) < 5) {
      const item = infiniteOriginals[current]
      if (item) navigate(`/originals/${item.category}/${item.id}`)
    }
    if (diff > 50) { setCurrent(prev => prev + 1); setIsTransitioning(true) }
    if (diff < -50) { setCurrent(prev => prev - 1); setIsTransitioning(true) }
    isDragging.current = false
  }

  const realIndex = ((current - originals.length) % originals.length + originals.length) % originals.length
  // 10px gap re-expressed as a % of one slide's actual measured width — the
  // dominant term (slideFraction, 90 or 45) stays a plain constant mirroring
  // the CSS breakpoint rather than something computed purely from
  // measurement, so the very first paint (before the ResizeObserver's first
  // callback lands) is already correct instead of collapsing toward 0.
  const gapPercentOfSlide = slideWidth > 0 ? (10 / slideWidth) * 100 : 1.6 * 100 / slideFraction
  const offsetPercent = current * (slideFraction + gapPercentOfSlide) - 5

  return (
    <div className="home">
      <section className={`home-hero${heroInset ? ' home-hero--inset' : ''}`} style={{
        ...outerRs(heroRatio, heroInset),
        ...(heroInset ? { padding: `0 ${heroInset}`, background: homeData.hero?.bgColor || '#f5f5f7', boxShadow: `0 0 0 100vmax ${homeData.hero?.bgColor || '#f5f5f7'}`, clipPath: 'inset(-1px -100vmax)' } : {}),
      }}>
        <div className="home-hero-bg" style={innerRs(heroRatio, heroInset)}>
          <ImageWithFallback
            basePath={heroImg} mobileBasePath={heroImgMobile} tabletBasePath={heroImgTablet}
            nativeSize={homeData.hero?.nativeSize} hideOnMobile={homeData.hero?.hideOnMobile}
            alt="hero" style={{width:'100%', height:'100%', objectFit:'cover'}} cacheBust={mountTime} lazy={false}
          />
        </div>
        {!isMobile && (
          <div className={`hero-scroll-hint${showScrollHint ? ' visible' : ''}`}>
            <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>
        )}
      </section>

      {homeData.featured.filter(cardShown).map((item) => (
        <Link key={item.id} to={`/${item.linkType || 'projects'}/${item.category}/${item.id}`} className={`home-full-card${featuredInset ? ' home-full-card--inset' : ''}`} style={{
          ...outerRs(featuredRatio, featuredInset),
          ...(featuredInset ? (() => { const c = item.bgColor || homeData.featuredSection?.bgColor || '#f5f5f7'; return { padding: `0 ${featuredInset}`, background: c, boxShadow: `0 0 0 100vmax ${c}`, clipPath: 'inset(-1px -100vmax)' } })() : {}),
        }}>
          <div className="home-full-card-bg" style={innerRs(featuredRatio, featuredInset)}>
            <ImageWithFallback
              basePath={item.image} mobileBasePath={item.mobileImage} tabletBasePath={item.tabletImage}
              nativeSize={item.nativeSize} hideOnMobile={item.hideOnMobile}
              alt={item.id} style={{width:'100%', height:'100%', objectFit:'cover'}}
            />
          </div>
          <div className="home-full-card-overlay" style={item.logoGap != null ? { gap: autoPx(item.logoGap) } : undefined}>
            <img src={item.logo} alt={item.id} className="home-full-card-svg" style={(() => {
              const h = isMobile ? (item.logoHeightMobile || item.logoHeight) : item.logoHeight
              return h ? { height: h, maxWidth: 'none' } : undefined
            })()} onError={(e) => e.target.style.display='none'} />
            <p className="home-full-card-tagline" style={{
              ...(item.taglineSize ? {fontSize: autoPx(item.taglineSize)} : {}),
              ...(item.taglineWeight ? {fontWeight: item.taglineWeight} : {}),
              ...(item.taglineColor ? {color: item.taglineColor} : {}),
              ...(item.taglineFont && item.taglineFont !== 'inherit' ? {fontFamily: item.taglineFont} : {}), ...typo(item, 'tagline'),
              ...(() => {
                const top = isMobile ? (item.taglineTopMobile ?? item.taglineTop) : item.taglineTop
                if (top == null || top === '') return {}
                return { position: 'absolute', top, left: 0, right: 0, textAlign: 'center' }
              })(),
            }} dangerouslySetInnerHTML={{__html: sanitizeInline(item.tagline || '')}} />
          </div>
        </Link>
      ))}

      {(homeData.gridSections || []).map((section, si) => {
        if (section.hidden === true) return null
        const items = (section.items || []).filter(cardShown)
        if (items.length === 0) return null
        const gridRatio = gridRatioFor(section)
        const gridGap = gridGapFor(section)
        const gridInset = gridInsetFor(section)
        return (
          <div key={si} className="home-grid" style={gridGap !== undefined && gridGap !== '' ? { gap: autoPx(gridGap) } : {}}>
            {items.map(project => (
              <Link key={project.id} to={`/${project.linkType || 'projects'}/${project.category}/${project.id}`} className={`home-grid-card${gridInset ? ' home-grid-card--inset' : ''}`} style={{
                ...outerRs(gridRatio, gridInset),
                ...(gridInset ? { padding: `0 ${gridInset}`, background: project.bgColor || section.bgColor || '#f5f5f7' } : {}),
              }}>
                <ImageWithFallback
                  basePath={project.image} mobileBasePath={project.mobileImage} tabletBasePath={project.tabletImage}
                  nativeSize={project.nativeSize} hideOnMobile={project.hideOnMobile}
                  alt={project.title} style={{width:'100%', height:'100%', objectFit:'cover', position:'absolute', inset:0, ...innerRs(gridRatio, gridInset)}}
                />
                <div className="home-grid-card-overlay">
                  {project.logo && <img src={project.logo} alt={project.title} className="home-full-card-svg" onError={(e) => e.target.style.display='none'} />}
                  <p className="home-full-card-tagline" style={{
                    ...(project.taglineSize ? {fontSize: autoPx(project.taglineSize)} : {}),
                    ...(project.taglineWeight ? {fontWeight: project.taglineWeight} : {}),
                    ...(project.taglineColor ? {color: project.taglineColor} : {}),
                    ...(project.taglineFont && project.taglineFont !== 'inherit' ? {fontFamily: project.taglineFont} : {}), ...typo(project, 'tagline'),
                  }} dangerouslySetInnerHTML={{__html: sanitizeInline(project.tagline || '')}} />
                </div>
              </Link>
            ))}
          </div>
        )
      })}

      {originals.length > 0 && (
      <section className={`home-originals${originalsInset ? ' home-originals--inset' : ''}`} style={{
        ...((isMobile ? (homeData.originalsSection?.gapBeforeMobile ?? homeData.originalsSection?.gapBefore) : homeData.originalsSection?.gapBefore) != null
          ? { paddingTop: autoPx(isMobile ? (homeData.originalsSection?.gapBeforeMobile ?? homeData.originalsSection?.gapBefore) : homeData.originalsSection?.gapBefore) }
          : {}),
        ...((isMobile ? (homeData.originalsSection?.gapAfterMobile ?? homeData.originalsSection?.gapAfter) : homeData.originalsSection?.gapAfter) != null
          ? { paddingBottom: autoPx(isMobile ? (homeData.originalsSection?.gapAfterMobile ?? homeData.originalsSection?.gapAfter) : homeData.originalsSection?.gapAfter) }
          : {}),
        ...(originalsInset ? (() => { const c = homeData.originalsSection?.bgColor || '#f5f5f7'; return { paddingLeft: originalsInset, paddingRight: originalsInset, background: c, boxShadow: `0 0 0 100vmax ${c}`, clipPath: 'inset(-1px -100vmax)', boxSizing: 'border-box' } })() : {}),
      }}>
        {homeData.originalsSection?.showTitle !== false && (
          <h2 style={{
            ...(homeData.originalsSection?.titleSize ? {fontSize: autoPx(homeData.originalsSection.titleSize)} : {}),
            ...(homeData.originalsSection?.titleWeight ? {fontWeight: homeData.originalsSection.titleWeight} : {}),
            ...(homeData.originalsSection?.titleColor ? {color: homeData.originalsSection.titleColor} : {}),
            ...(homeData.originalsSection?.titleFont && homeData.originalsSection.titleFont !== 'inherit' ? {fontFamily: homeData.originalsSection.titleFont} : {}),
            ...typo(homeData.originalsSection, 'title'),
          }}>{homeData.originalsSection?.titleText || sectionName('originals')}</h2>
        )}
        {homeData.originalsSection?.showDesc && homeData.originalsSection?.description && (
          <p className="home-originals-desc" style={{
            ...(homeData.originalsSection?.descSize ? {fontSize: autoPx(homeData.originalsSection.descSize)} : {}),
            ...(homeData.originalsSection?.descWeight ? {fontWeight: homeData.originalsSection.descWeight} : {}),
            ...(homeData.originalsSection?.descColor ? {color: homeData.originalsSection.descColor} : {}),
            ...(homeData.originalsSection?.descFont && homeData.originalsSection.descFont !== 'inherit' ? {fontFamily: homeData.originalsSection.descFont} : {}),
            ...typo(homeData.originalsSection, 'desc'),
          }} dangerouslySetInnerHTML={{__html: sanitizeInline(homeData.originalsSection.description)}} />
        )}
        <div className="home-originals-banner" ref={originalsBannerRef} onMouseDown={handleDragStart} onMouseUp={handleDragEnd} onTouchStart={handleDragStart} onTouchEnd={handleDragEnd}>
          <div className="home-originals-track" style={{transform: `translateX(-${offsetPercent}%)`, transition: isTransitioning ? 'transform 0.6s ease' : 'none'}}>
            {infiniteOriginals.map((item, index) => (
              <div key={index} ref={index === 0 ? originalsSlideRef : undefined} className={`home-originals-slide ${(index === current || (isWideCarousel && index === current + 1)) ? 'active' : ''}`} style={{aspectRatio: slideRatio}}>
                <ImageWithFallback basePath={item.homeThumbnail} alt={item.title} style={{width:'100%', height:'100%', objectFit:'cover'}} />
              </div>
            ))}
          </div>
        </div>
        {homeData.originalsSection?.showDots === true && (
          <div className="home-originals-dots">
            {originals.map((_, index) => (
              <button key={index} className={`home-originals-dot ${index === realIndex ? 'active' : ''}`} onClick={() => { setCurrent(originals.length + index); setIsTransitioning(true) }} />
            ))}
          </div>
        )}
      </section>
      )}

      {(homeData.sections || []).length > 0 && (
        <div className="cat-sections"><CategorySections sections={homeData.sections} basePath="/assets/home/sections" tabletImageMode={homeData.tabletImageMode} /></div>
      )}
    </div>
  )
}
