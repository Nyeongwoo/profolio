import { useParams, Link } from 'react-router-dom'
import { useState, useEffect } from 'react'
import blogs from '../data/blog.json'
import { ImageWithFallback } from '../utils/getImage'
import BlogSections from './BlogSections'
import { getMaintenanceGate } from '../components/SiteMaintenance'
import { translateData, t } from '../i18n'
import { useProfolioDoc } from '../utils/pofoleLive'

export default function BlogPost() {
  const { id } = useParams()
  const post = blogs.find(b => b.id === id)
  const [sections, setSections] = useState(null)

  useEffect(() => {
    fetch(`/assets/blog/${id}/info.json`)
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then(d => setSections(translateData(d).sections || []))
      .catch(() => setSections([]))
  }, [id])
  useProfolioDoc(`/assets/blog/${id}/info.json`, d => setSections(translateData(d).sections || []))

  if (!post) return <div>{t('Post not found')}</div>

  const maintenanceGate = getMaintenanceGate(post.maintenance)
  if (maintenanceGate) return maintenanceGate

  return (
    <div className="blog-post">
      <ImageWithFallback basePath={`/assets/blog/${id}/hero`} alt={post.title} style={{width:'100%', height:'400px', objectFit:'cover'}} />

      <article className="blog-post-content">
        <div className="blog-post-header">
          <span className="blog-post-tag">tag: {post.category}</span>
          <h1>{post.title}</h1>
          <p className="blog-post-date">{post.date}</p>
        </div>
        {post.preview && (
          <div className="blog-post-body">
            <p>{post.preview}</p>
          </div>
        )}
      </article>

      {sections && sections.length > 0 && (
        <BlogSections sections={sections} basePath={`/assets/blog/${id}`} />
      )}

      {(!sections || sections.length === 0) && post.content && (
        <article className="blog-post-content">
          <div className="blog-post-body">{post.content}</div>
        </article>
      )}

      <div className="blog-post-nav">
        <Link to="/blog">← Back to Blog</Link>
      </div>
    </div>
  )
}
