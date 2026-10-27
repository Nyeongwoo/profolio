import { useParams, Link } from 'react-router-dom'
import { useState, useEffect, useRef, useMemo } from 'react'
import originals from '../data/originals.json'
import siteConfig from '../data/siteConfig.json'
import { ImageWithFallback, PLACEHOLDER_IMG } from '../utils/getImage'
import ChevronIcon from '../components/ChevronIcon'
import { useScrollReveal } from '../utils/useScrollReveal'
import { useIsMobile, useBreakpointTier } from '../utils/useIsMobile'
import { sanitizeInline } from '../utils/sanitizeInline'
import { autoPx } from '../utils/autoPx'
import { typo } from '../utils/typography'
import { getMaintenanceGate } from '../components/SiteMaintenance'
import ScrollAnimationSection from '../components/ScrollAnimationSection'
import LabEmbed from '../components/LabEmbed'
import { extractYoutubeId } from '../utils/youtube'
import { translateData, t } from '../i18n'
import { useProfolioDoc, IS_POFOLE } from '../utils/pofoleLive'
import { structureFlag, otherName } from '../utils/structure'

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

const sectionBgStyleFn = (section, category, id, mobile = false) => {
  const style = {}
  if (section.bgColor) {
    style.backgroundColor = section.bgColor
    style.boxShadow = `0 0 0 100vmax ${section.bgColor}`
    style.clipPath = 'inset(-1px -100vmax)'
  }
  if (section.bgImage) {
    const src = section.bgImage.startsWith('/') ? section.bgImage : `/assets/originals/${category}/${id}/${section.bgImage}`
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

function renderLines(lines, isMobile, tier) {
  const effTier = tier || (isMobile ? 'mobile' : 'desktop')
  return lines.map((line, i) => {
    const isBodyKind = line.kind !== 'title' && line.kind !== 'subtitle' && line.kind !== 'spacer'
    // Body copy has a fixed 17/15/14px (desktop/tablet/mobile) default so
    // every text section reads consistently even when no size was ever
    // set — titles/subtitles are still author-sized per block on purpose,
    // so they fall through to CSS (undefined) when left blank.
    const resolvedFs = (() => {
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
    const ls = {
      ...(resolvedFs ? { fontSize: resolvedFs } : {}),
      ...(line.weight ? { fontWeight: line.weight } : (isBodyKind ? { fontWeight: '500' } : {})),
      ...(line.color  ? { color:      line.color  } : (isBodyKind ? { color: '#86868D' } : {})),
      ...(line.font && line.font !== 'inherit' ? { fontFamily: line.font } : {}),
      ...(line.italic ? { fontStyle: 'italic' } : {}),
      ...(line.lineHeight ? { lineHeight: line.lineHeight } : (isBodyKind ? { lineHeight: 1.45 } : {})),
      ...(line.letterSpacing ? { letterSpacing: line.letterSpacing } : {}),
      ...(line.maxWidth ? { maxWidth: autoPx(line.maxWidth), ...(line.textAlign === 'center' ? { marginLeft: 'auto', marginRight: 'auto' } : line.textAlign === 'right' ? { marginLeft: 'auto' } : {}) } : {}),
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

function HoverImage({ baseSrc, hoverSrc, isHoverable, alt, ratio, rounded = true }) {
  const [hovered, setHovered] = useState(false)
  const [hoverReady, setHoverReady] = useState(false)
  const [hoverExtIdx, setHoverExtIdx] = useState(0)

  const showHover = hovered && hoverReady
  const radius = rounded ? '12px' : '0'

  return (
    <div
      className="detail-hover-img"
      style={{ ...(ratio ? { aspectRatio: ratio } : null), borderRadius: radius }}
      onMouseEnter={() => isHoverable && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <ImageWithFallback basePath={baseSrc} alt={alt} style={{width:'100%', height:'100%', objectFit:'cover', borderRadius: radius, position:'absolute', inset:0, transition:'opacity 0.5s ease', opacity: showHover ? 0 : 1}} />
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

function AnnotatedImage({ baseSrc, hoverSrc, isHoverable, alt, annotations, ratio }) {
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
        const hasBend = ann.bendX !== undefined && ann.bendX !== null
        const bx = hasBend ? px(ann.bendX, size.w) : null
        const active = isActive(ann, i)

        const pathD = hasBend
          ? `M ${x1} ${y1} L ${bx} ${y1} L ${bx} ${y2} L ${x2} ${y2}`
          : `M ${x1} ${y1} L ${x2} ${y2}`

        return (
          <div key={i}>
            <svg
              className="ann-svg"
              style={{position:'absolute', inset:0, width:'100%', height:'100%', pointerEvents:'none', overflow:'visible', zIndex:10}}
            >
              <path d={pathD} fill="none" stroke="#333" strokeWidth="1" opacity={active ? 1 : 0.4} />
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
              {ann.icon && <img src={ann.icon} alt="" className="ann-label-icon" />}
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

function BlockCarousel({ blocks, category, id, isMobile, tier, cardSize, cardRatio, cardHeight, cardHeightTablet }) {
  const trackRef = useRef(null)
  const [canPrev, setCanPrev] = useState(false)
  const [canNext, setCanNext] = useState(true)
  const [hasOverflow, setHasOverflow] = useState(false)
  const effCardHeight = tier === 'tablet' ? (cardHeightTablet || cardHeight) : cardHeight
  const fixedHpx = tier !== 'mobile' && effCardHeight ? parseFloat(effCardHeight) : null
  const fixedH = fixedHpx ? `${fixedHpx}px` : null

  const updateButtons = () => {
    const el = trackRef.current
    if (!el) return
    setCanPrev(el.scrollLeft > 4)
    setCanNext(el.scrollLeft < el.scrollWidth - el.clientWidth - 4)
    setHasOverflow(el.scrollWidth > el.clientWidth + 4)
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
    const ro = new ResizeObserver(updateButtons)
    ro.observe(el)
    return () => { el.removeEventListener('scroll', updateButtons); window.removeEventListener('resize', updateButtons); ro.disconnect() }
  }, [])

  return (
    <div className="bc-wrap">
      <div className="bc-track" ref={trackRef}>
        {blocks.map((block, idx) => {
          const images = block.images || []
          const hoverImages = block.hoverImages || []
          const mobileImages = mobileMap(block.mobileImages)
          const getImgSrc = (i) => {
            if (i === PLACEHOLDER_IMG) return PLACEHOLDER_IMG
            const num = String(i).padStart(2,'0')
            const mNum = mobileImages[i]
            if (mNum === PLACEHOLDER_IMG) return isMobile ? PLACEHOLDER_IMG : `/assets/originals/${category}/${id}/sections/${num}`
            if (isMobile && mNum != null) return `/assets/originals/${category}/${id}/mobile/${String(mNum).padStart(2,'0')}`
            return `/assets/originals/${category}/${id}/sections/${num}`
          }
          const getHoverSrc = (i) => `/assets/originals/${category}/${id}/hover/${String(i).padStart(2,'0')}`
          const blockRatio = isMobile ? (block.mobileRatio || block.desktopRatio || cardRatio) : (block.desktopRatio || cardRatio)
          const cardFlexBasis = isMobile ? undefined : (CARD_SIZE_MAP[cardSize] || undefined)
          const cardW = fixedHpx ? `${Math.round(fixedHpx * (parseRatioNum(blockRatio) || 16 / 9))}px` : null
          const cardStyle = cardW ? { flex: `0 0 ${cardW}` } : (cardFlexBasis ? { flex: `0 0 ${cardFlexBasis}` } : undefined)
          const imgStyle = fixedH ? { width: cardW, height: fixedH } : (blockRatio ? { aspectRatio: blockRatio } : undefined)
          return (
            <div key={idx} className="bc-card" style={cardStyle}>
              <div className="bc-card-img" style={imgStyle}>
                {block.gridColumns > 1 ? (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: `repeat(${block.gridColumns}, 1fr)`,
                    gridTemplateRows: `repeat(${block.gridRows || Math.max(1, Math.ceil(images.length / block.gridColumns))}, 1fr)`,
                    gap: autoPx(block.gridGap) || '2px',
                    width: '100%', height: '100%',
                  }}>
                    {images.map(i => (
                      <div key={i} style={{ overflow: 'hidden', minHeight: 0 }}>
                        <ImageWithFallback basePath={getImgSrc(i)} alt={block.title || id} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                      </div>
                    ))}
                  </div>
                ) : images.map(i => {
                  const isHoverable = hoverImages.includes(i)
                  return <HoverImage key={i} baseSrc={getImgSrc(i)} hoverSrc={getHoverSrc(i)} isHoverable={isHoverable} alt={block.title || id} ratio={blockRatio} />
                })}
                {(block.overlayTitle || block.overlayContent) && (
                  <div className="detail-full-overlay detail-full-overlay-left">
                    {block.overlayTitle && <h2 className="detail-full-overlay-title" dangerouslySetInnerHTML={{__html: sanitizeInline(block.overlayTitle)}} />}
                    {block.overlayContent && <p className="detail-full-overlay-content" dangerouslySetInnerHTML={{__html: sanitizeInline(block.overlayContent)}} />}
                  </div>
                )}
              </div>
              <div className="bc-card-body" style={{ maxWidth: toMaxWidth(block.textMaxWidth), ...txtStyle(block) }}>
                {block.lines != null ? renderLines(block.lines, isMobile) : <>
                  {block.title && <p style={{ fontFamily: ff(block,'title'), ...typo(block, 'title'), fontWeight: fw(block,'title'), color: fc(block,'title'), fontStyle: fi(block,'title') }} dangerouslySetInnerHTML={{__html: sanitizeInline(block.title)}} />}
                  {block.content && <p style={{ fontFamily: ff(block,'content'), ...typo(block, 'content'), fontWeight: fw(block,'content'), color: fc(block,'content'), fontStyle: fi(block,'content') }} dangerouslySetInnerHTML={{__html: sanitizeInline(block.content)}} />}
                  {block.subtitle && <p className="bc-card-sub" style={{ fontFamily: ff(block,'subtitle'), ...typo(block, 'subtitle'), fontWeight: fw(block,'subtitle'), color: fc(block,'subtitle'), fontStyle: fi(block,'subtitle') }} dangerouslySetInnerHTML={{__html: sanitizeInline(block.subtitle)}} />}
                </>}
              </div>
            </div>
          )
        })}
      </div>
      {hasOverflow && (
        <div className="bc-nav">
          <button className="bc-btn" onClick={() => scroll(-1)} disabled={!canPrev} aria-label="Previous"><ChevronIcon direction="left" /></button>
          <button className="bc-btn" onClick={() => scroll(1)} disabled={!canNext} aria-label="Next"><ChevronIcon direction="right" /></button>
        </div>
      )}
    </div>
  )
}

function TabSwitcherSection({ section, category, id }) {
  const tabs = section.tabs || []
  const [active, setActive] = useState(0)
  const tab = tabs[active] || {}
  const imgSrc = tab.image ? `/assets/originals/${category}/${id}/sections/${String(tab.image).padStart(2,'0')}` : null

  return (
    <section id={section.id} className="detail-section-mid detail-tab-switcher" style={sectionBgStyleFn(section, category, id)}>
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

function ImageTabSection({ section, category, id, isMobile, tier }) {
  const tabs = section.tabs || []
  const [active, setActive] = useState(0)
  const basePath = `/assets/originals/${category}/${id}/sections`
  const tabStyle   = section.tabStyle    || 'underline'
  const tabPos     = section.tabPosition || 'bottom'
  const tabSize    = section.tabSize     || 'md'
  const activeTab  = tabs[active] || {}

  const tabImgSrc = (num) => num === PLACEHOLDER_IMG ? PLACEHOLDER_IMG : `${basePath}/${String(num).padStart(2,'0')}`

  const tabBar = (
    <div className={`detail-image-tab-bar detail-image-tab-bar--${tabStyle} detail-image-tab-bar--${tabSize} detail-image-tab-bar--${tabPos}`} style={{
      ...(section.tabGap != null ? { gap: `${section.tabGap}px` } : {}),
      ...(section.tabAlign === 'center' ? { justifyContent: 'center' } : section.tabAlign === 'left' ? { justifyContent: 'flex-start' } : {}),
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
                <span style={typo(t, 'label')}>{t.label || ' '}</span>
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
                  basePath={tabImgSrc(num)}
                  alt={tab.label || ''}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  lazy={false}
                />
              </div>
            ))}
            {(hasLines || section.textMinHeight) && !textBelowBar && (
              <div className="detail-image-tab-text" style={{
                ...(section.textAlign ? { textAlign: section.textAlign } : {}),
                ...(section.textMinHeight ? { minHeight: `${section.textMinHeight}px` } : {}),
              }}>
                {hasLines && renderLines(tab.lines, isMobile, tier)}
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
        {hasLines && renderLines(activeTab.lines, isMobile, tier)}
      </div>
    )
  })()

  return (
    <section id={section.id} className="detail-image-tab" style={sectionBgStyleFn(section, category, id, isMobile)}>
      {section.title && <h2 className="detail-image-tab-heading" style={typo(section, 'title')} dangerouslySetInnerHTML={{__html: sanitizeInline(section.title)}} />}
      {tabPos === 'top' && tabBar}
      {stage}
      {tabPos !== 'top' && tabBar}
      {belowBarText}
    </section>
  )
}

function FeatureTabsSection({ section, category, id, isMobile, tier }) {
  const items = section.items || []
  const [active, setActive] = useState(0)
  const item = items[active] || {}
  const basePath = `/assets/originals/${category}/${id}/sections`
  const imgs = item.images || []
  const itemRatio = isMobile ? (item.mobileRatio || item.desktopRatio) : item.desktopRatio
  const hasLines = item.lines != null && item.lines.length > 0

  const getImgSrc = (num) => num === PLACEHOLDER_IMG ? PLACEHOLDER_IMG : `${basePath}/${String(num).padStart(2,'0')}`

  return (
    <section id={section.id} className="detail-feature-tabs" style={sectionBgStyleFn(section, category, id, isMobile)}>
      <div className="detail-feature-tabs-bar">
        {items.map((t, i) => (
          <button key={i} className={`detail-feature-tab${active === i ? ' detail-feature-tab--active' : ''}`} onClick={() => setActive(i)}>
            {t.icon && <img src={`/assets/originals/${category}/${id}/sections/${t.icon}`} alt={t.title||''} className="detail-feature-tab-icon" />}
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
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          </div>
        ))}
        {hasLines
          ? renderLines(item.lines, isMobile, tier)
          : item.subtitle && <p dangerouslySetInnerHTML={{__html: sanitizeInline(item.subtitle)}} />}
      </div>
    </section>
  )
}

function AccordionSection({ section, category, id, isMobile, tier }) {
  const items = section.items || []
  const [openIdx, setOpenIdx] = useState(null)
  const basePath = `/assets/originals/${category}/${id}/sections`

  const getImgSrc = (num) => num === PLACEHOLDER_IMG ? PLACEHOLDER_IMG : `${basePath}/${String(num).padStart(2,'0')}`

  return (
    <section id={section.id} className="detail-section-mid detail-accordion" style={sectionBgStyleFn(section, category, id, isMobile)}>
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
                        basePath={getImgSrc(num)}
                        alt={item.title || ''}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                      />
                    </div>
                  ))}
                  {hasLines
                    ? renderLines(item.lines, isMobile, tier)
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

export default function OriginalDetail() {
  const { category, id } = useParams()
  const original = originals.find(o => o.id === id)
  const [info, setInfo] = useState(null)
  useScrollReveal(info)
  const [activeSection, setActiveSection] = useState('')
  const [showToc, setShowToc] = useState(false)
  const tocEnabled = info?.toc ?? !!siteConfig.tocEnabled
  const isMobile = useIsMobile()
  const tier = useBreakpointTier()
  // Resolves a size/value that can be overridden per-tier (mobile/tablet),
  // falling back to the desktop base value when no tier-specific override is set.
  const pick = (base, mobile, tablet) => (tier === 'mobile' ? mobile : tier === 'tablet' ? tablet : null) || base
  const [navHidden, setNavHidden] = useState(false)
  const lastScrollYRef = useRef(0)
  const othersRef = useRef(null)
  const overviewRef = useRef(null)
  const overviewTextRef = useRef(null)
  const overviewSubtitleRef = useRef(null)
  const overviewMetaRef = useRef(null)
  const [overviewMetaPadTop, setOverviewMetaPadTop] = useState(0)
  const [overviewMetaHeight, setOverviewMetaHeight] = useState(0)

  useEffect(() => {
    const measure = () => {
      const meta = overviewMetaRef.current
      if (!meta) return
      if (info?.overviewSubtitle) {
        const sub = overviewSubtitleRef.current
        if (sub) setOverviewMetaPadTop(Math.max(0, sub.getBoundingClientRect().top - meta.getBoundingClientRect().top))
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
      const url = `/assets/originals/${category}/${id}/info.json${bust ? `?t=${Date.now()}` : ''}`
      fetch(url, { cache: 'no-cache' })
        .then(r => r.json())
        .then(d => { if (active) setInfo(translateData(d)) })
        .catch(() => { if (active) setInfo({}) })
    }
    loadInfo(false)
    let bc
    try {
      bc = new BroadcastChannel('nnwoo-content')
      bc.onmessage = (e) => { const d = e.data; if (!d || d.all || (d.category === category && d.id === id)) loadInfo(true) }
    } catch { /* BroadcastChannel unsupported */ }
    // In Profolio the app sends edits live and owns reloading.
    const onFocus = () => loadInfo(true)
    if (!IS_POFOLE) window.addEventListener('focus', onFocus)
    return () => { active = false; window.removeEventListener('focus', onFocus); if (bc) bc.close() }
  }, [category, id])
  useProfolioDoc(`/assets/originals/${category}/${id}/info.json`, d => setInfo(translateData(d)))

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
      const othersTop = othersRef.current ? othersRef.current.getBoundingClientRect().top : Infinity
      const beforeOthers = othersTop > window.innerHeight
      setShowToc(pastHero && beforeOthers)
      const sections = tocItems.map(item => document.getElementById(item.id)).filter(Boolean)
      const scrollY = window.scrollY + 120
      for (let i = sections.length - 1; i >= 0; i--) {
        if (sections[i].offsetTop <= scrollY) {
          setActiveSection(sections[i].id)
          break
        }
      }
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [tocItems])

  if (!original) return <div>{t('Not found')}</div>

  const maintenanceGate = getMaintenanceGate(info?.maintenance)
  if (maintenanceGate) return maintenanceGate

  const imgSrc = (i, mobileField) => {
    if (i === PLACEHOLDER_IMG) return PLACEHOLDER_IMG
    const num = String(i).padStart(2, '0')
    const mNum = mobileMap(mobileField)[i]
    if (mNum === PLACEHOLDER_IMG) return isMobile ? PLACEHOLDER_IMG : `/assets/originals/${category}/${id}/sections/${num}`
    if (isMobile && mNum != null) return `/assets/originals/${category}/${id}/mobile/${String(mNum).padStart(2,'0')}`
    return `/assets/originals/${category}/${id}/sections/${num}`
  }
  const hoverSrcFn = (i) => `/assets/originals/${category}/${id}/hover/${String(i).padStart(2,'0')}`

  const sectionBgStyle = (section, mobile = false) => sectionBgStyleFn(section, category, id, mobile)

  const renderSection = (section, idx) => {
    if (section.type === 'scroll-animation') {
      return (
        <ScrollAnimationSection key={`${section.id}-${idx}`} id={section.id} section={section} assetsBase={`/assets/originals/${category}/${id}`} isMobile={isMobile} tier={tier} renderLines={renderLines} />
      )
    }

    if (section.type === 'model-viewer') {
      const modelSrc = section.modelFile ? (section.modelFile.startsWith('/') ? section.modelFile : `/assets/originals/${category}/${id}/${section.modelFile}`) : null
      return (
        <section key={`${section.id}-${idx}`} id={section.id} className="detail-section-mid" style={sectionBgStyle(section, isMobile)}>
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
              {renderLines(section.lines, isMobile, tier)}
            </div>
          )}
        </section>
      )
    }

    if (section.type === 'tab-switcher') {
      return <TabSwitcherSection key={`${section.id}-${idx}`} section={section} category={category} id={id} />
    }

    if (section.type === 'feature-tabs') {
      return <FeatureTabsSection key={`${section.id}-${idx}`} section={section} category={category} id={id} isMobile={isMobile} tier={tier} />
    }

    if (section.type === 'image-tab') {
      return <ImageTabSection key={`${section.id}-${idx}`} section={section} category={category} id={id} isMobile={isMobile} tier={tier} />
    }

    if (section.type === 'accordion') {
      return <AccordionSection key={`${section.id}-${idx}`} section={section} category={category} id={id} isMobile={isMobile} tier={tier} />
    }

    if (section.type === 'interactive') {
      return (
        <section key={`${section.id}-${idx}`} id={section.id} className="detail-section-mid" style={sectionBgStyle(section, isMobile)}>
          <LabEmbed section={section} isMobile={isMobile} />
          {section.lines && section.lines.length > 0 && (
            <div className="detail-block-mid-body">
              {renderLines(section.lines, isMobile, tier)}
            </div>
          )}
        </section>
      )
    }

    if (section.type === 'video-background') {
      const isYoutube = section.videoType === 'youtube' && !!section.youtubeId
      const vSrc = !isYoutube && section.videoSrc ? (section.videoSrc.startsWith('/') ? section.videoSrc : `/assets/originals/${category}/${id}/sections/${section.videoSrc}`) : null
      const muted = section.videoMuted !== false
      const loop = section.videoLoop !== false
      const videoProps = { src: vSrc, autoPlay: muted, muted, loop, playsInline: true, controls: !muted }
      const hasText = section.lines?.length > 0 || section.title || section.content
      const textInner = section.lines != null ? renderLines(section.lines, isMobile, tier) : <>
        {section.title && <h2 style={{ color: section.titleColor, fontSize: autoPx(section.titleSize), fontWeight: section.titleBold ? '700' : undefined }} dangerouslySetInnerHTML={{__html: sanitizeInline(section.title)}} />}
        {section.content && <p style={{ color: section.contentColor, fontSize: isMobile ? '14px' : autoPx(section.contentSize) }} dangerouslySetInnerHTML={{__html: sanitizeInline(section.content)}} />}
      </>

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
            ...sectionBgStyle(section, isMobile),
            ...(section.matchTextPadding && !isMobile ? { alignItems: 'flex-start' } : {}),
          }}>
            {!below && textNode}
            {isYoutube ? (
              <div className="detail-video-ratio-wrap" style={{ aspectRatio: effRatio, maxWidth: autoPx(section.videoMaxWidth) }}>
                <YoutubeEmbed videoId={section.youtubeId} thumbnail={section.videoThumbnail} />
              </div>
            ) : vSrc && (
              <div className="detail-video-ratio-wrap" style={{ aspectRatio: effRatio, maxWidth: autoPx(section.videoMaxWidth) }}>
                <video className="detail-video-ratio" {...videoProps} />
              </div>
            )}
            {below && textNode}
          </section>
        )
      }

      return (
        <section key={`${section.id}-${idx}`} id={section.id} className="detail-section-video-bg" style={sectionBgStyle(section, isMobile)}>
          {vSrc && <video className="detail-video-bg" {...videoProps} />}
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
        <section key={`${section.id}-${idx}`} id={section.id} className="detail-stats" style={sectionBgStyle(section, isMobile)}>
          {items.map((item, i) => (
            <div key={i} className="detail-stats-item">
              {item.icon && <img className="detail-stats-icon" src={`/assets/originals/${category}/${id}/sections/${item.icon}`} alt="" />}
              {item.value && <div className="detail-stats-value" style={typo(item, 'value')}>{item.value}</div>}
              {item.label && <div className="detail-stats-label" style={typo(item, 'label')}>{item.label}</div>}
            </div>
          ))}
        </section>
      )
    }

    if (section.type === 'images') {
      const ov = section.overlay
      const mobileNums = section.mobileImages || []
      const sectionRatio = isMobile ? (section.mobileRatio || section.desktopRatio) : section.desktopRatio
      return (
        <section key={`${section.id}-${idx}`} id={section.id} className={`detail-section-full${section.matchTextPadding ? ' detail-section-full--padded' : ''}`} style={sectionBgStyle(section)}>
          {(section.images || []).map(i => (
            <div key={i} className="detail-full-img-wrap" style={sectionRatio ? { aspectRatio: sectionRatio, overflow: 'hidden' } : undefined}>
              <ImageWithFallback basePath={imgSrc(i, mobileNums)} alt={`section-${i}`} style={{width:'100%', height: sectionRatio ? '100%' : undefined, display:'block', objectFit: sectionRatio ? 'cover' : undefined}} />
              {ov && (ov.title || ov.subtitle || ov.content) && (
                <div className={`detail-full-overlay detail-full-overlay-${ov.position || 'left'}`} style={(isMobile ? (ov.mobileTextMaxWidth || undefined) : ov.textMaxWidth) ? { maxWidth: isMobile ? (ov.mobileTextMaxWidth || undefined) : ov.textMaxWidth } : undefined}>
                  {ov.title && <h2 className="detail-full-overlay-title" style={{ color: ov.titleColor, fontSize: autoPx(ov.titleSize), fontWeight: ov.titleWeight, fontFamily: ov.titleFont, fontStyle: ov.titleItalic ? 'italic' : undefined }} dangerouslySetInnerHTML={{__html: sanitizeInline(ov.title)}} />}
                  {ov.subtitle && <h4 className="detail-full-overlay-subtitle" dangerouslySetInnerHTML={{__html: sanitizeInline(ov.subtitle)}} />}
                  {ov.content && <p className="detail-full-overlay-content" style={{ color: ov.contentColor, fontSize: isMobile ? '14px' : autoPx(ov.contentSize), fontWeight: ov.contentWeight, fontFamily: ov.contentFont, fontStyle: ov.contentItalic ? 'italic' : undefined }} dangerouslySetInnerHTML={{__html: sanitizeInline(ov.content)}} />}
                </div>
              )}
            </div>
          ))}
        </section>
      )
    }

    if (section.type === 'image-text') {
      const blocks = (section.blocks || []).filter(b => !b.hidden)
      const effCardHeight = tier === 'tablet' ? (section.cardHeightTablet || section.cardHeight) : section.cardHeight
      const fixedH = tier !== 'mobile' && effCardHeight ? `${effCardHeight}px` : null
      return (
        <section key={`${section.id}-${idx}`} id={section.id} className={`detail-section-mid${section.matchTextPadding ? ' match-text-pad' : ''}`} style={sectionBgStyle(section, isMobile)}>
          {blocks.map((block, idx) => {
            const images = block.images || []
            const hoverImages = block.hoverImages || []
            const mobileImages = block.mobileImages
            const activeAnnotations = isMobile
              ? (Array.isArray(block.mobileAnnotations) ? block.mobileAnnotations : (block.annotations || []))
              : (block.annotations || [])
            const hasMobileOnly = images.length === 0 && Object.keys(mobileMap(mobileImages)).length > 0
            const blockRatio = isMobile ? (block.mobileRatio || block.desktopRatio) : block.desktopRatio
            const imgMaxW = !isMobile ? IMG_WIDTH_MAP[block.imgWidth] : undefined
            const blockAlign = !isMobile && block.textAlign === 'right' ? 'right' : !isMobile && block.textAlign === 'left' ? 'left' : null
            const sharedW = blockAlign ? (imgMaxW || '100%') : undefined
            const blockWrapStyle = blockAlign === 'left' ? { paddingLeft: 'var(--gutter)', alignItems: 'flex-start' }
                                 : blockAlign === 'right' ? { paddingRight: 'var(--gutter)', alignItems: 'flex-end' } : undefined
            const roundedImg = !(isMobile && block.mobileSquare)
            return (
              <div key={idx} className="detail-block-mid" style={blockWrapStyle}>
                {(images.length > 0 || (isMobile && hasMobileOnly)) && (
                  <div className={`detail-block-mid-img${fixedH ? ' fixed-h' : ''}`} style={{ ...(sharedW ? { width: sharedW } : (imgMaxW ? { maxWidth: imgMaxW, margin: '0 auto' } : {})), ...(fixedH ? { height: fixedH } : {}) }}>
                    {images.length > 0 ? images.map(i => {
                      const isHoverable = hoverImages.includes(i)
                      return activeAnnotations.length > 0
                        ? <AnnotatedImage key={i} baseSrc={imgSrc(i, mobileImages)} hoverSrc={hoverSrcFn(i)} isHoverable={isHoverable} alt={block.title || section.id} annotations={activeAnnotations} ratio={fixedH ? undefined : blockRatio} />
                        : <HoverImage key={i} baseSrc={imgSrc(i, mobileImages)} hoverSrc={hoverSrcFn(i)} isHoverable={isHoverable} alt={block.title || section.id} ratio={fixedH ? undefined : blockRatio} rounded={roundedImg} />
                    }) : Object.values(mobileMap(mobileImages)).map(i => {
                      const num = String(i).padStart(2,'0')
                      return <HoverImage key={i} baseSrc={`/assets/originals/${category}/${id}/mobile/${num}`} hoverSrc={hoverSrcFn(i)} isHoverable={false} alt={block.title || section.id} ratio={fixedH ? undefined : blockRatio} rounded={roundedImg} />
                    })}
                    {(block.overlayTitle || block.overlayContent) && (
                      <div className="detail-full-overlay detail-full-overlay-left">
                        {block.overlayTitle && <h2 className="detail-full-overlay-title" dangerouslySetInnerHTML={{__html: sanitizeInline(block.overlayTitle)}} />}
                        {block.overlayContent && <p className="detail-full-overlay-content" dangerouslySetInnerHTML={{__html: sanitizeInline(block.overlayContent)}} />}
                      </div>
                    )}
                  </div>
                )}
                {(block.lines != null ? block.lines.length > 0 : (block.title || block.subtitle || block.content)) && (
                  <div className="detail-block-mid-body" style={sharedW
                    ? { ...txtStyle(block), width: sharedW, maxWidth: autoPx(block.textMaxWidth) || sharedW }
                    : { ...txtStyle(block), alignSelf: block.textAlign === 'right' ? 'flex-end' : block.textAlign === 'center' ? 'center' : 'flex-start', ...(block.textMaxWidth ? { maxWidth: autoPx(block.textMaxWidth) } : {}) }
                  }>
                    {block.lines != null ? renderLines(block.lines, isMobile) : <>
                      {block.title && <h2 style={{ fontFamily: ff(block,'title'), ...typo(block, 'title'), fontWeight: fw(block,'title'), color: fc(block,'title'), fontStyle: fi(block,'title') }} dangerouslySetInnerHTML={{__html: sanitizeInline(block.title)}} />}
                      {block.subtitle && <h4 style={{ fontFamily: ff(block,'subtitle'), ...typo(block, 'subtitle'), fontWeight: fw(block,'subtitle'), color: fc(block,'subtitle'), fontStyle: fi(block,'subtitle') }} dangerouslySetInnerHTML={{__html: sanitizeInline(block.subtitle)}} />}
                      {block.content && <p style={{ fontFamily: ff(block,'content'), ...typo(block, 'content'), fontWeight: fw(block,'content'), color: fc(block,'content'), fontStyle: fi(block,'content') }} dangerouslySetInnerHTML={{__html: sanitizeInline(block.content)}} />}
                    </>}
                  </div>
                )}
              </div>
            )
          })}
        </section>
      )
    }

    if (section.type === 'image-text-carousel') {
      return (
        <section key={`${section.id}-${idx}`} id={section.id} className="detail-section-carousel" style={sectionBgStyle(section)}>
          <BlockCarousel blocks={(section.blocks || []).filter(b => !b.hidden)} category={category} id={id} isMobile={isMobile} tier={tier} cardSize={section.cardSize} cardRatio={section.cardRatio} cardHeight={section.cardHeight} cardHeightTablet={section.cardHeightTablet} />
        </section>
      )
    }

    if (section.type === 'image-grid') {
      const cols = tier === 'mobile' ? (section.mobileColumns || 2) : tier === 'tablet' ? (section.tabletColumns || 3) : (section.columns || 4)
      const rows = tier === 'mobile' ? section.mobileRows : tier === 'tablet' ? (section.tabletRows ?? section.rows) : section.rows
      const gap = section.gap || '4px'
      const ratio = isMobile ? (section.mobileRatio || section.desktopRatio) : section.desktopRatio
      const mobileNums = section.mobileImages || []
      return (
        <section key={`${section.id}-${idx}`} id={section.id} className="detail-section-mid" style={sectionBgStyle(section)}>
          <div style={{
            width: '100%',
            boxSizing: 'border-box',
            ...(isMobile
              ? { padding: `0 ${section.mobilePadding ?? 20}px` }
              : toMaxWidth(section.textMaxWidth)
                ? { maxWidth: toMaxWidth(section.textMaxWidth), margin: '0 auto' }
                // Same convention as ProjectDetail.jsx's image-grid — matches
                // the "images"/"image-text" matchTextPadding side inset (22%)
                // by default instead of an uncoordinated width%.
                : { padding: '0 22%' }),
          }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${cols}, 1fr)`,
              ...(rows ? { gridTemplateRows: `repeat(${rows}, 1fr)` } : {}),
              gap,
            }}>
              {(section.images || []).map(i => {
                const src = imgSrc(i, mobileNums)
                return (
                  <div key={i} style={ratio ? { aspectRatio: ratio, overflow: 'hidden' } : undefined}>
                    <ImageWithFallback basePath={src} alt={`${section.id}-${i}`} style={{ width: '100%', height: ratio ? '100%' : undefined, display: 'block', objectFit: 'cover' }} />
                  </div>
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
        <section key={`${section.id}-${idx}`} id={section.id} className="detail-section-mid match-text-pad" style={sectionBgStyle(section)}>
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
                {renderLines(col.lines || [], isMobile, tier)}
              </div>
            ))}
          </div>
        </section>
      )
    }

    if (section.type === 'text') {
      const txtAlign = { textAlign: section.textAlign || 'left' }
      return (
        <section key={`${section.id}-${idx}`} id={section.id} className="detail-section-mid" style={sectionBgStyle(section)}>
          <div className="detail-section-text-body" style={{
            ...(toMaxWidth(section.textMaxWidth) ? { maxWidth: toMaxWidth(section.textMaxWidth) } : {}),
            margin: section.textAlign === 'center' ? '0 auto' : section.textAlign === 'right' ? '0 0 0 auto' : '0',
            ...txtAlign,
          }}>
            {section.lines != null ? (
              renderLines(section.lines, isMobile, tier)
            ) : (
              <>
                {section.title && <h2 style={{ fontFamily: ff(section,'title'), ...typo(section, 'title'), fontWeight: fw(section,'title'), ...(section.titleSize ? { fontSize: autoPx(section.titleSize) } : {}), color: fc(section,'title'), fontStyle: fi(section,'title') }} dangerouslySetInnerHTML={{__html: sanitizeInline(section.title)}} />}
                {section.content && <p style={{ fontFamily: ff(section,'content'), ...typo(section, 'content'), fontWeight: fw(section,'content'), ...(isMobile ? { fontSize: '14px' } : section.contentSize ? { fontSize: autoPx(section.contentSize) } : {}), color: fc(section,'content'), fontStyle: fi(section,'content') }} dangerouslySetInnerHTML={{__html: sanitizeInline(section.content)}} />}
              </>
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
            <Link to={`/originals/${category}`} aria-label="Back">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
            </Link>
          </span>
          <div className="detail-nav-links">
            <span className="detail-nav-item" style={{ fontSize: autoPx(info?.navLabelSize) || undefined, fontWeight: info?.navLabelWeight || undefined, fontStyle: info?.navLabelItalic ? 'italic' : undefined, ...typo(info, 'navLabel') }}>{info?.navLabel || `${original.title} — ${original.year}`}</span>
          </div>
        </nav>
      )}

      {/* Section TOC — off unless enabled site-wide (Home editor → TOC
          Settings) or for this page (info.toc: true/false overrides). */}
      {tocEnabled && (
        <nav className={`detail-toc${showToc ? ' toc-visible' : ''}${siteConfig.tocAlwaysShowLabels ? ' toc-always-labels' : ''}${siteConfig.tocBackgroundStyle === 'none' ? ' toc-bg-none' : siteConfig.tocBackgroundStyle === 'gradient' ? ' toc-bg-gradient' : ''}`}
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
              <span className="toc-label">{item.label}</span>
            </a>
          ))}
        </nav>
      )}

      <div className="detail-hero" style={{aspectRatio: tier !== 'desktop' ? '5/4' : '16/9', overflow:'hidden'}}>
        <ImageWithFallback basePath={`/assets/originals/${category}/${id}/hero`} alt={original.title} style={{width:'100%', height:'100%', objectFit:'cover'}} lazy={false} />
      </div>

      {info && (info.overviewTitle || info.overview || info.type || info.role || info.duration || info.team) && (
        <section id="overview" ref={overviewRef} className={`detail-overview${tier === 'desktop' ? ' detail-overview--fill' : ''}`} style={{
          ...(info.overviewBgColor ? { '--overview-bg-color': info.overviewBgColor } : {}),
          ...(info.overviewTextColor ? { '--overview-text-color': info.overviewTextColor } : {}),
          ...(pick(info.overviewTitleGap, info.overviewTitleGapMobile, info.overviewTitleGapTablet) != null ? { '--overview-title-gap': `${pick(info.overviewTitleGap, info.overviewTitleGapMobile, info.overviewTitleGapTablet)}px` } : {}),
        }}>
          <div ref={overviewTextRef} className="detail-overview-text">
            {info.overviewTitle && <h2 className="detail-overview-title" style={{ fontSize: autoPx(pick(info.overviewTitleSize, info.overviewTitleSizeMobile, info.overviewTitleSizeTablet)) || undefined, fontWeight: info.overviewTitleWeight || undefined, fontStyle: info.overviewTitleItalic ? 'italic' : undefined, ...typo(info, 'overviewTitle') }}>{info.overviewTitle}</h2>}
            {info.overviewSubtitle && <div ref={overviewSubtitleRef} className="detail-overview-subtitle" style={{ fontSize: autoPx(pick(info.overviewSubtitleSize, info.overviewSubtitleSizeMobile, info.overviewSubtitleSizeTablet)) || undefined, fontWeight: info.overviewSubtitleWeight || undefined, fontStyle: info.overviewSubtitleItalic ? 'italic' : undefined, ...typo(info, 'overviewSubtitle') }} dangerouslySetInnerHTML={{ __html: info.overviewSubtitle }} />}
            {info.overview && <p style={{ fontSize: autoPx(pick(info.overviewSize, info.overviewSizeMobile, info.overviewSizeTablet)) || undefined, fontWeight: info.overviewWeight || undefined, fontStyle: info.overviewItalic ? 'italic' : undefined, ...typo(info, 'overview'), ...(info.overviewMaxWidth ? { '--overview-max-width': info.overviewMaxWidth } : {}) }} dangerouslySetInnerHTML={{ __html: sanitizeInline(info.overview) }} />}
          </div>
          <div ref={overviewMetaRef} className={`detail-overview-meta${tier === 'desktop' ? ' detail-overview-meta--fill' : ''}`} style={{ height: overviewMetaHeight || undefined, paddingTop: overviewMetaPadTop || undefined }}>
            {info.type && <div className="detail-meta-item"><span className="detail-meta-label" style={{ fontWeight: info.metaLabelWeight || undefined, ...typo(info, 'metaLabel') }}>{t('TYPE')}</span><span className="detail-meta-value" style={{ fontSize: autoPx(pick(info.typeSize, info.typeSizeMobile, info.typeSizeTablet)) || undefined, fontWeight: info.typeWeight || undefined, fontStyle: info.typeItalic ? 'italic' : undefined, ...typo(info, 'type') }}>{t(info.type)}</span></div>}
            {info.duration && <div className="detail-meta-item"><span className="detail-meta-label" style={{ fontWeight: info.metaLabelWeight || undefined, ...typo(info, 'metaLabel') }}>{t('YEAR')}</span><span className="detail-meta-value" style={{ fontSize: autoPx(pick(info.durationSize, info.durationSizeMobile, info.durationSizeTablet)) || undefined, fontWeight: info.durationWeight || undefined, fontStyle: info.durationItalic ? 'italic' : undefined, ...typo(info, 'duration') }}>{info.duration}</span></div>}
            {info.team
              ? <div className="detail-meta-item"><span className="detail-meta-label" style={{ fontWeight: info.metaLabelWeight || undefined, ...typo(info, 'metaLabel') }}>{t('TEAM')}</span><span className="detail-meta-value" style={{ fontSize: autoPx(pick(info.teamSize, info.teamSizeMobile, info.teamSizeTablet)) || undefined, fontWeight: info.teamWeight || undefined, fontStyle: info.teamItalic ? 'italic' : undefined, ...typo(info, 'team') }}>{info.team}</span></div>
              : <div className="detail-meta-item"><span className="detail-meta-value" style={{ color: 'var(--text-muted, #999)' }}>{t('Individual Project')}</span></div>
            }
            {info.role && <div className="detail-meta-item"><span className="detail-meta-label" style={{ fontWeight: info.metaLabelWeight || undefined, ...typo(info, 'metaLabel') }}>{t('ROLE')}</span><span className="detail-meta-value" style={{ fontSize: autoPx(pick(info.roleSize, info.roleSizeMobile, info.roleSizeTablet)) || undefined, fontWeight: info.roleWeight || undefined, fontStyle: info.roleItalic ? 'italic' : undefined, ...typo(info, 'role') }}>{info.role}</span></div>}
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
        <h2>{otherName('originals')}</h2>
        <div className="icon-carousel-wrap">
          <div className="icon-carousel-track">
            {originals.filter(o => o.id !== id).map(o => (
              <Link key={o.id} to={`/originals/${o.category}/${o.id}`} className="projects-category-icon-item anim-done">
                <ImageWithFallback basePath={`/assets/originals/icon-thumbnails/${o.category}-${o.id}`} alt={o.title} style={{width:'100%', height:'100%', objectFit:'contain'}} />
                <span>{o.title}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
