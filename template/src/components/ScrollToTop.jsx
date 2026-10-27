import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

export default function ScrollToTop() {
  const { pathname, hash } = useLocation()

  useEffect(() => {
    if (hash) {
      // Content sections render synchronously from static data, but give
      // layout a tick before measuring so scroll-margin-top etc. are settled.
      const id = decodeURIComponent(hash.slice(1))
      const t = setTimeout(() => {
        const el = document.getElementById(id)
        if (el) el.scrollIntoView({ behavior: 'instant' })
        else window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
      }, 0)
      return () => clearTimeout(t)
    }
    // Explicit `behavior: 'instant'` (not the 2-arg scrollTo(0,0) shorthand)
    // since the site sets `html { scroll-behavior: smooth }` globally, which
    // the 2-arg form inherits — animating this jump instead of snapping it.
    // Navigating away while a scroll gesture (trackpad/wheel momentum) is
    // still settling then races that residual momentum against the smooth
    // animation, and momentum wins often enough to leave the new page
    // scrolled down near where the old one was instead of at its top.
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  }, [pathname, hash])

  return null
}
