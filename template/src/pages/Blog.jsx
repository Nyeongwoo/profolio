import { useParams, Link, useNavigate } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
import blogs from '../data/blog.json'
import siteConfig from '../data/siteConfig.json'
import { ImageWithFallback } from '../utils/getImage'
import { useIsMobile, useScrollHidden } from '../utils/useIsMobile'
import BlogSections from './BlogSections'
import { translateData, t } from '../i18n'
import { useProfolioDoc } from '../utils/pofoleLive'
import { sectionName } from '../utils/structure'

const rawCats = siteConfig.blogCategories || []
const categories = rawCats.length > 0
  ? ['all', ...rawCats.map(c => c.id)]
  : ['all', 'research', 'report', 'essay', 'others']

const categoryLabels = rawCats.length > 0
  ? Object.fromEntries(rawCats.map(c => [c.id, c.label]))
  : { research: 'Research', report: 'Report', essay: 'Essay', others: 'Others' }

function MobileFilterBar({ current }) {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const ref = useRef(null)

  const currentLabel = t(current === 'all' ? 'All' : categoryLabels[current] || current)

  useEffect(() => {
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const handleSelect = (cat) => {
    setOpen(false)
    navigate(cat === 'all' ? '/blog' : `/blog/${cat}`)
  }

  return (
    <div className="mobile-filter-bar" ref={ref}>
      <button className="mobile-filter-trigger" onClick={() => setOpen(o => !o)}>
        <span className="mobile-filter-label">
          <span className="mobile-filter-parent">{sectionName('blog')}</span>
          <span className="mobile-filter-sep">›</span>
          <span className="mobile-filter-current">{currentLabel}</span>
        </span>
        <span className={`mobile-filter-chevron${open ? ' open' : ''}`}>›</span>
      </button>
      {open && (
        <ul className="mobile-filter-list">
          {categories.map(cat => {
            const label = t(cat === 'all' ? 'All' : categoryLabels[cat] || cat)
            return (
              <li key={cat}>
                <button
                  className={`mobile-filter-option${current === cat ? ' active' : ''}`}
                  onClick={() => handleSelect(cat)}
                >
                  {label}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export default function Blog() {
  const { category } = useParams()
  const isMobile = useIsMobile()
  const filterHidden = useScrollHidden()
  const current = category || 'all'
  const filtered = current === 'all' ? blogs : blogs.filter(b => b.category === current)

  const [landingSections, setLandingSections] = useState(null)
  useEffect(() => {
    if (!category) {
      fetch('/assets/blog/landing-info.json')
        .then(r => { if (!r.ok) throw new Error(); return r.json() })
        .then(d => setLandingSections(translateData(d).sections || []))
        .catch(() => setLandingSections([]))
    } else {
      setLandingSections(null)
    }
  }, [category])
  useProfolioDoc(!category && '/assets/blog/landing-info.json', d => setLandingSections(translateData(d).sections || []))

  return (
    <div className="blog">
      <div className={`filter-bar-fixed filter-bar-desktop${filterHidden ? ' filter-bar-hidden' : ''}`}>
        {categories.map(cat => (
          <Link key={cat} to={cat === 'all' ? '/blog' : `/blog/${cat}`} className={current === cat ? 'filter-item active' : 'filter-item'}>
            {t(cat === 'all' ? 'All' : categoryLabels[cat] || cat.charAt(0).toUpperCase() + cat.slice(1))}
          </Link>
        ))}
      </div>
      <div className={`filter-bar-fixed filter-bar-mobile${filterHidden ? ' filter-bar-hidden' : ''}`}>
        <MobileFilterBar current={current} />
      </div>

      <div className="page-hero"><ImageWithFallback basePath="/assets/blog/hero" alt="blog hero" style={{width:'100%', height:'400px', objectFit:'cover'}} /></div>

      {landingSections && landingSections.length > 0 && (
        <BlogSections sections={landingSections} basePath="/assets/blog/landing" />
      )}

      <section className="blog-list" style={{
        ...(siteConfig.blogTitleSize ? { '--blog-title-size': siteConfig.blogTitleSize } : {}),
        ...(siteConfig.blogTitleSizeMobile ? { '--blog-title-size-mobile': siteConfig.blogTitleSizeMobile } : {}),
        ...(siteConfig.blogTitleBold ? { '--blog-title-weight': '700' } : {}),
        ...(siteConfig.blogTitleTopGap ? { '--blog-title-top-gap': `${siteConfig.blogTitleTopGap}px` } : {}),
        ...(siteConfig.blogTitleTopGapMobile ? { '--blog-title-top-gap-mobile': `${siteConfig.blogTitleTopGapMobile}px` } : {}),
        ...(siteConfig.blogTitleGap ? { '--blog-title-gap': `${siteConfig.blogTitleGap}px` } : {}),
        ...(siteConfig.blogTitleGapMobile ? { '--blog-title-gap-mobile': `${siteConfig.blogTitleGapMobile}px` } : {}),
      }}>
        <h2>{t('All')}</h2>
        {filtered.map(post => (
          <Link key={post.id} to={`/blog/post/${post.id}`} className="blog-post-card">
            <ImageWithFallback basePath={post.thumbnail ? post.thumbnail.replace(/\.(webp|png|jpg|jpeg|gif)$/i, '') : `/assets/blog/${post.id}/thumbnail`} mobileBasePath={post.thumbnailMobileImage} tabletBasePath={post.thumbnailTabletImage} nativeSize={post.thumbnailNativeSize} hideOnMobile={post.thumbnailHideOnMobile} alt={post.title} style={{width:'240px', aspectRatio: isMobile ? (post.thumbnailMobileRatio||'3/2') : (post.thumbnailDesktopRatio||'3/2'), height:'auto', objectFit:'cover', borderRadius:'8px', flexShrink:0}} />
            <div className="blog-post-info">
              <h3>{post.title}</h3>
              <p className="blog-post-date">{post.date}</p>
              <p className="blog-post-preview">{post.preview}</p>
            </div>
            <span className="blog-post-tag">{t('tag')}: {t(categoryLabels[post.category] || post.category)}</span>
          </Link>
        ))}
      </section>

      <div className="blog-pagination">
        <button>{'<'}</button>
        <span>1</span>
        <button>{'>'}</button>
      </div>
    </div>
  )
}
