// Site localization.
//
// English is the source language: every page is written (and edited) in
// English, and each other language is a dictionary keyed by the English
// string — { strings: { "English": "번역" }, images: { "/assets/…/01": "/assets/…/ko/01" } }.
// Anything without an entry falls back to English, so a half-translated
// language still renders fully. Keying by the source text (not by position)
// means reordering sections never mismatches a translation; changing an
// English sentence just makes it "untranslated" until its entry is updated.
//
// The language comes from the URL prefix (/ko/…, /zh/…; English has none)
// and is fixed for the page load — switching language is a full navigation,
// so content can be translated once, up front, before any page renders.
//
// Which languages the site has is siteConfig.languages (see ./languages.js);
// without it the site is English-only. A language that's off sends its
// URLs to the English page, and the footer shows no language menu while
// English is the only one.

import siteConfig from '../data/siteConfig.json'
import { enabledLanguages, OTHER_LANGUAGE_CODES } from './languages'
import { translateTree } from './rules'

export const LANGUAGES = enabledLanguages(siteConfig)

// Dictionaries bundled with the site. A language added since this bundle was
// built (the Mac editor's preview) is read from the package instead.
const DICTIONARIES = import.meta.glob('./*.json')
const loadDictionary = (code) => DICTIONARIES[`./${code}.json`]?.().then(m => m.default)
  ?? fetch(`/src/i18n/${code}.json`, { cache: 'no-store' }).then(r => r.ok ? r.json() : {})

// /ko/about on a site without Korean → /about.
const off = OTHER_LANGUAGE_CODES.find(c => !LANGUAGES.some(l => l.code === c) &&
  (window.location.pathname === `/${c}` || window.location.pathname.startsWith(`/${c}/`)))
if (off) window.location.replace((window.location.pathname.slice(off.length + 1) || '/') + window.location.search + window.location.hash)

function detectLang(pathname) {
  const seg = pathname.split('/')[1]
  return LANGUAGES.find(l => l.code !== 'en' && l.code === seg) || LANGUAGES[0]
}

const current = detectLang(window.location.pathname)
// The editor is English-only and always lives at the root.
const isEditor = /^\/editor(\/|$)/.test(window.location.pathname)

export const LANG = isEditor ? 'en' : current.code
export const BASENAME = isEditor ? '' : current.prefix

let strings = {}
let images = {}

export function t(s) {
  if (typeof s !== 'string' || !s) return s
  return strings[s] ?? strings[s.trim()] ?? s
}

// Localized replacement for an image basePath (no extension), if one was set.
export function localizedImage(basePath) {
  return (basePath && images[basePath]) || basePath
}

// Translates visible-text fields (see ./rules.js) in place — so modules that
// already hold a reference to a JSON object see the translated values — and
// returns it.
export function translateData(node) {
  if (LANG === 'en' || node == null) return node
  return translateTree(node, v => strings[v] ?? strings[v.trim()])
}

// For content fetched at runtime (project info.json, category-info.json…).
export const fetchJson = (url, init) =>
  fetch(url, init).then(r => r.json()).then(d => translateData(d))

// Same page in another language, from a router path (which never includes
// the language prefix).
export function langHref(code, routerPath = '/') {
  const target = LANGUAGES.find(l => l.code === code) || LANGUAGES[0]
  return target.prefix + (routerPath === '/' && target.prefix ? '' : routerPath)
}

// Remembers a hand-picked language, so the first-visit auto-detection
// (edge middleware) never overrides it.
export function rememberLang(code) {
  document.cookie = `nnwoo_lang=${code}; path=/; max-age=31536000; samesite=lax`
}

// Same page in another language.
export function pathInLang(code, pathname = window.location.pathname, search = window.location.search, hash = window.location.hash) {
  const rest = pathname.slice(current.prefix.length) || '/'
  const target = LANGUAGES.find(l => l.code === code) || LANGUAGES[0]
  const path = target.prefix + (rest === '/' && target.prefix ? '' : rest)
  return (path || '/') + search + hash
}

const FONTS = {
  ko: 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css',
  zh: 'https://cdn.jsdelivr.net/npm/@fontsource-variable/noto-sans-sc@5/index.css',
  ja: 'https://cdn.jsdelivr.net/npm/@fontsource-variable/noto-sans-jp@5/index.css',
}

function addHead(tag, attrs) {
  const el = document.createElement(tag)
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v))
  document.head.appendChild(el)
}

// Loads the dictionary and translates the bundled JSON data before the app
// renders. Must run before App (and the pages it lazy-loads) is imported.
export async function initI18n(bundledData = []) {
  const lang = LANGUAGES.find(l => l.code === LANG)
  document.documentElement.lang = lang.htmlLang

  if (!isEditor) {
    // Alternate-language links for search engines.
    LANGUAGES.forEach(l => addHead('link', { rel: 'alternate', hreflang: l.htmlLang, href: window.location.origin + pathInLang(l.code, window.location.pathname, '', '') }))
    addHead('link', { rel: 'alternate', hreflang: 'x-default', href: window.location.origin + pathInLang('en', window.location.pathname, '', '') })
  }

  if (LANG === 'en') return
  if (FONTS[LANG]) addHead('link', { rel: 'stylesheet', href: FONTS[LANG] })
  try {
    const dict = (await loadDictionary(LANG)) || {}
    strings = dict.strings || {}
    images = dict.images || {}
  } catch (e) {
    console.error('Failed to load dictionary', e)
  }
  bundledData.forEach(d => translateData(d))
  document.title = t(document.title)
}
