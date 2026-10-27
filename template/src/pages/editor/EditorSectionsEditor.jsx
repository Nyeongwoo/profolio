import { useState, useEffect, useCallback, useRef } from 'react'
import { API, TextField, Field, Row, Block, Card, ImageField, ImagePicker, MobileOverridePicker, PositionPicker, RatioRow, TextStyleRow, BgColorField, TextLinesEditor, autoConvertToLines, SectionDots, MaxWidthInput, RATIOS, LinkField, LinkPreviewField, Toggle, remapCollapsedOnReorder } from './EditorComponents'
import { useProfolioSectionSelect } from './pofole'

const TYPE_BADGE = {
  'images':               { label: 'IMG', color: '#ffebee', text: '#e53935' }, // 빨
  'image-text':           { label: 'I+T', color: '#fff3e0', text: '#f57c00' }, // 주
  'image-text-carousel':  { label: 'CAR', color: '#fffde7', text: '#f9a825' }, // 노
  'image-grid':           { label: 'GRD', color: '#e8f5e9', text: '#43a047' }, // 초
  'text':                 { label: 'TXT', color: '#e3f2fd', text: '#1e88e5' }, // 파
  'text-columns':         { label: 'COL', color: '#e8eaf6', text: '#3949ab' }, // 남
  'scroll-animation':     { label: 'SCR', color: '#f3e5f5', text: '#8e24aa' }, // 보
  'model-viewer':         { label: '3D',  color: '#fce4ec', text: '#d81b60' }, // 핑크
  'tab-switcher':         { label: 'TAB', color: '#e0f2f1', text: '#00897b' },
  'feature-tabs':         { label: 'FTAB', color: '#e8eaf6', text: '#3949ab' },
  'accordion':            { label: 'ACC', color: '#fff8e1', text: '#f9a825' },
  'image-tab':            { label: 'ITAB', color: '#e0f7fa', text: '#00838f' },
  'video-background':     { label: 'VID', color: '#ede7f6', text: '#7b1fa2' },
  'stats':                { label: 'STAT', color: '#e0f2f1', text: '#00695c' },
}

const TYPE_OPTS = [
  { value: 'images',              label: 'Images',           desc: 'Full width image' },
  { value: 'image-text',          label: 'Image + Text',     desc: 'Mid size' },
  { value: 'image-text-carousel', label: 'Carousel',         desc: 'Slide cards' },
  { value: 'image-grid',          label: 'Grid',             desc: '2×2, 4×4 tiles' },
  { value: 'scroll-animation',    label: 'Scroll Animation', desc: 'Frame sequence' },
  { value: 'model-viewer',        label: '3D Model',         desc: 'GLB viewer' },
  { value: 'text',                label: 'Text',             desc: 'Text only' },
  { value: 'text-columns',        label: 'Text Columns',     desc: '2–4 col layout' },
  { value: 'tab-switcher',        label: 'Tab Switcher',     desc: 'Tabbed content' },
  { value: 'feature-tabs',        label: 'Feature Tabs',     desc: 'Icon pill tabs' },
  { value: 'accordion',           label: 'Accordion',        desc: 'Expand/collapse' },
  { value: 'image-tab',          label: 'Image Tab',        desc: 'Tab image+text switcher' },
  { value: 'video-background',    label: 'Video BG',         desc: 'Autoplay video' },
  { value: 'stats',                label: 'Stats',            desc: 'Number highlights' },
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

// sections: array of section objects. onChange(newSections) is called on every edit — the caller owns persistence/save.
export default function SectionsEditor({ sections, onChange, basePath, uploadUrl, mobileBasePath, mobileUploadUrl, tabletBasePath, tabletUploadUrl, infoNote }) {
  const [dragIdx, setDragIdx] = useState(null)
  const [dropIdx, setDropIdx] = useState(null)
  const dragIdxRef = useRef(null)

  const [local, setLocal] = useState(() => ({ sections: sections || [] }))
  const [collapsed, setCollapsed] = useState(() => { const c = {}; (sections || []).forEach((_, i) => { c[i] = true }); return c })
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
  const [images, setImages] = useState([])
  const [mobileImages, setMobileImages] = useState([])
  const [tabletImages, setTabletImages] = useState([])

  const refreshImages = useCallback(() =>
    fetch(uploadUrl.replace(/\/upload$/, '')).then(r => r.json()).then(setImages),
    []
  )
  const refreshMobileImages = useCallback(() =>
    fetch(mobileUploadUrl.replace(/\/upload$/, '')).then(r => r.json()).then(setMobileImages),
    []
  )
  const refreshTabletImages = useCallback(() =>
    fetch(tabletUploadUrl.replace(/\/upload$/, '')).then(r => r.json()).then(setTabletImages),
    []
  )

  useEffect(() => { refreshImages(); refreshMobileImages(); refreshTabletImages() }, [])
  useEffect(() => { onChange(local.sections) }, [local.sections])

  const updateSection = (si, key, val) => setLocal(d => {
    const n = JSON.parse(JSON.stringify(d))
    n.sections[si] = { ...n.sections[si], [key]: val }
    return n
  })
  const updateOverlay = (si, key, val) => setLocal(d => {
    const n = JSON.parse(JSON.stringify(d))
    n.sections[si].overlay = { ...(n.sections[si].overlay || {}), [key]: val }
    return n
  })
  const updateBlock = (si, bi, key, val) => setLocal(d => {
    const n = JSON.parse(JSON.stringify(d))
    n.sections[si].blocks[bi] = { ...n.sections[si].blocks[bi], [key]: val }
    return n
  })
  const addSection = () => setLocal(d => {
    const n = JSON.parse(JSON.stringify(d))
    const len = (n.sections || []).length
    n.sections = [...(n.sections || []), emptySection()]
    setCollapsed(c => ({ ...c, [len]: false }))
    return n
  })
  const removeSection = (si) => setLocal(d => {
    const n = JSON.parse(JSON.stringify(d))
    n.sections.splice(si, 1)
    return n
  })
  const duplicateSection = (si) => setLocal(d => {
    const n = JSON.parse(JSON.stringify(d))
    const copy = JSON.parse(JSON.stringify(n.sections[si]))
    copy.id = copy.id ? copy.id + '-copy' : ''
    n.sections.splice(si + 1, 0, copy)
    return n
  })
  const moveSection = (si, dir) => setLocal(d => {
    const n = JSON.parse(JSON.stringify(d))
    const t = si + dir
    if (t < 0 || t >= n.sections.length) return d
    ;[n.sections[si], n.sections[t]] = [n.sections[t], n.sections[si]]
    return n
  })
  const reorderSection = (from, to) => {
    if (from == null || to == null || from === to) return
    setLocal(d => { const n = JSON.parse(JSON.stringify(d)); const [moved] = n.sections.splice(from, 1); n.sections.splice(to, 0, moved); return n })
    setCollapsed(c => remapCollapsedOnReorder(c, from, to, (local.sections || []).length))
  }
  const addBlock = (si) => setLocal(d => {
    const n = JSON.parse(JSON.stringify(d))
    n.sections[si].blocks = [...(n.sections[si].blocks || []), emptyBlock()]
    return n
  })
  const removeBlock = (si, bi) => setLocal(d => {
    const n = JSON.parse(JSON.stringify(d))
    n.sections[si].blocks.splice(bi, 1)
    return n
  })
  const duplicateBlock = (si, bi) => setLocal(d => {
    const n = JSON.parse(JSON.stringify(d))
    n.sections[si].blocks.splice(bi + 1, 0, JSON.parse(JSON.stringify(n.sections[si].blocks[bi])))
    return n
  })
  const moveBlock = (si, bi, dir) => setLocal(d => {
    const n = JSON.parse(JSON.stringify(d))
    const blocks = n.sections[si].blocks
    const j = bi + dir
    if (j < 0 || j >= blocks.length) return d;
    [blocks[bi], blocks[j]] = [blocks[j], blocks[bi]]
    return n
  })

  const collapseAll = () => { const c = {}; (local.sections || []).forEach((_, i) => { c[i] = true }); setCollapsed(c) }
  const expandAll = () => setCollapsed({})

  return (
    <>
      {/* ── Sections ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0 0' }}>
        <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ed-text)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Sections</span>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button onClick={collapseAll} style={{ background: 'var(--ed-input-bg)', border: 'none', borderRadius: '6px', padding: '6px 12px', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--ed-text-sub)' }}>Collapse All</button>
          <button onClick={expandAll} style={{ background: 'var(--ed-input-bg)', border: 'none', borderRadius: '6px', padding: '6px 12px', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--ed-text-sub)' }}>Expand All</button>
        </div>
      </div>

      <div style={{ background: '#f0f7ff', border: '1px solid #d0e8ff', borderRadius: '10px', padding: '12px 16px', fontSize: '12px', color: '#444', lineHeight: 1.7 }}>
        Images: <code style={{ background: '#e8f4ff', padding: '2px 6px', borderRadius: '4px', fontSize: '11px' }}>{basePath}/</code>
        {infoNote && <>&nbsp;— {infoNote}</>}
      </div>

      <div style={{ display:'flex', gap:'14px', alignItems:'flex-start' }}>
        {(local.sections || []).length > 0 && (
          <nav
            className="detail-toc toc-visible ed-section-toc"
            style={{ position:'sticky', top:'88px', left:'auto', transform:'none', flexShrink:0, maxHeight:'calc(100vh - 140px)', overflowY:'auto', overscrollBehavior:'contain', scrollbarWidth:'none' }}
          >
            {(local.sections || []).map((section, si) => (
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
      {(local.sections || []).map((section, si) => {
        const isCollapsed = !!collapsed[si]
        return (
          <div
            key={si}
            id={`ed-section-${si}`}
            onDragOver={e => { if (dragIdx !== null) { e.preventDefault(); if (dropIdx !== si) setDropIdx(si) } }}
            onDrop={e => { e.preventDefault(); reorderSection(dragIdxRef.current, si); dragIdxRef.current = null; setDragIdx(null); setDropIdx(null) }}
            style={{ border: '1px solid var(--ed-card-border)', borderRadius: '12px', background: 'var(--ed-card-bg)', flexShrink: 0, opacity: dragIdx === si ? 0.4 : section.hidden ? 0.5 : 1, boxShadow: (dropIdx === si && dragIdx !== null && dragIdx !== si) ? '0 0 0 2px #0087ED' : undefined, transition: 'box-shadow 0.12s ease, opacity 0.12s ease', scrollMarginTop:'88px' }}>
            <div
              className="ed-section-hd" style={{ display: 'flex', flexWrap: 'wrap', rowGap: '8px', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', background: 'var(--ed-head-bg)', borderRadius: isCollapsed ? '12px' : '12px 12px 0 0', userSelect: 'none' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '140px', overflow: 'hidden' }}>
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
                  <Field label="ID"><input style={s} value={section.id || ''} onChange={e => updateSection(si, 'id', e.target.value)} /></Field>
                  <Field label="Label"><input style={s} value={section.label || ''} onChange={e => updateSection(si, 'label', e.target.value)} /></Field>
                </Row>

                <TypeSelector value={section.type} onChange={v => updateSection(si, 'type', v)} />

                <BgColorField value={section.bgColor || ''} onChange={v => updateSection(si, 'bgColor', v)} />

                <Row>
                  <Field label="Spacing Top (desktop) — e.g. 80px, 0">
                    <input style={s} placeholder="default (80px)" value={section.paddingTop ?? ''} onChange={e => updateSection(si, 'paddingTop', e.target.value)} onBlur={e => { if (!e.target.value) updateSection(si, 'paddingTop', '80px') }} />
                  </Field>
                  <Field label="Spacing Bottom (desktop) — e.g. 80px, 0">
                    <input style={s} placeholder="default (80px)" value={section.paddingBottom ?? ''} onChange={e => updateSection(si, 'paddingBottom', e.target.value)} onBlur={e => { if (!e.target.value) updateSection(si, 'paddingBottom', '80px') }} />
                  </Field>
                </Row>
                <Row>
                  <Field label="Spacing Top (tablet) — empty = same as desktop">
                    <input style={s} placeholder={`Same as desktop (${section.paddingTop || '80px'})`} value={section.paddingTopTablet ?? ''} onChange={e => updateSection(si, 'paddingTopTablet', e.target.value || undefined)} />
                  </Field>
                  <Field label="Spacing Bottom (tablet) — empty = same as desktop">
                    <input style={s} placeholder={`Same as desktop (${section.paddingBottom || '80px'})`} value={section.paddingBottomTablet ?? ''} onChange={e => updateSection(si, 'paddingBottomTablet', e.target.value || undefined)} />
                  </Field>
                </Row>
                <Row>
                  <Field label="Spacing Top (mobile) — empty = same as tablet/desktop">
                    <input style={s} placeholder={`Same as tablet/desktop (${section.paddingTopTablet || section.paddingTop || '80px'})`} value={section.paddingTopMobile ?? ''} onChange={e => updateSection(si, 'paddingTopMobile', e.target.value || undefined)} />
                  </Field>
                  <Field label="Spacing Bottom (mobile) — empty = same as tablet/desktop">
                    <input style={s} placeholder={`Same as tablet/desktop (${section.paddingBottomTablet || section.paddingBottom || '80px'})`} value={section.paddingBottomMobile ?? ''} onChange={e => updateSection(si, 'paddingBottomMobile', e.target.value || undefined)} />
                  </Field>
                </Row>

                {/* ── Full-screen image ── */}
                {section.type === 'images' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <RatioRow
                      desktopRatio={section.desktopRatio || '16/9'}
                      mobileRatio={section.mobileRatio || '16/9'}
                      onDesktopRatio={v => updateSection(si, 'desktopRatio', v)}
                      onMobileRatio={v => updateSection(si, 'mobileRatio', v)}
                    />
                    <Toggle
                      label="Content Width"
                      checked={!!section.matchTextPadding}
                      onChange={v => updateSection(si, 'matchTextPadding', v || undefined)}
                      onLabel="Respects page padding" offLabel="Full-bleed (edge to edge)"
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
                      cropData={section.cropData || {}}
                      onCropChange={(num, crop) => updateSection(si, 'cropData', crop ? {...(section.cropData||{}), [num]: crop} : Object.fromEntries(Object.entries(section.cropData||{}).filter(([k]) => String(k) !== String(num))))}
                    />
                    <MobileOverridePicker
                      desktopNums={section.images || []}
                      value={section.mobileImages || {}}
                      onChange={v => updateSection(si, 'mobileImages', v)}
                      images={mobileImages}
                      basePath={mobileBasePath}
                      uploadUrl={mobileUploadUrl}
                      onRefresh={refreshMobileImages}
                      ratio={section.mobileRatio || section.desktopRatio}
                      cropData={section.mobileCropData || {}}
                      onCropChange={(num, crop) => updateSection(si, 'mobileCropData', crop ? {...(section.mobileCropData||{}), [num]: crop} : Object.fromEntries(Object.entries(section.mobileCropData||{}).filter(([k]) => String(k) !== String(num))))}
                    />
                    <MobileOverridePicker
                      icon="💻"
                      label="Tablet Override (optional) — empty falls back to the page's Tablet Images setting"
                      desktopNums={section.images || []}
                      value={section.tabletImages || {}}
                      onChange={v => updateSection(si, 'tabletImages', v)}
                      images={tabletImages}
                      basePath={tabletBasePath}
                      uploadUrl={tabletUploadUrl}
                      onRefresh={refreshTabletImages}
                      ratio={section.desktopRatio}
                      cropData={section.tabletCropData || {}}
                      onCropChange={(num, crop) => updateSection(si, 'tabletCropData', crop ? {...(section.tabletCropData||{}), [num]: crop} : Object.fromEntries(Object.entries(section.tabletCropData||{}).filter(([k]) => String(k) !== String(num))))}
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
                    <Row>
                      <Field label="Link Card Size — desktop (%)">
                        <input style={s} type="number" min="0" placeholder="Default (100)" value={section.ogSize ?? ''} onChange={e => updateSection(si, 'ogSize', e.target.value !== '' ? Number(e.target.value) : undefined)} />
                      </Field>
                      <Field label="Link Card Size — tablet (%)">
                        <input style={s} type="number" min="0" placeholder="Same as desktop" value={section.ogSizeTablet ?? ''} onChange={e => updateSection(si, 'ogSizeTablet', e.target.value !== '' ? Number(e.target.value) : undefined)} />
                      </Field>
                      <Field label="Link Card Size — mobile (%)">
                        <input style={s} type="number" min="0" placeholder="Same as tablet/desktop" value={section.ogSizeMobile ?? ''} onChange={e => updateSection(si, 'ogSizeMobile', e.target.value !== '' ? Number(e.target.value) : undefined)} />
                      </Field>
                    </Row>
                    <TextStyleRow value={section} onChange={v => setLocal(d => { const n = JSON.parse(JSON.stringify(d)); n.sections[si] = { ...n.sections[si], ...v }; return n })} />
                    <TextLinesEditor
                      lines={section.lines != null ? section.lines : autoConvertToLines(section)}
                      onChange={lines => updateSection(si, 'lines', lines)}
                    />
                    <LinkPreviewField
                      link={section.link}
                      previewStyle={section.previewStyle}
                      ogTitle={section.ogTitle}
                      ogDescription={section.ogDescription}
                      ogImage={section.ogImage}
                      ogSiteName={section.ogSiteName}
                      ogTitleSize={section.ogTitleSize} ogTitleSizeTablet={section.ogTitleSizeTablet} ogTitleSizeMobile={section.ogTitleSizeMobile}
                      ogDescSize={section.ogDescSize} ogDescSizeTablet={section.ogDescSizeTablet} ogDescSizeMobile={section.ogDescSizeMobile}
                      ogSiteSize={section.ogSiteSize} ogSiteSizeTablet={section.ogSiteSizeTablet} ogSiteSizeMobile={section.ogSiteSizeMobile}
                      onChange={(key, val) => updateSection(si, key, val)}
                    />
                  </div>
                )}

                {section.type === 'image-text' && (
                  <>
                    <Toggle
                      label="Content Width"
                      checked={!!section.matchTextPadding}
                      onChange={v => updateSection(si, 'matchTextPadding', v || undefined)}
                      onLabel="Respects page padding" offLabel="Full-bleed (edge to edge)"
                    />
                    <Field label="Layout">
                      <label style={{display:'flex', alignItems:'center', gap:'8px', cursor:'pointer', fontSize:'13px', color:'var(--ed-text)'}}>
                        <input type="checkbox" checked={!!section.iconList} onChange={e => updateSection(si, 'iconList', e.target.checked || undefined)} />
                        Icon list (small round icon left, text right — e.g. resume entries)
                      </label>
                    </Field>
                    {section.iconList && (
                      <Row>
                        <Field label="Columns (desktop — mobile is always 1)">
                          <select style={s} value={section.iconColumns || 1} onChange={e => updateSection(si, 'iconColumns', Number(e.target.value) > 1 ? Number(e.target.value) : undefined)}>
                            <option value={1}>1 (stacked)</option>
                            <option value={2}>2 per row</option>
                            <option value={3}>3 per row</option>
                            <option value={4}>4 per row</option>
                          </select>
                        </Field>
                        <Field label="Columns (tablet)">
                          <select style={s} value={section.tabletColumns || 0} onChange={e => updateSection(si, 'tabletColumns', Number(e.target.value) > 1 ? Number(e.target.value) : undefined)}>
                            <option value={0}>Default (2 per row)</option>
                            <option value={1}>1 (stacked)</option>
                            <option value={2}>2 per row</option>
                            <option value={3}>3 per row</option>
                            <option value={4}>4 per row</option>
                          </select>
                        </Field>
                      </Row>
                    )}
                    {section.iconList && (
                      <Row>
                        <Field label="Icon Size — desktop (px)">
                          <input style={s} type="number" min="0" placeholder="Default (56)" value={section.iconSize ? parseInt(section.iconSize) : ''} onChange={e => updateSection(si, 'iconSize', e.target.value || undefined)} />
                        </Field>
                        <Field label="Icon Size — tablet (px)">
                          <input style={s} type="number" min="0" placeholder="Same as desktop" value={section.iconSizeTablet ? parseInt(section.iconSizeTablet) : ''} onChange={e => updateSection(si, 'iconSizeTablet', e.target.value || undefined)} />
                        </Field>
                        <Field label="Icon Size — mobile (px)">
                          <input style={s} type="number" min="0" placeholder="Default (44)" value={section.iconSizeMobile ? parseInt(section.iconSizeMobile) : ''} onChange={e => updateSection(si, 'iconSizeMobile', e.target.value || undefined)} />
                        </Field>
                      </Row>
                    )}
                    {section.iconList && (
                      <Row>
                        <Field label="Icon–Text Gap — desktop (px)">
                          <input style={s} type="number" min="0" placeholder="Default (20)" value={section.iconGap ? parseInt(section.iconGap) : ''} onChange={e => updateSection(si, 'iconGap', e.target.value || undefined)} />
                        </Field>
                        <Field label="Icon–Text Gap — tablet (px)">
                          <input style={s} type="number" min="0" placeholder="Same as desktop" value={section.iconGapTablet ? parseInt(section.iconGapTablet) : ''} onChange={e => updateSection(si, 'iconGapTablet', e.target.value || undefined)} />
                        </Field>
                        <Field label="Icon–Text Gap — mobile (px)">
                          <input style={s} type="number" min="0" placeholder="Same as desktop" value={section.iconGapMobile ? parseInt(section.iconGapMobile) : ''} onChange={e => updateSection(si, 'iconGapMobile', e.target.value || undefined)} />
                        </Field>
                      </Row>
                    )}
                    <Field label="Show more">
                      <label style={{display:'flex', alignItems:'center', gap:'8px', cursor:'pointer', fontSize:'13px', color:'var(--ed-text)'}}>
                        <input type="checkbox" checked={!!section.limitPreview} onChange={e => updateSection(si, 'limitPreview', e.target.checked || undefined)} />
                        Show only 3 blocks with a "Show more" button to expand the rest
                      </label>
                    </Field>
                    <Field label="Fixed Card Height (px) — empty = ratio mode">
                      <input style={s} type="number" min="0" placeholder="e.g. 480 (leave empty to disable)" value={section.cardHeight || ''} onChange={e => updateSection(si, 'cardHeight', e.target.value ? Number(e.target.value) : undefined)} />
                    </Field>
                    <Field label="Fixed Card Height — Tablet (px)">
                      <input style={s} type="number" min="0" placeholder="Same as Desktop" value={section.cardHeightTablet || ''} onChange={e => updateSection(si, 'cardHeightTablet', e.target.value ? Number(e.target.value) : undefined)} />
                    </Field>
                    <Field label="Image–Text Gap (px)">
                      <input style={s} type="number" min="0" placeholder="Default (40)" value={section.imageTextGap ?? ''} onChange={e => updateSection(si, 'imageTextGap', e.target.value !== '' ? Number(e.target.value) : undefined)} />
                    </Field>
                  </>
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

                {/* ── Grid ── */}
                {section.type === 'image-grid' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <Row>
                      <Field label="Columns (desktop)">
                        <select style={s} value={section.columns || 4} onChange={e => updateSection(si, 'columns', Number(e.target.value))}>
                          {[1,2,3,4,5,6].map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                      </Field>
                      <Field label="Rows (desktop)">
                        <select style={s} value={section.rows || ''} onChange={e => updateSection(si, 'rows', e.target.value ? Number(e.target.value) : undefined)}>
                          <option value="">Auto</option>
                          {[1,2,3,4,5,6].map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                      </Field>
                    </Row>
                    <Row>
                      <Field label="Columns (tablet)">
                        <select style={s} value={section.tabletColumns || 3} onChange={e => updateSection(si, 'tabletColumns', Number(e.target.value))}>
                          {[1,2,3,4,5,6].map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                      </Field>
                      <Field label="Rows (tablet)">
                        <select style={s} value={section.tabletRows || ''} onChange={e => updateSection(si, 'tabletRows', e.target.value ? Number(e.target.value) : undefined)}>
                          <option value="">Auto</option>
                          {[1,2,3,4,5,6].map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                      </Field>
                    </Row>
                    <Row>
                      <Field label="Columns (mobile)">
                        <select style={s} value={section.mobileColumns || 2} onChange={e => updateSection(si, 'mobileColumns', Number(e.target.value))}>
                          {[1,2,3,4].map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                      </Field>
                      <Field label="Rows (mobile)">
                        <select style={s} value={section.mobileRows || ''} onChange={e => updateSection(si, 'mobileRows', e.target.value ? Number(e.target.value) : undefined)}>
                          <option value="">Auto</option>
                          {[1,2,3,4].map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                      </Field>
                    </Row>
                    <Row>
                      <Field label="Gap (desktop)">
                        <input style={s} placeholder="Default (4px)" value={section.gap || ''} onChange={e => updateSection(si, 'gap', e.target.value)} onBlur={e => { if (!e.target.value) updateSection(si, 'gap', '4px') }} />
                      </Field>
                      <Field label="Gap (mobile)">
                        <input style={s} placeholder="Same as desktop" value={section.mobileGap || ''} onChange={e => updateSection(si, 'mobileGap', e.target.value || undefined)} />
                      </Field>
                    </Row>
                    <Field label="Side Padding (mobile, px)">
                      <input style={s} type="number" min="0" placeholder="Default (20)" value={section.mobilePadding ?? ''} onChange={e => updateSection(si, 'mobilePadding', e.target.value !== '' ? Number(e.target.value) : undefined)} />
                    </Field>
                    <MaxWidthInput
                      label="Max Width (desktop — match a Text section above/below this grid so their edges line up)"
                      placeholder="Default (22% side padding, matches Images/Image+Text)"
                      value={section.textMaxWidth || ''}
                      onChange={v => updateSection(si, 'textMaxWidth', v || undefined)}
                    />
                    <RatioRow
                      desktopRatio={section.desktopRatio || ''}
                      mobileRatio={section.mobileRatio || ''}
                      onDesktopRatio={v => updateSection(si, 'desktopRatio', v || undefined)}
                      onMobileRatio={v => updateSection(si, 'mobileRatio', v || undefined)}
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
                      cropData={section.cropData || {}}
                      onCropChange={(num, crop) => updateSection(si, 'cropData', crop ? {...(section.cropData||{}), [num]: crop} : Object.fromEntries(Object.entries(section.cropData||{}).filter(([k]) => String(k) !== String(num))))}
                      onRatioChange={v => updateSection(si, 'desktopRatio', v)}
                    />
                  </div>
                )}

                {/* ── Text Columns section ── */}
                {section.type === 'text-columns' && (() => {
                  const cols = section.columns || [{ lines: [] }, { lines: [] }]
                  const updateCol = (ci, key, val) => {
                    const next = cols.map((c, i) => i === ci ? {...c, [key]: val} : c)
                    updateSection(si, 'columns', next)
                  }
                  const setColCount = (n) => {
                    let next
                    if (n > cols.length) next = [...cols, ...Array(n - cols.length).fill(null).map(() => ({ lines: [] }))]
                    else next = cols.slice(0, n)
                    updateSection(si, 'columns', next)
                  }
                  return (
                    <div style={{display:'flex', flexDirection:'column', gap:'12px'}}>
                      <Row>
                        <Field label="Number of Columns">
                          <select style={s} value={cols.length} onChange={e => setColCount(parseInt(e.target.value))}>
                            <option value={2}>2 Columns</option>
                            <option value={3}>3 Columns</option>
                            <option value={4}>4 Columns</option>
                          </select>
                        </Field>
                        <Field label="Column Gap (e.g. 60px)">
                          <input style={s} placeholder="Default (60px)" value={section.columnGap||''} onChange={e => updateSection(si,'columnGap', e.target.value)} onBlur={e => { if (!e.target.value) updateSection(si,'columnGap','60px') }} />
                        </Field>
                      </Row>
                      {cols.map((col, ci) => (
                        <Block key={ci} label={`Column ${ci + 1}`}>
                          <PositionPicker value={col.textAlign||'left'} onChange={v => updateCol(ci,'textAlign',v)} label="Align" />
                          <TextLinesEditor lines={col.lines||[]} onChange={lines => updateCol(ci,'lines',lines)} />
                        </Block>
                      ))}
                    </div>
                  )
                })()}

                {/* ── Scroll Animation section ── */}
                {section.type === 'scroll-animation' && (() => {
                  const sideItems = section.sideItems || []
                  const updateSide = (ii, key, val) => updateSection(si, 'sideItems', sideItems.map((it, i) => i === ii ? {...it, [key]: val} : it))
                  return (
                    <div style={{background:'var(--ed-block-bg)', borderRadius:'10px', padding:'16px', display:'flex', flexDirection:'column', gap:'12px'}}>
                      <div style={{fontSize:'11px', fontWeight:600, color:'var(--ed-text-muted)', textTransform:'uppercase', letterSpacing:'0.06em'}}>Scroll Animation</div>
                      <Field label="Scroll Frame Folder (e.g. scroll — frames named frame-0001.webp)">
                        <input style={s} value={section.scrollFolder||''} onChange={e => updateSection(si,'scrollFolder',e.target.value)} placeholder="scroll" />
                      </Field>
                      <Row>
                        <Field label="Frame Count">
                          <input style={s} type="number" min="1" value={section.frameCount||''} onChange={e => updateSection(si,'frameCount', e.target.value ? Number(e.target.value) : undefined)} placeholder="72" />
                        </Field>
                        <Field label="Scroll Height (x viewport)">
                          <input style={s} type="number" min="1" value={section.scrollVh||''} onChange={e => updateSection(si,'scrollVh', e.target.value ? Number(e.target.value) : undefined)} placeholder="4" />
                        </Field>
                      </Row>
                      <Field label="Canvas Position">
                        <select style={s} value={section.canvasPosition||'left'} onChange={e => updateSection(si,'canvasPosition',e.target.value)}>
                          <option value="left">Left</option>
                          <option value="center">Center</option>
                          <option value="right">Right</option>
                        </select>
                      </Field>
                      <TextStyleRow value={section} onChange={v => setLocal(d => { const n = JSON.parse(JSON.stringify(d)); n.sections[si] = { ...n.sections[si], ...v }; return n })} />
                      <TextLinesEditor
                        lines={section.lines != null ? section.lines : autoConvertToLines(section)}
                        onChange={lines => updateSection(si, 'lines', lines)}
                      />
                      <div style={{fontSize:'11px', fontWeight:600, color:'var(--ed-text-muted)', textTransform:'uppercase', letterSpacing:'0.06em', marginTop:'8px'}}>Side Items (optional tabs)</div>
                      {sideItems.map((item, ii) => (
                        <Block key={ii} label={`Side Item ${ii + 1}`} onRemove={() => updateSection(si, 'sideItems', sideItems.filter((_,i) => i !== ii))} collapsible>
                          <Field label="Icon Image (from category folder)"><input style={s} value={item.image||''} onChange={e => updateSide(ii,'image',e.target.value)} placeholder="icon.png" /></Field>
                          <Field label="Title"><input style={s} value={item.title||''} onChange={e => updateSide(ii,'title',e.target.value)} /></Field>
                          <Field label="Subtitle"><input style={s} value={item.subtitle||''} onChange={e => updateSide(ii,'subtitle',e.target.value)} /></Field>
                        </Block>
                      ))}
                      <button onClick={() => updateSection(si, 'sideItems', [...sideItems, {image:'', title:'', subtitle:''}])} style={{background:'none', border:'1px dashed var(--ed-input-border)', borderRadius:'8px', padding:'8px 16px', fontSize:'13px', color:'var(--ed-text-muted)', cursor:'pointer', alignSelf:'flex-start', fontFamily:'inherit'}}>+ Add Side Item</button>
                    </div>
                  )
                })()}

                {/* ── 3D Model section ── */}
                {section.type === 'model-viewer' && (
                  <div style={{background:'var(--ed-block-bg)', borderRadius:'10px', padding:'16px', display:'flex', flexDirection:'column', gap:'12px'}}>
                    <div style={{fontSize:'11px', fontWeight:600, color:'var(--ed-text-muted)', textTransform:'uppercase', letterSpacing:'0.06em'}}>3D Model</div>
                    <Field label="Model File (e.g. model.glb)"><input style={s} value={section.modelFile||''} onChange={e => updateSection(si,'modelFile',e.target.value)} placeholder="model.glb" /></Field>
                    <Field label="Auto Rotate">
                      <select style={s} value={section.autoRotate!==false?'true':'false'} onChange={e => updateSection(si,'autoRotate',e.target.value==='true')}>
                        <option value="true">On</option>
                        <option value="false">Off</option>
                      </select>
                    </Field>
                    <TextLinesEditor
                      lines={section.lines != null ? section.lines : autoConvertToLines(section)}
                      onChange={lines => updateSection(si, 'lines', lines)}
                    />
                  </div>
                )}

                {/* ── Tab Switcher ── */}
                {section.type === 'tab-switcher' && (() => {
                  const tabs = section.tabs || []
                  const setTabs = (v) => updateSection(si, 'tabs', v)
                  const updateTab = (ti, key, val) => setTabs(tabs.map((t, i) => i === ti ? {...t, [key]: val} : t))
                  return (
                    <div style={{display:'flex', flexDirection:'column', gap:'12px'}}>
                      <Field label="Tab Bar Alignment">
                        <select style={s} value={section.tabAlign||'left'} onChange={e => updateSection(si,'tabAlign', e.target.value)}>
                          <option value="left">Left</option>
                          <option value="center">Center</option>
                        </select>
                      </Field>
                      {tabs.map((tab, ti) => (
                        <div key={ti} style={{background:'var(--ed-block-bg)', borderRadius:'10px', padding:'16px', display:'flex', flexDirection:'column', gap:'10px'}}>
                          <div style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
                            <span style={{fontSize:'11px', fontWeight:600, color:'var(--ed-text-muted)', textTransform:'uppercase', letterSpacing:'0.06em'}}>Tab {ti + 1}</span>
                            <button onClick={() => setTabs(tabs.filter((_,i) => i !== ti))} style={{background:'none', border:'none', color:'#e53e3e', cursor:'pointer', fontSize:'11px', padding:'2px 6px', fontFamily:'inherit'}}>Remove</button>
                          </div>
                          <Field label="Tab Label"><input style={s} value={tab.label||''} onChange={e => updateTab(ti,'label',e.target.value)} /></Field>
                          <Field label="Image Number"><input style={s} type="number" min="1" value={tab.image||''} onChange={e => updateTab(ti,'image', e.target.value ? parseInt(e.target.value) : undefined)} /></Field>
                          <Field label="Aspect Ratio (e.g. 16/9)"><input style={s} value={tab.ratio||''} onChange={e => updateTab(ti,'ratio',e.target.value)} /></Field>
                          <Field label="Title"><input style={s} value={tab.title||''} onChange={e => updateTab(ti,'title',e.target.value)} /></Field>
                          <div style={{display:'flex', gap:'4px', alignItems:'center'}}>
                            <span style={{fontSize:'10px', color:'var(--ed-text-xmuted)', flexShrink:0}}>Title–Body gap</span>
                            <select style={{...s, flex:1}} value={tab.titleGap ?? ''} onChange={e => updateTab(ti,'titleGap', e.target.value !== '' ? Number(e.target.value) : undefined)}>
                              <option value="">Default (4px)</option>
                              {[0,2,4,6,8,10,12,16,20,24,28,32].map(v => <option key={v} value={v}>{v}px</option>)}
                            </select>
                          </div>
                          <TextField label="Body" value={tab.body||''} onChange={v => updateTab(ti,'body',v)} multiline rows={4} rich />
                        </div>
                      ))}
                      <button onClick={() => setTabs([...tabs, {label:'', image:'', title:'', body:''}])} style={{...s, background:'var(--ed-input-bg)', cursor:'pointer', textAlign:'center', fontWeight:600}}>+ Add Tab</button>
                    </div>
                  )
                })()}

                {/* ── Feature Tabs ── */}
                {section.type === 'feature-tabs' && (() => {
                  const items = section.items || []
                  const setItems = (v) => updateSection(si, 'items', v)
                  const updateItem = (ii, key, val) => setItems(items.map((t, i) => i === ii ? {...t, [key]: val} : t))
                  return (
                    <div style={{display:'flex', flexDirection:'column', gap:'12px'}}>
                      <BgColorField value={section.bgColor||''} onChange={v => updateSection(si,'bgColor',v)} />
                      {items.map((item, ii) => (
                        <Block key={ii} label={`Tab ${ii + 1}`} onRemove={() => setItems(items.filter((_,i) => i !== ii))} collapsible>
                          <Field label="Icon Image (from category folder)">
                            <input style={s} value={item.icon||''} onChange={e => updateItem(ii,'icon',e.target.value)} placeholder="icon.png" />
                          </Field>
                          <Field label="Title"><input style={s} value={item.title||''} onChange={e => updateItem(ii,'title',e.target.value)} /></Field>
                          <RatioRow
                            desktopRatio={item.desktopRatio||''} mobileRatio={item.mobileRatio||''}
                            onDesktopRatio={v => updateItem(ii,'desktopRatio',v||undefined)}
                            onMobileRatio={v => updateItem(ii,'mobileRatio',v||undefined)}
                          />
                          <ImagePicker
                            label="Images"
                            value={item.images||[]}
                            onChange={v => updateItem(ii,'images',v)}
                            images={images} basePath={basePath}
                            uploadUrl={uploadUrl}
                            onRefresh={refreshImages}
                            ratio={item.desktopRatio}
                            cropData={item.cropData||{}}
                            onCropChange={(num, crop) => updateItem(ii,'cropData', crop ? {...(item.cropData||{}), [num]: crop} : Object.fromEntries(Object.entries(item.cropData||{}).filter(([k]) => String(k) !== String(num))))}
                            onRatioChange={v => updateItem(ii,'desktopRatio',v)}
                          />
                          <TextStyleRow value={item} onChange={v => setItems(items.map((t, i) => i === ii ? {...t, ...v} : t))} />
                          <TextLinesEditor
                            lines={item.lines != null ? item.lines : autoConvertToLines(item)}
                            onChange={lines => updateItem(ii,'lines',lines)}
                          />
                        </Block>
                      ))}
                      <button onClick={() => setItems([...items, {icon:'', title:'', images:[], lines:[]}])} style={{background:'none', border:'1px dashed var(--ed-input-border)', borderRadius:'8px', padding:'8px 16px', fontSize:'13px', color:'var(--ed-text-muted)', cursor:'pointer', alignSelf:'flex-start', fontFamily:'inherit'}}>+ Add Tab</button>
                    </div>
                  )
                })()}

                {/* ── Image Tab Switcher ── */}
                {section.type === 'image-tab' && (() => {
                  const tabs = section.tabs || []
                  const setTabs = (v) => updateSection(si, 'tabs', v)
                  const updateTab = (ti, key, val) => setTabs(tabs.map((t, i) => i === ti ? {...t, [key]: val} : t))
                  return (
                    <div style={{display:'flex', flexDirection:'column', gap:'12px'}}>
                      <BgColorField value={section.bgColor||''} onChange={v => updateSection(si,'bgColor',v)} />
                      <Field label="Section Title (optional)"><input style={s} value={section.title||''} onChange={e => updateSection(si,'title',e.target.value)} /></Field>
                      <Row>
                        <Field label="Tab Style">
                          <select style={s} value={section.tabStyle||'underline'} onChange={e => updateSection(si,'tabStyle',e.target.value)}>
                            <option value="underline">Underline</option>
                            <option value="pill">Pill</option>
                            <option value="swatch">Swatch (color circle)</option>
                            <option value="dot">Dot</option>
                            <option value="card">Card</option>
                          </select>
                        </Field>
                        <Field label="Tab Position">
                          <select style={s} value={section.tabPosition||'bottom'} onChange={e => updateSection(si,'tabPosition',e.target.value)}>
                            <option value="bottom">Bottom</option>
                            <option value="top">Top</option>
                          </select>
                        </Field>
                        <Field label="Text Position">
                          <select style={s} value={section.textPosition||'with-image'} onChange={e => updateSection(si,'textPosition', e.target.value === 'with-image' ? undefined : e.target.value)}>
                            <option value="with-image">With image</option>
                            <option value="below-bar">Below tab bar</option>
                          </select>
                        </Field>
                        <Field label="Tab Size">
                          <select style={s} value={section.tabSize||'md'} onChange={e => updateSection(si,'tabSize',e.target.value)}>
                            <option value="sm">Small</option>
                            <option value="md">Medium</option>
                            <option value="lg">Large</option>
                          </select>
                        </Field>
                        <Field label="Tab Gap (px)">
                          <input style={s} type="number" min="0" max="120" placeholder="default" value={section.tabGap ?? ''} onChange={e => updateSection(si,'tabGap', e.target.value !== '' ? Number(e.target.value) : undefined)} />
                        </Field>
                        <Field label="Tab Alignment">
                          <select style={s} value={section.tabAlign||''} onChange={e => updateSection(si,'tabAlign', e.target.value || undefined)}>
                            <option value="">Default</option>
                            <option value="center">Center</option>
                            <option value="left">Left</option>
                          </select>
                        </Field>
                        <Field label="Text Min Height (px)">
                          <input style={s} type="number" min="0" placeholder="e.g. 120 (keeps layout below stable)" value={section.textMinHeight ?? ''} onChange={e => updateSection(si,'textMinHeight', e.target.value !== '' ? Number(e.target.value) : undefined)} />
                        </Field>
                      </Row>
                      {section.tabStyle === 'swatch' && (
                        <>
                          <Row>
                            <Field label="Label Gap (px)">
                              <input style={s} type="number" min="0" max="40" placeholder="8" value={section.swatchLabelGap ?? ''} onChange={e => updateSection(si,'swatchLabelGap', e.target.value !== '' ? Number(e.target.value) : undefined)} />
                            </Field>
                            <Field label="Label Font Size (px)">
                              <input style={s} type="number" min="8" max="32" placeholder="13" value={section.swatchLabelSize ?? ''} onChange={e => updateSection(si,'swatchLabelSize', e.target.value !== '' ? Number(e.target.value) : undefined)} />
                            </Field>
                          </Row>
                          <Field label="Ring Color">
                            <div style={{display:'flex', gap:'6px', alignItems:'center'}}>
                              <input type="color" value={section.swatchRingColor||'#0073EB'} onChange={e => updateSection(si,'swatchRingColor',e.target.value)} style={{width:'36px', height:'36px', border:'1px solid var(--ed-input-border)', borderRadius:'6px', padding:'2px', cursor:'pointer', background:'none'}} />
                              <input style={{...s, flex:1}} value={section.swatchRingColor||''} placeholder="#0073EB" onChange={e => updateSection(si,'swatchRingColor', e.target.value || undefined)} />
                            </div>
                          </Field>
                        </>
                      )}
                      <PositionPicker value={section.textAlign||'left'} onChange={v => updateSection(si,'textAlign',v)} label="Text Align" />
                      {tabs.map((tab, ti) => (
                        <Block key={ti} label={`Tab ${ti + 1}`} onRemove={() => setTabs(tabs.filter((_,i) => i !== ti))} collapsible>
                          <Row>
                            <Field label="Tab Label"><input style={s} value={tab.label||''} onChange={e => updateTab(ti,'label',e.target.value)} /></Field>
                            {section.tabStyle === 'swatch' && (
                              <Field label="Swatch Color">
                                <div style={{display:'flex', gap:'6px', alignItems:'center'}}>
                                  <input type="color" value={tab.swatchColor||'#cccccc'} onChange={e => updateTab(ti,'swatchColor',e.target.value)} style={{width:'36px', height:'36px', border:'1px solid var(--ed-input-border)', borderRadius:'6px', padding:'2px', cursor:'pointer', background:'none'}} />
                                  <input style={{...s, flex:1}} value={tab.swatchColor||''} placeholder="#cccccc" onChange={e => updateTab(ti,'swatchColor',e.target.value)} />
                                </div>
                              </Field>
                            )}
                          </Row>
                          <RatioRow
                            desktopRatio={tab.desktopRatio || ''}
                            mobileRatio={tab.mobileRatio || ''}
                            onDesktopRatio={v => updateTab(ti,'desktopRatio', v || undefined)}
                            onMobileRatio={v => updateTab(ti,'mobileRatio', v || undefined)}
                          />
                          <ImagePicker
                            label="Images"
                            value={tab.images||[]}
                            onChange={v => updateTab(ti,'images',v)}
                            images={images}
                            basePath={basePath}
                            uploadUrl={uploadUrl}
                            onRefresh={refreshImages}
                            ratio={tab.desktopRatio}
                            cropData={tab.cropData||{}}
                            onCropChange={(num, crop) => updateTab(ti,'cropData', crop ? {...(tab.cropData||{}), [num]: crop} : Object.fromEntries(Object.entries(tab.cropData||{}).filter(([k]) => String(k) !== String(num))))}
                            onRatioChange={v => updateTab(ti,'desktopRatio', v)}
                          />
                          <TextStyleRow value={tab} onChange={v => setTabs(tabs.map((t, i) => i === ti ? {...t, ...v} : t))} />
                          <TextLinesEditor
                            lines={tab.lines != null ? tab.lines : autoConvertToLines(tab)}
                            onChange={lines => updateTab(ti, 'lines', lines)}
                          />
                        </Block>
                      ))}
                      <button onClick={() => setTabs([...tabs, {label:'', images:[], lines:[]}])} style={{background:'none', border:'1px dashed var(--ed-input-border)', borderRadius:'8px', padding:'8px 16px', fontSize:'13px', color:'var(--ed-text-muted)', cursor:'pointer', alignSelf:'flex-start', fontFamily:'inherit'}}>+ Add Tab</button>
                    </div>
                  )
                })()}

                {/* ── Accordion ── */}
                {section.type === 'accordion' && (() => {
                  const items = section.items || []
                  const setItems = (v) => updateSection(si, 'items', v)
                  const updateItem = (ii, key, val) => setItems(items.map((t, i) => i === ii ? {...t, [key]: val} : t))
                  return (
                    <div style={{display:'flex', flexDirection:'column', gap:'12px'}}>
                      <Field label="Section Heading (optional)"><input style={s} value={section.title||''} onChange={e => updateSection(si,'title',e.target.value)} /></Field>
                      {items.map((item, ii) => (
                        <Block key={ii} label={`Item ${ii + 1}`} onRemove={() => setItems(items.filter((_,i) => i !== ii))} collapsible>
                          <Field label="Title"><input style={s} value={item.title||''} onChange={e => updateItem(ii,'title',e.target.value)} /></Field>
                          <div style={{display:'flex', gap:'4px', alignItems:'center'}}>
                            <span style={{fontSize:'10px', color:'var(--ed-text-xmuted)', flexShrink:0}}>Title–Body gap</span>
                            <select style={{...s, flex:1}} value={item.titleGap ?? ''} onChange={e => updateItem(ii,'titleGap', e.target.value !== '' ? Number(e.target.value) : undefined)}>
                              <option value="">Default (4px)</option>
                              {[0,2,4,6,8,10,12,16,20,24,28,32].map(v => <option key={v} value={v}>{v}px</option>)}
                            </select>
                          </div>
                          <RatioRow
                            desktopRatio={item.desktopRatio||''} mobileRatio={item.mobileRatio||''}
                            onDesktopRatio={v => updateItem(ii,'desktopRatio',v||undefined)}
                            onMobileRatio={v => updateItem(ii,'mobileRatio',v||undefined)}
                          />
                          <ImagePicker
                            label="Images"
                            value={item.images||[]}
                            onChange={v => updateItem(ii,'images',v)}
                            images={images} basePath={basePath}
                            uploadUrl={uploadUrl}
                            onRefresh={refreshImages}
                            ratio={item.desktopRatio}
                            cropData={item.cropData||{}}
                            onCropChange={(num, crop) => updateItem(ii,'cropData', crop ? {...(item.cropData||{}), [num]: crop} : Object.fromEntries(Object.entries(item.cropData||{}).filter(([k]) => String(k) !== String(num))))}
                            onRatioChange={v => updateItem(ii,'desktopRatio',v)}
                          />
                          <TextStyleRow value={item} onChange={v => setItems(items.map((t, i) => i === ii ? {...t, ...v} : t))} />
                          <TextLinesEditor
                            lines={item.lines != null ? item.lines : autoConvertToLines(item)}
                            onChange={lines => updateItem(ii,'lines',lines)}
                          />
                        </Block>
                      ))}
                      <button onClick={() => setItems([...items, {title:'', images:[], lines:[]}])} style={{background:'none', border:'1px dashed var(--ed-input-border)', borderRadius:'8px', padding:'8px 16px', fontSize:'13px', color:'var(--ed-text-muted)', cursor:'pointer', alignSelf:'flex-start', fontFamily:'inherit'}}>+ Add Item</button>
                    </div>
                  )
                })()}

                {/* ── Video Background ── */}
                {section.type === 'video-background' && (
                  <div style={{background:'var(--ed-block-bg)', borderRadius:'10px', padding:'16px', display:'flex', flexDirection:'column', gap:'12px'}}>
                    <div style={{fontSize:'11px', fontWeight:600, color:'var(--ed-text-muted)', textTransform:'uppercase', letterSpacing:'0.06em'}}>Video Background</div>
                    <Field label="Video File (from category folder)">
                      <input style={s} value={section.videoSrc||''} onChange={e => updateSection(si,'videoSrc',e.target.value)} placeholder="video.mp4" />
                    </Field>
                    <Row>
                      <Field label="Aspect Ratio">
                        <select style={s} value={section.videoRatio||''} onChange={e => updateSection(si,'videoRatio', e.target.value || undefined)}>
                          <option value="">Full background (cover)</option>
                          {RATIOS.filter(r => r.value).map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                        </select>
                      </Field>
                      <Field label="Sound">
                        <select style={s} value={section.videoMuted === false ? 'sound' : 'muted'} onChange={e => updateSection(si,'videoMuted', e.target.value !== 'sound')}>
                          <option value="muted">Muted (autoplay)</option>
                          <option value="sound">With sound (requires click to play)</option>
                        </select>
                      </Field>
                    </Row>
                    <Field label="Playback">
                      <select style={s} value={section.videoLoop === false ? 'once' : 'loop'} onChange={e => updateSection(si,'videoLoop', e.target.value !== 'once')}>
                        <option value="loop">Loop</option>
                        <option value="once">Play once</option>
                      </select>
                    </Field>
                    <Row>
                      <Field label="Text Align">
                        <select style={s} value={section.overlayPosition||'center'} onChange={e => updateSection(si,'overlayPosition',e.target.value)}>
                          <option value="center">Center</option>
                          <option value="left">Left</option>
                          <option value="right">Right</option>
                        </select>
                      </Field>
                      {section.videoRatio && (
                        <Field label="Text Position">
                          <select style={s} value={section.videoTextPosition === 'below' ? 'below' : 'above'} onChange={e => updateSection(si,'videoTextPosition',e.target.value)}>
                            <option value="above">Above Video</option>
                            <option value="below">Below Video</option>
                          </select>
                        </Field>
                      )}
                    </Row>
                    {section.videoRatio && (
                      <MaxWidthInput label="Video Max Width" placeholder="Default (900px)" value={section.videoMaxWidth||''} onChange={v => updateSection(si,'videoMaxWidth',v || undefined)} />
                    )}
                    <TextLinesEditor
                      lines={section.lines != null ? section.lines : autoConvertToLines(section)}
                      onChange={lines => updateSection(si, 'lines', lines)}
                    />
                    <MaxWidthInput label="Text Max Width" value={section.textMaxWidth||''} onChange={v => updateSection(si,'textMaxWidth',v)} />
                  </div>
                )}

                {/* ── Stats ── */}
                {section.type === 'stats' && (() => {
                  const items = section.items || []
                  const setItems = (v) => updateSection(si, 'items', v)
                  const updateItem = (ii, key, val) => setItems(items.map((t, i) => i === ii ? {...t, [key]: val} : t))
                  return (
                    <div style={{display:'flex', flexDirection:'column', gap:'12px'}}>
                      <BgColorField value={section.bgColor||''} onChange={v => updateSection(si,'bgColor',v)} />
                      {items.map((item, ii) => (
                        <Block key={ii} label={`Stat ${ii + 1}`} onRemove={() => setItems(items.filter((_,i) => i !== ii))} collapsible>
                          <Field label="Icon Image (optional, from category folder)">
                            <input style={s} value={item.icon||''} onChange={e => updateItem(ii,'icon',e.target.value)} placeholder="icon.png" />
                          </Field>
                          <Row>
                            <Field label="Value (e.g. 3, 50+, 40%)">
                              <input style={s} value={item.value||''} onChange={e => updateItem(ii,'value',e.target.value)} placeholder="50+" />
                            </Field>
                            <Field label="Label">
                              <input style={s} value={item.label||''} onChange={e => updateItem(ii,'label',e.target.value)} placeholder="Users tested" />
                            </Field>
                          </Row>
                        </Block>
                      ))}
                      <button onClick={() => setItems([...items, {icon:'', value:'', label:''}])} style={{background:'none', border:'1px dashed var(--ed-input-border)', borderRadius:'8px', padding:'8px 16px', fontSize:'13px', color:'var(--ed-text-muted)', cursor:'pointer', alignSelf:'flex-start', fontFamily:'inherit'}}>+ Add Stat</button>
                    </div>
                  )
                })()}

                {/* ── Block (image+text / carousel) ── */}
                {(section.type === 'image-text' || section.type === 'image-text-carousel') && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {(section.blocks || []).map((block, bi) => (
                      <Block key={bi} label={`Block ${bi+1}`} onRemove={() => removeBlock(si, bi)} onDuplicate={() => duplicateBlock(si, bi)} onMoveUp={bi > 0 ? () => moveBlock(si, bi, -1) : undefined} onMoveDown={bi < (section.blocks.length - 1) ? () => moveBlock(si, bi, 1) : undefined} collapsible hidden={block.hidden} onToggleHidden={() => updateBlock(si, bi, "hidden", !block.hidden)}>
                        <RatioRow
                          desktopRatio={block.desktopRatio || '16/9'}
                          tabletRatio={block.tabletRatio || ''}
                          mobileRatio={block.mobileRatio || '16/9'}
                          onDesktopRatio={v => updateBlock(si, bi, 'desktopRatio', v)}
                          onTabletRatio={v => updateBlock(si, bi, 'tabletRatio', v || undefined)}
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
                          cropData={block.cropData || {}}
                          onCropChange={(num, crop) => updateBlock(si, bi, 'cropData', crop ? {...(block.cropData||{}), [num]: crop} : Object.fromEntries(Object.entries(block.cropData||{}).filter(([k]) => String(k) !== String(num))))}
                        />
                        <MobileOverridePicker
                          desktopNums={block.images || []}
                          value={block.mobileImages || {}}
                          onChange={v => updateBlock(si, bi, 'mobileImages', v)}
                          images={mobileImages}
                          basePath={mobileBasePath}
                          uploadUrl={mobileUploadUrl}
                          onRefresh={refreshMobileImages}
                          ratio={block.mobileRatio || block.desktopRatio}
                          cropData={block.mobileCropData || {}}
                          onCropChange={(num, crop) => updateBlock(si, bi, 'mobileCropData', crop ? {...(block.mobileCropData||{}), [num]: crop} : Object.fromEntries(Object.entries(block.mobileCropData||{}).filter(([k]) => String(k) !== String(num))))}
                        />
                        <MobileOverridePicker
                          icon="💻"
                          label="Tablet Override (optional) — empty falls back to the page's Tablet Images setting"
                          desktopNums={block.images || []}
                          value={block.tabletImages || {}}
                          onChange={v => updateBlock(si, bi, 'tabletImages', v)}
                          images={tabletImages}
                          basePath={tabletBasePath}
                          uploadUrl={tabletUploadUrl}
                          onRefresh={refreshTabletImages}
                          ratio={block.desktopRatio}
                          cropData={block.tabletCropData || {}}
                          onCropChange={(num, crop) => updateBlock(si, bi, 'tabletCropData', crop ? {...(block.tabletCropData||{}), [num]: crop} : Object.fromEntries(Object.entries(block.tabletCropData||{}).filter(([k]) => String(k) !== String(num))))}
                        />
                        {section.type === 'image-text' && !section.iconList && (
                          <Field label="Image Width (desktop)">
                            <select style={s} value={block.imgWidth || 'medium'} onChange={e => updateBlock(si, bi, 'imgWidth', e.target.value)}>
                              <option value="small">Small — 50%</option>
                              <option value="medium">Medium — 70%</option>
                              <option value="large">Large — 90%</option>
                              <option value="full">Full — 100%</option>
                            </select>
                          </Field>
                        )}
                        {section.type === 'image-text' && !section.iconList && (
                          <PositionPicker
                            label="Block Align (desktop) — shifts the whole image+text block to one side, with a 15% gutter"
                            value={block.blockAlign || 'center'}
                            onChange={v => updateBlock(si, bi, 'blockAlign', v === 'center' ? undefined : v)}
                          />
                        )}
                        {section.type === 'image-text' && !section.iconList && (
                          <>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', background: 'var(--ed-block-bg)', borderRadius: '8px' }}>
                              <span style={{ fontSize: '12px', color: 'var(--ed-text-sub)', flex: 1 }}>Side-by-side on desktop (Apple-style 2-column row — image and text next to each other, stacking to 1 column on mobile)</span>
                              <button
                                onClick={() => updateBlock(si, bi, 'splitLayout', !block.splitLayout)}
                                style={{ border: 'none', borderRadius: '20px', padding: '4px 14px', fontSize: '11px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, background: block.splitLayout ? 'var(--ed-text)' : 'var(--ed-input-bg)', color: block.splitLayout ? 'var(--ed-bg)' : 'var(--ed-text-muted)' }}
                              >{block.splitLayout ? 'On' : 'Off'}</button>
                            </div>
                            {block.splitLayout && (
                              <Field label="On mobile, stack as">
                                <select style={s} value={block.mobileImageOrder || 'first'} onChange={e => updateBlock(si, bi, 'mobileImageOrder', e.target.value)}>
                                  <option value="first">Image, then text</option>
                                  <option value="last">Text, then image</option>
                                </select>
                              </Field>
                            )}
                          </>
                        )}
                        <TextStyleRow value={block} onChange={v => setLocal(d => { const n = JSON.parse(JSON.stringify(d)); n.sections[si].blocks[bi] = { ...n.sections[si].blocks[bi], ...v }; return n })} />
                        <TextLinesEditor
                          lines={block.lines != null ? block.lines : autoConvertToLines(block)}
                          onChange={lines => updateBlock(si, bi, 'lines', lines)}
                        />
                        {(section.type === 'image-text-carousel' || section.type === 'image-text') && (
                          <Field label="Text Max Width">
                            <MaxWidthInput placeholder="Default (480)" value={block.textMaxWidth} onChange={v => updateBlock(si, bi, 'textMaxWidth', v)} />
                          </Field>
                        )}
                        <LinkField label="Link (optional — makes the whole block clickable)" value={block.link} onChange={v => updateBlock(si, bi, 'link', v)} />
                        <LinkField label="Second Link (optional — adds its own separate icon next to the first)" value={block.link2} onChange={v => updateBlock(si, bi, 'link2', v)} />
                        <Field label="Click Action — adds a + button on the image that, on click, swaps in another image or reveals text (instead of hover)">
                          <select style={s} value={block.clickReveal || 'none'} onChange={e => updateBlock(si, bi, 'clickReveal', e.target.value === 'none' ? undefined : e.target.value)}>
                            <option value="none">Off</option>
                            <option value="image">Swap Image</option>
                            <option value="text">Reveal Text</option>
                          </select>
                        </Field>
                        {block.clickReveal === 'image' && (
                          <ImagePicker
                            label="Click Images (shown instead of Images above, once clicked)"
                            value={block.clickImages || []}
                            onChange={v => updateBlock(si, bi, 'clickImages', v)}
                            images={images}
                            basePath={basePath}
                            uploadUrl={uploadUrl}
                            onRefresh={refreshImages}
                            ratio={block.desktopRatio}
                            cropData={block.clickCropData || {}}
                            onCropChange={(num, crop) => updateBlock(si, bi, 'clickCropData', crop ? {...(block.clickCropData||{}), [num]: crop} : Object.fromEntries(Object.entries(block.clickCropData||{}).filter(([k]) => String(k) !== String(num))))}
                          />
                        )}
                        {block.clickReveal === 'text' && (
                          <>
                            <Field label="Click Title"><input style={s} value={block.clickTitle || ''} onChange={e => updateBlock(si, bi, 'clickTitle', e.target.value)} /></Field>
                            <Field label="Click Content"><textarea style={{...s, resize: 'vertical'}} rows={3} value={block.clickContent || ''} onChange={e => updateBlock(si, bi, 'clickContent', e.target.value)} /></Field>
                          </>
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
    </>
  )
}
