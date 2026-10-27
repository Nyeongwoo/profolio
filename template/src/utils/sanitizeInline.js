// Strips everything except a small inline-formatting allowlist (bold/italic/underline/
// line-break/color span) from editor-authored HTML before it's injected via
// dangerouslySetInnerHTML.
const ALLOWED_TAGS = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'BR', 'SPAN', 'FONT', 'A'])
const COLOR_RE = /^(#[0-9a-fA-F]{3,8}|rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)|rgba\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*[\d.]+\s*\))$/
// Only allow schemes that can't execute script (blocks javascript:, data:, vbscript:, etc.)
const SAFE_URL_RE = /^(https?:\/\/|mailto:|tel:|\/|#)/i

export function sanitizeInline(html) {
  if (!html) return ''
  const doc = new DOMParser().parseFromString(html, 'text/html')

  const clean = (node) => {
    [...node.childNodes].forEach(child => {
      if (child.nodeType !== 1) return
      if (child.tagName === 'DIV' || child.tagName === 'P') {
        // Legacy line-wrapper from before Enter was handled via manual <br>
        // insertion. Flattening it to child.textContent (like other
        // disallowed tags) would destroy any inline formatting/color spans
        // nested inside — unwrap it as a line break instead, preserving them.
        clean(child)
        const br = document.createElement('br')
        child.replaceWith(...[...child.childNodes], br)
        return
      }
      if (!ALLOWED_TAGS.has(child.tagName)) {
        child.replaceWith(document.createTextNode(child.textContent))
        return
      }
      // execCommand output varies with the browser's styleWithCSS mode: color comes
      // as <font color> or <span style="color:...">, and — if styleWithCSS was left
      // on from an earlier color edit — bold/italic land as inline style on a SPAN
      // instead of a <b>/<i> tag. Read all three off the *original* style before
      // wiping attributes, so bold/italic applied that way don't silently vanish.
      const color = child.tagName === 'FONT' ? child.getAttribute('color') : child.style.color
      const isBoldSpan = child.tagName === 'SPAN' && /^(bold|bolder|[6-9]00)$/.test((child.style.fontWeight || '').trim())
      const isItalicSpan = child.tagName === 'SPAN' && /^(italic|oblique)/.test((child.style.fontStyle || '').trim())
      const href = child.tagName === 'A' ? child.getAttribute('href') : null
      ;[...child.attributes].forEach(attr => child.removeAttribute(attr.name))
      if (color && COLOR_RE.test(color.trim())) {
        child.style.color = color
      }
      if (isBoldSpan) child.style.fontWeight = 'bold'
      if (isItalicSpan) child.style.fontStyle = 'italic'
      if (child.tagName === 'A') {
        if (href && SAFE_URL_RE.test(href.trim())) {
          child.setAttribute('href', href.trim())
          child.setAttribute('target', '_blank')
          child.setAttribute('rel', 'noopener noreferrer')
        } else {
          // No safe href survived sanitization — an <a> with none is just
          // inert text, so unwrap it instead of leaving a dead/unsafe tag.
          child.replaceWith(document.createTextNode(child.textContent))
          return
        }
      }
      clean(child)
    })
  }

  clean(doc.body)
  // Strip the zero-width space the editor inserts to anchor the caret after a trailing <br>.
  return doc.body.innerHTML.replace(/\u200B/g, '')
}
