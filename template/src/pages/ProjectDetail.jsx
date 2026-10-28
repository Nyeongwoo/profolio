// Detail page: renders project sections (text, images, image-text, carousel, etc.)
import { useParams, Link, useNavigate, useLocation } from 'react-router-dom'
import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import projects from '../data/projects'
import siteConfig from '../data/siteConfig.json'
import { minimalProjectShown } from '../utils/minimal'
import { ImageWithFallback, PLACEHOLDER_IMG } from '../utils/getImage'
import ChevronIcon from '../components/ChevronIcon'
import { useScrollReveal } from '../utils/useScrollReveal'
import { sanitizeInline } from '../utils/sanitizeInline'
import { cropStyle } from '../utils/cropStyle'
import ScrollAnimationSection from '../components/ScrollAnimationSection'
import LabEmbed from '../components/LabEmbed'
import { useIsMobile, useBreakpointTier, useWindowWidth } from '../utils/useIsMobile'
import { autoPx } from '../utils/autoPx'
import { typo } from '../utils/typography'
import { extractYoutubeId } from '../utils/youtube'
import { getMaintenanceGate } from '../components/SiteMaintenance'
import { translateData, t } from '../i18n'
import { useProfolioDoc, IS_POFOLE } from '../utils/pofoleLive'
import { structureFlag, otherName } from '../utils/structure'

// The labels of a project page's details: siteConfig.projectMetaLabels
// ({ team, duration, role }) when set (an event's Organizer, Date, Venue),
// else the usual ones.
const metaLabel = (key, fallback) => siteConfig.projectMetaLabels?.[key] || t(fallback)

const HOVER_EXTS = ['gif', 'webp', 'png', 'jpg', 'jpeg', 'svg']

const toMaxWidth = (v) => {
  if (!v) return undefined
  return /^\d+(\.\d+)?$/.test(String(v)) ? `${v}px` : String(v)
}

// A desktop image number can be paired with ANY mobile-folder image number
// via an explicit { desktopNum: mobileNum } map (set in the editor's Mobile
// Override picker). Also reads the older "same-number" array format so
// existing content keeps working.
const mobileMap = (v) => {
  if (!v) return {}
  if (Array.isArray(v)) return Object.fromEntries(v.map(n => [n, n]))
  return v
}

const sectionBgStyle = (section, category, projectId, mobile = false) => {
  const style = {}
  if (section.bgColor) {
    if (/gradient\(/.test(section.bgColor)) style.backgroundImage = section.bgColor
    else {
      style.backgroundColor = section.bgColor
      // Bleeds the color past body's max-width:1920px cap to the true
      // viewport edge, since the box itself stays capped for padding/content.
      style.boxShadow = `0 0 0 100vmax ${section.bgColor}`
      style.clipPath = 'inset(-1px -100vmax)'
    }
  }
  if (section.bgImage) {
    const src = section.bgImage.startsWith('/') ? section.bgImage : `/assets/projects/${category}/${projectId}/${section.bgImage}`
    style.backgroundImage = `url(${src})`
    style.backgroundSize = 'cover'
    style.backgroundPosition = 'center'
  }
  const noVPad = (mobile && section.noPaddingMobile) || (!mobile && section.noPaddingDesktop)
  if (noVPad) {
    style.paddingTop = 0
    style.paddingBottom = 0
  } else {
    if (section.paddingTop    != null) style.paddingTop    = autoPx(section.paddingTop)
    if (section.paddingBottom != null) style.paddingBottom = autoPx(section.paddingBottom)
  }
  return style
}

const txtStyle = (obj) => ({ textAlign: obj.textAlign || 'left' })
const fw = (obj, field) => obj[`${field}Weight`] || ((obj[`${field}Bold`] ?? obj.textBold) ? '700' : undefined)
const ff = (obj, field) => obj[`${field}Font`] || obj[`${field}FontFamily`] || obj.fontFamily || 'inherit'
const fc = (obj, field) => obj[`${field}Color`] || undefined
const fi = (obj, field) => obj[`${field}Italic`] ? 'italic' : undefined

function renderLines(lines, isMobile, textAlign, tier) {
  const effTier = tier || (isMobile ? 'mobile' : 'desktop')
  const items = lines.map((line, i) => {
    const isBodyKind = line.kind !== 'title' && line.kind !== 'subtitle' && line.kind !== 'spacer'
    const resolvedFs = (() => {
      // Body copy has a fixed 17/15/14px (desktop/tablet/mobile) default so
      // every text section reads consistently even when no size was ever
      // set — titles/subtitles are still author-sized per block on purpose,
      // so they fall through to CSS (undefined) when left blank.
      const base = autoPx(line.size) || (isBodyKind ? '17px' : undefined)
      if (!base) return undefined
      if (effTier === 'mobile') {
        if (line.mobileSize === 'inherit') return undefined
        if (line.mobileSize) return autoPx(line.mobileSize)
        if (isBodyKind) return '14px'
        return autoPx(line.tabletSize) || base
      }
      if (effTier === 'tablet') {
        if (line.tabletSize) return autoPx(line.tabletSize)
        if (isBodyKind) return '15px'
        return base
      }
      return base
    })()
    const effAlign = line.textAlign || textAlign
    const ls = {
      margin: 0,
      ...(resolvedFs ? { fontSize: resolvedFs } : {}),
      ...(line.weight ? { fontWeight: line.weight } : (isBodyKind ? { fontWeight: '500' } : {})),
      ...(line.color  ? { color:      line.color  } : (isBodyKind ? { color: '#86868D' } : {})),
      ...(line.font && line.font !== 'inherit' ? { fontFamily: line.font } : {}),
      ...(line.italic ? { fontStyle: 'italic' } : {}),
      ...(line.lineHeight ? { lineHeight: line.lineHeight } : (isBodyKind ? { lineHeight: 1.45 } : {})),
      ...(line.letterSpacing ? { letterSpacing: line.letterSpacing } : {}),
      ...(line.maxWidth ? { maxWidth: autoPx(line.maxWidth), ...(effAlign === 'center' ? { marginLeft: 'auto', marginRight: 'auto' } : effAlign === 'right' ? { marginLeft: 'auto' } : {}) } : {}),
      ...(line.gapAfter !== undefined ? { marginBottom: autoPx(line.gapAfter) } : {}),
      ...(line.textAlign ? { textAlign: line.textAlign } : {}),
    }
    const html = { __html: sanitizeInline(line.text) }
    if (line.kind === 'spacer')   return <div key={i} style={{ height: autoPx(line.size) || '32px' }} />
    if (line.kind === 'title')    return <h2 key={i} style={ls} dangerouslySetInnerHTML={html} />
    if (line.kind === 'subtitle') return <h4 key={i} style={ls} dangerouslySetInnerHTML={html} />
    if (line.kind === 'row') {
      const cols = (line.text || '').split('|').map(t => t.trim()).filter(Boolean)
      return (
        <div key={i} className="detail-line-row" style={ls}>
          {cols.map((t, ci) => <span key={ci} dangerouslySetInnerHTML={{ __html: sanitizeInline(t) }} />)}
        </div>
      )
    }
    return <p key={i} style={ls} dangerouslySetInnerHTML={html} />
  })
  return <div style={{ display: 'flex', flexDirection: 'column', textAlign: textAlign || 'inherit' }}>{items}</div>
}

// Click-to-play YouTube embed: shows a poster (custom thumbnail, falling back
// to YouTube's own) with a play button until clicked, then swaps in the real
// iframe — avoids loading YouTube's player (and firing its own autoplay/ads)
// for every visitor who never actually plays the video.
function YoutubeEmbed({ videoId, thumbnail }) {
  const [playing, setPlaying] = useState(false)
  const vid = extractYoutubeId(videoId)
  if (!vid) return null

  if (playing) {
    return (
      <iframe
        className="detail-youtube-iframe"
        src={`https://www.youtube.com/embed/${vid}?autoplay=1`}
        title="YouTube video"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    )
  }

  return (
    <button type="button" className="detail-youtube-thumb" onClick={() => setPlaying(true)} aria-label={t('Play video')}>
      {thumbnail
        ? <ImageWithFallback basePath={thumbnail} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', inset: 0 }} />
        : <img src={`https://i.ytimg.com/vi/${vid}/maxresdefault.jpg`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', inset: 0 }} />}
      <span className="detail-youtube-play">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z" /></svg>
      </span>
    </button>
  )
}

function HoverImage({ baseSrc, hoverSrc, isHoverable, alt, ratio, crop, rounded = true }) {
  const [hovered, setHovered] = useState(false)
  const [hoverReady, setHoverReady] = useState(false)
  const [hoverExtIdx, setHoverExtIdx] = useState(0)

  const showHover = hovered && hoverReady
  const radius = rounded ? '12px' : '0'

  // When new-format crop has imgRatio, derive the true display ratio from the crop region
  let displayRatio = ratio
  if (crop && crop.x1 !== undefined && crop.imgRatio) {
    displayRatio = String(Math.round(crop.imgRatio * (crop.x2 - crop.x1) / (crop.y2 - crop.y1) * 10000) / 10000)
  }

  return (
    <div
      className="detail-hover-img"
      style={{ ...(displayRatio ? { aspectRatio: displayRatio } : null), borderRadius: radius }}
      onMouseEnter={() => isHoverable && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <ImageWithFallback basePath={baseSrc} alt={alt} style={{width:'100%', height:'100%', objectFit:'cover', borderRadius: radius, position:'absolute', inset:0, transition:'opacity 0.5s ease', opacity: showHover ? 0 : 1, ...cropStyle(crop)}} />
      {isHoverable && (
        <img
          src={`${hoverSrc}.${HOVER_EXTS[hoverExtIdx]}`}
          alt=""
          style={{width:'100%', height:'100%', objectFit:'cover', borderRadius: radius, position:'absolute', inset:0, transition:'opacity 0.5s ease', opacity: showHover ? 1 : 0, pointerEvents:'none'}}
          onLoad={() => setHoverReady(true)}
          onError={() => { if (hoverExtIdx + 1 < HOVER_EXTS.length) setHoverExtIdx(i => i + 1) }}
        />
      )}
    </div>
  )
}

function AnnotatedImage({ baseSrc, hoverSrc, isHoverable, alt, annotations, ratio, iconsBase }) {
  const [hovered, setHovered] = useState(false)
  const [hoverReady, setHoverReady] = useState(false)
  const [hoverExtIdx, setHoverExtIdx] = useState(0)
  const [activeIdx, setActiveIdx] = useState(null)
  const showHover = hovered && hoverReady
  const wrapRef = useRef(null)
  const [size, setSize] = useState({ w: 0, h: 0 })

  useEffect(() => {
    const update = () => {
      if (wrapRef.current) {
        const r = wrapRef.current.getBoundingClientRect()
        setSize({ w: r.width, h: r.height })
      }
    }
    update()
    const ro = new ResizeObserver(update)
    if (wrapRef.current) ro.observe(wrapRef.current)
    return () => ro.disconnect()
  }, [])

  const px = (pct, total) => (pct / 100) * total

  const isActive = (ann, i) => {
    const mode = ann.hoverMode || 'hover'
    if (mode === 'always-on') return true
    if (mode === 'always-off') return false
    return activeIdx === i
  }

  return (
    <div
      ref={wrapRef}
      className="annotated-img-wrap"
      style={ratio ? { aspectRatio: ratio } : undefined}
      onMouseEnter={() => isHoverable && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <ImageWithFallback basePath={baseSrc} alt={alt} style={{width:'100%', height:'100%', objectFit:'cover', position:'absolute', inset:0, transition:'opacity 0.5s ease', opacity: showHover ? 0 : 1}} />
      {isHoverable && (
        <img
          src={`${hoverSrc}.${HOVER_EXTS[hoverExtIdx]}`}
          alt=""
          style={{width:'100%', height:'100%', objectFit:'cover', position:'absolute', inset:0, transition:'opacity 0.5s ease', opacity: showHover ? 1 : 0, pointerEvents:'none'}}
          onLoad={() => setHoverReady(true)}
          onError={() => { if (hoverExtIdx + 1 < HOVER_EXTS.length) setHoverExtIdx(i => i + 1) }}
        />
      )}

      {size.w > 0 && (annotations || []).map((ann, i) => {
        const x1 = px(ann.x, size.w)
        const y1 = px(ann.y, size.h)
        const x2 = px(ann.lineX, size.w)
        const y2 = px(ann.lineY, size.h)
        const hasMid = ann.midX != null
        const hasBend = !hasMid && ann.bendX !== undefined && ann.bendX !== null
        const bx = hasBend ? px(ann.bendX, size.w) : null
        const mx = hasMid ? px(ann.midX, size.w) : null
        const my = hasMid ? px(ann.midY, size.h) : null
        const active = isActive(ann, i)

        const pathD = hasMid
          ? `M ${x1} ${y1} L ${mx} ${my} L ${x2} ${y2}`
          : hasBend
          ? `M ${x1} ${y1} L ${bx} ${y1} L ${bx} ${y2} L ${x2} ${y2}`
          : `M ${x1} ${y1} L ${x2} ${y2}`

        return (
          <div key={i}>
            <svg
              className="ann-svg"
              style={{position:'absolute', inset:0, width:'100%', height:'100%', pointerEvents:'none', overflow:'visible', zIndex:10}}
            >
              <path
                d={pathD}
                fill="none"
                stroke="#333"
                strokeWidth="1"
                opacity={active ? 1 : 0.4}
              />
            </svg>
            <div
              className={`ann-label${ann.side === 'right' ? ' ann-label-right' : ' ann-label-left'}${active ? ' active' : ''}`}
              style={{
                left: ann.side === 'right' ? `${ann.lineX}%` : 'auto',
                right: ann.side === 'left' ? `${100 - ann.lineX}%` : 'auto',
                top: `${ann.lineY}%`
              }}
              onMouseEnter={() => (ann.hoverMode || 'hover') === 'hover' && setActiveIdx(i)}
              onMouseLeave={() => (ann.hoverMode || 'hover') === 'hover' && setActiveIdx(null)}
            >
              {ann.icon && <img src={iconsBase ? `${iconsBase}/${ann.icon}` : ann.icon} alt="" className="ann-label-icon" />}
              {ann.title && <div className="ann-label-title">{ann.title}</div>}
              {ann.content && <div className="ann-label-content">{ann.content}</div>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

const CARD_SIZE_MAP = { small: '40%', medium: '70%', large: '90%' }
const IMG_WIDTH_MAP = { small: '50%', medium: '70%', large: '90%', full: '100%' }

const parseRatioNum = (r) => { if (!r) return null; const [w, h] = String(r).split('/').map(Number); return (w && h) ? w / h : null }

function BlockCarousel({ blocks, category, id, isMobile, tier, useMobileImg, cardSize, cardRatio, cardHeight, cardHeightTablet, maxWidth }) {
  const trackRef = useRef(null)
  const [canPrev, setCanPrev] = useState(false)
  const [canNext, setCanNext] = useState(true)
  // Fixed-height mode (desktop/tablet only): height stays constant, width follows each block's ratio.
  // Tablet uses its own override when set, else falls back to the desktop value.
  const effCardHeight = tier === 'tablet' ? (cardHeightTablet || cardHeight) : cardHeight
  // Gate on tier (mobile <=600) rather than isMobile (<=768) — otherwise a
  // tablet-tier width in the 601-768 gap would still get isMobile=true and
  // silently ignore the tablet card-height override.
  const fixedHpx = tier !== 'mobile' && effCardHeight ? parseFloat(effCardHeight) : null
  const fixedH = fixedHpx ? `${fixedHpx}px` : null

  const updateButtons = () => {
    const el = trackRef.current
    if (!el) return
    setCanPrev(el.scrollLeft > 4)
    setCanNext(el.scrollLeft < el.scrollWidth - el.clientWidth - 4)
  }

  const scroll = (dir) => {
    const el = trackRef.current
    if (!el) return
    const cardWidth = el.querySelector('.bc-card')?.offsetWidth || 400
    el.scrollBy({ left: dir * (cardWidth + 24), behavior: 'smooth' })
  }

  useEffect(() => {
    const el = trackRef.current
    if (!el) return
    updateButtons()
    el.addEventListener('scroll', updateButtons)
    window.addEventListener('resize', updateButtons)
    // A plain window 'resize' listener misses container-width changes that
    // aren't driven by an actual window resize (e.g. a parent layout shift,
    // or an embedding iframe whose CSS size changes without dispatching a
    // resize event) — a ResizeObserver on the track itself catches those too,
    // so the nav arrows/overflow state stay correct regardless of the cause.
    const ro = new ResizeObserver(updateButtons)
    ro.observe(el)
    return () => { el.removeEventListener('scroll', updateButtons); window.removeEventListener('resize', updateButtons); ro.disconnect() }
  }, [])

  return (
    <>
    <div className="bc-wrap" style={maxWidth ? { maxWidth: autoPx(maxWidth) } : undefined}>
      <div className="bc-track" ref={trackRef} style={{
        // .bc-track's 22% left padding normally matches the page-wide gutter
        // because it's computed against .bc-wrap's own (otherwise full-width)
        // box — capping .bc-wrap's width for the clipped-carousel effect
        // shrinks that same box, so the SAME 22% now resolves to a smaller
        // px value and the row's left edge drifts left of every other
        // section's text, "sticking out" on the opposite side from the
        // intentional clip. Pinning it back to 22% of the page's own
        // (uncapped) width keeps it aligned regardless of maxWidth.
        ...(maxWidth ? { paddingLeft: 'calc(var(--gutter-k) * min(100vw, 1920px))' } : {}),
        // scroll-snap-align:start (desktop) snaps a card's edge to the
        // scrollport's own start (x:0), ignoring padding-left entirely once
        // any scroll has happened — only the very first, unscrolled position
        // happens to look right because that gutter is baked in as padding
        // before it, not because snapping respects it. scroll-padding tells
        // the browser the "real" scrollport starts inset by the gutter, so
        // every snapped card — not just the first — lands flush with it
        // instead of at the literal viewport edge.
        scrollPaddingLeft: maxWidth ? 'calc(var(--gutter-k) * min(100vw, 1920px))' : 'var(--gutter)',
      }}>
        {blocks.map((block, idx) => {
          const images = block.images || []
          const hoverImages = block.hoverImages || []
          const mobileImages = mobileMap(block.mobileImages)
          // hoverImages stores hover-folder file numbers positionally: hoverImages[pos] = hover file for images[pos]
          const hoverFileMap = Object.fromEntries(images.map((imgNum, pos) => [imgNum, hoverImages[pos]]).filter(([, h]) => h != null))
          const getImgSrc = (i) => {
            if (i === PLACEHOLDER_IMG) return PLACEHOLDER_IMG
            const num = String(i).padStart(2,'0')
            const mNum = mobileImages[i]
            if (mNum === PLACEHOLDER_IMG) return useMobileImg ? PLACEHOLDER_IMG : `/assets/projects/${category}/${id}/sections/${num}`
            if (useMobileImg && mNum != null) return `/assets/projects/${category}/${id}/mobile/${String(mNum).padStart(2,'0')}`
            return `/assets/projects/${category}/${id}/sections/${num}`
          }
          const getHoverSrc = (i) => `/assets/projects/${category}/${id}/hover/${String(hoverFileMap[i] ?? i).padStart(2,'0')}`
          const blockRatio = isMobile ? (block.mobileRatio || block.desktopRatio || cardRatio) : (block.desktopRatio || cardRatio)
          const cardFlexBasis = isMobile ? undefined : (CARD_SIZE_MAP[cardSize] || undefined)
          const cardW = fixedHpx ? `${Math.round(fixedHpx * (parseRatioNum(blockRatio) || 16 / 9))}px` : null
          const cardStyle = cardW ? { flex: `0 0 ${cardW}` } : (cardFlexBasis ? { flex: `0 0 ${cardFlexBasis}` } : undefined)
          const imgStyle = fixedH ? { width: cardW, height: fixedH } : (blockRatio ? { aspectRatio: blockRatio } : undefined)
          return (
            <div key={idx} className="bc-card" style={cardStyle}>
              <div className={`bc-card-img${block.rounded === false ? ' bc-card-img--square' : ''}`} style={imgStyle}>
                {images.map(i => {
                  const isHoverable = i in hoverFileMap
                  return <HoverImage key={i} baseSrc={getImgSrc(i)} hoverSrc={getHoverSrc(i)} isHoverable={isHoverable} alt={block.title || id} ratio={blockRatio} crop={useMobileImg ? (block.mobileCropData?.[i] ?? block.cropData?.[i]) : block.cropData?.[i]} rounded={block.rounded !== false} />
                })}
                {(block.overlayTitle || block.overlayContent) && (
                  <div className="detail-full-overlay detail-full-overlay-left">
                    {block.overlayTitle && <h2 className="detail-full-overlay-title" dangerouslySetInnerHTML={{__html: sanitizeInline(block.overlayTitle)}} />}
                    {block.overlayContent && <p className="detail-full-overlay-content" dangerouslySetInnerHTML={{__html: sanitizeInline(block.overlayContent)}} />}
                  </div>
                )}
              </div>
              <div className="bc-card-body" style={{ maxWidth: toMaxWidth(block.textMaxWidth), ...txtStyle(block) }}>
                {block.lines != null ? renderLines(block.lines, isMobile, undefined, tier) : <>
                  {block.title && <p style={{ fontFamily: ff(block,'title'), ...typo(block, 'title'), fontWeight: fw(block,'title'), color: fc(block,'title'), fontStyle: fi(block,'title') }} dangerouslySetInnerHTML={{__html: sanitizeInline(block.title)}} />}
                  {block.content && <p style={{ fontFamily: ff(block,'content'), ...typo(block, 'content'), fontWeight: fw(block,'content'), color: fc(block,'content'), fontStyle: fi(block,'content') }} dangerouslySetInnerHTML={{__html: sanitizeInline(block.content)}} />}
                  {block.subtitle && <p className="bc-card-sub" style={{ fontFamily: ff(block,'subtitle'), ...typo(block, 'subtitle'), fontWeight: fw(block,'subtitle'), color: fc(block,'subtitle'), fontStyle: fi(block,'subtitle') }} dangerouslySetInnerHTML={{__html: sanitizeInline(block.subtitle)}} />}
                </>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
    {/* A sibling of .bc-wrap, not a child — .bc-wrap is the clipped/capped
        carousel viewport (overflow:hidden + maxWidth), so anything inside it
        is bounded by that same maxWidth no matter what padding tricks are
        applied to it. The arrows need to stay at the page's true right
        gutter even when maxWidth clips the viewport well short of that, so
        they have to live outside the capped box entirely. */}
    <div className="bc-nav" style={maxWidth ? { padding: '0 calc(var(--gutter-k) * min(100vw, 1920px))' } : undefined}>
      <button className="bc-btn" onClick={() => scroll(-1)} disabled={!canPrev} aria-label="Previous"><ChevronIcon direction="left" /></button>
      <button className="bc-btn" onClick={() => scroll(1)} disabled={!canNext} aria-label="Next"><ChevronIcon direction="right" /></button>
    </div>
    </>
  )
}

function TabSwitcherSection({ section, category, projectId, isMobile, tier, useMobileImg }) {
  const tabs = section.tabs || []
  const [active, setActive] = useState(0)
  const tab = tabs[active] || {}
  const imgSrc = tab.image ? `/assets/projects/${category}/${projectId}/sections/${String(tab.image).padStart(2,'0')}` : null

  return (
    <section id={section.id} className="detail-section-mid detail-tab-switcher" style={sectionBgStyle(section, category, projectId, isMobile)}>
      <div className="detail-tab-bar" style={section.tabAlign === 'center' ? { justifyContent: 'center' } : undefined}>
        {tabs.map((t, i) => (
          <button
            key={i}
            className={`detail-tab-btn${active === i ? ' active' : ''}`}
            onClick={() => setActive(i)}
          >
            <span style={typo(t, 'label')}>{t.label || `Tab ${i + 1}`}</span>
          </button>
        ))}
      </div>
      <div className="detail-tab-content">
        {imgSrc && (
          <div className="detail-tab-img-wrap" style={tab.ratio ? { aspectRatio: tab.ratio } : undefined}>
            <ImageWithFallback basePath={imgSrc} alt={tab.label || ''} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          </div>
        )}
        {(tab.title || tab.body) && (
          <div className="detail-tab-text">
            {tab.title && <h2 style={{ ...(tab.titleGap !== undefined ? { marginBottom: autoPx(tab.titleGap) } : {}), ...typo(tab, 'title') }} dangerouslySetInnerHTML={{__html: sanitizeInline(tab.title)}} />}
            {tab.body && <p style={typo(tab, 'body')} dangerouslySetInnerHTML={{__html: sanitizeInline(tab.body)}} />}
          </div>
        )}
      </div>
    </section>
  )
}

function ImageTabSection({ section, category, projectId, isMobile, tier, useMobileImg }) {
  const tabs = section.tabs || []
  const [active, setActive] = useState(0)
  const basePath = `/assets/projects/${category}/${projectId}/sections`
  const tabStyle   = section.tabStyle    || 'underline'
  const tabPos     = section.tabPosition || 'bottom'
  const tabSize    = section.tabSize     || 'md'
  const activeTab  = tabs[active] || {}

  const tabImgSrc = (num, mobileField) => {
    if (num === PLACEHOLDER_IMG) return PLACEHOLDER_IMG
    if (useMobileImg) {
      const mNum = mobileMap(mobileField)?.[num]
      if (mNum === PLACEHOLDER_IMG) return PLACEHOLDER_IMG
      if (mNum) return `/assets/projects/${category}/${projectId}/mobile/${String(mNum).padStart(2,'0')}`
    }
    return `${basePath}/${String(num).padStart(2,'0')}`
  }

  const tabBar = (
    <div className={`detail-image-tab-bar detail-image-tab-bar--${tabStyle} detail-image-tab-bar--${tabSize} detail-image-tab-bar--${tabPos}`} style={{
      ...(section.tabGap != null ? { gap: `${section.tabGap}px` } : {}),
      ...(section.tabAlign === 'center' ? { justifyContent: 'center' } : section.tabAlign === 'left' ? { justifyContent: 'flex-start' } : {}),
      // The underline style shrink-wraps to its items (see .detail-image-tab-bar--underline),
      // so tabAlign has to reposition the whole box via margin too, not just the
      // now-inert justify-content between items that already fill it edge to edge.
      ...(tabStyle === 'underline' && section.tabAlign === 'center' ? { marginLeft: 'auto', marginRight: 'auto' } : {}),
    }}>
      {tabs.map((t, i) => {
        const isActive = active === i
        if (tabStyle === 'swatch') {
          const labelGap  = section.swatchLabelGap  != null ? `${section.swatchLabelGap}px`  : '8px'
          const labelSize = section.swatchLabelSize != null ? `${section.swatchLabelSize}px` : '13px'
          const ringColor = section.swatchRingColor || '#0073EB'
          return (
            <div key={i} className={`detail-image-tab-swatch-wrap${isActive ? ' active' : ''}`} onClick={() => setActive(i)}>
              <button
                className={`detail-image-tab-swatch${isActive ? ' active' : ''}`}
                style={{ ...(t.swatchColor ? { backgroundColor: t.swatchColor } : {}), ...(isActive ? { outlineColor: ringColor } : {}) }}
                aria-label={t.label || `Tab ${i + 1}`}
              />
              <span
                className="detail-image-tab-swatch-label"
                style={{ marginTop: labelGap, fontSize: labelSize, visibility: isActive ? 'visible' : 'hidden' }}
              >
                {t.label || ' '}
              </span>
            </div>
          )
        }
        if (tabStyle === 'dot') {
          return (
            <button
              key={i}
              className={`detail-image-tab-dot${isActive ? ' active' : ''}`}
              onClick={() => setActive(i)}
              aria-label={t.label || `Tab ${i + 1}`}
            />
          )
        }
        return (
          <button
            key={i}
            className={`detail-image-tab-btn detail-image-tab-btn--${tabStyle}${isActive ? ' active' : ''}`}
            onClick={() => setActive(i)}
          >
            <span style={typo(t, 'label')}>{t.label || `Tab ${i + 1}`}</span>
          </button>
        )
      })}
    </div>
  )

  const textBelowBar = section.textPosition === 'below-bar'

  const stage = (
    <div className="detail-image-tab-stage">
      {tabs.map((tab, i) => {
        const imgs = tab.images || []
        const tabRatio = isMobile ? (tab.mobileRatio || tab.desktopRatio) : tab.desktopRatio
        const hasLines = tab.lines != null && tab.lines.length > 0
        return (
          <div key={i} className={`detail-image-tab-item${active === i ? ' active' : ''}`}>
            {imgs.map(num => (
              <div key={num} className="detail-image-tab-img-wrap" style={tabRatio ? { aspectRatio: tabRatio } : undefined}>
                <ImageWithFallback
                  basePath={tabImgSrc(num, tab.mobileImages)}
                  alt={tab.label || ''}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', position: 'absolute', inset: 0, ...cropStyle(useMobileImg ? (tab.mobileCropData?.[num] ?? tab.cropData?.[num]) : tab.cropData?.[num]) }}
                  lazy={false}
                />
              </div>
            ))}
            {(hasLines || section.textMinHeight) && !textBelowBar && (
              <div className="detail-image-tab-text" style={{
                ...(section.textAlign ? { textAlign: section.textAlign } : {}),
                ...(section.textMinHeight ? { minHeight: `${section.textMinHeight}px` } : {}),
              }}>
                {hasLines && renderLines(tab.lines, isMobile, tab.textAlign || section.textAlign, tier)}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )

  const belowBarText = textBelowBar && (() => {
    const hasLines = activeTab.lines != null && activeTab.lines.length > 0
    if (!hasLines && !section.textMinHeight) return null
    return (
      <div className="detail-image-tab-stage detail-image-tab-below-text" style={{
        ...(section.textAlign ? { textAlign: section.textAlign } : {}),
        ...(section.textMinHeight ? { minHeight: `${section.textMinHeight}px` } : {}),
      }}>
        {hasLines && renderLines(activeTab.lines, isMobile, activeTab.textAlign || section.textAlign, tier)}
      </div>
    )
  })()

  // Each tab can carry its own extra "description" image(s), swapped in below
  // the tab bar/stage as the active tab changes — separate from the main
  // stage images so a tab can pair its picker (e.g. a color swatch) with a
  // standalone explainer graphic instead of just resizing the main photo.
  const descImgs = activeTab.descImages || []
  const descRatio = isMobile ? (activeTab.descMobileRatio || activeTab.descRatio) : activeTab.descRatio
  const descBlock = descImgs.length > 0 && (
    <div className="detail-image-tab-desc">
      {descImgs.map(num => (
        <div key={num} className="detail-image-tab-desc-img-wrap" style={descRatio ? { aspectRatio: descRatio } : undefined}>
          <ImageWithFallback
            basePath={num === PLACEHOLDER_IMG ? PLACEHOLDER_IMG : `${basePath}/${String(num).padStart(2,'0')}`}
            alt={activeTab.label || ''}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', position: 'absolute', inset: 0, ...cropStyle(activeTab.descCropData?.[num]) }}
          />
        </div>
      ))}
    </div>
  )

  return (
    <section id={section.id} className="detail-image-tab" style={sectionBgStyle(section, category, projectId, isMobile)}>
      {section.title && <h2 className="detail-image-tab-heading" style={typo(section, 'title')} dangerouslySetInnerHTML={{__html: sanitizeInline(section.title)}} />}
      {tabPos === 'top' && tabBar}
      {stage}
      {tabPos !== 'top' && tabBar}
      {belowBarText}
      {descBlock}
    </section>
  )
}

function FeatureTabsSection({ section, category, projectId, isMobile, tier, useMobileImg }) {
  const items = section.items || []
  const [active, setActive] = useState(0)
  const item = items[active] || {}
  const basePath = `/assets/projects/${category}/${projectId}/sections`
  const mobileBasePath = `/assets/projects/${category}/${projectId}/mobile`
  const imgs = item.images || []
  const itemRatio = isMobile ? (item.mobileRatio || item.desktopRatio) : item.desktopRatio
  const hasLines = item.lines != null && item.lines.length > 0

  const getImgSrc = (num) => {
    if (num === PLACEHOLDER_IMG) return PLACEHOLDER_IMG
    const mNums = mobileMap(item.mobileImages)
    if (useMobileImg) {
      const mNum = mNums[num]
      if (mNum === PLACEHOLDER_IMG) return PLACEHOLDER_IMG
      if (mNum != null) return `${mobileBasePath}/${String(mNum).padStart(2,'0')}`
    }
    return `${basePath}/${String(num).padStart(2,'0')}`
  }

  return (
    <section id={section.id} className="detail-feature-tabs" style={sectionBgStyle(section, category, projectId, isMobile)}>
      <div className="detail-feature-tabs-bar">
        {items.map((t, i) => (
          <button key={i} className={`detail-feature-tab${active === i ? ' detail-feature-tab--active' : ''}`} onClick={() => setActive(i)}>
            {t.icon && <img src={`/assets/projects/${category}/${projectId}/sections/${t.icon}`} alt={t.title||''} className="detail-feature-tab-icon" />}
            {t.title && <span className="detail-feature-tab-label" style={typo(t, 'title')} dangerouslySetInnerHTML={{__html: sanitizeInline(t.title)}} />}
          </button>
        ))}
      </div>
      <div className="detail-feature-tabs-content">
        {imgs.map(num => (
          <div key={num} className="detail-feature-tabs-img-wrap" style={itemRatio ? { aspectRatio: itemRatio } : undefined}>
            <ImageWithFallback
              basePath={getImgSrc(num)}
              alt={item.title || ''}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', position: 'absolute', inset: 0, ...cropStyle(useMobileImg ? (item.mobileCropData?.[num] ?? item.cropData?.[num]) : item.cropData?.[num]) }}
            />
          </div>
        ))}
        {hasLines
          ? renderLines(item.lines, isMobile, item.textAlign || section.textAlign, tier)
          : item.subtitle && <p dangerouslySetInnerHTML={{__html: sanitizeInline(item.subtitle)}} />}
      </div>
    </section>
  )
}

function AccordionSection({ section, category, projectId, isMobile, tier, useMobileImg }) {
  const items = section.items || []
  const [openIdx, setOpenIdx] = useState(null)
  const basePath = `/assets/projects/${category}/${projectId}/sections`
  const mobileBasePath = `/assets/projects/${category}/${projectId}/mobile`

  const getImgSrc = (item, num) => {
    if (num === PLACEHOLDER_IMG) return PLACEHOLDER_IMG
    const mNums = mobileMap(item.mobileImages)
    if (useMobileImg) {
      const mNum = mNums[num]
      if (mNum === PLACEHOLDER_IMG) return PLACEHOLDER_IMG
      if (mNum != null) return `${mobileBasePath}/${String(mNum).padStart(2,'0')}`
    }
    return `${basePath}/${String(num).padStart(2,'0')}`
  }

  return (
    <section id={section.id} className="detail-section-mid detail-accordion" style={sectionBgStyle(section, category, projectId, isMobile)}>
      {section.title && <h2 className="detail-accordion-heading" style={typo(section, 'title')} dangerouslySetInnerHTML={{__html: sanitizeInline(section.title)}} />}
      <div className="detail-accordion-list">
        {items.map((item, i) => {
          const isOpen = openIdx === i
          const imgs = item.images || []
          const itemRatio = isMobile ? (item.mobileRatio || item.desktopRatio) : item.desktopRatio
          const hasLines = item.lines != null && item.lines.length > 0
          return (
            <div key={i} className={`detail-accordion-item${isOpen ? ' open' : ''}`}>
              <button className="detail-accordion-trigger" onClick={() => setOpenIdx(isOpen ? null : i)}>
                <span style={typo(item, 'title')} dangerouslySetInnerHTML={{__html: sanitizeInline(item.title || '')}} />
                <span className="detail-accordion-icon">{isOpen ? '−' : '+'}</span>
              </button>
              <div className="detail-accordion-body" style={{ maxHeight: isOpen ? '2000px' : '0' }}>
                <div className="detail-accordion-body-inner" style={item.titleGap !== undefined ? { paddingTop: autoPx(item.titleGap) } : undefined}>
                  {imgs.map(num => (
                    <div key={num} className="detail-accordion-img-wrap" style={itemRatio ? { aspectRatio: itemRatio } : undefined}>
                      <ImageWithFallback
                        basePath={getImgSrc(item, num)}
                        alt={item.title || ''}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', position: 'absolute', inset: 0, ...cropStyle(useMobileImg ? (item.mobileCropData?.[num] ?? item.cropData?.[num]) : item.cropData?.[num]) }}
                      />
                    </div>
                  ))}
                  {hasLines
                    ? renderLines(item.lines, isMobile, item.textAlign || section.textAlign, tier)
                    : item.body && <p dangerouslySetInnerHTML={{__html: sanitizeInline(item.body)}} />}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

export default function ProjectDetail() {
  const { category, id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  // location.key is 'default' only when this entry has no preceding in-app
  // history (direct link, refresh, new tab) — in that case there's nothing
  // real to go back to, so fall back to the category page. Otherwise use
  // actual browser history so "back" returns to wherever the link was
  // clicked from (About, a specific category tab, Home, ...).
  const canGoBack = location.key !== 'default'
  const project = projects.find(p => p.id === id)
  const [info, setInfo] = useState(null)
  useScrollReveal(info)
  const [activeSection, setActiveSection] = useState('')
  const [showToc, setShowToc] = useState(false)
  const tocEnabled = info?.toc ?? !!siteConfig.tocEnabled
  const [tocOnDark, setTocOnDark] = useState(false)
  const isMobile = useIsMobile()
  const tier = useBreakpointTier()
  const windowWidth = useWindowWidth()
  // Icon-card grids (image-text + iconList) need to drop to 2 columns well
  // before the site's normal 1024px tablet ceiling — common "tablet" device
  // presets in browser responsive-testing tools (iPad Pro landscape, Surface,
  // etc.) run up to ~1300px wide and still read as cramped at 3-4 across.
  const isCompactGrid = useIsMobile(1300)
  // Resolves a size/value that can be overridden per-tier (mobile/tablet),
  // falling back to the desktop base value when no tier-specific override is set.
  const pick = (base, mobile, tablet) => (tier === 'mobile' ? mobile : tier === 'tablet' ? tablet : null) || base
  // Which image/crop folder ("mobile" vs "desktop") tablet width uses is an
  // author choice (set in the editor's Info tab) — defaults to "mobile" since
  // that's been the site's convention so far.
  const useMobileImg = tier === 'mobile' || (tier === 'tablet' && info?.tabletImageMode !== 'desktop')
  const [navHidden, setNavHidden] = useState(false)
  const lastScrollYRef = useRef(0)
  const othersRef = useRef(null)
  const overviewRef = useRef(null)
  const overviewTextRef = useRef(null)
  const overviewSubtitleRef = useRef(null)
  const overviewMetaRef = useRef(null)
  const [overviewMetaPadTop, setOverviewMetaPadTop] = useState(0)
  const [overviewMetaHeight, setOverviewMetaHeight] = useState(0)

  // Meta column's (TEAM/DURATION/ROLE) first row lines up with the Sub
  // Title's top when there is one, instead of the Overview Title's top above
  // it, via a measured padding-top — at every tier. Desktop additionally
  // stretches the meta column to the text column's exact measured height and
  // space-betweens the 3 rows across it, so the last row also stays flush
  // with the text's bottom (.detail-overview--fill/--meta--fill in CSS).
  // Tablet/mobile skip that stretch and just use a fixed gap: forcing both
  // ends to match spreads the rows across however tall the Overview text
  // happens to be, which read as huge, inconsistent gaps once text wraps to
  // more lines at narrower widths.
  useEffect(() => {
    const measure = () => {
      const meta = overviewMetaRef.current
      if (!meta) return
      if (info?.overviewSubtitle) {
        const sub = overviewSubtitleRef.current
        if (sub) {
          // viewport-relative (not offsetTop) since the two elements are
          // siblings in different grid cells and may not share an offsetParent
          setOverviewMetaPadTop(Math.max(0, sub.getBoundingClientRect().top - meta.getBoundingClientRect().top))
        }
      } else {
        setOverviewMetaPadTop(0)
      }
      if (tier === 'desktop' && overviewTextRef.current) {
        setOverviewMetaHeight(overviewTextRef.current.getBoundingClientRect().height)
      } else {
        setOverviewMetaHeight(0)
      }
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [info?.overviewSubtitle, info?.overviewTitle, info?.overview, tier])

  const tocItems = useMemo(() => {
    const seen = new Set()
    return (info?.sections || []).filter(s => s.label).reduce((acc, s) => {
      if (!seen.has(s.label)) { seen.add(s.label); acc.push({ id: s.id, label: s.label }) }
      return acc
    }, [])
  }, [info])

  useEffect(() => {
    let active = true
    const loadInfo = (bust) => {
      const url = `/assets/projects/${category}/${id}/info.json${bust ? `?t=${Date.now()}` : ''}`
      fetch(url, { cache: 'no-cache' })
        .then(r => r.json())
        .then(d => { if (active) setInfo(translateData(d)) })
        .catch(() => { if (active) setInfo({}) })
    }
    loadInfo(false)
    // Auto-reflect editor saves (dev): re-fetch when the editor broadcasts an update or on window focus.
    let bc
    try {
      bc = new BroadcastChannel('nnwoo-content')
      bc.onmessage = (e) => { const d = e.data; if (!d || d.all || (d.category === category && d.id === id)) loadInfo(true) }
    } catch { /* BroadcastChannel unsupported */ }
    // In Profolio the app sends edits live and owns reloading; re-fetching on
    // focus would show the file's older content over unsaved edits.
    const onFocus = () => loadInfo(true)
    if (!IS_POFOLE) window.addEventListener('focus', onFocus)
    return () => { active = false; window.removeEventListener('focus', onFocus); if (bc) bc.close() }
  }, [category, id])
  useProfolioDoc(`/assets/projects/${category}/${id}/info.json`, d => setInfo(translateData(d)))

  useEffect(() => {
    if (info?.darkNav) document.documentElement.classList.add('dark-nav')
    return () => { document.documentElement.classList.remove('dark-nav') }
  }, [info?.darkNav])

  // Per-project navbar background override. Both this and Navbar.jsx's own
  // site-wide default write the same root CSS vars — this effect runs after
  // Navbar's (declared later in the tree) so it wins while mounted, and on
  // unmount re-applies the site-wide value (rather than just clearing the
  // property) so leaving the project page doesn't strand the var unset.
  useEffect(() => {
    const bg = info?.navBgColor || siteConfig.navBgColor
    const bottomBg = info?.navBottomBgColor || siteConfig.navBottomBgColor
    const behindBg = info?.navBehindBgColor || siteConfig.navBehindBgColor
    if (bg) document.documentElement.style.setProperty('--navbar-bg-override', bg)
    else document.documentElement.style.removeProperty('--navbar-bg-override')
    if (bottomBg) document.documentElement.style.setProperty('--navbar-bottom-bg-override', bottomBg)
    else document.documentElement.style.removeProperty('--navbar-bottom-bg-override')
    if (behindBg) document.documentElement.style.setProperty('--navbar-behind-bg-override', behindBg)
    else document.documentElement.style.removeProperty('--navbar-behind-bg-override')
    return () => {
      if (siteConfig.navBgColor) document.documentElement.style.setProperty('--navbar-bg-override', siteConfig.navBgColor)
      else document.documentElement.style.removeProperty('--navbar-bg-override')
      if (siteConfig.navBottomBgColor) document.documentElement.style.setProperty('--navbar-bottom-bg-override', siteConfig.navBottomBgColor)
      else document.documentElement.style.removeProperty('--navbar-bottom-bg-override')
      if (siteConfig.navBehindBgColor) document.documentElement.style.setProperty('--navbar-behind-bg-override', siteConfig.navBehindBgColor)
      else document.documentElement.style.removeProperty('--navbar-behind-bg-override')
    }
  }, [info?.navBgColor, info?.navBottomBgColor, info?.navBehindBgColor])

  useEffect(() => {
    const handleScroll = () => {
      const currentY = window.scrollY
      if (currentY < 10) {
        setNavHidden(false)
      } else if (currentY > lastScrollYRef.current + 4) {
        setNavHidden(true)
      } else if (currentY < lastScrollYRef.current - 4) {
        setNavHidden(false)
      }
      lastScrollYRef.current = currentY

      const overviewTop = overviewRef.current ? overviewRef.current.offsetTop : 0
      const pastHero = window.scrollY > overviewTop - 100
      // Used to hide the TOC again once the "Related/Others" section at the
      // very bottom scrolled into view — now it just stays visible for the
      // rest of the page instead of disappearing there and reappearing on
      // further scroll.
      setShowToc(pastHero)
      const sections = tocItems.map(item => document.getElementById(item.id)).filter(Boolean)
      const scrollY = window.scrollY + 120
      for (let i = sections.length - 1; i >= 0; i--) {
        if (sections[i].offsetTop <= scrollY) {
          setActiveSection(sections[i].id)
          break
        }
      }

      // Cheap light/dark contrast check for the TOC pill: one elementFromPoint
      // read per scroll tick (not per frame, no canvas/pixel sampling) using
      // the background-color each section already sets inline — reused here
      // instead of adding a drop shadow to fake contrast against any backdrop.
      if (pastHero) {
        const el = document.elementFromPoint(34, window.innerHeight / 2)
        let node = el, bg = null
        while (node && node !== document.body) {
          const c = getComputedStyle(node).backgroundColor
          if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') { bg = c; break }
          node = node.parentElement
        }
        if (bg) {
          const m = bg.match(/[\d.]+/g)
          if (m && m.length >= 3) {
            const [r, g, b] = m.map(Number)
            const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
            setTocOnDark(luminance < 0.5)
          }
        }
      }
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [tocItems])

  if (!project) return <div>{t('Project not found')}</div>

  const maintenanceGate = getMaintenanceGate(info?.maintenance)
  if (maintenanceGate) return maintenanceGate

  const imgSrc = (i, mobileField, tabletField) => {
    if (i === PLACEHOLDER_IMG) return PLACEHOLDER_IMG
    const num = String(i).padStart(2,'0')
    if (tier === 'tablet' && tabletField) {
      const tNum = mobileMap(tabletField)[i]
      if (tNum === PLACEHOLDER_IMG) return PLACEHOLDER_IMG
      if (tNum != null) return `/assets/projects/${category}/${id}/tablet/${String(tNum).padStart(2,'0')}`
    }
    const mNum = mobileMap(mobileField)[i]
    if (mNum === PLACEHOLDER_IMG) return useMobileImg ? PLACEHOLDER_IMG : `/assets/projects/${category}/${id}/sections/${num}`
    if (useMobileImg && mNum != null) return `/assets/projects/${category}/${id}/mobile/${String(mNum).padStart(2,'0')}`
    return `/assets/projects/${category}/${id}/sections/${num}`
  }
  const hoverSrcFn = (i) => `/assets/projects/${category}/${id}/hover/${String(i).padStart(2,'0')}`

  const renderSection = (section, idx) => {
    if (section.type === 'scroll-animation') {
      return (
        <ScrollAnimationSection key={`${section.id}-${idx}`} id={section.id} section={section} assetsBase={`/assets/projects/${category}/${id}`} isMobile={isMobile} tier={tier} renderLines={renderLines} />
      )
    }

    if (section.type === 'images') {
      const ov = section.overlay
      const mobileNums = section.mobileImages || []
      const tabletNums = section.tabletImages || []
      const sectionRatio = isMobile ? (section.mobileRatio || section.desktopRatio) : section.desktopRatio
      return (
        <section key={`${section.id}-${idx}`} id={section.id} className={`detail-section-full${section.matchTextPadding ? ' detail-section-full--padded' : ''}`} style={sectionBgStyle(section, category, id)}>
          {(section.images || []).map(i => (
            <div key={i} className="detail-full-img-wrap" style={sectionRatio ? { aspectRatio: sectionRatio, overflow: 'hidden' } : undefined}>
              <ImageWithFallback basePath={imgSrc(i, mobileNums, tabletNums)} alt={`section-${i}`} style={{width:'100%', height:'100%', display:'block', objectFit:'cover', position:'absolute', inset:0, ...cropStyle(tier === 'tablet' && section.tabletCropData?.[i] ? section.tabletCropData[i] : useMobileImg ? (section.mobileCropData?.[i] ?? section.cropData?.[i]) : section.cropData?.[i])}} />
              {ov && (ov.lines?.length > 0 || ov.title || ov.subtitle || ov.content) && (
                <div className={`detail-full-overlay detail-full-overlay-${ov.position || 'left'}`} style={(isMobile ? (ov.mobileTextMaxWidth || undefined) : ov.textMaxWidth) ? { maxWidth: isMobile ? (ov.mobileTextMaxWidth || undefined) : ov.textMaxWidth } : undefined}>
                  {ov.lines != null ? renderLines(ov.lines, isMobile, undefined, tier) : <>
                    {ov.title && <h2 className="detail-full-overlay-title" style={{ color: ov.titleColor, fontSize: autoPx(ov.titleSize), fontWeight: ov.titleWeight, fontFamily: ov.titleFont, fontStyle: ov.titleItalic ? 'italic' : undefined }} dangerouslySetInnerHTML={{__html: sanitizeInline(ov.title)}} />}
                    {ov.subtitle && <h4 className="detail-full-overlay-subtitle" dangerouslySetInnerHTML={{__html: sanitizeInline(ov.subtitle)}} />}
                    {ov.content && <p className="detail-full-overlay-content" style={{ color: ov.contentColor, fontSize: isMobile ? '14px' : autoPx(ov.contentSize), fontWeight: ov.contentWeight, fontFamily: ov.contentFont, fontStyle: ov.contentItalic ? 'italic' : undefined }} dangerouslySetInnerHTML={{__html: sanitizeInline(ov.content)}} />}
                  </>}
                </div>
              )}
            </div>
          ))}
        </section>
      )
    }

    if (section.type === 'image-text') {
      const allBlocks = (section.blocks || []).filter(b => !b.hidden)
      // The editor's "Columns" control for icon-list layouts writes to
      // iconColumns (a dedicated field, separate from image-grid's plain
      // `columns`) — read that first so the dropdown actually has an effect;
      // fall back to `columns` for any section that set it directly.
      const desktopCols = section.iconList ? (section.iconColumns || section.columns) : section.columns
      const isGridSection = desktopCols > 1
      // A section can opt into its own, wider carousel-switch width instead
      // of the site's normal mobile breakpoint (768px) — e.g. a 4-column
      // stats grid that already feels cramped well before the layout
      // actually goes mobile. Below that width the row becomes the same
      // horizontal-scroll BlockCarousel as on a real phone, but still using
      // desktop assets/ratios (isMobile itself is untouched).
      const showCarousel = isGridSection && (section.carouselBreakpoint ? windowWidth <= section.carouselBreakpoint : isMobile)
      if (showCarousel) {
        return (
          <section key={`${section.id}-${idx}`} id={section.id} className="detail-section-mid detail-section-carousel" style={sectionBgStyle(section, category, id, isMobile)}>
            <BlockCarousel blocks={allBlocks} category={category} id={id} isMobile={isMobile} tier={tier} useMobileImg={useMobileImg} cardHeight={section.cardHeight} cardHeightTablet={section.cardHeightTablet} maxWidth={section.carouselMaxWidth || 1600} />
          </section>
        )
      }
      const blocks = allBlocks
      const effCardHeight = tier === 'tablet' ? (section.cardHeightTablet || section.cardHeight) : section.cardHeight
      const fixedH = tier !== 'mobile' && effCardHeight ? `${effCardHeight}px` : null
      // Tablet-and-narrower-laptop widths default to their own column count
      // instead of blindly inheriting desktop's — icon-card grids in
      // particular read cramped at 3-4 across, so they default to 2 unless a
      // Columns (tablet) override is set.
      const gridColsRaw = (tier === 'tablet' || (section.iconList && isCompactGrid)) ? (section.tabletColumns || (section.iconList ? Math.min(desktopCols || 1, 2) : desktopCols)) : desktopCols
      const gridCols = !isMobile && gridColsRaw > 1 ? gridColsRaw : null
      // When a multi-column grid also has a Fixed Card Height, blocks can have
      // differing image ratios — a plain CSS grid forces equal column widths,
      // which either overflows the page padding or leaves the row unevenly
      // filled at other viewport widths (laptop breakpoints, auto-resize).
      // "Justified" mode swaps the row to flexbox: each column's flex-grow is
      // set to its own image ratio, so widths distribute proportionally and
      // every column resolves to the exact same height — at any container
      // width, with no JS-computed pixel size and no overflow.
      const isJustified = !!(gridCols && fixedH)
      const blockEls = blocks.map((block, idx) => {
            const images = block.images || []
            const hoverImages = block.hoverImages || []
            const hoverFileMap = Object.fromEntries(images.map((imgNum, pos) => [imgNum, hoverImages[pos]]).filter(([, h]) => h != null))
            const mobileImages = block.mobileImages
            // Tablet is touch-first too — hover-to-reveal doesn't work reliably
            // there either, so it reuses the same always-visible mobile
            // annotation set instead of falling through to desktop's hover mode.
            const activeAnnotations = tier !== 'desktop'
              ? (Array.isArray(block.mobileAnnotations) ? block.mobileAnnotations : (block.annotations || []))
              : (block.annotations || [])
            const hasMobileOnly = images.length === 0 && Object.keys(mobileMap(mobileImages)).length > 0
            const blockRatio = isMobile ? (block.mobileRatio || block.desktopRatio) : block.desktopRatio
            const fixedHpx = fixedH ? parseFloat(fixedH) : null
            const fixedW = fixedHpx ? `${Math.round(fixedHpx * (parseRatioNum(blockRatio) || 16 / 9))}px` : null
            const imgMaxW = !isMobile ? IMG_WIDTH_MAP[block.imgWidth || 'medium'] : undefined
            const blockAlign = !isMobile && (block.blockAlign || null)
            const sharedW = blockAlign ? (imgMaxW || '100%') : undefined
            const blockRatioNum = parseRatioNum(blockRatio) || 16 / 9
            const blockWrapStyle = {
              ...(section.imageTextGap != null ? { gap: `${section.imageTextGap}px` } : {}),
              ...(blockAlign === 'left' ? { paddingLeft: 'var(--gutter)', alignItems: 'flex-start' }
                : blockAlign === 'right' ? { paddingRight: 'var(--gutter)', alignItems: 'flex-end' }
                : blockAlign === 'inset' ? { paddingLeft: 'var(--gutter)', paddingRight: 'var(--gutter)', boxSizing: 'border-box' } : {}),
              // Justified mode: column width is proportional to its own image
              // ratio, so every column's height resolves to the same value —
              // see isJustified above.
              ...(isJustified ? { flex: `${blockRatioNum} 1 0`, minWidth: 0 } : {}),
            }
            // imgTextAlign: 'image' = text matches image width+centering; 'left' = text starts at container left edge
            const alignWithImage = !isMobile && (block.imgTextAlign === 'image' || block.imgTextAlign == null)
            // Section Padding only repositions TEXT (to match the padded gutter, like other text sections);
            // it never touches the image's own sizing/centering. Explicit center alignment is respected as-is —
            // it's already symmetric once the section has equal left/right padding.
            const flushLeft = !isMobile && !!section.matchTextPadding && !blockAlign && block.textAlign !== 'center'
            // In a multi-column grid, fixed-height images of differing ratios end up
            // narrower than their column — centering each one independently leaves the
            // outer edges (first/last column) indented past the grid's own padding,
            // which no longer lines up with the text above. Push the outermost images
            // flush to the grid's left/right edge instead; only interior columns center.
            const gridEdgeMargin = gridCols
              ? (idx === 0 ? { marginLeft: 0, marginRight: 'auto' }
                : idx === blocks.length - 1 ? { marginLeft: 'auto', marginRight: 0 }
                : { margin: '0 auto' })
              : flushLeft ? { margin: 0, alignSelf: 'flex-start' } : { margin: '0 auto' }
            const roundedImg = !(isMobile && block.mobileSquare)
            return (
              <div key={idx} className={`detail-block-mid${section.iconList ? ' detail-block-mid--icon-row' : ''}`} style={blockWrapStyle}>
                {(images.length > 0 || (isMobile && hasMobileOnly)) && (
                  <div className={`detail-block-mid-img${fixedH && !isJustified ? ' fixed-h' : ''}`} style={{
                    ...(isJustified
                      ? { width: '100%' }
                      : fixedW ? (blockAlign ? { width: fixedW } : { width: fixedW, ...gridEdgeMargin }) : sharedW ? { width: sharedW } : (imgMaxW ? { maxWidth: imgMaxW, margin: flushLeft ? 0 : '0 auto', ...(flushLeft ? { alignSelf: 'flex-start' } : {}) } : {})),
                    ...(fixedH && !isJustified ? { height: fixedH } : {}),
                  }}>
                    {images.length > 0 ? images.map(i => {
                      const isHoverable = i in hoverFileMap
                      const hoverSrc = `/assets/projects/${category}/${id}/hover/${String(hoverFileMap[i] ?? i).padStart(2,'0')}`
                      const cropForImg = tier === 'tablet' && block.tabletCropData?.[i] ? block.tabletCropData[i] : useMobileImg ? (block.mobileCropData?.[i] ?? block.cropData?.[i]) : block.cropData?.[i]
                      return activeAnnotations.length > 0
                        ? <AnnotatedImage key={i} baseSrc={imgSrc(i, mobileImages, block.tabletImages)} hoverSrc={hoverSrc} isHoverable={isHoverable} alt={block.title || section.id} annotations={activeAnnotations} ratio={(fixedH && !isJustified) ? undefined : blockRatio} iconsBase={`/assets/projects/${category}/${id}/icons`} />
                        : <HoverImage key={i} baseSrc={imgSrc(i, mobileImages, block.tabletImages)} hoverSrc={hoverSrc} isHoverable={isHoverable} alt={block.title || section.id} ratio={(fixedH && !isJustified) ? undefined : blockRatio} crop={cropForImg} rounded={roundedImg} />
                    }) : Object.values(mobileMap(mobileImages)).map(i => {
                      const num = String(i).padStart(2,'0')
                      return <HoverImage key={i} baseSrc={`/assets/projects/${category}/${id}/mobile/${num}`} hoverSrc={hoverSrcFn(i)} isHoverable={false} alt={block.title || section.id} ratio={(fixedH && !isJustified) ? undefined : blockRatio} rounded={roundedImg} />
                    })}
                    {(block.overlayTitle || block.overlayContent) && (
                      <div className="detail-full-overlay detail-full-overlay-left">
                        {block.overlayTitle && <h2 className="detail-full-overlay-title" dangerouslySetInnerHTML={{__html: sanitizeInline(block.overlayTitle)}} />}
                        {block.overlayContent && <p className="detail-full-overlay-content" dangerouslySetInnerHTML={{__html: sanitizeInline(block.overlayContent)}} />}
                      </div>
                    )}
                  </div>
                )}
                {!(gridCols && section.sharedText) && (block.lines != null ? block.lines.length > 0 : (block.title || block.subtitle || block.content)) && (
                  <div className="detail-block-mid-body" style={block.textMaxWidth
                    ? (blockAlign
                      ? { ...txtStyle(block), maxWidth: autoPx(block.textMaxWidth), ...(isMobile || flushLeft ? {} : { padding: '0 15%', boxSizing: 'border-box' }) }
                      : { ...txtStyle(block), maxWidth: autoPx(block.textMaxWidth), ...(isMobile || flushLeft ? {} : { padding: '0 15%', boxSizing: 'border-box' }), margin: flushLeft ? 0 : '0 auto', ...(flushLeft ? { alignSelf: 'flex-start' } : {}) })
                    : sharedW
                      ? { ...txtStyle(block), width: sharedW, maxWidth: sharedW }
                      : alignWithImage && fixedW
                        ? { ...txtStyle(block), maxWidth: fixedW, margin: flushLeft ? 0 : '0 auto', ...(flushLeft ? { alignSelf: 'flex-start' } : {}) }
                        : alignWithImage && imgMaxW
                          ? { ...txtStyle(block), maxWidth: imgMaxW, margin: flushLeft ? 0 : '0 auto', ...(flushLeft ? { alignSelf: 'flex-start' } : {}) }
                          : { ...txtStyle(block), alignSelf: block.textAlign === 'right' ? 'flex-end' : block.textAlign === 'center' ? 'center' : 'flex-start' }
                  }>
                    {block.lines != null ? renderLines(block.lines, isMobile, block.textAlign, tier) : <>
                      {block.title && <h2 style={{ fontFamily: ff(block,'title'), ...typo(block, 'title'), fontWeight: fw(block,'title'), color: fc(block,'title'), fontStyle: fi(block,'title') }} dangerouslySetInnerHTML={{__html: sanitizeInline(block.title)}} />}
                      {block.subtitle && <h4 style={{ fontFamily: ff(block,'subtitle'), ...typo(block, 'subtitle'), fontWeight: fw(block,'subtitle'), color: fc(block,'subtitle'), fontStyle: fi(block,'subtitle') }} dangerouslySetInnerHTML={{__html: sanitizeInline(block.subtitle)}} />}
                      {block.content && <p style={{ fontFamily: ff(block,'content'), ...typo(block, 'content'), fontWeight: fw(block,'content'), color: fc(block,'content'), fontStyle: fi(block,'content') }} dangerouslySetInnerHTML={{__html: sanitizeInline(block.content)}} />}
                    </>}
                  </div>
                )}
              </div>
            )
      })
      return (
        <section key={`${section.id}-${idx}`} id={section.id} className={`detail-section-mid${gridCols ? ' detail-section-mid--grid' : ''}${isJustified ? ' detail-section-mid--justified' : ''}${section.iconList ? ' detail-section-mid--icon-list' : ''}${section.matchTextPadding ? ' match-text-pad' : ''}`} style={{
          ...sectionBgStyle(section, category, id, isMobile),
          ...(gridCols ? { '--cols': gridCols } : {}),
          ...(gridCols && section.columnGap != null ? { '--col-gap': `${section.columnGap}px` } : {}),
          ...(gridCols && section.rowGap != null ? { '--row-gap': `${section.rowGap}px` } : {}),
          ...(gridCols && section.gridImageWidth != null ? { '--img-width': `${section.gridImageWidth}%` } : {}),
          ...(gridCols && section.imageGap != null ? { '--img-gap': `${section.imageGap}px` } : {}),
          ...(gridCols && section.gridPadding != null ? { '--grid-pad': section.gridPadding === '0' ? '0' : section.gridPadding } : {}),
        }}>
          {/* Justified (flex-based, differing-ratio) layout keeps the shared
              caption OUT of the flex row that sizes the image columns — as a
              sibling flex item with flex-basis:100%, it consumed the row's
              entire hypothetical main size on its own line, leaving zero free
              space for the image items' flex-grow to distribute (they all
              collapsed to their 0 flex-basis, i.e. invisible). CSS Grid (the
              non-justified path) doesn't have this failure mode — a
              grid-column:1/-1 item there doesn't rob track space from the
              other items — so only this path needs the extra wrapper. */}
          {isJustified ? <div className="detail-blocks-row">{blockEls}</div> : blockEls}
          {gridCols && section.sharedText && (section.sharedLines?.length > 0) && (
            <div className="detail-block-mid-body detail-block-mid-body--shared" style={{ gridColumn: '1 / -1', textAlign: section.textAlign || 'left', maxWidth: autoPx(section.textMaxWidth) }}>
              {renderLines(section.sharedLines, isMobile, section.textAlign, tier)}
            </div>
          )}
        </section>
      )
    }

    if (section.type === 'image-text-carousel') {
      return (
        <section key={`${section.id}-${idx}`} id={section.id} className="detail-section-carousel" style={sectionBgStyle(section, category, id)}>
          <BlockCarousel blocks={(section.blocks || []).filter(b => !b.hidden)} category={category} id={id} isMobile={isMobile} tier={tier} useMobileImg={useMobileImg} cardSize={section.cardSize} cardRatio={section.cardRatio} cardHeight={section.cardHeight} cardHeightTablet={section.cardHeightTablet} maxWidth={section.carouselMaxWidth || 1600} />
        </section>
      )
    }

    if (section.type === 'image-grid') {
      const cols = tier === 'mobile' ? (section.mobileColumns || 2) : tier === 'tablet' ? (section.tabletColumns || 3) : (section.columns || 4)
      const rows = tier === 'mobile' ? section.mobileRows : tier === 'tablet' ? (section.tabletRows ?? section.rows) : section.rows
      const gap = tier === 'mobile' ? (section.mobileGap || section.gap || '4px') : (section.gap || '4px')
      const ratio = isMobile ? (section.mobileRatio || section.desktopRatio) : section.desktopRatio
      const mobileNums = section.mobileImages || []
      const tabletNums = section.tabletImages || []
      const gridImages = section.images || []
      const hoverImages = section.hoverImages || []
      const hoverFileMap = Object.fromEntries(gridImages.map((imgNum, pos) => [imgNum, hoverImages[pos]]).filter(([, h]) => h != null))
      return (
        <section key={`${section.id}-${idx}`} id={section.id} className="detail-section-mid" style={sectionBgStyle(section, category, id)}>
          <div style={{
            width: '100%',
            boxSizing: 'border-box',
            ...(isMobile
              ? { padding: `0 ${section.mobilePadding ?? 20}px` }
              : toMaxWidth(section.textMaxWidth)
                ? { maxWidth: toMaxWidth(section.textMaxWidth), margin: '0 auto' }
                // Same side padding as the images/image-text sections'
                // `matchTextPadding` convention (22%), so a grid's edges
                // line up with theirs by default instead of the old
                // `width: 70%` (a different, uncoordinated inset).
                : { padding: '0 22%' }),
          }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            ...(rows ? { gridTemplateRows: `repeat(${rows}, 1fr)` } : {}),
            gap,
          }}>
            {gridImages.map(i => {
              const isHoverable = i in hoverFileMap
              return (
                <HoverImage
                  key={i}
                  baseSrc={imgSrc(i, mobileNums, tabletNums)}
                  hoverSrc={`/assets/projects/${category}/${id}/hover/${String(hoverFileMap[i] ?? i).padStart(2,'0')}`}
                  isHoverable={isHoverable}
                  alt={`${section.id}-${i}`}
                  ratio={ratio}
                  crop={tier === 'tablet' && section.tabletCropData?.[i] ? section.tabletCropData[i] : useMobileImg ? (section.mobileCropData?.[i] ?? section.cropData?.[i]) : section.cropData?.[i]}
                />
              )
            })}
          </div>
          </div>
        </section>
      )
    }

    if (section.type === 'text-columns') {
      const columns = section.columns || []
      return (
        <section key={`${section.id}-${idx}`} id={section.id} className="detail-section-mid match-text-pad" style={sectionBgStyle(section, category, id)}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : `repeat(${columns.length}, minmax(0, 1fr))`,
            gap: isMobile ? '40px' : autoPx(section.columnGap || '60px'),
            boxSizing: 'border-box',
            width: '100%',
            alignItems: 'start',
          }}>
            {columns.map((col, ci) => (
              <div key={ci} style={{ textAlign: col.textAlign || 'left' }}>
                {renderLines(col.lines || [], isMobile, undefined, tier)}
              </div>
            ))}
          </div>
        </section>
      )
    }

    if (section.type === 'tab-switcher') {
      return <TabSwitcherSection key={`${section.id}-${idx}`} section={section} category={category} projectId={id} isMobile={isMobile} tier={tier} useMobileImg={useMobileImg} />
    }

    if (section.type === 'feature-tabs') {
      return <FeatureTabsSection key={`${section.id}-${idx}`} section={section} category={category} projectId={id} isMobile={isMobile} tier={tier} useMobileImg={useMobileImg} />
    }

    if (section.type === 'image-tab') {
      return <ImageTabSection key={`${section.id}-${idx}`} section={section} category={category} projectId={id} isMobile={isMobile} tier={tier} useMobileImg={useMobileImg} />
    }

    if (section.type === 'accordion') {
      return <AccordionSection key={`${section.id}-${idx}`} section={section} category={category} projectId={id} isMobile={isMobile} tier={tier} useMobileImg={useMobileImg} />
    }

    if (section.type === 'model-viewer') {
      const modelSrc = section.modelFile ? (section.modelFile.startsWith('/') ? section.modelFile : `/assets/projects/${category}/${id}/${section.modelFile}`) : null
      return (
        <section key={`${section.id}-${idx}`} id={section.id} className="detail-section-mid" style={sectionBgStyle(section, category, id, isMobile)}>
          {modelSrc && (
            <model-viewer
              src={modelSrc}
              auto-rotate={section.autoRotate !== false ? '' : undefined}
              camera-controls=""
              style={{ width: '100%', height: '500px', display: 'block' }}
            />
          )}
          {section.lines && section.lines.length > 0 && (
            <div className="detail-block-mid-body">
              {renderLines(section.lines, isMobile, section.textAlign, tier)}
            </div>
          )}
        </section>
      )
    }

    if (section.type === 'interactive') {
      return (
        <section key={`${section.id}-${idx}`} id={section.id} className="detail-section-mid" style={{ ...sectionBgStyle(section, category, id, isMobile), ...(info?.hideHero && idx === 0 ? { paddingTop: 0 } : {}) }}>
          <LabEmbed section={section} isMobile={isMobile} />
          {section.lines && section.lines.length > 0 && (
            <div className="detail-block-mid-body">
              {renderLines(section.lines, isMobile, section.textAlign, tier)}
            </div>
          )}
        </section>
      )
    }

    if (section.type === 'video-background') {
      const isYoutube = section.videoType === 'youtube' && !!section.youtubeId
      const vSrc = !isYoutube && section.videoSrc ? (section.videoSrc.startsWith('/') ? section.videoSrc : `/assets/projects/${category}/${id}/sections/${section.videoSrc}`) : null
      const muted = section.videoMuted !== false
      const loop = section.videoLoop !== false
      const videoProps = { src: vSrc, autoPlay: muted, muted, loop, playsInline: true, controls: !muted }
      const hasText = section.lines?.length > 0 || section.title || section.content
      const textInner = section.lines != null ? renderLines(section.lines, isMobile, section.overlayPosition, tier) : <>
        {section.title && <h2 style={{ color: section.titleColor, fontSize: autoPx(section.titleSize), fontWeight: section.titleBold ? '700' : undefined }} dangerouslySetInnerHTML={{__html: sanitizeInline(section.title)}} />}
        {section.content && <p style={{ color: section.contentColor, fontSize: isMobile ? '14px' : autoPx(section.contentSize) }} dangerouslySetInnerHTML={{__html: sanitizeInline(section.content)}} />}
      </>

      const videoStyle = cropStyle(section.videoCropData)
      // A YouTube embed is always shown in its own ratio-boxed frame (a
      // background-cover autoplay loop isn't something the iframe embed can
      // do cleanly), defaulting to 16:9 the way the "Video File" path
      // defaults its own aspect picker when nothing's been chosen.
      const effRatio = section.videoRatio || (isYoutube ? '16/9' : null)

      if (effRatio) {
        const textNode = hasText && (
          <div className={`detail-video-ratio-text detail-video-overlay-${section.overlayPosition || 'center'}`} style={section.textMaxWidth ? { maxWidth: autoPx(section.textMaxWidth) } : undefined}>
            {textInner}
          </div>
        )
        const below = section.videoTextPosition === 'below'
        return (
          <section key={`${section.id}-${idx}`} id={section.id} className={`detail-section-video-ratio${section.matchTextPadding ? ' match-text-pad' : ''}`} style={{
            ...sectionBgStyle(section, category, id, isMobile),
            ...(section.matchTextPadding && tier !== 'mobile' ? { alignItems: 'flex-start' } : {}),
          }}>
            {!below && textNode}
            {isYoutube ? (
              <div className="detail-video-ratio-wrap" style={{ aspectRatio: effRatio, maxWidth: autoPx(section.videoMaxWidth) }}>
                <YoutubeEmbed videoId={section.youtubeId} thumbnail={section.videoThumbnail} />
              </div>
            ) : vSrc && (
              <div className="detail-video-ratio-wrap" style={{ aspectRatio: effRatio, maxWidth: autoPx(section.videoMaxWidth) }}>
                <video className="detail-video-ratio" style={videoStyle} {...videoProps} />
              </div>
            )}
            {below && textNode}
          </section>
        )
      }

      return (
        <section key={`${section.id}-${idx}`} id={section.id} className="detail-section-video-bg" style={sectionBgStyle(section, category, id, isMobile)}>
          {vSrc && <video className="detail-video-bg" style={videoStyle} {...videoProps} />}
          {hasText && (
            <div className={`detail-video-overlay detail-video-overlay-${section.overlayPosition || 'center'}`} style={section.textMaxWidth ? { maxWidth: autoPx(section.textMaxWidth) } : undefined}>
              {textInner}
            </div>
          )}
        </section>
      )
    }

    if (section.type === 'stats') {
      const items = section.items || []
      return (
        <section key={`${section.id}-${idx}`} id={section.id} className="detail-stats" style={sectionBgStyle(section, category, id, isMobile)}>
          {items.map((item, i) => (
            <div key={i} className="detail-stats-item">
              {item.icon && <img className="detail-stats-icon" src={`/assets/projects/${category}/${id}/sections/${item.icon}`} alt="" />}
              {item.value && <div className="detail-stats-value" style={typo(item, 'value')}>{item.value}</div>}
              {item.label && <div className="detail-stats-label" style={typo(item, 'label')}>{item.label}</div>}
            </div>
          ))}
        </section>
      )
    }

    if (section.type === 'text') {
      const txtAlign = { textAlign: section.textAlign || 'left' }
      return (
        <section key={`${section.id}-${idx}`} id={section.id} className="detail-section-mid" style={sectionBgStyle(section, category, id)}>
          <div className="detail-section-text-body" style={{
            // Only cap width when a Max Width is actually set — .detail-section-text-body's
            // own 22%/6%/20px side padding is computed against the section's (much wider)
            // containing block, not this box, so combining that padding with the old
            // unconditional 560px fallback ate the entire box (padding alone > 560px on
            // any normal desktop), collapsing content to ~0 and wrapping word-by-word.
            // With no explicit max-width, the padding alone is left to define the gutter,
            // same as every other plain text section on the site.
            ...(toMaxWidth(section.textMaxWidth) ? { maxWidth: toMaxWidth(section.textMaxWidth) } : {}),
            margin: section.textAlign === 'center' ? '0 auto' : section.textAlign === 'right' ? '0 0 0 auto' : '0',
            ...txtAlign,
          }}>
            {section.lines != null ? (
              renderLines(section.lines, isMobile, section.textAlign, tier)
            ) : (
              <>
                {section.title && <h2 style={{ fontFamily: ff(section,'title'), ...typo(section, 'title'), fontWeight: fw(section,'title'), ...(section.titleSize ? { fontSize: autoPx(section.titleSize) } : {}), color: fc(section,'title'), fontStyle: fi(section,'title') }} dangerouslySetInnerHTML={{__html: sanitizeInline(section.title)}} />}
                {section.content && <p style={{ fontFamily: ff(section,'content'), ...typo(section, 'content'), fontWeight: fw(section,'content'), ...(isMobile ? { fontSize: '14px' } : section.contentSize ? { fontSize: autoPx(section.contentSize) } : {}), color: fc(section,'content'), fontStyle: fi(section,'content') }} dangerouslySetInnerHTML={{__html: sanitizeInline(section.content)}} />}
              </>
            )}
            {section.link?.url && (
              <a
                href={section.link.url}
                className={`detail-text-link${section.link.style === 'text' ? ' detail-text-link--text' : ''}`}
                {...(section.link.newTab !== false ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              >
                {section.link.label || section.link.url}
              </a>
            )}
          </div>
        </section>
      )
    }

    return null
  }

  return (
    <div className="project-detail">
      {structureFlag('detailBar') && (
        <nav className={`detail-nav${isMobile && navHidden ? ' detail-nav--hidden' : ''}`}>
          <span className="detail-nav-back">
            {canGoBack ? (
              <button onClick={() => navigate(-1)} aria-label="Back" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
              </button>
            ) : (
              <Link to={`/projects/${category}`} aria-label="Back">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
              </Link>
            )}
          </span>
          <div className="detail-nav-links">
            <span className="detail-nav-item" style={{ fontSize: autoPx(info?.navLabelSize) || undefined, fontWeight: info?.navLabelWeight || '600', fontStyle: info?.navLabelItalic ? 'italic' : undefined, ...typo(info, 'navLabel') }}>{info?.navLabel || `${project.title} — ${project.year}`}</span>
          </div>
        </nav>
      )}

      {/* Section TOC — off unless enabled site-wide (Home editor → TOC
          Settings) or for this page (info.toc: true/false overrides). */}
      {tocEnabled && (
        <nav className={`detail-toc${showToc ? ' toc-visible' : ''}${siteConfig.tocAlwaysShowLabels ? ' toc-always-labels' : ''}${siteConfig.tocBackgroundStyle === 'none' ? ' toc-bg-none' : siteConfig.tocBackgroundStyle === 'gradient' ? ' toc-bg-gradient' : ''}${tocOnDark ? ' toc-on-dark' : ''}`}
          style={{ ...(siteConfig.tocColor ? { '--toc-color': siteConfig.tocColor } : {}), ...(siteConfig.tocActiveColor ? { '--toc-active-color': siteConfig.tocActiveColor } : {}) }}
        >
          {tocItems.map(item => (
            <a key={item.id} href={`#${item.id}`} className={`detail-toc-item${activeSection === item.id ? ' active' : ''}`}
              onClick={e => {
                const target = document.getElementById(item.id)
                if (!target) return
                e.preventDefault()
                const stickyEls = document.querySelectorAll('.navbar, .detail-nav')
                const offset = Array.from(stickyEls).reduce((sum, el) => {
                  const s = getComputedStyle(el)
                  if (s.position === 'sticky' || s.position === 'fixed') sum += el.getBoundingClientRect().height
                  return sum
                }, 0)
                const top = target.getBoundingClientRect().top + window.scrollY - offset
                window.scrollTo({ top, behavior: 'smooth' })
              }}
            >
              <span className="toc-dot" />
              <span className="toc-label" style={siteConfig.tocLabelSize ? { fontSize: `${siteConfig.tocLabelSize}px` } : undefined}>{item.label}</span>
            </a>
          ))}
        </nav>
      )}

      {/* info.hideHero: no hero image, the first section starts right under
          the nav (an interactive piece that brings its own opening). */}
      {!info?.hideHero && (
        <div className="detail-hero" style={{aspectRatio: tier !== 'desktop' ? '5/4' : '16/9', overflow:'hidden'}}>
          <ImageWithFallback basePath={
            tier === 'tablet' && info?.heroTabletImage ? info.heroTabletImage
            : useMobileImg && info?.heroMobileImage ? info.heroMobileImage
            : (info?.heroImage || `/assets/projects/${category}/${id}/hero`)
          } alt={project.title} style={{width:'100%', height:'100%', objectFit:'cover'}} lazy={false} />
        </div>
      )}

      {info && (info.overviewTitle || info.overviewLogo || info.overview || info.role || info.duration || info.team || info.type) && (
        <section id="overview" ref={overviewRef} className={`detail-overview${tier === 'desktop' ? ' detail-overview--fill' : ''}`} style={{
          ...(info.overviewBgColor ? { '--overview-bg-color': info.overviewBgColor } : {}),
          ...(info.overviewTextColor ? { '--overview-text-color': info.overviewTextColor } : {}),
          ...(pick(info.overviewTitleGap, info.overviewTitleGapMobile, info.overviewTitleGapTablet) != null ? { '--overview-title-gap': `${pick(info.overviewTitleGap, info.overviewTitleGapMobile, info.overviewTitleGapTablet)}px` } : {}),
        }}>
          <div ref={overviewTextRef} className="detail-overview-text">
            {info.overviewLogo
              ? <img src={info.overviewLogo} alt={info.overviewTitle || project.title} className="detail-overview-logo" style={{ height: autoPx(info.overviewLogoHeight) || '40px' }} />
              : info.overviewTitle && <h2 className="detail-overview-title" style={{ fontSize: autoPx(pick(info.overviewTitleSize, info.overviewTitleSizeMobile, info.overviewTitleSizeTablet)) || undefined, fontWeight: info.overviewTitleWeight || undefined, fontStyle: info.overviewTitleItalic ? 'italic' : undefined, ...typo(info, 'overviewTitle') }}>{info.overviewTitle}</h2>}
            {info.overviewSubtitle && <div ref={overviewSubtitleRef} className="detail-overview-subtitle" style={{ fontSize: autoPx(pick(info.overviewSubtitleSize, info.overviewSubtitleSizeMobile, info.overviewSubtitleSizeTablet)) || undefined, fontWeight: info.overviewSubtitleWeight || undefined, fontStyle: info.overviewSubtitleItalic ? 'italic' : undefined, ...typo(info, 'overviewSubtitle') }} dangerouslySetInnerHTML={{ __html: info.overviewSubtitle }} />}
            {info.overview && <p style={{ fontSize: autoPx(pick(info.overviewSize, info.overviewSizeMobile, info.overviewSizeTablet)) || undefined, fontWeight: info.overviewWeight || undefined, fontStyle: info.overviewItalic ? 'italic' : undefined, ...typo(info, 'overview'), ...(info.overviewMaxWidth ? { '--overview-max-width': info.overviewMaxWidth } : {}) }} dangerouslySetInnerHTML={{ __html: info.overview }} />}
          </div>
          <div ref={overviewMetaRef} className={`detail-overview-meta${tier === 'desktop' ? ' detail-overview-meta--fill' : ''}`} style={{ height: overviewMetaHeight || undefined, paddingTop: overviewMetaPadTop || undefined }}>
            <div className="detail-meta-item">
              {info.team
                ? <><span className="detail-meta-label" style={{ fontSize: autoPx(info.metaLabelSize) || undefined, fontWeight: info.metaLabelWeight || undefined, ...typo(info, 'metaLabel') }}>{metaLabel('team', 'TEAM')}</span><span className="detail-meta-value" style={{ fontSize: autoPx(pick(info.teamSize, info.teamSizeMobile, info.teamSizeTablet)) || undefined, fontWeight: info.teamWeight || undefined, fontStyle: info.teamItalic ? 'italic' : undefined, ...typo(info, 'team') }}>{info.team}</span></>
                : <span className="detail-meta-value" style={{ fontSize: autoPx(pick(info.teamSize, info.teamSizeMobile, info.teamSizeTablet)) || undefined, fontWeight: info.teamWeight || undefined, fontStyle: info.teamItalic ? 'italic' : undefined, ...typo(info, 'team') }}>{t('Individual Project')}</span>
              }
            </div>
            {info.duration && <div className="detail-meta-item"><span className="detail-meta-label" style={{ fontSize: autoPx(info.metaLabelSize) || undefined, fontWeight: info.metaLabelWeight || undefined, ...typo(info, 'metaLabel') }}>{metaLabel('duration', 'DURATION')}</span><span className="detail-meta-value" style={{ fontSize: autoPx(pick(info.durationSize, info.durationSizeMobile, info.durationSizeTablet)) || undefined, fontWeight: info.durationWeight || undefined, fontStyle: info.durationItalic ? 'italic' : undefined, ...typo(info, 'duration') }}>{info.duration}</span></div>}
            {info.role && <div className="detail-meta-item"><span className="detail-meta-label" style={{ fontSize: autoPx(info.metaLabelSize) || undefined, fontWeight: info.metaLabelWeight || undefined, ...typo(info, 'metaLabel') }}>{metaLabel('role', 'ROLE')}</span><span className="detail-meta-value" style={{ fontSize: autoPx(pick(info.roleSize, info.roleSizeMobile, info.roleSizeTablet)) || undefined, fontWeight: info.roleWeight || undefined, fontStyle: info.roleItalic ? 'italic' : undefined, ...typo(info, 'role') }}>{info.role}</span></div>}
          </div>
        </section>
      )}

      {info?.sections && info.sections.filter(s => !s.hidden).map((section, idx) => renderSection(section, idx))}

      <div ref={othersRef} className="detail-others" style={(() => {
        const iconSize = pick(siteConfig.othersIconSize, siteConfig.othersIconSizeMobile, siteConfig.othersIconSizeTablet)
        const titleSize = autoPx(pick(siteConfig.othersTitleSize, siteConfig.othersTitleSizeMobile, siteConfig.othersTitleSizeTablet))
        const titleGap = pick(siteConfig.othersTitleGap, siteConfig.othersTitleGapMobile, siteConfig.othersTitleGapTablet)
        const iconGap = pick(siteConfig.othersIconGap, siteConfig.othersIconGapMobile, siteConfig.othersIconGapTablet)
        return {
          ...(iconSize ? { '--others-icon-size': iconSize } : {}),
          ...(titleSize ? { '--others-title-size': titleSize } : {}),
          ...(titleGap ? { '--others-title-gap': titleGap } : {}),
          ...(iconGap ? { '--others-icon-gap': iconGap } : {}),
          ...(siteConfig.othersTitleBold ? { '--others-title-weight': '700' } : {}),
        }
      })()}>
        <h2>{otherName('projects')}</h2>
        <div className="icon-carousel-wrap">
          <div className="icon-carousel-track">
            {projects.filter(p => p.category === category && p.id !== id && !(siteConfig.hiddenProjects || []).includes(`${p.category}/${p.id}`) && minimalProjectShown(p.category, p.id)).map(p => (
              <Link key={p.id} to={`/projects/${p.category}/${p.id}`} className="projects-category-icon-item anim-done">
                <ImageWithFallback basePath={`/assets/projects/icon-thumbnails/${p.category}-${p.id}`} alt={p.title} style={{width:'100%', height:'100%', objectFit:'contain'}} withHover />
                <span>{p.shortTitle}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {(info?.footnoteLines?.length > 0 || info?.footnote) && (
        <div className="detail-footnote" style={info.footnoteBgColor ? { background: info.footnoteBgColor } : undefined}>
          {info.footnoteLines != null ? renderLines(info.footnoteLines, isMobile, undefined, tier) : (
            <p dangerouslySetInnerHTML={{ __html: sanitizeInline(info.footnote) }} />
          )}
        </div>
      )}
    </div>
  )
}
