import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useLocation } from 'react-router-dom'
import { API, EditorTopbar, EditorSectionNav, Card, TextField, Field, Row, Block, ImagePicker, PositionPicker, RatioRow, TextStyleRow, BgColorField, TextLinesEditor, autoConvertToLines, LinkPicker, SectionDots, MaxWidthInput, remapCollapsedOnReorder } from './EditorComponents'
import { useProfolioSectionSelect } from './pofole'

const TYPE_BADGE = {
  'images':              { label: 'FULL', color: '#ffebee', text: '#e53935' },
  'image-text':          { label: 'MID',  color: '#fff3e0', text: '#f57c00' },
  'image-text-carousel': { label: 'CAR',  color: '#fffde7', text: '#f9a825' },
  'text':                { label: 'TXT',  color: '#e3f2fd', text: '#1e88e5' },
}

const TYPE_OPTS = [
  { value: 'images',              label: 'Fullscreen',    desc: 'Full width image' },
  { value: 'image-text',          label: 'Image + Text',  desc: 'Image + text block' },
  { value: 'image-text-carousel', label: 'Carousel',      desc: 'Slide cards' },
  { value: 'text',                label: 'Text only',     desc: 'Text only' },
]

const CATEGORY_LABELS = {
  product: 'Product', mobility: 'Mobility', service: 'Service',
  ip: 'IP', games: 'Games', apps: 'Apps',
}

const emptyBlock = () => ({ images: [], lines: [], link: '' })
const emptySection = () => ({ id: '', label: '', type: 'images', images: [], blocks: [emptyBlock()], link: '' })

const s = { border: '1px solid var(--ed-input-border)', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', fontFamily: 'inherit', color: 'var(--ed-text)', background: 'var(--ed-input-bg)', outline: 'none', width: '100%', boxSizing: 'border-box' }

function TypeSelector({ value, onChange }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ed-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Type</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
        {TYPE_OPTS.map(opt => {
          const badge = TYPE_BADGE[opt.value] || {}
          const active = value === opt.value
          return (
            <button
              key={opt.value}
              onClick={() => onChange(opt.value)}
              style={{
                display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'flex-start',
                padding: '8px 12px', borderRadius: '9px', cursor: 'pointer',
                border: active ? `1.5px solid ${badge.text}` : '1.5px solid var(--ed-badge-border)',
                background: active ? badge.color : 'var(--ed-input-bg)',
                color: active ? badge.text : 'var(--ed-text-muted)',
                fontFamily: 'inherit', transition: 'all 0.1s',
              }}
            >
              <span style={{ fontSize: '11px', fontWeight: 700 }}>{opt.label}</span>
              <span style={{ fontSize: '10px', opacity: 0.7 }}>{opt.desc}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function EditorCategory() {
  const { category } = useParams()
  const location = useLocation()
  const type = location.pathname.includes('/projects-cat/') ? 'projects' : 'originals'

  const [info, setInfo] = useState(null)
  const [images, setImages] = useState([])
  const [saved, setSaved] = useState(false)
  const [collapsed, setCollapsed] = useState({})
  const [dragIdx, setDragIdx] = useState(null)
  const [dropIdx, setDropIdx] = useState(null)
  const dragIdxRef = useRef(null)
  const [scrollToSection, setScrollToSection] = useState(null)

  useEffect(() => {
    if (scrollToSection == null) return
    const el = document.getElementById(`ed-section-${scrollToSection}`)
    if (el) el.scrollIntoView({ behavior: 'instant', block: 'start' })
    setScrollToSection(null)
  }, [scrollToSection, collapsed])

  const jumpToSection = (si) => {
    setCollapsed(c => (c[si] ? { ...c, [si]: false } : c))
    setScrollToSection(si)
  }
  useProfolioSectionSelect(jumpToSection)

  // Category Page Hero — this category's own title/icon size etc., stored
  // in siteConfig (shared, keyed by category slug) rather than category-info.
  // Each dimension has desktop/tablet/mobile variants; tablet/mobile fall
  // back to desktop when left blank (see resolveTier in Projects/Originals).
  const emptyTiers = () => ({ desktop: '', tablet: '', mobile: '' })
  const [heroTitleSize, setHeroTitleSize] = useState(emptyTiers())
  const [heroIconSize, setHeroIconSize] = useState(emptyTiers())
  const [heroGap, setHeroGap] = useState(emptyTiers())
  const [heroIconGap, setHeroIconGap] = useState(emptyTiers())
  const [heroTitleTopGap, setHeroTitleTopGap] = useState(emptyTiers())
  const [heroAnimDuration, setHeroAnimDuration] = useState('')
  const [heroAnimStagger, setHeroAnimStagger] = useState('')

  // "Other Projects" strip at the bottom of every detail page — a single
  // site-wide setting (not keyed per category, unlike the hero fields above),
  // also editable from the All Projects/Originals page. Exposed here too so
  // it can be tuned without leaving whichever category page you're already on.
  const [othersIconSize, setOthersIconSize] = useState(emptyTiers())

  const basePath = `/assets/${type}/${category}/category`
  const uploadUrl = `${API}/category-images/${type}/${category}/upload`

  const refreshImages = useCallback(() =>
    fetch(`${API}/category-images/${type}/${category}`)
      .then(r => r.json())
      .then(setImages),
    [type, category]
  )

  useEffect(() => {
    fetch(`${API}/category-info/${type}/${category}`)
      .then(r => r.json())
      .then(d => {
        setInfo(d)
        const c = {}
        ;(d.sections || []).forEach((_, i) => { c[i] = true })
        setCollapsed(c)
      })
    refreshImages()
    fetch(`${API}/page/siteConfig`).then(r => r.json()).then(cfg => {
      setHeroTitleSize({
        desktop: cfg.categoryHeroTitleSize?.[category] || '',
        tablet: cfg.categoryHeroTitleSizeTablet?.[category] || '',
        mobile: cfg.categoryHeroTitleSizeMobile?.[category] || '',
      })
      setHeroIconSize({
        desktop: cfg.categoryIconSize?.[category] || '',
        tablet: cfg.categoryIconSizeTablet?.[category] || '',
        mobile: cfg.categoryIconSizeMobile?.[category] || '',
      })
      setHeroGap({
        desktop: cfg.categoryHeroGap?.[category] || '',
        tablet: cfg.categoryHeroGapTablet?.[category] || '',
        mobile: cfg.categoryHeroGapMobile?.[category] || '',
      })
      setHeroIconGap({
        desktop: cfg.categoryIconGap?.[category] || '',
        tablet: cfg.categoryIconGapTablet?.[category] || '',
        mobile: cfg.categoryIconGapMobile?.[category] || '',
      })
      setHeroTitleTopGap({
        desktop: cfg.categoryTitleTopGap?.[category] || '',
        tablet: cfg.categoryTitleTopGapTablet?.[category] || '',
        mobile: cfg.categoryTitleTopGapMobile?.[category] || '',
      })
      setHeroAnimDuration(cfg.categoryAnimDuration?.[category] ?? '')
      setHeroAnimStagger(cfg.categoryAnimStagger?.[category] ?? '')
      setOthersIconSize({
        desktop: cfg.othersIconSize || '',
        tablet: cfg.othersIconSizeTablet || '',
        mobile: cfg.othersIconSizeMobile || '',
      })
    })
  }, [type, category])

  const save = async () => {
    await fetch(`${API}/category-info/${type}/${category}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(info),
    })

    const cfg = await fetch(`${API}/page/siteConfig`).then(r => r.json())
    const withCat = (obj, val) => {
      const next = { ...(obj || {}) }
      if (val) next[category] = val
      else delete next[category]
      return next
    }
    await fetch(`${API}/page/siteConfig`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...cfg,
        categoryHeroTitleSize: withCat(cfg.categoryHeroTitleSize, heroTitleSize.desktop),
        categoryHeroTitleSizeTablet: withCat(cfg.categoryHeroTitleSizeTablet, heroTitleSize.tablet),
        categoryHeroTitleSizeMobile: withCat(cfg.categoryHeroTitleSizeMobile, heroTitleSize.mobile),
        categoryIconSize: withCat(cfg.categoryIconSize, heroIconSize.desktop),
        categoryIconSizeTablet: withCat(cfg.categoryIconSizeTablet, heroIconSize.tablet),
        categoryIconSizeMobile: withCat(cfg.categoryIconSizeMobile, heroIconSize.mobile),
        categoryHeroGap: withCat(cfg.categoryHeroGap, heroGap.desktop),
        categoryHeroGapTablet: withCat(cfg.categoryHeroGapTablet, heroGap.tablet),
        categoryHeroGapMobile: withCat(cfg.categoryHeroGapMobile, heroGap.mobile),
        categoryIconGap: withCat(cfg.categoryIconGap, heroIconGap.desktop),
        categoryIconGapTablet: withCat(cfg.categoryIconGapTablet, heroIconGap.tablet),
        categoryIconGapMobile: withCat(cfg.categoryIconGapMobile, heroIconGap.mobile),
        categoryTitleTopGap: withCat(cfg.categoryTitleTopGap, heroTitleTopGap.desktop),
        categoryTitleTopGapTablet: withCat(cfg.categoryTitleTopGapTablet, heroTitleTopGap.tablet),
        categoryTitleTopGapMobile: withCat(cfg.categoryTitleTopGapMobile, heroTitleTopGap.mobile),
        categoryAnimDuration: withCat(cfg.categoryAnimDuration, heroAnimDuration),
        categoryAnimStagger: withCat(cfg.categoryAnimStagger, heroAnimStagger),
        othersIconSize: othersIconSize.desktop || undefined,
        othersIconSizeTablet: othersIconSize.tablet || undefined,
        othersIconSizeMobile: othersIconSize.mobile || undefined,
      }),
    })

    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const updateSection = (si, key, val) => setInfo(i => { const sections = [...i.sections]; sections[si] = { ...sections[si], [key]: val }; return { ...i, sections } })
  const updateOverlay = (si, key, val) => setInfo(i => { const sections = [...i.sections]; const overlay = { ...(sections[si].overlay || {}), [key]: val }; sections[si] = { ...sections[si], overlay }; return { ...i, sections } })
  const updateBlock = (si, bi, key, val) => setInfo(i => { const sections = [...i.sections]; const blocks = [...(sections[si].blocks || [])]; blocks[bi] = { ...blocks[bi], [key]: val }; sections[si] = { ...sections[si], blocks }; return { ...i, sections } })
  const addSection = () => setInfo(i => { const sections = [...(i.sections || []), emptySection()]; setCollapsed(c => ({ ...c, [sections.length - 1]: false })); return { ...i, sections } })
  const removeSection    = (si) => setInfo(i => ({ ...i, sections: i.sections.filter((_, idx) => idx !== si) }))
  const duplicateSection = (si) => setInfo(i => { const sections = [...i.sections]; const copy = JSON.parse(JSON.stringify(sections[si])); copy.id = copy.id ? copy.id + '-copy' : ''; sections.splice(si + 1, 0, copy); return { ...i, sections } })
  const moveSection = (si, dir) => setInfo(i => { const sections = [...i.sections]; const t = si + dir; if (t < 0 || t >= sections.length) return i; [sections[si], sections[t]] = [sections[t], sections[si]]; return { ...i, sections } })
  const reorderSection = (from, to) => {
    if (from == null || to == null || from === to) return
    setInfo(i => { const sections = [...i.sections]; const [moved] = sections.splice(from, 1); sections.splice(to, 0, moved); return { ...i, sections } })
    setCollapsed(c => remapCollapsedOnReorder(c, from, to, (info.sections || []).length))
  }
  const addBlock = (si) => setInfo(i => { const sections = [...i.sections]; sections[si] = { ...sections[si], blocks: [...(sections[si].blocks || []), emptyBlock()] }; return { ...i, sections } })
  const removeBlock = (si, bi) => setInfo(i => { const sections = [...i.sections]; sections[si] = { ...sections[si], blocks: sections[si].blocks.filter((_, idx) => idx !== bi) }; return { ...i, sections } })
  const moveBlock   = (si, bi, dir) => setInfo(i => { const sections = [...i.sections]; const blocks = [...(sections[si].blocks||[])]; const j = bi + dir; if (j < 0 || j >= blocks.length) return i; [blocks[bi], blocks[j]] = [blocks[j], blocks[bi]]; sections[si] = {...sections[si], blocks}; return {...i, sections} })

  const collapseAll = () => { const c = {}; (info.sections || []).forEach((_, i) => { c[i] = true }); setCollapsed(c) }
  const expandAll = () => setCollapsed({})

  if (!info) return <div style={{ padding: '40px', color: 'var(--ed-text-xmuted)' }}>Loading...</div>

  const typeLabel = type === 'projects' ? 'Projects' : 'Originals'
  const catLabel = CATEGORY_LABELS[category] || category

  return (
    <div className="ed-page">
      <EditorTopbar
        title={`${typeLabel} / ${catLabel} — Category Page`}
        onSave={save}
        saved={saved}
        extra={
          <div style={{ display: 'flex', gap: '6px' }}>
            <button onClick={collapseAll} style={{ background: 'var(--ed-input-bg)', border: 'none', borderRadius: '6px', padding: '6px 12px', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--ed-text-sub)' }}>Collapse All</button>
            <button onClick={expandAll} style={{ background: 'var(--ed-input-bg)', border: 'none', borderRadius: '6px', padding: '6px 12px', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--ed-text-sub)' }}>Expand All</button>
          </div>
        }
      />
      <EditorSectionNav sections={[
        { id: 'ed-cat-hero', label: 'Hero' },
        { id: 'ed-cat-sections', label: 'Sections' },
      ]} />

      <div style={{ background: '#f0f7ff', border: '1px solid #d0e8ff', borderRadius: '10px', padding: '12px 16px', fontSize: '12px', color: '#444', lineHeight: 1.7 }}>
        Images: <code style={{ background: '#e8f4ff', padding: '2px 6px', borderRadius: '4px', fontSize: '11px' }}>/assets/{type}/{category}/category/</code>
        &nbsp;· Link example: <code style={{ background: '#e8f4ff', padding: '2px 6px', borderRadius: '4px', fontSize: '11px' }}>/{type === 'projects' ? 'projects' : 'originals'}/{category}/nargo</code>
        &nbsp;· Without a link, clicking does nothing.
      </div>

      <Card id="ed-cat-hero" title="Category Page Hero" collapsible defaultOpen>
        <div style={{ fontSize: '12px', color: 'var(--ed-text-muted)', marginBottom: '14px' }}>
          The title + icon carousel at the top of this category's page. Tablet/Mobile fall back to Desktop when left blank.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '140px repeat(3, 1fr)', gap: '8px', fontSize: '10px', fontWeight: 600, color: 'var(--ed-text-xmuted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            <span></span>
            <span>🖥 Desktop</span>
            <span>💻 Tablet</span>
            <span>📱 Mobile</span>
          </div>
          {[
            { label: 'Title Top Gap', state: heroTitleTopGap, setState: setHeroTitleTopGap, ph: '100px' },
            { label: 'Title Size', state: heroTitleSize, setState: setHeroTitleSize, ph: '56px' },
            { label: 'Icon Size', state: heroIconSize, setState: setHeroIconSize, ph: '72px' },
            { label: 'Title–Icon Gap', state: heroGap, setState: setHeroGap, ph: '64px' },
            { label: 'Icon–Icon Gap', state: heroIconGap, setState: setHeroIconGap, ph: '60px' },
          ].map(({ label, state, setState, ph }) => (
            <div key={label} style={{ display: 'grid', gridTemplateColumns: '140px repeat(3, 1fr)', gap: '8px', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ed-text-muted)' }}>{label}</span>
              <input style={s} value={state.desktop} onChange={e => setState(v => ({ ...v, desktop: e.target.value }))} placeholder={`Default (${ph})`} />
              <input style={s} value={state.tablet} onChange={e => setState(v => ({ ...v, tablet: e.target.value }))} placeholder="Same as Desktop" />
              <input style={s} value={state.mobile} onChange={e => setState(v => ({ ...v, mobile: e.target.value }))} placeholder="Same as Desktop" />
            </div>
          ))}
        </div>
        <div style={{ fontSize: '11px', color: 'var(--ed-text-muted)', margin: '16px 0 8px' }}>
          Reveal animation — how the icons fade in, and how long before they're clickable. Lower = faster.
        </div>
        <Row>
          <Field label="Fade Duration (sec)"><input style={s} type="number" step="0.05" min="0" value={heroAnimDuration} onChange={e => setHeroAnimDuration(e.target.value)} placeholder="Default (0.5)" /></Field>
          <Field label="Stagger Per Icon (sec)"><input style={s} type="number" step="0.01" min="0" value={heroAnimStagger} onChange={e => setHeroAnimStagger(e.target.value)} placeholder="Default (0.08)" /></Field>
        </Row>

        <div style={{ fontSize: '11px', color: 'var(--ed-text-muted)', margin: '20px 0 8px' }}>
          "Other Projects" icon size — the strip at the bottom of every detail page. This is a site-wide setting (also editable from the All Projects/Originals page), not specific to this category.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '140px repeat(3, 1fr)', gap: '8px', alignItems: 'center' }}>
          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ed-text-muted)' }}>Icon Size</span>
          <input style={s} value={othersIconSize.desktop} onChange={e => setOthersIconSize(v => ({ ...v, desktop: e.target.value }))} placeholder="Default (200px)" />
          <input style={s} value={othersIconSize.tablet} onChange={e => setOthersIconSize(v => ({ ...v, tablet: e.target.value }))} placeholder="Same as Desktop" />
          <input style={s} value={othersIconSize.mobile} onChange={e => setOthersIconSize(v => ({ ...v, mobile: e.target.value }))} placeholder="120px" />
        </div>
      </Card>

      <div id="ed-cat-sections" style={{ scrollMarginTop: '76px' }} />
      <div style={{ display:'flex', gap:'14px', alignItems:'flex-start' }}>
        {(info.sections || []).length > 0 && (
          <nav
            className="detail-toc toc-visible ed-section-toc"
            style={{ position:'sticky', top:'88px', left:'auto', transform:'none', flexShrink:0, maxHeight:'calc(100vh - 140px)', overflowY:'auto', overscrollBehavior:'contain', scrollbarWidth:'none' }}
          >
            {(info.sections || []).map((section, si) => (
              <a
                key={si}
                href={`#ed-section-${si}`}
                className="detail-toc-item"
                onClick={e => { e.preventDefault(); jumpToSection(si) }}
                title={`${String(si+1).padStart(2,'0')} — ${section.label || section.id || section.type}`}
              >
                <span className="toc-dot" />
                <span className="toc-label-group">
                  <span className="toc-label">{String(si+1).padStart(2,'0')} — {section.label || section.type}</span>
                  {section.id && <span className="toc-id">{section.id}</span>}
                </span>
              </a>
            ))}
          </nav>
        )}
        <div style={{ flex:1, minWidth:0, display:'flex', flexDirection:'column', gap:'24px' }}>
      {(info.sections || []).map((section, si) => {
        const isCollapsed = !!collapsed[si]
        return (
          <div
            key={si}
            id={`ed-section-${si}`}
            onDragOver={e => { if (dragIdx !== null) { e.preventDefault(); if (dropIdx !== si) setDropIdx(si) } }}
            onDrop={e => { e.preventDefault(); reorderSection(dragIdxRef.current, si); dragIdxRef.current = null; setDragIdx(null); setDropIdx(null) }}
            style={{ border: '1px solid var(--ed-card-border)', borderRadius: '12px', background: 'var(--ed-card-bg)', flexShrink: 0, opacity: dragIdx === si ? 0.4 : section.hidden ? 0.5 : 1, boxShadow: (dropIdx === si && dragIdx !== null && dragIdx !== si) ? '0 0 0 2px #0087ED' : undefined, transition: 'box-shadow 0.12s ease, opacity 0.12s ease', scrollMarginTop:'88px' }}>
            {/* Header */}
            <div
              className="ed-section-hd" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', background: 'var(--ed-head-bg)', borderRadius: isCollapsed ? '12px' : '12px 12px 0 0', userSelect: 'none' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0, overflow: 'hidden' }}>
                <span draggable onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; dragIdxRef.current = si; setDragIdx(si) }} onDragEnd={() => { dragIdxRef.current = null; setDragIdx(null); setDropIdx(null) }} title="Drag to reorder" style={{ cursor: 'grab', color: 'var(--ed-text-xmuted)', fontSize: '15px', flexShrink: 0, padding: '0 2px', lineHeight: 1, userSelect: 'none' }}>⠿</span>
                <SectionDots section={section} />
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ed-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{section.label || section.id || '(No title)'}</span>
                <button
                  onClick={() => setCollapsed(c => ({ ...c, [si]: !c[si] }))}
                  style={{ background: 'none', border: 'none', borderRadius: '5px', padding: '3px 6px', cursor: 'pointer', color: 'var(--ed-text-muted)', flexShrink: 0, display: 'flex', alignItems: 'center' }}
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" style={{ display: 'block', transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}><polygon points="1,2 11,2 6,10"/></svg>
                </button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0, marginLeft: '8px' }}>
                <button onClick={() => moveSection(si, -1)} style={{ background: 'var(--ed-input-bg)', border: 'none', borderRadius: '5px', padding: '3px 8px', cursor: 'pointer', fontSize: '12px', color: 'var(--ed-text-sub)' }}>↑</button>
                <button onClick={() => moveSection(si, 1)} style={{ background: 'var(--ed-input-bg)', border: 'none', borderRadius: '5px', padding: '3px 8px', cursor: 'pointer', fontSize: '12px', color: 'var(--ed-text-sub)' }}>↓</button>
                <button onClick={() => updateSection(si, 'hidden', !section.hidden)} title={section.hidden ? 'Show section' : 'Hide section'} style={{ background: 'var(--ed-input-bg)', border: 'none', borderRadius: '5px', padding: '3px 8px', cursor: 'pointer', color: section.hidden ? 'var(--ed-accent)' : 'var(--ed-text-sub)', display: 'flex', alignItems: 'center' }}>
                  {section.hidden ? (
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M1 8s3-5 7-5 7 5 7 5-3 5-7 5-7-5-7-5z"/><circle cx="8" cy="8" r="2.5"/><line x1="2" y1="2" x2="14" y2="14"/></svg>
                  ) : (
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M1 8s3-5 7-5 7 5 7 5-3 5-7 5-7-5-7-5z"/><circle cx="8" cy="8" r="2.5"/></svg>
                  )}
                </button>
                <button onClick={() => duplicateSection(si)} style={{ background: 'var(--ed-input-bg)', border: 'none', color: 'var(--ed-text-sub)', cursor: 'pointer', fontSize: '11px', padding: '3px 8px', borderRadius: '5px', fontFamily: 'inherit', fontWeight: 500 }}>Copy</button>
                <button onClick={() => removeSection(si)} style={{ background: 'none', border: '1px solid #ffccc7', color: '#e53e3e', cursor: 'pointer', fontSize: '11px', padding: '3px 8px', borderRadius: '5px', fontFamily: 'inherit', fontWeight: 500 }}>Delete</button>
              </div>
            </div>

            {!isCollapsed && (
              <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '20px', borderTop: '1px solid var(--ed-divider)' }}>
                <Row>
                  <Field label="ID"><input style={s} value={section.id} onChange={e => updateSection(si, 'id', e.target.value)} /></Field>
                  <Field label="Label"><input style={s} value={section.label} onChange={e => updateSection(si, 'label', e.target.value)} /></Field>
                </Row>

                <TypeSelector value={section.type} onChange={v => updateSection(si, 'type', v)} />

                <BgColorField value={section.bgColor || ''} onChange={v => updateSection(si, 'bgColor', v)} />

                <Row>
                  <Field label="Padding Top">
                    <input style={s} placeholder="default (80px)" value={section.paddingTop ?? ''} onChange={e => updateSection(si, 'paddingTop', e.target.value)} onBlur={e => { if (!e.target.value) updateSection(si, 'paddingTop', '80px') }} />
                  </Field>
                  <Field label="Padding Bottom">
                    <input style={s} placeholder="default (80px)" value={section.paddingBottom ?? ''} onChange={e => updateSection(si, 'paddingBottom', e.target.value)} onBlur={e => { if (!e.target.value) updateSection(si, 'paddingBottom', '80px') }} />
                  </Field>
                </Row>

                <LinkPicker label="Link — navigate on click (optional)" value={section.link || ''} onChange={v => updateSection(si, 'link', v)} />

                {/* ── Full-screen image ── */}
                {section.type === 'images' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <RatioRow
                      desktopRatio={section.desktopRatio || '16/9'}
                      mobileRatio={section.mobileRatio || '16/9'}
                      onDesktopRatio={v => updateSection(si, 'desktopRatio', v)}
                      onMobileRatio={v => updateSection(si, 'mobileRatio', v)}
                    />
                    <ImagePicker
                      label="Images"
                      value={section.images || []}
                      onChange={v => updateSection(si, 'images', v)}
                      images={images}
                      basePath={basePath}
                      uploadUrl={uploadUrl}
                      onRefresh={refreshImages}
                      ratio={section.desktopRatio}
                      cropData={section.cropData||{}}
                      onCropChange={(num, crop) => updateSection(si,'cropData', crop ? {...(section.cropData||{}), [num]: crop} : Object.fromEntries(Object.entries(section.cropData||{}).filter(([k]) => String(k) !== String(num))))}
                      onRatioChange={v => updateSection(si,'desktopRatio', v)}
                    />
                    <div style={{ paddingTop: '12px', borderTop: '1px dashed var(--ed-divider)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ed-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Overlay Text (optional)</div>
                      <PositionPicker value={(section.overlay || {}).position} onChange={v => updateOverlay(si, 'position', v)} label="Position" />
                      <Field label="Max Width"><MaxWidthInput placeholder="Default (320px)" value={(section.overlay||{}).textMaxWidth} onChange={v => updateOverlay(si,'textMaxWidth',v)} /></Field>
                      <TextField label="Title" value={(section.overlay || {}).title || ''} onChange={v => updateOverlay(si, 'title', v)}
                        size={(section.overlay || {}).titleSize} onSize={v => updateOverlay(si, 'titleSize', v)}
                        weight={(section.overlay || {}).titleWeight} onWeight={v => updateOverlay(si, 'titleWeight', v)}
                        color={(section.overlay || {}).titleColor} onColor={v => updateOverlay(si, 'titleColor', v)}
                        font={(section.overlay || {}).titleFont} onFont={v => updateOverlay(si, 'titleFont', v)}  rich />
                      <TextField label="Content" value={(section.overlay || {}).content || ''} onChange={v => updateOverlay(si, 'content', v)}
                        size={(section.overlay || {}).contentSize} onSize={v => updateOverlay(si, 'contentSize', v)}
                        weight={(section.overlay || {}).contentWeight} onWeight={v => updateOverlay(si, 'contentWeight', v)}
                        color={(section.overlay || {}).contentColor} onColor={v => updateOverlay(si, 'contentColor', v)}
                        font={(section.overlay || {}).contentFont} onFont={v => updateOverlay(si, 'contentFont', v)}
                        multiline rows={3}  rich />
                    </div>
                  </div>
                )}

                {/* ── Text ── */}
                {section.type === 'text' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <Row>
                      <Field label="Text Max Width">
                        <MaxWidthInput placeholder="Default (700)" value={section.textMaxWidth} onChange={v => updateSection(si, 'textMaxWidth', v)} />
                      </Field>
                    </Row>
                    <TextStyleRow value={section} onChange={v => setInfo(i => { const sections = [...i.sections]; sections[si] = { ...sections[si], ...v }; return { ...i, sections } })} />
                    <TextLinesEditor
                      lines={section.lines != null ? section.lines : autoConvertToLines(section)}
                      onChange={lines => updateSection(si, 'lines', lines)}
                    />
                  </div>
                )}

                {section.type === 'image-text' && (
                  <Row>
                    <Field label="Fixed Card Height (px) — empty = ratio mode">
                      <input style={s} type="number" min="0" placeholder="e.g. 480 (leave empty to disable)" value={section.cardHeight || ''} onChange={e => updateSection(si, 'cardHeight', e.target.value ? Number(e.target.value) : undefined)} />
                    </Field>
                    <Field label="Fixed Card Height — Tablet (px)">
                      <input style={s} type="number" min="0" placeholder="Same as Desktop" value={section.cardHeightTablet || ''} onChange={e => updateSection(si, 'cardHeightTablet', e.target.value ? Number(e.target.value) : undefined)} />
                    </Field>
                  </Row>
                )}

                {/* ── Carousel options ── */}
                {section.type === 'image-text-carousel' && (
                  <Row>
                    <Field label={`Card Width${section.cardHeight ? ' (height mode)' : ''}`}>
                      <select style={s} value={section.cardSize || 'medium'} disabled={!!section.cardHeight} onChange={e => updateSection(si, 'cardSize', e.target.value)}>
                        <option value="small">Small — 40%</option>
                        <option value="medium">Medium — 70%</option>
                        <option value="large">Large — 90%</option>
                      </select>
                    </Field>
                    <Field label="Card Ratio (fallback)">
                      <select style={s} value={section.cardRatio || ''} onChange={e => updateSection(si, 'cardRatio', e.target.value || undefined)}>
                        <option value="">Default (16:9)</option>
                        <option value="16/9">16:9</option>
                        <option value="1/1">1:1</option>
                        <option value="5/4">5:4</option>
                        <option value="3/2">3:2</option>
                      </select>
                    </Field>
                    <Field label="Fixed Card Height (px) — empty = width mode">
                      <input style={s} type="number" min="0" placeholder="e.g. 480" value={section.cardHeight || ''} onChange={e => updateSection(si, 'cardHeight', e.target.value ? Number(e.target.value) : undefined)} />
                    </Field>
                    <Field label="Fixed Card Height — Tablet (px)">
                      <input style={s} type="number" min="0" placeholder="Same as Desktop" value={section.cardHeightTablet || ''} onChange={e => updateSection(si, 'cardHeightTablet', e.target.value ? Number(e.target.value) : undefined)} />
                    </Field>
                    <Field label="Start Position">
                      <select style={s} value={section.carouselAlign || 'center'} onChange={e => updateSection(si, 'carouselAlign', e.target.value)}>
                        <option value="center">Center (default)</option>
                        <option value="start">Left</option>
                      </select>
                    </Field>
                  </Row>
                )}

                {/* ── Blocks (image-text / carousel) ── */}
                {(section.type === 'image-text' || section.type === 'image-text-carousel') && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {(section.blocks || []).map((block, bi) => (
                      <Block key={bi} label={`Block ${bi+1}`} onRemove={() => removeBlock(si, bi)} onMoveUp={bi > 0 ? () => moveBlock(si, bi, -1) : undefined} onMoveDown={bi < (section.blocks.length - 1) ? () => moveBlock(si, bi, 1) : undefined} collapsible hidden={block.hidden} onToggleHidden={() => updateBlock(si, bi, 'hidden', !block.hidden)}>
                        <RatioRow
                          desktopRatio={block.desktopRatio || '16/9'}
                          mobileRatio={block.mobileRatio || '16/9'}
                          onDesktopRatio={v => updateBlock(si, bi, 'desktopRatio', v)}
                          onMobileRatio={v => updateBlock(si, bi, 'mobileRatio', v)}
                        />
                        <ImagePicker
                          label="Images"
                          value={block.images || []}
                          onChange={v => updateBlock(si, bi, 'images', v)}
                          images={images}
                          basePath={basePath}
                          uploadUrl={uploadUrl}
                          onRefresh={refreshImages}
                          ratio={block.desktopRatio}
                          cropData={block.cropData||{}}
                          onCropChange={(num, crop) => updateBlock(si,bi,'cropData', crop ? {...(block.cropData||{}), [num]: crop} : Object.fromEntries(Object.entries(block.cropData||{}).filter(([k]) => String(k) !== String(num))))}
                          onRatioChange={v => updateBlock(si,bi,'desktopRatio', v)}
                        />
                        {section.type === 'image-text' && !section.iconList && (
                          <Field label="Image Width (desktop) — share of the space between the page margins">
                            <select style={s} value={block.imgWidth || 'medium'} onChange={e => updateBlock(si, bi, 'imgWidth', e.target.value === 'medium' ? undefined : e.target.value)}>
                              <option value="small">Small — 50%</option>
                              <option value="medium">Medium — 70% (default)</option>
                              <option value="large">Large — 90%</option>
                              <option value="full">Full — fills the page margins (lines up with the title)</option>
                            </select>
                          </Field>
                        )}
                        <TextStyleRow value={block} onChange={v => setInfo(i => { const sections = [...i.sections]; const blocks = [...(sections[si].blocks||[])]; blocks[bi] = { ...blocks[bi], ...v }; sections[si] = { ...sections[si], blocks }; return { ...i, sections } })} />
                        {(section.type === 'image-text-carousel' || section.type === 'image-text') && (
                          <Field label="Text Max Width">
                            <MaxWidthInput placeholder="Default (480)" value={block.textMaxWidth} onChange={v => updateBlock(si, bi, 'textMaxWidth', v)} />
                          </Field>
                        )}
                        <TextLinesEditor
                          lines={block.lines != null ? block.lines : autoConvertToLines(block)}
                          onChange={lines => updateBlock(si, bi, 'lines', lines)}
                        />
                        <LinkPicker label="Link — block click (overrides section link, optional)" value={block.link || ''} onChange={v => updateBlock(si, bi, 'link', v)} />
                      </Block>
                    ))}
                    <button onClick={() => addBlock(si)} style={{ background: 'none', border: '1px dashed var(--ed-input-border)', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', color: 'var(--ed-text-muted)', cursor: 'pointer', alignSelf: 'flex-start', fontFamily: 'inherit' }}>+ Add Block</button>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}

      <button onClick={addSection} style={{ background: 'none', border: '1px dashed var(--ed-input-border)', borderRadius: '8px', padding: '10px 20px', fontSize: '13px', color: 'var(--ed-text-muted)', cursor: 'pointer', alignSelf: 'flex-start', fontFamily: 'inherit' }}>+ Add Section</button>
        </div>
      </div>
    </div>
  )
}
