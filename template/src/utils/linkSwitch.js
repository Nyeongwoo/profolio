import { minimalAllows } from './minimal'

// A link can be switched off without deleting it: the card, line or section
// keeps its `link`, but `linkDisabled: true` (Profolio ▸ Links ▸ Disable link)
// makes it plain content — no click, no arrow. `link2Disabled` switches off
// only a card's second link.
export function liveLink(obj, key = 'link') {
  if (!obj || obj.linkDisabled || obj[`${key}Disabled`]) return ''
  return obj[key] || ''
}

// Switches off, in a copy of a page's sections, every link when `allOff`
// (the About page's "Disable every link"), and otherwise the links to pages
// minimal mode leaves out, which would only bounce the visitor home.
export function switchOffLinks(sections, allOff = false) {
  const off = (link) => !!link && (allOff || !minimalAllows(link))
  const mark = (o) => {
    if (!o || typeof o !== 'object') return o
    const out = { ...o }
    if (off(o.link)) out.linkDisabled = true
    if (off(o.link2)) out.link2Disabled = true
    if (Array.isArray(o.lines)) out.lines = o.lines.map(mark)
    if (Array.isArray(o.blocks)) out.blocks = o.blocks.map(mark)
    return out
  }
  return (sections || []).map(mark)
}
