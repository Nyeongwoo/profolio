import { useEffect, useState } from 'react'
import CategorySections from './CategorySections'
import { translateData } from '../i18n'
import { useProfolioDoc } from '../utils/pofoleLive'
import { sanitizeInline } from '../utils/sanitizeInline'

// One of the site's own pages (src/utils/pages.js): an optional title and
// description, then its sections — the same ones category pages use.
export default function CustomPage({ page }) {
  const infoPath = `/assets/pages/${page.id}/info.json`
  const [info, setInfo] = useState(null)

  useEffect(() => {
    fetch(infoPath, { cache: 'no-cache' })
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then(d => setInfo(translateData(d)))
      .catch(() => setInfo({ sections: [] }))
  }, [infoPath])
  useProfolioDoc(infoPath, d => setInfo(translateData(d)))

  if (!info) return null
  const title = info.title ?? page.title
  return (
    <div className="custom-page">
      {(title || info.description) && info.showHeader !== false && (
        <div className="projects-category-hero projects-category-hero--no-icons custom-page-header">
          {title && <h2 dangerouslySetInnerHTML={{ __html: sanitizeInline(title) }} />}
          {info.description && <p className="all-page-desc" dangerouslySetInnerHTML={{ __html: sanitizeInline(info.description) }} />}
        </div>
      )}
      {(info.sections || []).length > 0 && (
        <div className="cat-sections"><CategorySections sections={info.sections} basePath={`/assets/pages/${page.id}/sections`} /></div>
      )}
    </div>
  )
}
