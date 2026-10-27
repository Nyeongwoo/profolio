import { useState, useEffect } from 'react'
import { useBreakpointTier } from './useIsMobile'
import { localizedImage } from '../i18n'

// Ordered by how common each format actually is across the site's assets
// (webp >> png > svg > gif; the site's PNGs were converted to lossless WebP)
// — extension-guessing tries these in order and eats a failed request for
// each miss before the real file loads, so the common format goes first.
const DEFAULT_EXTENSIONS = ['webp', 'png', 'jpg', 'jpeg', 'gif', 'svg']

const noSave = { onContextMenu: e => e.preventDefault(), draggable: false }

// Explicit "use a placeholder" choice (picked in the editor's ImagePicker),
// as opposed to a missing/broken image. Rendered the same everywhere a real
// image would go — in the editor AND on the live site — so authors can see
// and size their layout before the real asset exists.
export const PLACEHOLDER_IMG = '__placeholder__'

// basePath: default/desktop asset. mobileBasePath/tabletBasePath (optional):
// art-directed crops swapped in per breakpoint (mobile ≤600, tablet 601–1024)
// — same idea as Apple's <picture> source-swap, but resolved in JS against
// our own extension-guessing <img> instead of native <picture><source>,
// since a broken/missing file can't "fall through" to the next extension
// inside a <picture> the way our onError retry chain does.
//
// nativeSize: opts out of the site's usual object-fit:cover scale-to-fill
// and instead centers the image at its own natural pixel size, clipping
// whatever spills outside the container — Apple's literal hero mechanism.
// Only reasonable when the source asset is prepared at (or above) the
// container's expected display size; otherwise it'll just show cropped-in
// rather than filling the box, so it's opt-in per image/section, not default.
//
// hideOnMobile: don't render this image at all at the mobile tier (≤600px)
// — for images that are purely decorative on desktop and just add visual
// noise/cropping problems on a phone.
export function ImageWithFallback({
  basePath: rawBasePath, mobileBasePath: rawMobileBasePath, tabletBasePath: rawTabletBasePath, nativeSize, hideOnMobile,
  withHover, alt, className, style, onLoad, cacheBust, lazy = true, extensions = DEFAULT_EXTENSIONS,
}) {
  // Per-language image replacements (Korean/Chinese dictionaries); unchanged
  // on English pages or when no replacement was set.
  const basePath = localizedImage(rawBasePath)
  const mobileBasePath = localizedImage(rawMobileBasePath)
  const tabletBasePath = localizedImage(rawTabletBasePath)
  const [extIndex, setExtIndex] = useState(0)
  const [failed, setFailed] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [hoverExtIndex, setHoverExtIndex] = useState(0)
  const [hoverLoaded, setHoverLoaded] = useState(false)
  const [naturalDims, setNaturalDims] = useState(null)
  const [dpr, setDpr] = useState(() => (typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1))
  const needsTier = !!(mobileBasePath || tabletBasePath || hideOnMobile)
  const tier = useBreakpointTier() // always called — hooks can't be conditional; cheap when unused
  const effectiveBasePath = needsTier
    ? (tier === 'mobile' && mobileBasePath) ? mobileBasePath
      : (tier === 'tablet' && tabletBasePath) ? tabletBasePath
      : basePath
    : basePath
  const [prevBasePath, setPrevBasePath] = useState(effectiveBasePath)

  // devicePixelRatio has no native change event; dragging the window to a
  // different-DPR display (or an OS zoom change) doesn't re-render on its
  // own. A `resolution` media query re-fires 'change' the moment the actual
  // DPR crosses the query's threshold, so re-subscribing at that new DPR
  // each time keeps this current instead of it going stale after the first
  // load — only relevant when nativeSize is on, since only then is `dpr`
  // actually used to size the image.
  useEffect(() => {
    if (!nativeSize || typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia(`(resolution: ${dpr}dppx)`)
    const onChange = () => setDpr(window.devicePixelRatio || 1)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [nativeSize, dpr])

  // Extension-guessing (below) means the browser can 404 against the wrong
  // extension before landing on the right one — each 404 briefly paints the
  // native broken-image icon. Keeping the <img> invisible until its `onLoad`
  // fires hides every failed attempt; only the successful load is ever seen.
  if (effectiveBasePath !== prevBasePath) {
    setPrevBasePath(effectiveBasePath)
    setExtIndex(0)
    setFailed(false)
    setLoaded(false)
    setNaturalDims(null)
  }

  if (hideOnMobile && tier === 'mobile') return null

  if (effectiveBasePath === PLACEHOLDER_IMG) {
    return <div className={className} style={{ background: '#e6e6e6', ...style }} />
  }

  const qs = cacheBust ? `?t=${cacheBust}` : ''
  const src = `${effectiveBasePath}.${extensions[extIndex]}${qs}`
  const loading = lazy ? 'lazy' : 'eager'

  const handleError = () => {
    if (extIndex + 1 < extensions.length) {
      setExtIndex(i => i + 1)
    } else {
      setFailed(true)
    }
  }

  // inset/right/bottom explicitly cleared: some callers pass `inset: 0` (to
  // fill their container in the default cover mode) — left alongside our own
  // top/left:50%, that over-constrains the absolutely-positioned box and the
  // browser resolves it by computing height/width from the leftover insets
  // instead of leaving them at their natural pixel size, defeating the
  // whole point of nativeSize.
  //
  // width/height are pinned to naturalWidth/height ÷ devicePixelRatio (once
  // known, post-load) rather than left as `auto`: a plain <img> renders at
  // 1 file-pixel per CSS px, ignoring DPR, so a 2x-density asset prepared
  // for retina crispness would otherwise display at literal 2x size and get
  // cropped twice as aggressively on a normal 1x-CSS-px-counted viewport
  // (e.g. a 3840px asset spans the full width of a 3840px-wide 1x display,
  // but at DPR 2 that same asset should read as "1920 CSS px", not 3840).
  const nativeSizeStyle = nativeSize
    ? {
        position: 'absolute', inset: 'auto', top: '50%', left: '50%', right: 'auto', bottom: 'auto', transform: 'translate(-50%, -50%)',
        width: naturalDims ? `${naturalDims.w / dpr}px` : 'auto',
        height: naturalDims ? `${naturalDims.h / dpr}px` : 'auto',
        maxWidth: 'none', maxHeight: 'none', objectFit: undefined,
      }
    : {}

  if (!withHover) {
    if (failed) return null
    return (
      <img
        src={src}
        alt={alt || ''}
        className={className}
        style={{ ...style, ...nativeSizeStyle, opacity: loaded ? (style?.opacity ?? 1) : 0, transition: 'opacity 0.25s ease' }}
        onLoad={e => {
          setLoaded(true)
          if (nativeSize) setNaturalDims({ w: e.target.naturalWidth, h: e.target.naturalHeight })
          onLoad?.(e)
        }}
        onError={handleError}
        loading={loading}
        decoding="async"
        {...noSave}
      />
    )
  }

  const hoverSrc = `${basePath}-hover.${extensions[hoverExtIndex]}`
  const { objectFit, ...divStyle } = style || {}

  if (failed) return null

  return (
    <div
      className={className}
      style={{ position: 'relative', overflow: 'hidden', ...divStyle }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <img
        src={src}
        alt={alt || ''}
        style={{ width: '100%', height: '100%', objectFit: objectFit || 'cover', display: 'block', opacity: loaded ? 1 : 0, transition: 'opacity 0.25s ease' }}
        onLoad={() => setLoaded(true)}
        onError={handleError}
        loading={loading}
        decoding="async"
        {...noSave}
      />
      <img
        src={hoverSrc}
        alt=""
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: objectFit || 'cover',
          opacity: hovered && hoverLoaded ? 1 : 0,
          transition: 'opacity 0.3s ease',
          pointerEvents: 'none',
        }}
        onError={() => hoverExtIndex + 1 < extensions.length && setHoverExtIndex(i => i + 1)}
        onLoad={() => setHoverLoaded(true)}
        loading="lazy"
        decoding="async"
        {...noSave}
      />
    </div>
  )
}
