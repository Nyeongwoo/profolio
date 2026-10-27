// Shared helper for lab pieces (public/lab/<slug>/), the counterpart of
// src/components/LabEmbed.jsx.
//
// Embedded in a site page, a piece is shown at its full content height (it
// reports it here) and scrolls with the page, so its own window never
// scrolls: LabFrame.onViewport tells it where the page's viewport is instead.
// Opened on its own (/lab/<slug>/), the same calls follow its own scroll.
//
//   LabFrame.onViewport(({ top, viewportHeight }) => …)
//     `top` is where this document's top edge is, in viewport pixels, so an
//     element at document y sits at `top + y` on screen.
//
// Pieces must not size anything with vh units: inside the frame, 100vh is
// the frame's own (content) height.
;(function () {
  const embedded = window.parent !== window
  const listeners = []
  let state = { top: 0, viewportHeight: window.innerHeight }

  function emit(next) {
    state = next
    listeners.forEach(cb => cb(state))
  }

  if (embedded) {
    const report = () => window.parent.postMessage(
      { type: 'nnwoo-lab:height', height: document.body.getBoundingClientRect().height }, '*')
    window.addEventListener('message', e => {
      if (e.source === window.parent && e.data && e.data.type === 'nnwoo-lab:viewport') {
        emit({ top: e.data.top, viewportHeight: e.data.viewportHeight })
        // The page may have started listening after our first report, so
        // answer every viewport update with the height too (repeats are
        // no-ops there).
        report()
      }
    })
    new ResizeObserver(report).observe(document.body)
    window.parent.postMessage({ type: 'nnwoo-lab:ready' }, '*')
    document.documentElement.classList.add('lab-embedded')
  } else {
    const own = () => emit({ top: -window.scrollY, viewportHeight: window.innerHeight })
    window.addEventListener('scroll', own, { passive: true })
    window.addEventListener('resize', own)
    own()
  }

  window.LabFrame = {
    embedded,
    onViewport(cb) {
      listeners.push(cb)
      cb(state)
    },
  }
})()
