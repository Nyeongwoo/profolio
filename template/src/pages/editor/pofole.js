// Profolio (the Mac app) integration for the web editor.
import { useEffect, useRef } from 'react'

// Embedded in Profolio's inspector (?embed=1): the app has its own sidebar,
// preview, language switch and Publish, so only the page's form shows here.
// Remembered for the tab, since in-editor links drop the query.
export const EMBED = (() => {
  try {
    if (new URLSearchParams(window.location.search).has('embed')) sessionStorage.setItem('pofoleEmbed', '1')
    return sessionStorage.getItem('pofoleEmbed') === '1'
  } catch { return false }
})()

// The app picks a section (in its preview or sidebar) → open that section in
// the page's form. `jump(index)` is the editor's own jump-to-section.
export function useProfolioSectionSelect(jump) {
  const ref = useRef(jump)
  useEffect(() => { ref.current = jump })
  useEffect(() => {
    const onMessage = (e) => {
      if (e.data && e.data.type === 'pofole:select-section' && Number.isInteger(e.data.index)) ref.current(e.data.index)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])
}

// Unsaved edits, so the app can ask before opening another page. Any typing
// or change in the form counts (the editors keep no dirty state of their
// own); saving clears it. Edits also save themselves a moment after the last
// one, like the app's native forms: the same 'pofole:save' message as File ▸
// Save, sent once React has re-rendered with the new value.
if (EMBED) {
  window.__pofoleDirty = false
  let timer
  const autosave = () => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      if (window.__pofoleDirty) window.postMessage({ type: 'pofole:save' }, '*')
    }, 1000)
  }
  // Typing and field changes only: a button may run its own request (rename,
  // delete) whose result a save of the form's older state would undo.
  for (const type of ['input', 'change']) {
    document.addEventListener(type, () => { window.__pofoleDirty = true; autosave() }, true)
  }
}
export function markSaved() {
  if (EMBED) window.__pofoleDirty = false
}
