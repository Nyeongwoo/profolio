import { useEffect } from 'react'
import { MINIMAL_REDUCE_MOTION } from './minimal'

// Fade + slide detail-page sections into view as they scroll up into the viewport.
// Uses a scroll listener + getBoundingClientRect (no IntersectionObserver dependency),
// reveals each element once, and does an initial pass so anything already in view shows
// immediately. Re-runs when `dep` changes (e.g. after info.json loads/refetches).
export function useScrollReveal(dep) {
  useEffect(() => {
    const root = document.querySelector('.project-detail')
    if (!root) return
    const sel = ':scope > section.detail-section-full, :scope > section.detail-section-mid, :scope > section.detail-section-carousel'
    const els = [...root.querySelectorAll(sel)]
    if (!els.length) return

    // Respect reduced-motion (and minimal mode's calmer pages): reveal everything immediately, no animation.
    if (MINIMAL_REDUCE_MOTION || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      els.forEach(el => el.classList.add('revealed'))
      return
    }

    let raf = 0
    let remaining = els.filter(el => !el.classList.contains('revealed'))
    const reveal = () => {
      const trigger = window.innerHeight * 0.9
      remaining = remaining.filter(el => {
        if (el.getBoundingClientRect().top < trigger) { el.classList.add('revealed'); return false }
        return true
      })
      if (!remaining.length) { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll) }
    }
    const onScroll = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(reveal) }

    reveal() // initial pass for already-visible sections
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [dep])
}
