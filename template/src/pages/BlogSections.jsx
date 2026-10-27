import { useState, useRef, useEffect } from 'react'
import { ImageWithFallback } from '../utils/getImage'
import ChevronIcon from '../components/ChevronIcon'
import { useIsMobile, useBreakpointTier } from '../utils/useIsMobile'
import { sanitizeInline } from '../utils/sanitizeInline'
import { autoPx } from '../utils/autoPx'

const CARD_SIZE_MAP = { small: '40%', medium: '70%', large: '90%' }
const parseRatioNum = (r) => { if (!r) return null; const [w, h] = String(r).split('/').map(Number); return (w && h) ? w / h : null }

function loadModelViewerScript() {
  if (document.querySelector('[data-mv-script]')) return
  const s = document.createElement('script')
  s.type = 'module'
  s.src = 'https://ajax.googleapis.com/ajax/libs/model-viewer/3.5.0/model-viewer.min.js'
  s.setAttribute('data-mv-script', '1')
  document.head.appendChild(s)
}

function ModelViewerEl({ src, autoRotate, title, subtitle, content }) {
  const ref = useRef(null)

  useEffect(() => {
    loadModelViewerScript()
    if (!ref.current || !src) return
    const mv = document.createElement('model-viewer')
    mv.setAttribute('src', src)
    if (autoRotate !== false) mv.setAttribute('auto-rotate', '')
    mv.setAttribute('camera-controls', '')
    mv.style.cssText = 'width:100%;height:500px;display:block;background:#e6e6e6;'
    ref.current.innerHTML = ''
    ref.current.appendChild(mv)
  }, [src, autoRotate])

  return (
    <div>
      <div ref={ref} />
      {(title || subtitle || content) && (
        <div className="detail-block-mid-body" style={{ textAlign: 'center', marginTop: '32px' }}>
          {title && <h2>{title}</h2>}
          {subtitle && <h4>{subtitle}</h4>}
          {content && <p>{content}</p>}
        </div>
      )}
    </div>
  )
}

function BlogBlockCarousel({ blocks, basePath, isMobile, tier, cardSize, cardRatio, cardHeight, cardHeightTablet }) {
  const trackRef = useRef(null)
  const [canPrev, setCanPrev] = useState(false)
  const [canNext, setCanNext] = useState(true)
  const [hasOverflow, setHasOverflow] = useState(false)
  // Fixed-height mode (desktop/tablet only): height stays constant, width follows each block's ratio.
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
    const w = el.querySelector('.bc-card')?.offsetWidth || 400
    el.scrollBy({ left: dir * (w + 24), behavior: 'smooth' })
  }

  useEffect(() => {
    const el = trackRef.current
    if (!el) return
    updateButtons()
    el.addEventListener('scroll', updateButtons)
    window.addEventListener('resize', updateButtons)
    return () => { el.removeEventListener('scroll', updateButtons); window.removeEventListener('resize', updateButtons) }
  }, [])

  return (
    <div className="bc-wrap">
      <div className="bc-track" ref={trackRef}>
        {blocks.map((block, idx) => {
          const blockRatio = isMobile ? (block.mobileRatio || block.desktopRatio || cardRatio) : (block.desktopRatio || cardRatio)
          const cardFlexBasis = isMobile ? undefined : (CARD_SIZE_MAP[cardSize] || undefined)
          const cardW = fixedHpx ? `${Math.round(fixedHpx * (parseRatioNum(blockRatio) || 16 / 9))}px` : null
          const cardStyle = cardW ? { flex: `0 0 ${cardW}` } : (cardFlexBasis ? { flex: `0 0 ${cardFlexBasis}` } : undefined)
          const imgStyle = fixedH ? { width: cardW, height: fixedH } : (blockRatio ? { aspectRatio: blockRatio } : undefined)
          return (
            <div key={idx} className="bc-card" style={cardStyle}>
              <div className="bc-card-img" style={imgStyle}>
                {(block.images || []).map(i => (
                  <ImageWithFallback
                    key={i}
                    basePath={`${basePath}/sections/${String(i).padStart(2, '0')}`}
                    alt={block.title || ''}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', inset: 0 }}
                  />
                ))}
                {(block.overlayTitle || block.overlayContent) && (
                  <div className="detail-full-overlay detail-full-overlay-left">
                    {block.overlayTitle && <h2 className="detail-full-overlay-title" dangerouslySetInnerHTML={{__html: sanitizeInline(block.overlayTitle)}} />}
                    {block.overlayContent && <p className="detail-full-overlay-content" dangerouslySetInnerHTML={{__html: sanitizeInline(block.overlayContent)}} />}
                  </div>
                )}
              </div>
              <div className="bc-card-body" style={{ maxWidth: autoPx(block.textMaxWidth) }}>
                {block.title && <p dangerouslySetInnerHTML={{__html: sanitizeInline(block.title)}} />}
                {block.content && <p dangerouslySetInnerHTML={{__html: sanitizeInline(block.content)}} />}
                {block.subtitle && <p className="bc-card-sub" dangerouslySetInnerHTML={{__html: sanitizeInline(block.subtitle)}} />}
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

export default function BlogSections({ sections, basePath }) {
  const isMobile = useIsMobile()
  const tier = useBreakpointTier()
  const imgSrc = (i) => `${basePath}/sections/${String(i).padStart(2, '0')}`

  const sectionBgStyle = (section) => {
    if (!section.bgImage) return {}
    const src = section.bgImage.startsWith('/') ? section.bgImage : `${basePath}/${section.bgImage}`
    return { backgroundImage: `url(${src})`, backgroundSize: 'cover', backgroundPosition: 'center' }
  }

  return sections.map((section, si) => {
    if (section.type === 'images') {
      const ov = section.overlay
      return (
        <section key={`${section.id}-${si}`} id={section.id} className="detail-section-full" style={sectionBgStyle(section)}>
          {(section.images || []).map(i => (
            <div key={i} className="detail-full-img-wrap">
              <ImageWithFallback basePath={imgSrc(i)} alt={`section-${i}`} style={{ width: '100%', display: 'block' }} />
              {ov && (ov.title || ov.subtitle || ov.content) && (
                <div className={`detail-full-overlay detail-full-overlay-${ov.position || 'left'}`} style={ov.textMaxWidth ? { maxWidth: autoPx(ov.textMaxWidth) } : undefined}>
                  {ov.title && <h2 className="detail-full-overlay-title">{ov.title}</h2>}
                  {ov.subtitle && <h4 className="detail-full-overlay-subtitle">{ov.subtitle}</h4>}
                  {ov.content && <p className="detail-full-overlay-content">{ov.content}</p>}
                </div>
              )}
            </div>
          ))}
        </section>
      )
    }

    if (section.type === 'image-text') {
      const effCardHeight = tier === 'tablet' ? (section.cardHeightTablet || section.cardHeight) : section.cardHeight
      const fixedH = tier !== 'mobile' && effCardHeight ? `${effCardHeight}px` : null
      return (
        <section key={`${section.id}-${si}`} id={section.id} className="detail-section-mid" style={sectionBgStyle(section)}>
          {(section.blocks || []).filter(b => !b.hidden).map((block, idx) => (
            <div key={idx} className="detail-block-mid">
              <div className={`detail-block-mid-img${fixedH ? ' fixed-h' : ''}`} style={fixedH ? { height: fixedH } : undefined}>
                {(block.images || []).map(i => (
                  <div key={i} className="detail-hover-img" style={{ cursor: 'default', ...(fixedH ? { aspectRatio: 'unset', height: '100%' } : {}) }}>
                    <ImageWithFallback
                      basePath={imgSrc(i)}
                      alt={block.title || ''}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '12px', position: 'absolute', inset: 0 }}
                    />
                  </div>
                ))}
              </div>
              {(block.title || block.subtitle || block.content) && (
                <div className="detail-block-mid-body" style={block.textMaxWidth ? { maxWidth: autoPx(block.textMaxWidth) } : undefined}>
                  {block.title && <h2 dangerouslySetInnerHTML={{__html: sanitizeInline(block.title)}} />}
                  {block.subtitle && <h4 dangerouslySetInnerHTML={{__html: sanitizeInline(block.subtitle)}} />}
                  {block.content && <p dangerouslySetInnerHTML={{__html: sanitizeInline(block.content)}} />}
                </div>
              )}
            </div>
          ))}
        </section>
      )
    }

    if (section.type === 'image-text-carousel') {
      return (
        <section key={`${section.id}-${si}`} id={section.id} className="detail-section-carousel" style={sectionBgStyle(section)}>
          <BlogBlockCarousel blocks={(section.blocks || []).filter(b => !b.hidden)} basePath={basePath} isMobile={isMobile} tier={tier} cardSize={section.cardSize} cardRatio={section.cardRatio} cardHeight={section.cardHeight} cardHeightTablet={section.cardHeightTablet} />
        </section>
      )
    }

    if (section.type === 'text') {
      return (
        <section key={`${section.id}-${si}`} id={section.id} className="detail-section-mid">
          <div style={{ maxWidth: autoPx(section.textMaxWidth) || '700px', margin: '0 auto' }}>
            {section.title && <h2 style={section.titleSize ? { fontSize: autoPx(section.titleSize) } : {}} dangerouslySetInnerHTML={{__html: sanitizeInline(section.title)}} />}
            {section.content && <p style={section.contentSize ? { fontSize: autoPx(section.contentSize) } : {}} dangerouslySetInnerHTML={{__html: sanitizeInline(section.content)}} />}
          </div>
        </section>
      )
    }

    if (section.type === 'model-viewer') {
      const modelSrc = section.modelFile
        ? (section.modelFile.startsWith('/') ? section.modelFile : `${basePath}/${section.modelFile}`)
        : null
      return (
        <section key={`${section.id}-${si}`} id={section.id} className="detail-section-mid">
          {modelSrc
            ? <ModelViewerEl
                src={modelSrc}
                autoRotate={section.autoRotate}
                title={section.title}
                subtitle={section.subtitle}
                content={section.content}
              />
            : <div style={{ padding: '40px', textAlign: 'center', color: '#bbb', fontSize: '14px' }}>No 3D model file found</div>
          }
        </section>
      )
    }

    return null
  })
}
