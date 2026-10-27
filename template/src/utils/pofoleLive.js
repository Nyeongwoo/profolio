// Profolio (the Mac app's build): the app sends a page's content while it's
// being edited, before it's saved, so the preview follows every keystroke.
// `path` is the content file's public URL path; onDoc gets the raw content.
import { useEffect, useRef } from 'react'

export const IS_POFOLE = import.meta.env.MODE === 'app'

export function useProfolioDoc(path, onDoc) {
  const ref = useRef(onDoc)
  useEffect(() => { ref.current = onDoc })
  useEffect(() => {
    if (!IS_POFOLE || !path) return
    const onMessage = (e) => {
      const d = e.data
      if (d && d.type === 'pofole:doc' && d.path === path) ref.current(d.doc)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [path])
}
