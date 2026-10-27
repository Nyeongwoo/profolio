import { useState, useEffect, useRef, useCallback } from 'react'

// Reveals an element (adds `revealed: true`) the first time it scrolls into
// view, then stops observing — a one-shot fade/slide-in trigger for feed-style
// lists (each card animates in as it's scrolled to, instead of all being
// visible immediately). Returns a ref callback (works with React Router's
// forwardRef'd <Link>) plus the current revealed state.
export function useRevealOnScroll(threshold = 0.15) {
  const [revealed, setRevealed] = useState(false)
  const obsRef = useRef(null)
  const setRef = useCallback((el) => {
    if (obsRef.current) { obsRef.current.disconnect(); obsRef.current = null }
    if (!el) return
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setRevealed(true); io.disconnect() }
    }, { threshold })
    io.observe(el)
    obsRef.current = io
  }, [threshold])
  return [setRef, revealed]
}

// Hides on scroll-down, reappears on scroll-up — same direction-based
// hysteresis Navbar.jsx uses for the navbar itself, factored out so any
// other fixed bar (category filter pill, etc.) can get the same behavior.
// `thresholdPx` keeps it always-visible near the top of the page.
export function useScrollHidden(thresholdPx = 80) {
  const [hidden, setHidden] = useState(false)
  const lastY = useRef(0)
  useEffect(() => {
    lastY.current = window.scrollY
    const onScroll = () => {
      const y = window.scrollY
      if (y <= thresholdPx) setHidden(false)
      else if (y > lastY.current + 2) setHidden(true)
      else if (y < lastY.current - 2) setHidden(false)
      lastY.current = y
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [thresholdPx])
  return hidden
}

export function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth <= breakpoint : false
  )
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`)
    // Re-sync immediately from the media query rather than trusting the
    // window.innerWidth read the initial useState() captured — if that
    // first read landed before layout/viewport had settled (seen on some
    // embedded/webview contexts), it can lock in the wrong value forever:
    // 'change' only fires on a future threshold crossing, so a page that's
    // desktop-sized the whole time never gets a chance to correct an
    // initial false positive.
    setIsMobile(mq.matches)
    const handler = (e) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [breakpoint])
  return isMobile
}

// Live window.innerWidth, for call sites that need to compare against a
// value only known at render time (e.g. a per-section custom breakpoint from
// content data) rather than a single fixed breakpoint useIsMobile can bake
// into its own media query.
export function useWindowWidth() {
  const [width, setWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1024)
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth)
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return width
}

// 'mobile' <=600, 'tablet' 601-1024, 'desktop' >1024 — used wherever mobile
// AND tablet need independently-overridable values (e.g. section spacing),
// as opposed to useIsMobile's plain mobile/desktop split.
export function useBreakpointTier() {
  const getTier = () => {
    if (typeof window === 'undefined') return 'desktop'
    const w = window.innerWidth
    return w <= 600 ? 'mobile' : w <= 1024 ? 'tablet' : 'desktop'
  }
  const [tier, setTier] = useState(getTier)
  useEffect(() => {
    const mqMobile = window.matchMedia('(max-width: 600px)')
    const mqTablet = window.matchMedia('(max-width: 1024px)')
    const handler = () => setTier(getTier())
    handler() // re-sync in case the initial window.innerWidth read (see useIsMobile) was stale
    mqMobile.addEventListener('change', handler)
    mqTablet.addEventListener('change', handler)
    return () => {
      mqMobile.removeEventListener('change', handler)
      mqTablet.removeEventListener('change', handler)
    }
  }, [])
  return tier
}
