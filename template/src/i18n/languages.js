// Every language a site can turn on. English is the source and always on;
// the others are listed in siteConfig.languages (Profolio: Site Structure ▸
// Languages) and each keeps its translations in src/i18n/<code>.json.
// Shared by the site, the editor and the editor server.

export const ALL_LANGUAGES = [
  { code: 'en', prefix: '',    htmlLang: 'en',      label: 'English',  name: 'English' },
  { code: 'ko', prefix: '/ko', htmlLang: 'ko',      label: '한국어',    name: 'Korean' },
  { code: 'zh', prefix: '/zh', htmlLang: 'zh-Hans', label: '简体中文',  name: 'Chinese (Simplified)' },
  { code: 'ja', prefix: '/ja', htmlLang: 'ja',      label: '日本語',    name: 'Japanese' },
  { code: 'es', prefix: '/es', htmlLang: 'es',      label: 'Español',  name: 'Spanish' },
  { code: 'fr', prefix: '/fr', htmlLang: 'fr',      label: 'Français', name: 'French' },
  { code: 'de', prefix: '/de', htmlLang: 'de',      label: 'Deutsch',  name: 'German' },
]

/** Codes of the languages other than English (also reserved as page paths). */
export const OTHER_LANGUAGE_CODES = ALL_LANGUAGES.filter(l => l.code !== 'en').map(l => l.code)

/** The site's languages, English first; a site without the setting is English-only. */
export function enabledLanguages(siteConfig) {
  const on = new Set(['en', ...(Array.isArray(siteConfig?.languages) ? siteConfig.languages : [])])
  return ALL_LANGUAGES.filter(l => on.has(l.code))
}
