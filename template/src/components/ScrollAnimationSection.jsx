import { useState, useRef, useEffect } from 'react'
import { sanitizeInline } from '../utils/sanitizeInline'
import { autoPx } from '../utils/autoPx'
import { typo } from '../utils/typography'

const ff = (obj, field) => obj[`${field}Font`] || obj[`${field}FontFamily`] || obj.fontFamily || 'inherit'
const fw = (obj, field) => obj[`${field}Weight`] || ((obj[`${field}Bold`] ?? obj.textBold) ? '700' : undefined)
const fc = (obj, field) => obj[`${field}Color`] || undefined
const fi = (obj, field) => obj[`${field}Italic`] ? 'italic' : undefined

// Renders a canvas-driven scroll-scrubbed frame sequence with optional side text.
// `assetsBase` is the folder that directly contains the frame folders
// (e.g. `/assets/projects/{category}/{id}` or `/assets/about`) and `sideItemsBase`
// is the folder that contains side-item / tab icon images (defaults to `${assetsBase}/sections`).
export default function ScrollAnimationSection({ id, section, assetsBase, sideItemsBase, isMobile: isMobileProp, tier, renderLines }) {
  // `isMobile` (tier === 'mobile', <=600px) drives which *assets* load
  // (mobileScrollFolder/mobileCanvasCrop/mobileFrameCount) — kept narrow so
  // tablet doesn't accidentally pull portrait-cropped mobile art.
  // `isCompact` (<=768px) drives *layout*: side-by-side canvas+text only
  // really works once there's real desktop width to split — at tablet the
  // fixed-width text column eats too much of a 768px row and squeezes the
  // canvas down to near-nothing, so tablet gets the same stacked
  // canvas-on-top + tabs-below treatment as mobile instead.
  const isMobile = tier ? tier === 'mobile' : isMobileProp
  const isCompact = tier ? tier !== 'desktop' : isMobileProp
  const sectionRef = useRef(null)
  const canvasRef = useRef(null)
  const frames = useRef([])
  const activeFolder = (isMobile && section.mobileScrollFolder) ? section.mobileScrollFolder : (section.scrollFolder || (section.scrollIndex != null ? `scroll-${section.scrollIndex}` : 'scroll'))
  const activeCrop = (isMobile && section.mobileCanvasCrop) ? section.mobileCanvasCrop : section.canvasCrop
  const cropRef = useRef(activeCrop)
  useEffect(() => { cropRef.current = (isMobile && section.mobileCanvasCrop) ? section.mobileCanvasCrop : section.canvasCrop }, [isMobile, section.mobileCanvasCrop, section.canvasCrop])
  const [canvasAspect, setCanvasAspect] = useState(null)
  const frameCount = (isMobile && section.mobileFrameCount) ? section.mobileFrameCount : (section.frameCount || 72)
  const canvasPos = section.canvasPosition || 'left'
  const textPos = section.textPosition || 'left'
  const iconsBase = sideItemsBase || `${assetsBase}/sections`
  const isMobileStatic = isMobile && !!section.mobileStatic

  useEffect(() => {
    const EXTS = ['webp', 'png', 'jpg', 'jpeg']
    const base = `${assetsBase}/${activeFolder}`

    const loadWithFallback = (frameNum) => new Promise(resolve => {
      const padded = String(frameNum).padStart(4, '0')
      const tryExt = (ei) => {
        if (ei >= EXTS.length) { resolve(null); return }
        const img = new Image()
        img.onload = () => resolve(img)
        img.onerror = () => tryExt(ei + 1)
        img.src = `${base}/frame-${padded}.${EXTS[ei]}`
      }
      tryExt(0)
    })

    let cancelled = false
    let shownIndex = -1
    const images = []
    frames.current = []
    setCanvasAspect(null)

    const crop = activeCrop
    const drawCropped = (canvas, img) => {
      if (crop && crop.x1 !== undefined) {
        const sx = img.naturalWidth * crop.x1 / 100
        const sy = img.naturalHeight * crop.y1 / 100
        const sw = img.naturalWidth * (crop.x2 - crop.x1) / 100
        const sh = img.naturalHeight * (crop.y2 - crop.y1) / 100
        canvas.width = sw
        canvas.height = sh
        canvas.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh)
      } else {
        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight
        canvas.getContext('2d').drawImage(img, 0, 0)
      }
    }

    // Static mode has no scroll-scrub, so it shows the last frame that's
    // finished loading — upgrading as later frames arrive, settling on the
    // final frame. Normal (scroll-scrubbed) mode just needs the first frame
    // painted once, since handleScroll takes over from there.
    const showFrame = (img, index) => {
      if (isMobileStatic ? index < shownIndex : shownIndex !== -1) return
      shownIndex = index
      const canvas = canvasRef.current
      if (canvas) {
        drawCropped(canvas, img)
        if (!cancelled) setCanvasAspect(canvas.width / canvas.height)
      }
    }

    // Detect extension from first frame, then bulk-load the rest with that ext
    loadWithFallback(1).then(first => {
      if (cancelled || !first) return
      const ext = first.src.split('.').pop()
      images.push(first)
      showFrame(first, 1)
      for (let i = 2; i <= frameCount; i++) {
        const img = new Image()
        img.src = `${base}/frame-${String(i).padStart(4, '0')}.${ext}`
        img.onload = () => showFrame(img, i)
        images.push(img)
      }
      frames.current = images
    })

    return () => { cancelled = true; frames.current = [] }
  }, [assetsBase, frameCount, activeFolder, activeCrop, isMobileStatic])

  useEffect(() => {
    const handleScroll = () => {
      if (isMobileStatic) return
      const el = sectionRef.current
      if (!el || frames.current.length === 0) return
      const rect = el.getBoundingClientRect()
      const scrollHeight = el.offsetHeight - window.innerHeight
      const progress = Math.max(0, Math.min(1, -rect.top / scrollHeight))
      const startPct = (section.scrollStart || 0) / 100
      const holdPct = (section.scrollHold || 0) / 100
      const animProgress = holdPct >= 1 ? 0 : Math.max(0, (progress - holdPct) / (1 - holdPct))
      const frameIndex = Math.min(Math.floor((startPct + animProgress * (1 - startPct)) * (frames.current.length - 1)), frames.current.length - 1)
      const img = frames.current[frameIndex]
      const canvas = canvasRef.current
      if (canvas && img && img.complete) {
        const ctx = canvas.getContext('2d')
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        const crop = cropRef.current
        if (crop && crop.x1 !== undefined) {
          const sx = img.naturalWidth * crop.x1 / 100
          const sy = img.naturalHeight * crop.y1 / 100
          const sw = img.naturalWidth * (crop.x2 - crop.x1) / 100
          const sh = img.naturalHeight * (crop.y2 - crop.y1) / 100
          ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
        } else {
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        }
      }
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [isMobileStatic])

  const sideItems = section.sideItems
  const hasSideItems = sideItems && sideItems.length > 0 && canvasPos !== 'center'
  const hasText = section.lines?.length > 0 || section.title || section.subtitle || section.content
  const [activeTab, setActiveTab] = useState(0)

  const textBlock = hasText && (
    <div className={`scroll-anim-text scroll-anim-text--${textPos}`} style={section.textMaxWidth ? { maxWidth: autoPx(section.textMaxWidth), margin: '0 auto' } : undefined}>
      {section.lines != null ? renderLines(section.lines, isCompact) : <>
        {section.title && <h2 style={{ fontFamily: ff(section,'title'), ...typo(section, 'title'), fontWeight: fw(section,'title'), color: fc(section,'title'), fontStyle: fi(section,'title') }} dangerouslySetInnerHTML={{__html: sanitizeInline(section.title)}} />}
        {section.subtitle && <h4 style={{ fontFamily: ff(section,'subtitle'), ...typo(section, 'subtitle'), fontWeight: fw(section,'subtitle'), color: fc(section,'subtitle'), fontStyle: fi(section,'subtitle') }} dangerouslySetInnerHTML={{__html: sanitizeInline(section.subtitle)}} />}
        {section.content && <p style={{ fontFamily: ff(section,'content'), ...typo(section, 'content'), fontWeight: fw(section,'content'), color: fc(section,'content'), fontStyle: fi(section,'content') }} dangerouslySetInnerHTML={{__html: sanitizeInline(section.content)}} />}
      </>}
    </div>
  )

  const mobileVh = isCompact ? (section.mobileScrollVh || (hasSideItems ? 2 : (section.scrollVh || 4))) : (section.scrollVh || 4)
  // Side items are static (no per-item scroll reveal) — only the canvas frame
  // sequence actually needs the section's extra scroll height to scrub
  // through. Once that's consumed, the sticky panel unpins with the rest of
  // the section's height still to scroll through, showing as a blank gap
  // before the next section. Pulling the next section up by that same
  // leftover distance closes it — previously only done for the
  // compact/tabs-below layout, but the gap is the same shape at desktop
  // (side-by-side layout doesn't need the extra scroll room either).
  const autoMobileGapAfter = hasSideItems && !section.mobileShowSideItems ? `${-(mobileVh - 1) * 100}vh` : undefined

  const sectionBg = {}
  if (section.bgColor) {
    if (/gradient\(/.test(section.bgColor)) sectionBg.backgroundImage = section.bgColor
    else {
      sectionBg.backgroundColor = section.bgColor
      // Bleeds the color past body's max-width:1920px cap to the true
      // viewport edge (same trick as sectionBgStyle in ProjectDetail.jsx) —
      // without it, a screen wider than 1920px shows the page's own white
      // background in the margin outside the capped column instead of this
      // section's color.
      sectionBg.boxShadow = `0 0 0 100vmax ${section.bgColor}`
      sectionBg.clipPath = 'inset(-1px -100vmax)'
    }
  }

  // Static mode (mobile only): skip the scroll-scrub entirely — show the
  // final frame in normal document flow, with side items/text stacked
  // directly beneath it instead of the pinned-canvas + scroll-tabs layout.
  if (isMobileStatic) {
    return (
      <section id={id} ref={sectionRef} className="scroll-anim-section scroll-anim-static" style={sectionBg}>
        <div className="scroll-anim-static-canvas-wrap" style={{ ...(section.canvasMaxWidth ? { maxWidth: autoPx(section.canvasMaxWidth) } : {}), ...(canvasAspect ? { aspectRatio: canvasAspect } : {}) }}>
          <canvas ref={canvasRef} className="scroll-anim-canvas" />
        </div>
        {hasSideItems ? (
          <div className="scroll-anim-static-items">
            {sideItems.map((item, i) => (
              <div key={i} className="scroll-anim-side-item" style={item.gapAfter !== undefined ? { marginBottom: autoPx(item.gapAfter) } : undefined}>
                {item.image && <img src={`${iconsBase}/${item.image}`} alt={item.title || ''} className="scroll-anim-side-item-img" style={{ ...(item.imageHeight ? { maxHeight: autoPx(item.imageHeight) } : {}) }} />}
                {item.title && <div className="scroll-anim-side-item-title" style={{ ...typo(item, 'title'), ...(item.titleSize ? { fontSize: autoPx(item.titleSize) } : {}), ...(item.titleColor ? { color: item.titleColor } : {}), ...(item.titleGap !== undefined ? { marginBottom: autoPx(item.titleGap) } : {}) }} dangerouslySetInnerHTML={{__html: sanitizeInline(item.title)}} />}
                {item.subtitle && <div className="scroll-anim-side-item-subtitle" style={{ ...typo(item, 'subtitle'), ...(item.subtitleSize ? { fontSize: autoPx(item.subtitleSize) } : {}), ...(item.subtitleColor ? { color: item.subtitleColor } : {}) }} dangerouslySetInnerHTML={{__html: sanitizeInline(item.subtitle)}} />}
              </div>
            ))}
          </div>
        ) : textBlock}
      </section>
    )
  }

  return (
    <>
      <section id={id} ref={sectionRef} className="scroll-anim-section" style={{ ...sectionBg, height: `${mobileVh * 100}vh`, ...(section.mobileGapAfter !== undefined ? { marginBottom: section.mobileGapAfter } : autoMobileGapAfter ? { marginBottom: autoMobileGapAfter } : {}) }}>
        <div className={`scroll-anim-sticky scroll-anim-sticky--canvas-${canvasPos}`} style={{ ...(section.bgColor ? { background: section.bgColor } : {}), ...(isCompact && section.mobileStickyTop !== undefined ? { top: `${section.mobileStickyTop}vh` } : {}), ...(isCompact && hasSideItems && !section.mobileShowSideItems ? { justifyContent: 'flex-start', paddingTop: section.mobileGapBefore !== undefined ? Math.max(0, 72 + section.mobileGapBefore) : 72 } : (isCompact && section.mobileGapBefore !== undefined ? { paddingTop: Math.max(0, 20 + section.mobileGapBefore) } : {})), ...(!isCompact && section.stickyPaddingTop !== undefined ? { alignItems: 'flex-start', paddingTop: section.stickyPaddingTop } : {}), ...(!isCompact ? { top: `${section.stickyTopOffset ?? 94}px`, height: `calc(100vh - ${section.stickyTopOffset ?? 94}px)` } : {}) }}>
          <div className="scroll-anim-canvas-wrap" style={{ ...(section.canvasMaxWidth ? { maxWidth: autoPx(section.canvasMaxWidth) } : {}), ...(canvasAspect ? { aspectRatio: canvasAspect } : {}) }}>
            <canvas ref={canvasRef} className="scroll-anim-canvas" />
          </div>
          {hasSideItems ? (
            <div className="scroll-anim-side-items" style={{
              ...(section.sideItemsWidth ? { width: `min(${autoPx(section.sideItemsWidth)}, 45%)` } : {}),
              ...(section.sideItemsAlign === 'center' ? { alignItems: 'center', textAlign: 'center' } : {}),
              ...(isCompact && section.mobileShowSideItems ? { display: 'flex' } : {}),
            }}>
              {sideItems.map((item, i) => (
                <div key={i} className="scroll-anim-side-item" style={item.gapAfter !== undefined ? { marginBottom: autoPx(item.gapAfter) } : undefined}>
                  {item.image && <img src={`${iconsBase}/${item.image}`} alt={item.title||''} className="scroll-anim-side-item-img" style={{
                    ...(item.imageHeight ? { maxHeight: autoPx(item.imageHeight) } : {}),
                    ...(section.sideItemsAlign === 'center' ? { objectPosition: 'center center' } : {}),
                  }} />}
                  {item.title && <div className="scroll-anim-side-item-title" style={{ ...typo(item, 'title'), ...(item.titleSize ? { fontSize: autoPx(item.titleSize) } : {}), ...(item.titleColor ? { color: item.titleColor } : {}), ...(item.titleGap !== undefined ? { marginBottom: autoPx(item.titleGap) } : {}) }} dangerouslySetInnerHTML={{__html: sanitizeInline(item.title)}} />}
                  {item.subtitle && <div className="scroll-anim-side-item-subtitle" style={{ ...typo(item, 'subtitle'), ...(item.subtitleSize ? { fontSize: autoPx(item.subtitleSize) } : {}), ...(item.subtitleColor ? { color: item.subtitleColor } : {}) }} dangerouslySetInnerHTML={{__html: sanitizeInline(item.subtitle)}} />}
                </div>
              ))}
            </div>
          ) : (
            canvasPos !== 'center' && textBlock
          )}
        </div>
      </section>
      {(canvasPos === 'center' || hasSideItems) && hasText && (
        <div className="scroll-anim-below-text">
          {textBlock}
        </div>
      )}
      {hasSideItems && !section.mobileShowSideItems && (
        <div className="scroll-anim-tabs" style={{ position: 'relative', zIndex: 1 }}>
          <div className="scroll-anim-tabs-bar">
            {sideItems.map((item, i) => (
              <button key={i} className={`scroll-anim-tab${activeTab === i ? ' scroll-anim-tab--active' : ''}`} onClick={() => setActiveTab(i)}>
                {item.image && <img src={`${iconsBase}/${item.image}`} alt={item.title || ''} className="scroll-anim-tab-icon" />}
                {item.title && <span className="scroll-anim-tab-label" style={typo(item, 'title')} dangerouslySetInnerHTML={{__html: sanitizeInline(item.title)}} />}
              </button>
            ))}
          </div>
          {sideItems[activeTab] && (
            <div className="scroll-anim-tab-content">
              {sideItems[activeTab].subtitle && <p dangerouslySetInnerHTML={{__html: sanitizeInline(sideItems[activeTab].subtitle)}} />}
            </div>
          )}
        </div>
      )}
    </>
  )
}
