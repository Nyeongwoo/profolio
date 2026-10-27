// Letter spacing and line height set on a single text field in the editor
// (Profolio's typography popover). They live next to the text as
// `${key}LetterSpacing` / `${key}LineHeight` — e.g. intro.title →
// intro.titleLetterSpacing — and override the stylesheet when set.
// A bare number of letter spacing is pixels; line height takes a multiplier
// (1.4) or a length (24px).
export function typo(obj, key) {
  if (!obj) return {}
  const ls = obj[`${key}LetterSpacing`]
  const lh = obj[`${key}LineHeight`]
  const style = {}
  if (ls !== undefined && ls !== null && ls !== '') style.letterSpacing = /^-?\d*\.?\d+$/.test(String(ls)) ? `${ls}px` : ls
  if (lh !== undefined && lh !== null && lh !== '') style.lineHeight = lh
  return style
}
