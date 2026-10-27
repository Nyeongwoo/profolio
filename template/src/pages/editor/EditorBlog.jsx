import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { API, EditorTopbar, EditorSectionNav, Card, Field, Row } from './EditorComponents'

const BADGE_COLORS = [
  { color: '#e8f0fe', text: '#1a73e8' },
  { color: '#e6f4ea', text: '#1e8e3e' },
  { color: '#fce8b2', text: '#f29900' },
  { color: '#fce8e6', text: '#d93025' },
  { color: '#f3e8fd', text: '#9334e6' },
  { color: '#e0f7fa', text: '#00838f' },
  { color: '#fff3e0', text: '#e65100' },
  { color: '#f0f0f0', text: '#555'    },
]

const getBadge = (catId, cats) => {
  const idx = cats.findIndex(c => c.id === catId)
  return BADGE_COLORS[(idx >= 0 ? idx : BADGE_COLORS.length - 1) % BADGE_COLORS.length]
}

export default function EditorBlog() {
  const navigate = useNavigate()
  const [posts, setPosts] = useState([])
  const [siteConfig, setSiteConfig] = useState(null)
  const [saved, setSaved] = useState(false)
  const [initialCatIds, setInitialCatIds] = useState(null)

  useEffect(() => {
    fetch(`${API}/page/blog`).then(r => r.json()).then(setPosts)
    fetch(`${API}/page/siteConfig`).then(r => r.json()).then(cfg => {
      setSiteConfig(cfg)
      setInitialCatIds((cfg.blogCategories || []).map(c => c.id))
    })
  }, [])

  const save = async () => {
    const currentIds = (siteConfig?.blogCategories || []).map(c => c.id)
    let updatedPosts = posts

    if (initialCatIds) {
      const removed = initialCatIds.filter(id => !currentIds.includes(id))
      const added = currentIds.filter(id => !initialCatIds.includes(id))
      if (removed.length === 1 && added.length === 1) {
        const from = removed[0], to = added[0]
        updatedPosts = posts.map(p => p.category === from ? { ...p, category: to } : p)
        setPosts(updatedPosts)
      }
    }

    await Promise.all([
      fetch(`${API}/page/blog`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updatedPosts) }),
      fetch(`${API}/page/siteConfig`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(siteConfig) }),
    ])
    setInitialCatIds(currentIds)
    setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  const s = { border: '1px solid var(--ed-input-border)', borderRadius: '8px', padding: '6px 10px', fontSize: '12px', fontFamily: 'inherit', color: 'var(--ed-text)', background: 'var(--ed-input-bg)', outline: 'none', flex: 1, minWidth: 0, boxSizing: 'border-box' }
  const btnSm = { border: '1px solid var(--ed-input-border)', borderRadius: '5px', padding: '3px 8px', cursor: 'pointer', fontSize: '11px', fontFamily: 'inherit', background: 'var(--ed-input-bg)', color: 'var(--ed-text-sub)' }

  const categories = siteConfig?.blogCategories || []
  const setCfg = (key, val) => setSiteConfig(cfg => ({ ...cfg, [key]: val || undefined }))

  // ── Post helpers ──
  const update = (i, key, val) => setPosts(p => p.map((post, idx) => idx === i ? { ...post, [key]: val } : post))
  const movePost = (i, dir) => setPosts(p => {
    const arr = [...p]; const t = i + dir
    if (t < 0 || t >= arr.length) return p
    ;[arr[i], arr[t]] = [arr[t], arr[i]]; return arr
  })
  const removePost = (i) => {
    if (!confirm(`Remove "${posts[i]?.title || posts[i]?.id}" from the list?\n(Content files remain.)`)) return
    setPosts(p => p.filter((_, idx) => idx !== i))
  }

  // ── Category helpers ──
  const updateCat = (i, key, val) => setSiteConfig(cfg => {
    const cats = [...(cfg.blogCategories || [])]
    cats[i] = { ...cats[i], [key]: val }
    return { ...cfg, blogCategories: cats }
  })
  const moveCat = (i, dir) => setSiteConfig(cfg => {
    const cats = [...(cfg.blogCategories || [])]; const t = i + dir
    if (t < 0 || t >= cats.length) return cfg
    ;[cats[i], cats[t]] = [cats[t], cats[i]]
    return { ...cfg, blogCategories: cats }
  })
  const removeCat = (i) => setSiteConfig(cfg => ({
    ...cfg,
    blogCategories: (cfg.blogCategories || []).filter((_, idx) => idx !== i)
  }))
  const addCat = () => setSiteConfig(cfg => ({
    ...cfg,
    blogCategories: [...(cfg.blogCategories || []), { id: '', label: '' }]
  }))

  if (!siteConfig) return <div style={{ padding: '40px', color: 'var(--ed-text-xmuted)' }}>Loading...</div>

  return (
    <div className="ed-page">
      <EditorTopbar title="All Blog" onSave={save} saved={saved} />
      <EditorSectionNav sections={[
        { id: 'ed-blog-layout', label: 'Title Layout' },
        { id: 'ed-blog-categories', label: 'Categories' },
        { id: 'ed-blog-posts', label: 'Posts' },
      ]} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--ed-head-bg)', border: '1px solid var(--ed-card-border)', borderRadius: '10px', padding: '14px 20px' }}>
        <div>
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ed-text)' }}>Blog Landing Page</div>
          <div style={{ fontSize: '12px', color: 'var(--ed-text-muted)', marginTop: '2px' }}>Sections shown below the hero on the /blog main page</div>
        </div>
        <Link to="/editor/blog-landing" style={{ padding: '7px 16px', background: '#111', color: '#fff', borderRadius: '8px', fontSize: '12px', fontWeight: 600, textDecoration: 'none' }}>
          Edit →
        </Link>
      </div>

      {/* ── Title Layout ── */}
      <Card id="ed-blog-layout" title="Title Layout" collapsible defaultOpen>
        <div style={{ fontSize: '12px', color: 'var(--ed-text-muted)', marginBottom: '4px' }}>
          Controls the "All" heading above the post list — same settings as All Projects / All Originals.
        </div>
        <Row>
          <Field label="Title Size — desktop (px)">
            <input style={s} type="number" min="0" placeholder="Default (24)" value={siteConfig?.blogTitleSize ? parseInt(siteConfig.blogTitleSize) : ''} onChange={e => setCfg('blogTitleSize', e.target.value ? `${e.target.value}px` : undefined)} />
          </Field>
          <Field label="Title Size — mobile (px)">
            <input style={s} type="number" min="0" placeholder="Same as desktop" value={siteConfig?.blogTitleSizeMobile ? parseInt(siteConfig.blogTitleSizeMobile) : ''} onChange={e => setCfg('blogTitleSizeMobile', e.target.value ? `${e.target.value}px` : undefined)} />
          </Field>
        </Row>
        <Field label="Weight">
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: 'var(--ed-text)' }}>
            <input type="checkbox" checked={!!siteConfig?.blogTitleBold} onChange={e => setCfg('blogTitleBold', e.target.checked || undefined)} />
            Bold title
          </label>
        </Field>
        <Row>
          <Field label="Gap Above — desktop (px, space between navbar/hero and title)">
            <input style={s} type="number" min="0" placeholder="Default (40)" value={siteConfig?.blogTitleTopGap ?? ''} onChange={e => setCfg('blogTitleTopGap', e.target.value)} />
          </Field>
          <Field label="Gap Above — mobile (px)">
            <input style={s} type="number" min="0" placeholder="Same as desktop" value={siteConfig?.blogTitleTopGapMobile ?? ''} onChange={e => setCfg('blogTitleTopGapMobile', e.target.value)} />
          </Field>
        </Row>
        <Row>
          <Field label="Gap Below — desktop (px, title to first post)">
            <input style={s} type="number" min="0" placeholder="Default (32)" value={siteConfig?.blogTitleGap ?? ''} onChange={e => setCfg('blogTitleGap', e.target.value)} />
          </Field>
          <Field label="Gap Below — mobile (px)">
            <input style={s} type="number" min="0" placeholder="Same as desktop" value={siteConfig?.blogTitleGapMobile ?? ''} onChange={e => setCfg('blogTitleGapMobile', e.target.value)} />
          </Field>
        </Row>
      </Card>

      {/* ── Categories ── */}
      <Card id="ed-blog-categories" title="Categories" collapsible defaultOpen>
        <div style={{ fontSize: '12px', color: 'var(--ed-text-muted)', marginBottom: '4px' }}>
          Order, rename, or add categories. The ID is used internally (slug, no spaces). Changes apply to the filter bar and new post dropdown.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {categories.map((cat, i) => {
            const badge = BADGE_COLORS[i % BADGE_COLORS.length]
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: badge.text, flexShrink: 0 }} />
                <input style={{ ...s, flex: '0 0 130px' }} placeholder="ID (e.g. news)" value={cat.id} onChange={e => updateCat(i, 'id', e.target.value)} />
                <input style={s} placeholder="Label (e.g. News)" value={cat.label} onChange={e => updateCat(i, 'label', e.target.value)} />
                <button onClick={() => moveCat(i, -1)} style={btnSm}>↑</button>
                <button onClick={() => moveCat(i, 1)}  style={btnSm}>↓</button>
                <button onClick={() => removeCat(i)} style={{ ...btnSm, color: '#e53e3e', borderColor: '#ffccc7' }}>Delete</button>
              </div>
            )
          })}
        </div>
        <button onClick={addCat} style={{ marginTop: '4px', background: 'none', border: '1px dashed var(--ed-input-border)', borderRadius: '8px', padding: '7px 16px', fontSize: '12px', color: 'var(--ed-text-muted)', cursor: 'pointer', fontFamily: 'inherit' }}>
          + Add Category
        </button>
      </Card>

      {/* ── Posts ── */}
      <Card id="ed-blog-posts" title="Post List — Order · Metadata" collapsible defaultOpen>
        <div style={{ fontSize: '11px', color: 'var(--ed-text-muted)', marginBottom: '8px' }}>
          Edit title/date/category then Save. Edit content (sections) by clicking a post → editor.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {posts.map((post, i) => {
            const badge = getBadge(post.category, categories)
            return (
              <div key={post.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', background: 'var(--ed-card-bg)', border: '1px solid var(--ed-divider)', borderRadius: '8px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', flexShrink: 0 }}>
                  <button onClick={() => movePost(i, -1)} style={{ background: 'var(--ed-input-bg)', border: 'none', borderRadius: '4px', padding: '2px 6px', cursor: 'pointer', fontSize: '11px', lineHeight: 1, color: 'var(--ed-text-sub)' }}>↑</button>
                  <button onClick={() => movePost(i, 1)}  style={{ background: 'var(--ed-input-bg)', border: 'none', borderRadius: '4px', padding: '2px 6px', cursor: 'pointer', fontSize: '11px', lineHeight: 1, color: 'var(--ed-text-sub)' }}>↓</button>
                </div>
                <span style={{ fontSize: '9px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: badge.color, color: badge.text, flexShrink: 0, textTransform: 'uppercase' }}>
                  {post.category}
                </span>
                <input style={s} value={post.title || ''} onChange={e => update(i, 'title', e.target.value)} placeholder="Title" />
                <input style={{ ...s, flex: '0 0 110px' }} value={post.date || ''} onChange={e => update(i, 'date', e.target.value)} placeholder="2026/06/16" />
                <select style={{ ...s, flex: '0 0 110px' }} value={post.category || ''} onChange={e => update(i, 'category', e.target.value)}>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
                <button onClick={() => navigate(`/editor/blog-post/${post.id}`)}
                  style={{ flexShrink: 0, padding: '5px 12px', border: 'none', borderRadius: '6px', background: '#111', color: '#fff', fontSize: '11px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>
                  Edit →
                </button>
                <button onClick={() => removePost(i)} style={{ background: 'none', border: 'none', color: 'var(--ed-text-xmuted)', cursor: 'pointer', fontSize: '14px', padding: '2px 4px', flexShrink: 0 }}>✕</button>
              </div>
            )
          })}
          {posts.length === 0 && (
            <div style={{ color: 'var(--ed-text-xmuted)', fontSize: '13px', padding: '20px 0', textAlign: 'center' }}>No posts. Use the + button in the Blog tab to add one.</div>
          )}
        </div>
      </Card>
    </div>
  )
}
