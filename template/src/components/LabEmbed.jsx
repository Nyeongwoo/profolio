import { useEffect, useRef, useState } from 'react'
import { t } from '../i18n'

// An interactive piece from public/lab/<slug>/, shown in an iframe — from
// the same place as the page, so Profolio's preview (which serves the
// .portfolio package, where Lab pieces live) shows its unpublished edits.
function labUrl(slug) {
  const clean = (slug || '').trim().replace(/^\/+|\/+$/g, '').replace(/^lab\//, '')
  // index.html spelled out: the Vite dev server answers a bare folder URL
  // with the site app instead of the folder's page.
  return clean ? `/lab/${clean}/index.html` : null
}

// Messages between the page and a piece (see public/lab/lab-frame.js):
//   piece → page  { type: 'nnwoo-lab:height', height }   its content height;
//                 used when the section sets no fixed height, so a long
//                 piece scrolls with the page instead of inside the frame
//   piece → page  { type: 'nnwoo-lab:ready' }
//   page → piece  { type: 'nnwoo-lab:viewport', top, viewportHeight }
//                 where the frame sits in the page's viewport, for
//                 scroll-driven animation
export default function LabEmbed({ section, isMobile }) {
  const src = labUrl(section.labSlug)
  const frame = useRef(null)
  const [reported, setReported] = useState(null)
  const fixed = (isMobile && section.mobileHeight) || section.height

  useEffect(() => {
    const el = frame.current
    if (!el) return
    const post = () => {
      const r = el.getBoundingClientRect()
      el.contentWindow?.postMessage({ type: 'nnwoo-lab:viewport', top: r.top, viewportHeight: window.innerHeight }, '*')
    }
    const onMessage = (e) => {
      if (e.source !== el.contentWindow || !e.data) return
      if (e.data.type === 'nnwoo-lab:height' && e.data.height > 0) setReported(Math.ceil(e.data.height))
      if (e.data.type === 'nnwoo-lab:ready') post()
    }
    window.addEventListener('message', onMessage)
    window.addEventListener('scroll', post, { passive: true })
    window.addEventListener('resize', post)
    el.addEventListener('load', post)
    return () => {
      window.removeEventListener('message', onMessage)
      window.removeEventListener('scroll', post)
      window.removeEventListener('resize', post)
      el.removeEventListener('load', post)
    }
  }, [src])

  if (!src) return null
  const height = fixed || reported || 600
  return (
    <div className="lab-embed">
      <iframe
        ref={frame}
        src={src}
        title={section.label || section.labSlug}
        allow="fullscreen; accelerometer; gyroscope; xr-spatial-tracking"
        scrolling={fixed ? undefined : 'no'}
        style={{ width: '100%', height: `${height}px`, border: 0, display: 'block' }}
      />
      {!section.hideOpenLink && (
        <a className="lab-embed-open" href={src} target="_blank" rel="noopener">{t('Open full screen')} ↗</a>
      )}
    </div>
  )
}
