import { useNavigate } from 'react-router-dom'
import { useState, useRef, useEffect } from 'react'
import { ImageWithFallback, PLACEHOLDER_IMG } from '../utils/getImage'
import ChevronIcon from '../components/ChevronIcon'
import { sanitizeInline } from '../utils/sanitizeInline'
import { cropStyle } from '../utils/cropStyle'
import ScrollAnimationSection from '../components/ScrollAnimationSection'
import { useIsMobile, useBreakpointTier } from '../utils/useIsMobile'
import { autoPx } from '../utils/autoPx'
import { typo } from '../utils/typography'
import { liveLink } from '../utils/linkSwitch'
import { t } from '../i18n'
import { PeopleSection, RecentPostsSection } from '../components/OrgSections'

// onClick is only set for a *second* link icon — the first relies on the
// whole block's own onClick (see blockLink below) rather than handling its
// own click, so it stays a plain visual indicator there.
function LinkArrowIcon({ onClick }) {
  return (
    <span className="detail-block-link-icon" onClick={onClick} style={onClick ? { cursor: 'pointer' } : undefined}>
      <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 12L12 4M12 4H5M12 4V11" />
      </svg>
    </span>
  )
}

// A crop region's own aspect ratio can differ from the container's configured
// ratio (e.g. a 16/9 slot cropped down to a near-square region) — using the
// container's nominal ratio in that case stretches/squishes the image, since
// cropStyle() sizes the image to exactly fill the cropped region. Deriving the
// true display ratio from the crop region (imgRatio × cropW/cropH) keeps it
// undistorted, matching how ProjectDetail.jsx's HoverImage handles this.
const cropDisplayRatio = (crop, fallbackRatio) => {
  if (crop && crop.x1 !== undefined && crop.imgRatio) {
    return String(Math.round(crop.imgRatio * (crop.x2 - crop.x1) / (crop.y2 - crop.y1) * 10000) / 10000)
  }
  return fallbackRatio
}

// A desktop image number can be paired with a mobile-folder image number via
// an explicit { desktopNum: mobileNum } map (set in the editor's Mobile
// Override picker). Also reads the older "same-number" array format.
const mobileMap = (v) => {
  if (!v) return {}
  if (Array.isArray(v)) return Object.fromEntries(v.map(n => [n, n]))
  return v
}

const pickTier = (tier, base, mobile, tablet) => (tier === 'mobile' ? mobile : tier === 'tablet' ? tablet : null) || base || undefined

function LinkPreview({ typoSrc, link, off, previewStyle, ogTitle, ogDescription, ogImage, ogSiteName, ogTitleSize, ogTitleSizeTablet, ogTitleSizeMobile, ogDescSize, ogDescSizeTablet, ogDescSizeMobile, ogSiteSize, ogSiteSizeTablet, ogSiteSizeMobile, tier }) {
  if (previewStyle === 'simple') {
    return (
      <span className="detail-link-chip">
        {!off && <LinkArrowIcon />}
        {ogSiteName || link.replace(/^https?:\/\//, '')}
      </span>
    )
  }
  if (previewStyle === 'og') {
    const titleFs = autoPx(pickTier(tier, ogTitleSize, ogTitleSizeMobile, ogTitleSizeTablet))
    const descFs = autoPx(pickTier(tier, ogDescSize, ogDescSizeMobile, ogDescSizeTablet))
    const siteFs = autoPx(pickTier(tier, ogSiteSize, ogSiteSizeMobile, ogSiteSizeTablet))
    return (
      <div className="detail-link-og-card">
        {ogImage && <div className="detail-link-og-image"><img src={ogImage} alt="" /></div>}
        <div className="detail-link-og-body">
          {ogTitle && <p className="detail-link-og-title" style={{ ...(titleFs ? { fontSize: titleFs } : {}), ...typo(typoSrc, 'ogTitle') }}>{ogTitle}</p>}
          {ogDescription && <p className="detail-link-og-desc" style={{ ...(descFs ? { fontSize: descFs } : {}), ...typo(typoSrc, 'ogDescription') }}>{ogDescription}</p>}
          <p className="detail-link-og-site" style={{ ...(siteFs ? { fontSize: siteFs } : {}), ...typo(typoSrc, 'ogSiteName') }}>{ogSiteName || link.replace(/^https?:\/\//, '').split('/')[0]}</p>
        </div>
      </div>
    )
  }
  return null
}

// rowWrap: lay lines out in a wrapping flex row instead of a straight stack —
// each line defaults to taking the full row (flex-basis 100%, so it looks
// identical to normal stacking) except linked-preview lines, which shrink to
// a fixed card width so consecutive ones pack left-to-right and wrap evenly
// (a real flex row, not inline-block "masonry" gaps).
function renderLines(lines, isMobile, linkIcon, goTo, rowWrap, textAlign, tier) {
  let iconUsed = false
  return lines.map((line, i) => {
    const isBodyKind = line.kind !== 'title' && line.kind !== 'subtitle' && line.kind !== 'spacer'
    const resolvedFs = (() => {
      // Body copy has a fixed 17/15/14px (desktop/tablet/mobile) default so
      // every text section reads consistently even when no size was ever
      // set — titles/subtitles are still author-sized per block on purpose,
      // so they fall through to CSS (undefined) when left blank.
      const base = autoPx(line.size) || (isBodyKind ? '17px' : undefined)
      if (!base) return undefined
      if (tier === 'mobile') {
        if (line.mobileSize === 'inherit') return undefined
        if (line.mobileSize) return autoPx(line.mobileSize)
        if (isBodyKind) return '14px'
        return autoPx(line.tabletSize) || base
      }
      if (tier === 'tablet') {
        if (line.tabletSize) return autoPx(line.tabletSize)
        if (isBodyKind) return '15px'
        return base
      }
      return base
    })()
    const ls = {
      margin: 0,
      ...(resolvedFs ? { fontSize: resolvedFs } : {}),
      ...(line.weight ? { fontWeight: line.weight } : (isBodyKind ? { fontWeight: '500' } : {})),
      ...(line.color  ? { color:      line.color  } : {}),
      ...(line.font && line.font !== 'inherit' ? { fontFamily: line.font } : {}),
      ...(line.italic ? { fontStyle: 'italic' } : {}),
      ...(line.lineHeight ? { lineHeight: line.lineHeight } : {}),
      ...(line.letterSpacing ? { letterSpacing: line.letterSpacing } : {}),
      ...(line.maxWidth ? { maxWidth: autoPx(line.maxWidth), ...((line.textAlign || textAlign) === 'center' ? { marginLeft: 'auto', marginRight: 'auto' } : (line.textAlign || textAlign) === 'right' ? { marginLeft: 'auto' } : {}) } : {}),
      ...(line.gapAfter !== undefined ? { marginBottom: autoPx(line.gapAfter) } : {}),
      ...(line.textAlign ? { textAlign: line.textAlign } : {}),
    }
    const html = { __html: sanitizeInline(line.text) }
    if (line.kind === 'spacer')   return <div key={i} style={{ height: autoPx(line.size) || '32px', ...(rowWrap ? { flex: '1 1 100%' } : {}) }} />
    if (line.kind === 'row') {
      const cols = (line.text || '').split('|').map(t => t.trim()).filter(Boolean)
      const el = (
        <div key={i} className="detail-line-row" style={ls}>
          {cols.map((t, ci) => <span key={ci} dangerouslySetInnerHTML={{ __html: sanitizeInline(t) }} />)}
        </div>
      )
      return rowWrap ? <div key={i} style={{ flex: '1 1 100%', minWidth: 0 }}>{el}</div> : el
    }

    const lineLink = liveLink(line)
    const clickable = !!(lineLink && goTo)
    const tagProps = clickable ? { onClick: () => goTo(lineLink), style: { ...ls, cursor: 'pointer' } } : { style: ls }

    let el
    if (line.kind === 'title') {
      if (linkIcon && !iconUsed) {
        iconUsed = true
        return (
          <div key={i} className="detail-block-title-row" style={{ display: 'flex', alignItems: 'center', gap: '6px', ...(rowWrap ? { flex: '1 1 100%' } : {}) }}>
            <h2 style={{ ...ls, fontWeight: 700 }} dangerouslySetInnerHTML={html} />
            {linkIcon}
          </div>
        )
      }
      el = <h2 {...tagProps} dangerouslySetInnerHTML={html} />
    } else if (line.kind === 'subtitle') {
      el = <h4 {...tagProps} dangerouslySetInnerHTML={html} />
    } else {
      el = <p {...tagProps} dangerouslySetInnerHTML={html} />
    }

    // A switched-off link keeps its chip/card, just not the click.
    if (!line.link || !goTo || !line.previewStyle || line.previewStyle === 'none') {
      return rowWrap
        ? <div key={i} style={{ flex: '1 1 100%', minWidth: 0 }}>{el}</div>
        : <span key={i} style={{ display: 'contents' }}>{el}</span>
    }
    // A line that only exists to carry a link (no real text) shouldn't render
    // its empty/near-empty text node above the card — even a couple stray
    // pixels of height there push the visible card down inconsistently
    // between cards whose text differs.
    const hasVisibleText = !!(line.text || '').replace(/<br\s*\/?>/gi, '').trim()
    return (
      <div key={i} className={rowWrap ? 'detail-link-preview-row-item' : 'detail-link-preview-wrap'} onClick={clickable ? () => goTo(lineLink) : undefined} style={clickable ? { cursor: 'pointer' } : undefined}>
        {hasVisibleText && el}
        <LinkPreview typoSrc={line} link={line.link} off={!clickable} previewStyle={line.previewStyle} ogTitle={line.ogTitle} ogDescription={line.ogDescription} ogImage={line.ogImage} ogSiteName={line.ogSiteName}
          ogTitleSize={line.ogTitleSize} ogTitleSizeTablet={line.ogTitleSizeTablet} ogTitleSizeMobile={line.ogTitleSizeMobile}
          ogDescSize={line.ogDescSize} ogDescSizeTablet={line.ogDescSizeTablet} ogDescSizeMobile={line.ogDescSizeMobile}
          ogSiteSize={line.ogSiteSize} ogSiteSizeTablet={line.ogSiteSizeTablet} ogSiteSizeMobile={line.ogSiteSizeMobile}
          tier={tier} />
      </div>
    )
  })
}

const fw = (obj, field) => obj[`${field}Weight`] || ((obj[`${field}Bold`] ?? obj.textBold) ? '700' : undefined)
const ff = (obj, field) => obj[`${field}Font`] || obj[`${field}FontFamily`] || obj.fontFamily || 'inherit'
const fc = (obj, field) => obj[`${field}Color`] || undefined

// Accepts both "w/h" ratio strings (e.g. "16/9") and plain decimal ratios
// (e.g. cropDisplayRatio()'s output, "1.6") — a crop-derived ratio isn't a
// clean w/h fraction, so it's returned as a decimal, not "w/h".
const parseRatioNum = (r) => {
  if (!r) return null
  const s = String(r)
  if (s.includes('/')) {
    const [w, h] = s.split('/').map(Number)
    return (w && h) ? w / h : null
  }
  const n = Number(s)
  return isNaN(n) ? null : n
}

const mkImgSrc = (basePath) => (i) => i === PLACEHOLDER_IMG ? PLACEHOLDER_IMG : `${basePath}/${String(i).padStart(2, '00')}`

const IMG_WIDTH_MAP = { small: '50%', medium: '70%', large: '90%', full: '100%' }

// tier-aware fallback: mobile -> paddingXMobile ?? paddingXTablet ?? paddingX;
// tablet -> paddingXTablet ?? paddingX; desktop -> paddingX.
const resolvePad = (section, tier, key) => {
  if (tier === 'mobile'  && section[`${key}Mobile`] != null) return section[`${key}Mobile`]
  if (tier === 'mobile'  && section[`${key}Tablet`] != null) return section[`${key}Tablet`]
  if (tier === 'tablet'  && section[`${key}Tablet`] != null) return section[`${key}Tablet`]
  return section[key]
}

const mkSectionBgStyle = (basePath) => (section, tier) => {
  const style = {}
  if (section.bgColor) {
    style.backgroundColor = section.bgColor
    style.boxShadow = `0 0 0 100vmax ${section.bgColor}`
    style.clipPath = 'inset(-1px -100vmax)'
  }
  if (section.bgImage) {
    const src = section.bgImage.startsWith('/') ? section.bgImage : `${basePath}/${section.bgImage}`
    style.backgroundImage = `url(${src})`
    style.backgroundSize = 'cover'
    style.backgroundPosition = 'center'
  }
  const pt = resolvePad(section, tier, 'paddingTop')
  const pb = resolvePad(section, tier, 'paddingBottom')
  if (pt != null) style.paddingTop    = autoPx(pt)
  if (pb != null) style.paddingBottom = autoPx(pb)
  return style
}

function loadModelViewerScript() {
  if (document.querySelector('[data-mv-script]')) return
  const s = document.createElement('script')
  s.type = 'module'
  s.src = 'https://ajax.googleapis.com/ajax/libs/model-viewer/3.5.0/model-viewer.min.js'
  s.setAttribute('data-mv-script', '1')
  document.head.appendChild(s)
}

function CatTabSwitcherSection({ section, basePath, isMobile, tier }) {
  const tabs = section.tabs || []
  const [active, setActive] = useState(0)
  const tab = tabs[active] || {}
  const imgSrc = mkImgSrc(basePath)

  return (
    <section id={section.id} className="detail-section-mid detail-tab-switcher" style={mkSectionBgStyle(basePath)(section, tier)}>
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
        {tab.image && (
          <div className="detail-tab-img-wrap" style={tab.ratio ? { aspectRatio: tab.ratio } : undefined}>
            <ImageWithFallback basePath={imgSrc(tab.image)} alt={tab.label || ''} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
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

function CatFeatureTabsSection({ section, basePath, isMobile, tier }) {
  const items = section.items || []
  const [active, setActive] = useState(0)
  const item = items[active] || {}
  const imgSrc = mkImgSrc(basePath)
  const imgs = item.images || []
  const itemRatio = (isMobile ? (item.mobileRatio || item.desktopRatio) : item.desktopRatio)
  const hasLines = item.lines != null && item.lines.length > 0

  return (
    <section id={section.id} className="detail-feature-tabs" style={mkSectionBgStyle(basePath)(section, tier)}>
      <div className="detail-feature-tabs-bar">
        {items.map((t, i) => (
          <button key={i} className={`detail-feature-tab${active === i ? ' detail-feature-tab--active' : ''}`} onClick={() => setActive(i)}>
            {t.icon && <img src={`${basePath}/${t.icon}`} alt={t.title||''} className="detail-feature-tab-icon" />}
            {t.title && <span className="detail-feature-tab-label" style={typo(t, 'title')} dangerouslySetInnerHTML={{__html: sanitizeInline(t.title)}} />}
          </button>
        ))}
      </div>
      <div className="detail-feature-tabs-content">
        {imgs.map(num => {
          const crop = item.cropData?.[num]
          return (
            <div key={num} className="detail-feature-tabs-img-wrap" style={{ aspectRatio: cropDisplayRatio(crop, itemRatio) }}>
              <ImageWithFallback
                basePath={imgSrc(num)}
                alt={item.title || ''}
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', position: 'absolute', inset: 0, ...cropStyle(crop) }}
              />
            </div>
          )
        })}
        {hasLines
          ? renderLines(item.lines, isMobile, undefined, undefined, undefined, undefined, tier)
          : item.subtitle && <p dangerouslySetInnerHTML={{__html: sanitizeInline(item.subtitle)}} />}
      </div>
    </section>
  )
}

function CatAccordionSection({ section, basePath, isMobile, tier }) {
  const items = section.items || []
  const [openIdx, setOpenIdx] = useState(null)
  const imgSrc = mkImgSrc(basePath)

  return (
    <section id={section.id} className="detail-section-mid detail-accordion" style={mkSectionBgStyle(basePath)(section, tier)}>
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
                  {imgs.map(num => {
                    const crop = item.cropData?.[num]
                    return (
                      <div key={num} className="detail-accordion-img-wrap" style={{ aspectRatio: cropDisplayRatio(crop, itemRatio) }}>
                        <ImageWithFallback
                          basePath={imgSrc(num)}
                          alt={item.title || ''}
                          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', position: 'absolute', inset: 0, ...cropStyle(crop) }}
                        />
                      </div>
                    )
                  })}
                  {hasLines
                    ? renderLines(item.lines, isMobile, undefined, undefined, undefined, undefined, tier)
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

function CatImageTabSection({ section, basePath, isMobile, tier }) {
  const tabs = section.tabs || []
  const [active, setActive] = useState(0)
  const imgSrc = mkImgSrc(basePath)
  const tabStyle   = section.tabStyle    || 'underline'
  const tabPos     = section.tabPosition || 'bottom'
  const tabSize    = section.tabSize     || 'md'
  const activeTab  = tabs[active] || {}

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
            {imgs.map(num => {
              const crop = tab.cropData?.[num]
              return (
                <div key={num} className="detail-image-tab-img-wrap" style={{ aspectRatio: cropDisplayRatio(crop, tabRatio) }}>
                  <ImageWithFallback
                    basePath={imgSrc(num)}
                    alt={tab.label || ''}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', position: 'absolute', inset: 0, ...cropStyle(crop) }}
                  />
                </div>
              )
            })}
            {(hasLines || section.textMinHeight) && !textBelowBar && (
              <div className="detail-image-tab-text" style={{
                ...(section.textAlign ? { textAlign: section.textAlign } : {}),
                ...(section.textMinHeight ? { minHeight: `${section.textMinHeight}px` } : {}),
              }}>
                {hasLines && renderLines(tab.lines, isMobile, undefined, undefined, undefined, undefined, tier)}
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
        {hasLines && renderLines(activeTab.lines, isMobile, undefined, undefined, undefined, undefined, tier)}
      </div>
    )
  })()

  return (
    <section id={section.id} className="detail-image-tab" style={mkSectionBgStyle(basePath)(section, tier)}>
      {section.title && <h2 className="detail-image-tab-heading" style={typo(section, 'title')} dangerouslySetInnerHTML={{__html: sanitizeInline(section.title)}} />}
      {tabPos === 'top' && tabBar}
      {stage}
      {tabPos !== 'top' && tabBar}
      {belowBarText}
    </section>
  )
}

function CatBlockCarousel({ blocks, basePath, sectionLink, align, isMobile, tier, cardSize, cardRatio, cardHeight, cardHeightTablet }) {
  const navigate = useNavigate()
  const trackRef = useRef(null)
  const [canPrev, setCanPrev] = useState(false)
  const [canNext, setCanNext] = useState(true)
  const [hasOverflow, setHasOverflow] = useState(false)
  const [openIdx, setOpenIdx] = useState({})
  const toggleOpen = (idx) => setOpenIdx(o => ({ ...o, [idx]: !o[idx] }))

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

  const isLeft = align === 'start'
  const sizeMap = { small: 40, medium: 70, large: 90 }
  const widthPct = typeof cardSize === 'string' ? (sizeMap[cardSize] ?? 70) : (cardSize || 70)
  // Fixed-height mode (desktop/tablet only): height stays constant, width follows each block's ratio.
  const effCardHeight = tier === 'tablet' ? (cardHeightTablet || cardHeight) : cardHeight
  const fixedHpx = tier !== 'mobile' && effCardHeight ? parseFloat(effCardHeight) : null
  const fixedH = fixedHpx ? `${fixedHpx}px` : null

  return (
    <div className="bc-wrap">
      <div className="bc-track" ref={trackRef} style={isLeft ? { paddingLeft: isMobile ? '20px' : 'var(--gutter)', scrollPaddingLeft: isMobile ? '20px' : 'var(--gutter)' } : {}}>
        {blocks.map((block, idx) => {
          const link = block.linkDisabled ? '' : (block.link || sectionLink)
          const clickReveal = block.clickReveal || 'none'
          const isOpen = !!openIdx[idx]
          const images = (clickReveal === 'image' && isOpen && block.clickImages?.length) ? block.clickImages : (block.images || [])
          const blockRatio = isMobile ? (block.mobileRatio || block.desktopRatio || cardRatio) : (block.desktopRatio || cardRatio)
          const cardW = fixedHpx ? `${Math.round(fixedHpx * (parseRatioNum(blockRatio) || 16 / 9))}px` : null
          const cardStyle = cardW
            ? { flex: `0 0 ${cardW}`, scrollSnapAlign: isLeft ? 'start' : 'center', ...(link ? { cursor: 'pointer' } : {}) }
            : { flex: `0 0 ${widthPct}%`, scrollSnapAlign: isLeft ? 'start' : 'center', ...(link ? { cursor: 'pointer' } : {}) }
          const imgStyle = fixedH ? { width: cardW, height: fixedH } : (blockRatio ? { aspectRatio: blockRatio } : {})
          return (
            <div
              key={idx}
              className="bc-card"
              style={cardStyle}
              onClick={() => link && navigate(link)}
            >
              <div className="bc-card-img" style={imgStyle}>
                {clickReveal === 'text' && isOpen ? (
                  <div className="bc-reveal-text">
                    {block.clickTitle && <h3 style={typo(block, 'clickTitle')} dangerouslySetInnerHTML={{__html: sanitizeInline(block.clickTitle)}} />}
                    {block.clickContent && <p style={typo(block, 'clickContent')} dangerouslySetInnerHTML={{__html: sanitizeInline(block.clickContent)}} />}
                  </div>
                ) : images.map(i => (
                  <div key={i} className="detail-hover-img" style={blockRatio ? { aspectRatio: blockRatio } : undefined}>
                    <ImageWithFallback
                      basePath={i === PLACEHOLDER_IMG ? PLACEHOLDER_IMG : `${basePath}/${String(i).padStart(2, '00')}`}
                      alt={block.title || ''}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '12px', position: 'absolute', inset: 0, ...cropStyle((clickReveal === 'image' && isOpen ? block.clickCropData?.[i] : block.cropData?.[i])) }}
                    />
                  </div>
                ))}
                {!isOpen && (block.overlayTitle || block.overlayContent) && (
                  <div className="detail-full-overlay detail-full-overlay-left">
                    {block.overlayTitle && <h2 className="detail-full-overlay-title" dangerouslySetInnerHTML={{__html: sanitizeInline(block.overlayTitle)}} />}
                    {block.overlayContent && <p className="detail-full-overlay-content" dangerouslySetInnerHTML={{__html: sanitizeInline(block.overlayContent)}} />}
                  </div>
                )}
                {clickReveal !== 'none' && (
                  <button
                    type="button"
                    className={`bc-expand-btn${isOpen ? ' bc-expand-btn--open' : ''}`}
                    onClick={e => { e.stopPropagation(); toggleOpen(idx) }}
                    aria-label={t(isOpen ? 'Close' : 'Expand')}
                  >+</button>
                )}
              </div>
              <div className="bc-card-body" style={{ maxWidth: autoPx(block.textMaxWidth), textAlign: block.textAlign || 'left' }}>
                {block.lines != null ? renderLines(block.lines, isMobile, undefined, undefined, undefined, undefined, tier) : <>
                  {block.title && <p style={{ fontFamily: ff(block,'title'), ...typo(block, 'title'), fontWeight: fw(block,'title'), color: fc(block,'title') }} dangerouslySetInnerHTML={{__html: `<strong>${sanitizeInline(block.title)}</strong>${block.content ? ' ' + sanitizeInline(block.content) : ''}`}} />}
                  {!block.title && block.content && <p style={{ fontFamily: ff(block,'content'), ...typo(block, 'content'), fontWeight: fw(block,'content'), color: fc(block,'content') }} dangerouslySetInnerHTML={{__html: sanitizeInline(block.content)}} />}
                  {block.subtitle && <p className="bc-card-sub" style={{ fontFamily: ff(block,'subtitle'), ...typo(block, 'subtitle'), fontWeight: fw(block,'subtitle'), color: fc(block,'subtitle') }} dangerouslySetInnerHTML={{__html: sanitizeInline(block.subtitle)}} />}
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

function CatImageTextSection({ section, si, basePath, sectionLink, isMobile, tier, tabletImageMode }) {
  const navigate = useNavigate()
  const goTo = (dest) => {
    if (!dest) return
    if (/^https?:\/\//.test(dest)) window.open(dest, '_blank', 'noopener,noreferrer')
    else if (/^(mailto|tel):/.test(dest)) window.location.href = dest
    else navigate(dest)
  }
  const imgSrc = mkImgSrc(basePath)
  const mobileImgSrc = mkImgSrc(`${basePath}/mobile`)
  const tabletImgSrc = mkImgSrc(`${basePath}/tablet`)
  const useMobileImgs = tier === 'mobile' || (tier === 'tablet' && tabletImageMode !== 'desktop')
  const [expanded, setExpanded] = useState(false)
  const [openIdx, setOpenIdx] = useState({})
  const toggleOpen = (idx) => setOpenIdx(o => ({ ...o, [idx]: !o[idx] }))

  const allBlocks = (section.blocks || []).filter(b => !b.hidden)
  const limited = section.limitPreview && allBlocks.length > 2 && !expanded
  const blocks = limited ? allBlocks.slice(0, 2) : allBlocks
  const effCardHeight = tier === 'tablet' ? (section.cardHeightTablet || section.cardHeight) : section.cardHeight
  const fixedHpx = tier !== 'mobile' && effCardHeight ? parseFloat(effCardHeight) : null
  const fixedH = fixedHpx ? `${fixedHpx}px` : null

  const iconSizeVars = section.iconList ? {
    ...(section.iconSize ? { '--icon-size': autoPx(section.iconSize) } : {}),
    ...(section.iconSizeTablet ? { '--icon-size-tablet': autoPx(section.iconSizeTablet) } : {}),
    ...(section.iconSizeMobile ? { '--icon-size-mobile': autoPx(section.iconSizeMobile) } : {}),
    ...(section.iconGap ? { '--icon-gap': autoPx(section.iconGap) } : {}),
    ...(section.iconGapTablet ? { '--icon-gap-tablet': autoPx(section.iconGapTablet) } : {}),
    ...(section.iconGapMobile ? { '--icon-gap-mobile': autoPx(section.iconGapMobile) } : {}),
    ...(section.iconColumns > 1 ? { '--icon-cols': section.iconColumns } : {}),
  } : {}

  return (
    <section key={`${section.id}-${si}`} id={section.id} className={`detail-section-mid${section.iconList ? ' detail-section-mid--icon-list' : ''}${section.iconList && section.iconColumns > 1 ? ' detail-section-mid--icon-grid' : ''}${section.matchTextPadding ? ' detail-section-mid--padded' : ''}`} style={{ ...mkSectionBgStyle(basePath)(section, tier), ...iconSizeVars }}>
      {blocks.map((block, idx) => {
        const blockLink = block.linkDisabled ? '' : (block.link || sectionLink)
        const link2 = liveLink(block, 'link2')
        // A second, independent link icon (link2) — the whole block
        // still only navigates to blockLink on click, so this one handles
        // its own click (and stops it bubbling up to that same handler).
        const linkIcons = (blockLink || link2) && (
          <>
            {blockLink && <LinkArrowIcon />}
            {link2 && <LinkArrowIcon onClick={e => { e.stopPropagation(); goTo(link2) }} />}
          </>
        )
        const clickReveal = block.clickReveal || 'none'
        const isOpen = !!openIdx[idx]
        const images = (clickReveal === 'image' && isOpen && block.clickImages?.length) ? block.clickImages : (block.images || [])
        // Must track the same condition that picks the image source
        // (`useMobileImgs`, below) rather than `isMobile` — `isMobile`
        // (≤768px) and `tier` (mobile ≤600, tablet 601–1024) don't share a
        // boundary, so at 601–768px this used to pick mobileRatio even when
        // `useMobileImgs` was false and the *desktop* image was the one
        // actually showing (or vice versa) — ratio and asset disagreeing
        // stretched/squished whichever image was actually selected.
        const ratio = (tier === 'tablet' && block.tabletRatio) || (useMobileImgs ? block.mobileRatio : block.desktopRatio) || '16/9'
        const hasText = block.lines != null ? block.lines.length > 0 : (block.title || block.subtitle || block.content)
        const imgMaxW = !isMobile && !section.iconList && !block.splitLayout ? IMG_WIDTH_MAP[block.imgWidth || 'medium'] : undefined
        const mImages = mobileMap(block.mobileImages)
        const tImages = mobileMap(block.tabletImages)
        // blockAlign shifts the whole image+text block to one side of the
        // section (with a 15% gutter, matching ProjectDetail.jsx) instead of
        // always centering it. imgTextAlign controls whether the text column
        // matches the image's width/centering or starts flush at the left edge.
        const blockAlign = !isMobile && !section.iconList && (block.blockAlign || null)
        const alignWithImage = !isMobile && (block.imgTextAlign === 'image' || block.imgTextAlign == null)
        const sharedW = blockAlign ? (imgMaxW || '100%') : undefined
        return (
          <div
            key={idx}
            className={`detail-block-mid${section.iconList ? ' detail-block-mid--icon-row' : ''}${block.splitLayout ? ` detail-block-mid--split${block.mobileImageOrder === 'last' ? ' detail-block-mid--split-image-last' : ''}` : ''}`}
            onClick={blockLink ? () => goTo(blockLink) : undefined}
            style={{
              ...(blockLink ? { cursor: 'pointer' } : {}),
              ...(section.imageTextGap != null ? { gap: autoPx(section.imageTextGap) } : {}),
              ...(blockAlign === 'left' ? { alignItems: 'flex-start', paddingLeft: 'var(--gutter)', boxSizing: 'border-box' }
                : blockAlign === 'right' ? { alignItems: 'flex-end', paddingRight: 'var(--gutter)', boxSizing: 'border-box' } : {}),
            }}
          >
            <div className={`detail-block-mid-img${fixedH ? ' fixed-h' : ''}`} style={{ ...(fixedH ? { height: fixedH } : {}), ...(sharedW ? { width: sharedW } : imgMaxW ? { maxWidth: imgMaxW, margin: '0 auto' } : {}) }}>
              {clickReveal === 'text' && isOpen && (
                <div className="detail-hover-img" style={{ aspectRatio: ratio }}>
                  <div className="bc-reveal-text">
                    {block.clickTitle && <h3 style={typo(block, 'clickTitle')} dangerouslySetInnerHTML={{__html: sanitizeInline(block.clickTitle)}} />}
                    {block.clickContent && <p style={typo(block, 'clickContent')} dangerouslySetInnerHTML={{__html: sanitizeInline(block.clickContent)}} />}
                  </div>
                </div>
              )}
              {clickReveal !== 'none' && (
                <button
                  type="button"
                  className={`bc-expand-btn${isOpen ? ' bc-expand-btn--open' : ''}`}
                  onClick={e => { e.stopPropagation(); toggleOpen(idx) }}
                  aria-label={t(isOpen ? 'Close' : 'Expand')}
                >+</button>
              )}
              {!(clickReveal === 'text' && isOpen) && images.map(i => {
                const tNum = tImages[i]
                let src, crop
                if (clickReveal === 'image' && isOpen) {
                  src = imgSrc(i)
                  crop = block.clickCropData?.[i]
                } else if (tier === 'tablet' && tNum != null) {
                  src = tNum === PLACEHOLDER_IMG ? PLACEHOLDER_IMG : tabletImgSrc(tNum)
                  crop = block.tabletCropData?.[i] ?? block.cropData?.[i]
                } else if (useMobileImgs && mImages[i] != null) {
                  src = mobileImgSrc(mImages[i])
                  crop = block.mobileCropData?.[i] ?? block.cropData?.[i]
                } else {
                  src = imgSrc(i)
                  crop = block.cropData?.[i]
                }
                const dispRatio = cropDisplayRatio(crop, ratio)
                // Fixed-height mode: the CSS class only pins height (via
                // .fixed-h .detail-hover-img { height: 100% }), leaving width
                // at the base rule's 100% — i.e. the full block width,
                // completely unrelated to the image's aspect ratio. That
                // stretched/squished the image regardless of crop. Deriving
                // width from height × ratio (same approach CatBlockCarousel
                // already uses) keeps it undistorted.
                const cardW = fixedHpx ? `${Math.round(fixedHpx * (parseRatioNum(dispRatio) || 16 / 9))}px` : null
                return (
                  <div key={i} className="detail-hover-img" style={{ cursor: blockLink ? 'pointer' : 'default', ...(fixedH ? { aspectRatio: 'unset', height: '100%', width: cardW, maxWidth: '100%' } : { aspectRatio: dispRatio }) }}>
                    <ImageWithFallback
                      basePath={src}
                      alt={block.title || ''}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '12px', position: 'absolute', inset: 0, ...cropStyle(crop) }}
                    />
                  </div>
                )
              })}
            </div>
            {hasText && (
              <div className="detail-block-mid-body" style={{
                textAlign: block.textAlign || 'left',
                alignSelf: block.textAlign === 'right' ? 'flex-end' : block.textAlign === 'center' ? 'center' : 'flex-start',
                ...(block.textMaxWidth
                  ? { maxWidth: autoPx(block.textMaxWidth) }
                  : sharedW
                    ? { width: sharedW, maxWidth: sharedW }
                    : alignWithImage && imgMaxW
                      ? { maxWidth: imgMaxW, margin: '0 auto' }
                      : {}),
              }}>
                {block.lines != null ? renderLines(block.lines, isMobile, linkIcons, undefined, undefined, undefined, tier) : <>
                  {block.title && <div className="detail-block-title-row" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><h2 style={{ fontFamily: ff(block,'title'), ...typo(block, 'title'), fontWeight: blockLink ? 700 : fw(block,'title'), color: fc(block,'title') }} dangerouslySetInnerHTML={{__html: sanitizeInline(block.title)}} />{linkIcons}</div>}
                  {block.subtitle && <h4 style={{ fontFamily: ff(block,'subtitle'), ...typo(block, 'subtitle'), fontWeight: fw(block,'subtitle'), color: fc(block,'subtitle') }} dangerouslySetInnerHTML={{__html: sanitizeInline(block.subtitle)}} />}
                  {block.content && <p style={{ fontFamily: ff(block,'content'), ...typo(block, 'content'), fontWeight: fw(block,'content'), color: fc(block,'content') }} dangerouslySetInnerHTML={{__html: sanitizeInline(block.content)}} />}
                </>}
              </div>
            )}
          </div>
        )
      })}
      {limited && (
        <button type="button" className="detail-show-more-btn" onClick={() => setExpanded(true)}>
          Show more ({allBlocks.length - 2})
        </button>
      )}
    </section>
  )
}

export default function CategorySections({ sections, basePath, tabletImageMode }) {
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const tier = useBreakpointTier()

  const goTo = (dest) => {
    if (!dest) return
    if (/^https?:\/\//.test(dest)) window.open(dest, '_blank', 'noopener,noreferrer')
    else if (/^(mailto|tel):/.test(dest)) window.location.href = dest
    else navigate(dest)
  }

  const imgSrc = (i) => i === PLACEHOLDER_IMG ? PLACEHOLDER_IMG : `${basePath}/${String(i).padStart(2, '00')}`

  const sectionBgStyle = (section) => {
    const style = {}
    if (section.bgColor) {
      style.backgroundColor = section.bgColor
      style.boxShadow = `0 0 0 100vmax ${section.bgColor}`
      style.clipPath = 'inset(-1px -100vmax)'
    }
    if (section.bgImage) {
      const src = section.bgImage.startsWith('/') ? section.bgImage : `${basePath}/${section.bgImage}`
      style.backgroundImage = `url(${src})`
      style.backgroundSize = 'cover'
      style.backgroundPosition = 'center'
    }
    const pt = resolvePad(section, tier, 'paddingTop')
    const pb = resolvePad(section, tier, 'paddingBottom')
    if (pt != null) style.paddingTop    = autoPx(pt)
    if (pb != null) style.paddingBottom = autoPx(pb)
    return style
  }

  return sections.filter(s => !s.hidden).map((section, si) => {
    const link = liveLink(section)

    if (section.type === 'images') {
      const ov = section.overlay
      const ratio = (isMobile ? section.mobileRatio : section.desktopRatio) || null
      const mobileImgSrcFull = mkImgSrc(`${basePath}/mobile`)
      const tabletImgSrcFull = mkImgSrc(`${basePath}/tablet`)
      const useMobileImgsFull = tier === 'mobile' || (tier === 'tablet' && tabletImageMode !== 'desktop')
      const mImagesFull = mobileMap(section.mobileImages)
      const tImagesFull = mobileMap(section.tabletImages)
      return (
        <section
          key={`${section.id}-${si}`}
          id={section.id}
          className={`detail-section-full${section.matchTextPadding ? ' detail-section-full--padded' : ''}`}
          style={{ ...sectionBgStyle(section), ...(link ? { cursor: 'pointer' } : {}) }}
          onClick={link ? () => goTo(link) : undefined}
        >
          {(section.images || []).map(i => {
            const tNum = tImagesFull[i]
            let src, crop
            if (tier === 'tablet' && tNum != null) {
              src = tNum === PLACEHOLDER_IMG ? PLACEHOLDER_IMG : tabletImgSrcFull(tNum)
              crop = section.tabletCropData?.[i] ?? section.cropData?.[i]
            } else if (useMobileImgsFull && mImagesFull[i] != null) {
              src = mobileImgSrcFull(mImagesFull[i])
              crop = section.mobileCropData?.[i] ?? section.cropData?.[i]
            } else {
              src = imgSrc(i)
              crop = section.cropData?.[i]
            }
            return (
            <div key={i} className="detail-full-img-wrap" style={ratio ? { aspectRatio: cropDisplayRatio(crop, ratio), overflow: 'hidden' } : {}}>
              <ImageWithFallback
                basePath={src}
                alt={`section-${i}`}
                style={ratio
                  ? { width: '100%', height: '100%', objectFit: 'cover', display: 'block', position: 'absolute', inset: 0, ...cropStyle(crop) }
                  : { width: '100%', display: 'block' }
                }
              />
              {ov && (ov.title || ov.subtitle || ov.content) && (
                <div className={`detail-full-overlay detail-full-overlay-${ov.position || 'left'}`} style={ov.textMaxWidth ? { maxWidth: autoPx(ov.textMaxWidth) } : undefined}>
                  {ov.title && <h2 className="detail-full-overlay-title" dangerouslySetInnerHTML={{__html: sanitizeInline(ov.title)}} />}
                  {ov.subtitle && <h4 className="detail-full-overlay-subtitle" dangerouslySetInnerHTML={{__html: sanitizeInline(ov.subtitle)}} />}
                  {ov.content && <p className="detail-full-overlay-content" dangerouslySetInnerHTML={{__html: sanitizeInline(ov.content)}} />}
                </div>
              )}
            </div>
            )
          })}
        </section>
      )
    }

    if (section.type === 'image-text') {
      return <CatImageTextSection key={`${section.id}-${si}`} section={section} si={si} basePath={basePath} sectionLink={link} isMobile={isMobile} tier={tier} tabletImageMode={tabletImageMode} />
    }

    if (section.type === 'image-text-carousel') {
      return (
        <section key={`${section.id}-${si}`} id={section.id} className="detail-section-carousel" style={sectionBgStyle(section)}>
          <CatBlockCarousel blocks={(section.blocks || []).filter(b => !b.hidden)} basePath={basePath} sectionLink={link} align={section.carouselAlign} isMobile={isMobile} tier={tier} cardSize={section.cardSize} cardRatio={section.cardRatio} cardHeight={section.cardHeight} cardHeightTablet={section.cardHeightTablet} />
        </section>
      )
    }

    // An organization's sections: a heading (lines), then the directory
    // or the newest posts.
    if (section.type === 'people' || section.type === 'recent-posts') {
      return (
        <section key={`${section.id}-${si}`} id={section.id} className="detail-section-mid org-section" style={sectionBgStyle(section)}>
          {(section.lines || []).length > 0 && (
            <div className="org-section-heading" style={{ textAlign: section.textAlign || 'left' }}>
              {renderLines(section.lines, isMobile, null, goTo, false, section.textAlign, tier)}
            </div>
          )}
          {section.type === 'people' ? <PeopleSection section={section} basePath={basePath} /> : <RecentPostsSection section={section} />}
        </section>
      )
    }

    if (section.type === 'text') {
      const txtAlign = { textAlign: section.textAlign || 'left' }
      // Auto-widen enough for up to 4 link-preview cards per row (280px each)
      // so multi-card rows work without needing a manually-set Text Max Width
      // (which is easy to lose — it's just one field among many on the section).
      const isCardLine = (l) => !!(l.link && l.previewStyle && l.previewStyle !== 'none')
      const cardCount = (section.lines || []).filter(isCardLine).length
      const autoWidth = cardCount > 0 ? `${Math.min(cardCount, 4) * 280 + (Math.min(cardCount, 4) - 1) * 16}px` : '100%'
      // Card lines are grouped into their own horizontally-wrapping (desktop)
      // / horizontally-scrolling (mobile) row, separate from normal lines
      // (title, body text, ...) which just stack full-width as usual.
      const lineGroups = []
      ;(section.lines || []).forEach(l => {
        const card = isCardLine(l)
        const last = lineGroups[lineGroups.length - 1]
        if (last && last.card === card) last.items.push(l)
        else lineGroups.push({ card, items: [l] })
      })
      const ogSizeVal = tier === 'mobile' ? (section.ogSizeMobile ?? section.ogSizeTablet ?? section.ogSize)
        : tier === 'tablet' ? (section.ogSizeTablet ?? section.ogSize)
        : section.ogSize
      const ogScale = ogSizeVal != null && ogSizeVal !== '' ? Number(ogSizeVal) / 100 : null
      return (
        <section
          key={`${section.id}-${si}`}
          id={section.id}
          className="detail-section-mid"
          style={{ ...sectionBgStyle(section), ...(link ? { cursor: 'pointer' } : {}) }}
          onClick={link ? () => goTo(link) : undefined}
        >
          <div style={{ maxWidth: autoPx(section.textMaxWidth) || autoWidth, margin: section.textAlign === 'center' ? '0 auto' : section.textAlign === 'right' ? '0 0 0 auto' : '0', ...txtAlign }}>
            {section.lines != null ? lineGroups.map((g, gi) => g.card ? (
              <div key={gi} className="detail-link-preview-row" style={ogScale != null ? { '--og-card-scale': ogScale } : undefined}>{renderLines(g.items, isMobile, null, goTo, true, section.textAlign, tier)}</div>
            ) : (
              <div key={gi}>{renderLines(g.items, isMobile, null, goTo, false, section.textAlign, tier)}</div>
            )) : (
              <>
                {section.title && <h2 style={{ fontFamily: ff(section,'title'), ...typo(section, 'title'), fontWeight: fw(section,'title'), ...(section.titleSize ? { fontSize: autoPx(section.titleSize) } : {}), color: fc(section,'title') }} dangerouslySetInnerHTML={{__html: sanitizeInline(section.title)}} />}
                {section.content && <p style={{ fontFamily: ff(section,'content'), ...typo(section, 'content'), fontWeight: fw(section,'content'), ...(isMobile ? { fontSize: '14px' } : section.contentSize ? { fontSize: autoPx(section.contentSize) } : {}), color: fc(section,'content') }} dangerouslySetInnerHTML={{__html: sanitizeInline(section.content)}} />}
              </>
            )}
            {section.link && !section.lines?.length && <LinkPreview typoSrc={section} link={section.link} off={!link} previewStyle={section.previewStyle} ogTitle={section.ogTitle} ogDescription={section.ogDescription} ogImage={section.ogImage} ogSiteName={section.ogSiteName}
              ogTitleSize={section.ogTitleSize} ogTitleSizeTablet={section.ogTitleSizeTablet} ogTitleSizeMobile={section.ogTitleSizeMobile}
              ogDescSize={section.ogDescSize} ogDescSizeTablet={section.ogDescSizeTablet} ogDescSizeMobile={section.ogDescSizeMobile}
              ogSiteSize={section.ogSiteSize} ogSiteSizeTablet={section.ogSiteSizeTablet} ogSiteSizeMobile={section.ogSiteSizeMobile}
              tier={tier} />}
          </div>
        </section>
      )
    }

    if (section.type === 'image-grid') {
      const cols = tier === 'mobile' ? (section.mobileColumns || 2) : tier === 'tablet' ? (section.tabletColumns || 3) : (section.columns || 4)
      const rows = tier === 'mobile' ? section.mobileRows : tier === 'tablet' ? (section.tabletRows ?? section.rows) : section.rows
      const gap = tier === 'mobile' ? (section.mobileGap || section.gap || '4px') : (section.gap || '4px')
      const ratio = isMobile ? (section.mobileRatio || section.desktopRatio) : section.desktopRatio
      const gridImages = section.images || []
      return (
        <section key={`${section.id}-${si}`} id={section.id} className="detail-section-mid" style={sectionBgStyle(section)}>
          <div style={{ width: isMobile ? '100%' : '70%', margin: '0 auto', ...(isMobile ? { padding: `0 ${section.mobilePadding ?? 20}px`, boxSizing: 'border-box' } : {}) }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${cols}, 1fr)`,
              ...(rows ? { gridTemplateRows: `repeat(${rows}, 1fr)` } : {}),
              gap,
            }}>
              {gridImages.map(i => {
                const crop = section.cropData?.[i]
                return (
                  <div key={i} className="detail-hover-img" style={{ aspectRatio: cropDisplayRatio(crop, ratio) }}>
                    <ImageWithFallback
                      basePath={imgSrc(i)}
                      alt={`${section.id}-${i}`}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '12px', position: 'absolute', inset: 0, ...cropStyle(crop) }}
                    />
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
        <section key={`${section.id}-${si}`} id={section.id} className="detail-section-mid" style={sectionBgStyle(section)}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : `repeat(${columns.length}, 1fr)`,
            gap: isMobile ? '40px' : autoPx(section.columnGap || '60px'),
            padding: isMobile ? '0 20px' : '0 15%',
            boxSizing: 'border-box',
            width: '100%',
            alignItems: 'start',
          }}>
            {columns.map((col, ci) => (
              <div key={ci} style={{ textAlign: col.textAlign || 'left' }}>
                {renderLines(col.lines || [], isMobile, undefined, undefined, undefined, undefined, tier)}
              </div>
            ))}
          </div>
        </section>
      )
    }

    if (section.type === 'tab-switcher') {
      return <CatTabSwitcherSection key={`${section.id}-${si}`} section={section} basePath={basePath} isMobile={isMobile} tier={tier} />
    }

    if (section.type === 'feature-tabs') {
      return <CatFeatureTabsSection key={`${section.id}-${si}`} section={section} basePath={basePath} isMobile={isMobile} tier={tier} />
    }

    if (section.type === 'image-tab') {
      return <CatImageTabSection key={`${section.id}-${si}`} section={section} basePath={basePath} isMobile={isMobile} tier={tier} />
    }

    if (section.type === 'accordion') {
      return <CatAccordionSection key={`${section.id}-${si}`} section={section} basePath={basePath} isMobile={isMobile} tier={tier} />
    }

    if (section.type === 'model-viewer') {
      const modelSrc = section.modelFile ? (section.modelFile.startsWith('/') ? section.modelFile : `${basePath}/${section.modelFile}`) : null
      loadModelViewerScript()
      return (
        <section key={`${section.id}-${si}`} id={section.id} className="detail-section-mid" style={sectionBgStyle(section)}>
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
              {renderLines(section.lines, isMobile, undefined, undefined, undefined, undefined, tier)}
            </div>
          )}
        </section>
      )
    }

    if (section.type === 'video-background') {
      const vSrc = section.videoSrc ? (section.videoSrc.startsWith('/') ? section.videoSrc : `${basePath}/${section.videoSrc}`) : null
      const muted = section.videoMuted !== false
      const loop = section.videoLoop !== false
      const videoProps = { src: vSrc, autoPlay: muted, muted, loop, playsInline: true, controls: !muted }
      const hasText = section.lines?.length > 0 || section.title || section.content
      const textInner = section.lines != null ? renderLines(section.lines, isMobile, undefined, undefined, undefined, undefined, tier) : <>
        {section.title && <h2 style={{ color: section.titleColor, fontSize: autoPx(section.titleSize), fontWeight: section.titleBold ? '700' : undefined }} dangerouslySetInnerHTML={{__html: sanitizeInline(section.title)}} />}
        {section.content && <p style={{ color: section.contentColor, fontSize: isMobile ? '14px' : autoPx(section.contentSize) }} dangerouslySetInnerHTML={{__html: sanitizeInline(section.content)}} />}
      </>

      const videoStyle = cropStyle(section.videoCropData)

      if (section.videoRatio) {
        const textNode = hasText && (
          <div className={`detail-video-ratio-text detail-video-overlay-${section.overlayPosition || 'center'}`} style={section.textMaxWidth ? { maxWidth: autoPx(section.textMaxWidth) } : undefined}>
            {textInner}
          </div>
        )
        const below = section.videoTextPosition === 'below'
        return (
          <section key={`${section.id}-${si}`} id={section.id} className="detail-section-video-ratio" style={sectionBgStyle(section)}>
            {!below && textNode}
            {vSrc && (
              <div className="detail-video-ratio-wrap" style={{ aspectRatio: section.videoRatio, maxWidth: autoPx(section.videoMaxWidth) }}>
                <video className="detail-video-ratio" style={videoStyle} {...videoProps} />
              </div>
            )}
            {below && textNode}
          </section>
        )
      }

      return (
        <section key={`${section.id}-${si}`} id={section.id} className="detail-section-video-bg" style={sectionBgStyle(section)}>
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
        <section key={`${section.id}-${si}`} id={section.id} className="detail-stats" style={sectionBgStyle(section)}>
          {items.map((item, i) => (
            <div key={i} className="detail-stats-item">
              {item.icon && <img className="detail-stats-icon" src={`${basePath}/${item.icon}`} alt="" />}
              {item.value && <div className="detail-stats-value" style={typo(item, 'value')}>{item.value}</div>}
              {item.label && <div className="detail-stats-label" style={typo(item, 'label')}>{item.label}</div>}
            </div>
          ))}
        </section>
      )
    }

    if (section.type === 'scroll-animation') {
      return (
        <ScrollAnimationSection key={`${section.id}-${si}`} id={section.id} section={section} assetsBase={basePath} isMobile={isMobile} tier={tier} renderLines={renderLines} />
      )
    }

    return null
  })
}
