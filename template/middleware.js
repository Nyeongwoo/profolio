// Vercel Routing Middleware — first-visit language detection.
//
// Runs only on the English home page ("/"). A visitor who hasn't picked a
// language yet is sent to /ko or /zh when their browser prefers Korean or
// Chinese; if the browser states no preference among our languages, the
// country of their IP decides. Everything else stays English:
//   - any deep link (/projects/…) is left exactly as shared — matcher is "/";
//   - a hand-picked language (footer switcher sets the `nnwoo_lang` cookie,
//     see src/i18n) is never overridden, English included;
//   - crawlers and link-preview bots always get the English page, so it
//     stays indexed (the other languages are linked via hreflang).
// Chinese goes to Simplified (/zh) for now, including zh-TW/HK, until a
// Traditional version exists.

export const config = { matcher: '/' }

const SUPPORTED = { en: '', ko: '/ko', zh: '/zh' }
const COUNTRY_LANG = { KR: 'ko', CN: 'zh', TW: 'zh', HK: 'zh', MO: 'zh', SG: 'zh' }
const BOT = /bot|crawl|spider|slurp|facebookexternalhit|embedly|preview|lighthouse|headless|curl|wget/i

// Accept-Language → our language codes in the visitor's order of preference.
function browserLangs(header) {
  return (header || '')
    .split(',')
    .map((part, i) => {
      const [tag, ...params] = part.trim().split(';')
      const q = params.map(p => p.trim()).find(p => p.startsWith('q='))
      return { lang: tag.toLowerCase().split('-')[0], q: q ? parseFloat(q.slice(2)) || 0 : 1, i }
    })
    .filter(x => x.lang && x.q > 0)
    .sort((a, b) => b.q - a.q || a.i - b.i)
    .map(x => x.lang)
}

export function detectLang(request) {
  const cookie = request.headers.get('cookie') || ''
  if (/(?:^|;\s*)nnwoo_lang=/.test(cookie)) return null
  if (BOT.test(request.headers.get('user-agent') || '')) return null

  const preferred = browserLangs(request.headers.get('accept-language')).find(l => l in SUPPORTED)
  const lang = preferred || COUNTRY_LANG[(request.headers.get('x-vercel-ip-country') || '').toUpperCase()] || 'en'
  return lang === 'en' ? null : lang
}

// Off while the site is English-only (see LANGUAGES in src/i18n).
const AUTO_DETECT = false

export default function middleware(request) {
  if (!AUTO_DETECT) return
  const lang = detectLang(request)
  if (!lang) return // continue to the English page

  const url = new URL(request.url)
  url.pathname = SUPPORTED[lang]
  // Temporary + uncached: the same URL answers differently per visitor.
  return new Response(null, {
    status: 307,
    headers: { Location: url.toString(), 'Cache-Control': 'private, no-store', Vary: 'Accept-Language, Cookie' },
  })
}
