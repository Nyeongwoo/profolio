import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { API, EditorTopbar, EditorSectionNav, TextField, Field, Row, Block, Card, ImageField, ImagePicker, PositionPicker, RatioRow, TextLinesEditor, autoConvertToLines, SectionDots, MaxWidthInput, remapCollapsedOnReorder, SizeHint, ImageBreakpointOptions, ratioDims } from './EditorComponents'
import { useProfolioSectionSelect } from './pofole'

const CATEGORIES = ['research', 'report', 'essay', 'others']

const TYPE_BADGE = {
  'images':              { label: 'FULL', color: '#ffebee', text: '#e53935' },
  'image-text':          { label: 'MID',  color: '#fff3e0', text: '#f57c00' },
  'image-text-carousel': { label: 'CAR',  color: '#fffde7', text: '#f9a825' },
  'text':                { label: 'TXT',  color: '#e3f2fd', text: '#1e88e5' },
  'model-viewer':        { label: '3D',   color: '#fce4ec', text: '#d81b60' },
}

const TYPE_OPTS = [
  { value: 'images',              label: 'Fullscreen',    desc: 'Full width image' },
  { value: 'image-text',          label: 'Image + Text',  desc: 'Image + text' },
  { value: 'image-text-carousel', label: 'Carousel',      desc: 'Slide cards' },
  { value: 'text',                label: 'Text only',     desc: 'Text only' },
  { value: 'model-viewer',        label: '3D Model',      desc: 'GLB viewer' },
]

const s = { border: '1px solid var(--ed-input-border)', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', fontFamily: 'inherit', color: 'var(--ed-text)', background: 'var(--ed-input-bg)', outline: 'none', width: '100%', boxSizing: 'border-box' }

const emptyBlock = () => ({ images: [], title: '', subtitle: '', content: '' })
const emptySection = () => ({ id: '', label: '', type: 'images', images: [], blocks: [emptyBlock()] })

function TypeSelector({ value, onChange }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ed-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Type</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
        {TYPE_OPTS.map(opt => {
          const badge = TYPE_BADGE[opt.value] || {}
          const active = value === opt.value
          return (
            <button key={opt.value} onClick={() => onChange(opt.value)} style={{
              display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'flex-start',
              padding: '8px 12px', borderRadius: '9px', cursor: 'pointer',
              border: active ? `1.5px solid ${badge.text}` : '1.5px solid var(--ed-badge-border)',
              background: active ? badge.color : 'var(--ed-input-bg)',
              color: active ? badge.text : 'var(--ed-text-muted)',
              fontFamily: 'inherit', transition: 'all 0.1s',
            }}>
              <span style={{ fontSize: '11px', fontWeight: 700 }}>{opt.label}</span>
              <span style={{ fontSize: '10px', opacity: 0.7 }}>{opt.desc}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function EditorBlogPost() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [meta, setMeta] = useState(null)
  const [info, setInfo] = useState(null)
  const [images, setImages] = useState([])
  const [saved, setSaved] = useState(false)
  const [collapsed, setCollapsed] = useState({})
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
  const [dragIdx, setDragIdx] = useState(null)
  const [dropIdx, setDropIdx] = useState(null)
  const dragIdxRef = useRef(null)

  const basePath = `/assets/blog/${id}/sections`
  const uploadUrl = `${API}/blog-images/${id}/upload`

  const refreshImages = useCallback(() =>
    fetch(`${API}/blog-images/${id}`).then(r => r.json()).then(setImages),
    [id]
  )

  useEffect(() => {
    fetch(`${API}/page/blog`).then(r => r.json()).then(posts => {
      const post = posts.find(p => p.id === id)
      setMeta(post || { id, title: '', category: 'others', date: '', thumbnail: '', preview: '' })
    })
    fetch(`${API}/blog-post-info/${id}`).then(r => r.json()).then(d => {
      setInfo(d)
      const c = {}
      ;(d.sections || []).forEach((_, i) => { c[i] = true })
      setCollapsed(c)
    })
    refreshImages()
  }, [id])

  const save = async () => {
    await Promise.all([
      fetch(`${API}/blog-post-meta/${id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(meta),
      }),
      fetch(`${API}/blog-post-info/${id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(info),
      }),
    ])
    setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  const deletePost = async () => {
    if (!confirm(`Delete post "${meta?.title || id}"?\nSection images will remain. (Please clean up the folder manually.)`)) return
    await fetch(`${API}/blog-post-delete/${id}`, { method: 'DELETE' })
    navigate('/editor/blog')
  }

  const updateMeta = (key, val) => setMeta(m => ({ ...m, [key]: val }))
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

  if (!meta || !info) return <div style={{ padding: '40px', color: 'var(--ed-text-xmuted)' }}>Loading...</div>

  const thumbDesktopRatio = meta.thumbnailDesktopRatio || '3/2'
  const thumbMobileRatio = meta.thumbnailMobileRatio || '3/2'

  return (
    <div className="ed-page">
      <EditorTopbar
        title={meta.title || id}
        onSave={save}
        saved={saved}
        extra={
          <div style={{ display: 'flex', gap: '6px' }}>
            <button onClick={collapseAll} style={{ background: 'var(--ed-input-bg)', border: 'none', borderRadius: '6px', padding: '6px 12px', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--ed-text-sub)' }}>Collapse All</button>
            <button onClick={expandAll} style={{ background: 'var(--ed-input-bg)', border: 'none', borderRadius: '6px', padding: '6px 12px', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--ed-text-sub)' }}>Expand All</button>
            <button onClick={() => updateMeta('maintenance', !meta.maintenance)} title={meta.maintenance ? 'Under maintenance — click to make this post public again' : 'Public — click to put just this post under maintenance'} style={{
              border: meta.maintenance ? '1px solid #ffc8c8' : '1px solid var(--ed-input-border)',
              borderRadius: '6px', padding: '6px 12px', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600,
              background: meta.maintenance ? '#fff0f0' : 'var(--ed-input-bg)',
              color: meta.maintenance ? '#e53e3e' : 'var(--ed-text-sub)',
              transition: 'all 0.15s',
            }}>
              {meta.maintenance ? '🔒 Maintenance' : '🌐 Public'}
            </button>
            <button onClick={deletePost} style={{ border: '1px solid #ffc8c8', borderRadius: '6px', padding: '6px 12px', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit', background: '#fff0f0', color: '#e53e3e' }}>Delete Post</button>
          </div>
        }
      />
      <EditorSectionNav sections={[
        { id: 'ed-post-info', label: 'Post Info' },
        { id: 'ed-post-sections', label: 'Sections' },
      ]} />

      {/* ── Post metadata ── */}
      <Card id="ed-post-info" title="Post Info" collapsible defaultOpen>
        <Row>
          <Field label="Title"><input style={s} value={meta.title || ''} onChange={e => updateMeta('title', e.target.value)} /></Field>
          <Field label="Category">
            <select style={s} value={meta.category || 'others'} onChange={e => updateMeta('category', e.target.value)}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
            </select>
          </Field>
          <Field label="Date"><input style={s} value={meta.date || ''} onChange={e => updateMeta('date', e.target.value)} placeholder="2026/06/16" /></Field>
        </Row>
        <ImageField
          label="Thumbnail"
          value={meta.thumbnail || ''}
          onChange={v => updateMeta('thumbnail', v)}
          desktopRatio={meta.thumbnailDesktopRatio || '3/2'}
          mobileRatio={meta.thumbnailMobileRatio || '3/2'}
          onDesktopRatio={v => updateMeta('thumbnailDesktopRatio', v)}
          onMobileRatio={v => updateMeta('thumbnailMobileRatio', v)}
        />
        <SizeHint>Recommended (Ratio above sets this — currently {thumbDesktopRatio}): {ratioDims(480, thumbDesktopRatio)}{thumbMobileRatio !== thumbDesktopRatio ? ` desktop · Mobile ${ratioDims(480, thumbMobileRatio)}` : ''} — rendered at a fixed 240px wide in the post list.</SizeHint>
        <ImageBreakpointOptions
          mobileValue={meta.thumbnailMobileImage} onMobileChange={v => updateMeta('thumbnailMobileImage', v)}
          tabletValue={meta.thumbnailTabletImage} onTabletChange={v => updateMeta('thumbnailTabletImage', v)}
          nativeSize={meta.thumbnailNativeSize} onNativeSize={v => updateMeta('thumbnailNativeSize', v)}
          hideOnMobile={meta.thumbnailHideOnMobile} onHideOnMobile={v => updateMeta('thumbnailHideOnMobile', v)}
          sizeHint="Prepare at ~2x for retina sharpness — required if Apple-style is on below, since then it won't be scaled down to fit."
          containerRatio={thumbDesktopRatio}
        />
        <Field label="Preview Text">
          <textarea style={{ ...s, resize: 'vertical' }} rows={3} value={meta.preview || ''} onChange={e => updateMeta('preview', e.target.value)} />
        </Field>
      </Card>

      {/* ── Section editor ── */}
      <div id="ed-post-sections" style={{ scrollMarginTop: '76px' }} />
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
            style={{ border: '1px solid var(--ed-card-border)', borderRadius: '12px', background: 'var(--ed-card-bg)', flexShrink: 0, opacity: dragIdx === si ? 0.4 : 1, boxShadow: (dropIdx === si && dragIdx !== null && dragIdx !== si) ? '0 0 0 2px #0087ED' : undefined, transition: 'box-shadow 0.12s ease, opacity 0.12s ease', scrollMarginTop:'88px' }}>
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
                <button onClick={() => duplicateSection(si)} style={{ background: 'var(--ed-input-bg)', border: 'none', color: 'var(--ed-text-sub)', cursor: 'pointer', fontSize: '11px', padding: '3px 8px', borderRadius: '5px', fontFamily: 'inherit', fontWeight: 500 }}>Copy</button>
                <button onClick={() => removeSection(si)} style={{ background: 'none', border: '1px solid #ffccc7', color: '#e53e3e', cursor: 'pointer', fontSize: '11px', padding: '3px 8px', borderRadius: '5px', fontFamily: 'inherit', fontWeight: 500 }}>Delete</button>
              </div>
            </div>

            {!isCollapsed && (
              <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '20px', borderTop: '1px solid var(--ed-divider)' }}>
                <Row>
                  <Field label="ID"><input style={s} value={section.id || ''} onChange={e => updateSection(si, 'id', e.target.value)} /></Field>
                  <Field label="Label"><input style={s} value={section.label || ''} onChange={e => updateSection(si, 'label', e.target.value)} /></Field>
                </Row>
                <TypeSelector value={section.type} onChange={v => updateSection(si, 'type', v)} />

                {/* ── Full-screen image ── */}
                {section.type === 'images' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <RatioRow
                      desktopRatio={section.desktopRatio || '16/9'}
                      mobileRatio={section.mobileRatio || '16/9'}
                      onDesktopRatio={v => updateSection(si, 'desktopRatio', v)}
                      onMobileRatio={v => updateSection(si, 'mobileRatio', v)}
                    />
                    <ImagePicker label="Images" value={section.images || []} onChange={v => updateSection(si, 'images', v)} images={images} basePath={basePath} uploadUrl={uploadUrl} onRefresh={refreshImages} />
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
                    <TextLinesEditor
                      lines={section.lines != null ? section.lines : autoConvertToLines(section)}
                      onChange={lines => updateSection(si, 'lines', lines)}
                    />
                  </div>
                )}

                {/* ── 3D model ── */}
                {section.type === 'model-viewer' && (
                  <div style={{ background: 'var(--ed-block-bg)', borderRadius: '10px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ed-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>3D Model</div>
                    <Field label="Model File path (e.g. /assets/blog/post-1/model.glb)">
                      <input style={s} value={section.modelFile || ''} onChange={e => updateSection(si, 'modelFile', e.target.value)} placeholder="/assets/blog/post-1/model.glb" />
                    </Field>
                    <Field label="Auto Rotate">
                      <select style={s} value={section.autoRotate !== false ? 'true' : 'false'} onChange={e => updateSection(si, 'autoRotate', e.target.value === 'true')}>
                        <option value="true">On</option>
                        <option value="false">Off</option>
                      </select>
                    </Field>
                    <TextField label="Title" value={section.title || ''} onChange={v => updateSection(si, 'title', v)}
                      size={section.titleSize} onSize={v => updateSection(si, 'titleSize', v)}
                      weight={section.titleWeight} onWeight={v => updateSection(si, 'titleWeight', v)}
                      color={section.titleColor} onColor={v => updateSection(si, 'titleColor', v)}
                      font={section.titleFont} onFont={v => updateSection(si, 'titleFont', v)}  rich />
                    <TextField label="Subtitle" value={section.subtitle || ''} onChange={v => updateSection(si, 'subtitle', v)}
                      size={section.subtitleSize} onSize={v => updateSection(si, 'subtitleSize', v)}
                      weight={section.subtitleWeight} onWeight={v => updateSection(si, 'subtitleWeight', v)}
                      color={section.subtitleColor} onColor={v => updateSection(si, 'subtitleColor', v)}
                      font={section.subtitleFont} onFont={v => updateSection(si, 'subtitleFont', v)}  rich />
                    <TextField label="Content" value={section.content || ''} onChange={v => updateSection(si, 'content', v)}
                      size={section.contentSize} onSize={v => updateSection(si, 'contentSize', v)}
                      weight={section.contentWeight} onWeight={v => updateSection(si, 'contentWeight', v)}
                      color={section.contentColor} onColor={v => updateSection(si, 'contentColor', v)}
                      font={section.contentFont} onFont={v => updateSection(si, 'contentFont', v)}
                      multiline rows={4}  rich />
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
                  </Row>
                )}

                {/* ── Block ── */}
                {(section.type === 'image-text' || section.type === 'image-text-carousel') && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {(section.blocks || []).map((block, bi) => (
                      <Block key={bi} label={`Block ${bi+1}`} onRemove={() => removeBlock(si, bi)} onMoveUp={bi > 0 ? () => moveBlock(si, bi, -1) : undefined} onMoveDown={bi < (section.blocks.length - 1) ? () => moveBlock(si, bi, 1) : undefined} collapsible hidden={block.hidden} onToggleHidden={() => updateBlock(si, bi, "hidden", !block.hidden)}>
                        <RatioRow
                          desktopRatio={block.desktopRatio || '16/9'}
                          mobileRatio={block.mobileRatio || '16/9'}
                          onDesktopRatio={v => updateBlock(si, bi, 'desktopRatio', v)}
                          onMobileRatio={v => updateBlock(si, bi, 'mobileRatio', v)}
                        />
                        <ImagePicker label="Images" value={block.images || []} onChange={v => updateBlock(si, bi, 'images', v)} images={images} basePath={basePath} uploadUrl={uploadUrl} onRefresh={refreshImages} />
                        <TextField label="Title" value={block.title || ''} onChange={v => updateBlock(si, bi, 'title', v)}
                          size={block.titleSize} onSize={v => updateBlock(si, bi, 'titleSize', v)}
                          weight={block.titleWeight} onWeight={v => updateBlock(si, bi, 'titleWeight', v)}
                          color={block.titleColor} onColor={v => updateBlock(si, bi, 'titleColor', v)}
                          font={block.titleFont} onFont={v => updateBlock(si, bi, 'titleFont', v)}  rich />
                        <TextField label="Subtitle" value={block.subtitle || ''} onChange={v => updateBlock(si, bi, 'subtitle', v)}
                          size={block.subtitleSize} onSize={v => updateBlock(si, bi, 'subtitleSize', v)}
                          weight={block.subtitleWeight} onWeight={v => updateBlock(si, bi, 'subtitleWeight', v)}
                          color={block.subtitleColor} onColor={v => updateBlock(si, bi, 'subtitleColor', v)}
                          font={block.subtitleFont} onFont={v => updateBlock(si, bi, 'subtitleFont', v)}  rich />
                        <TextField label="Content" value={block.content || ''} onChange={v => updateBlock(si, bi, 'content', v)}
                          size={block.contentSize} onSize={v => updateBlock(si, bi, 'contentSize', v)}
                          weight={block.contentWeight} onWeight={v => updateBlock(si, bi, 'contentWeight', v)}
                          color={block.contentColor} onColor={v => updateBlock(si, bi, 'contentColor', v)}
                          font={block.contentFont} onFont={v => updateBlock(si, bi, 'contentFont', v)}
                          multiline rows={3}  rich />
                        {(section.type === 'image-text-carousel' || section.type === 'image-text') && (
                          <Field label="Text Max Width">
                            <MaxWidthInput placeholder="Default (480)" value={block.textMaxWidth} onChange={v => updateBlock(si, bi, 'textMaxWidth', v)} />
                          </Field>
                        )}
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
