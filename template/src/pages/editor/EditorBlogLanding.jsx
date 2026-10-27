import { useState, useEffect, useCallback, useRef } from 'react'
import { API, EditorTopbar, TextField, Field, Row, Block, ImagePicker, PositionPicker, RatioRow, TextStyleRow, BgColorField, TextLinesEditor, autoConvertToLines, SectionDots, MaxWidthInput, remapCollapsedOnReorder } from './EditorComponents'

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

const emptyBlock = () => ({ images: [], title: '', subtitle: '', content: '', link: '' })
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

export default function EditorBlogLanding() {
  const [info, setInfo] = useState(null)
  const [images, setImages] = useState([])
  const [saved, setSaved] = useState(false)
  const [collapsed, setCollapsed] = useState({})
  const [dragIdx, setDragIdx] = useState(null)
  const [dropIdx, setDropIdx] = useState(null)
  const dragIdxRef = useRef(null)

  const basePath = '/assets/blog/landing'
  const uploadUrl = `${API}/blog-landing-images/upload`

  const refreshImages = useCallback(() =>
    fetch(`${API}/blog-landing-images`)
      .then(r => r.json())
      .then(setImages),
    []
  )

  useEffect(() => {
    fetch(`${API}/blog-landing-info`)
      .then(r => r.json())
      .then(d => {
        setInfo(d)
        const c = {}
        ;(d.sections || []).forEach((_, i) => { c[i] = true })
        setCollapsed(c)
      })
    refreshImages()
  }, [])

  const save = async () => {
    await fetch(`${API}/blog-landing-info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(info),
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

  return (
    <div className="ed-page">
      <EditorTopbar
        title="Blog — Landing Page"
        onSave={save}
        saved={saved}
        extra={
          <div style={{ display: 'flex', gap: '6px' }}>
            <button onClick={collapseAll} style={{ background: 'var(--ed-input-bg)', border: 'none', borderRadius: '6px', padding: '6px 12px', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--ed-text-sub)' }}>Collapse All</button>
            <button onClick={expandAll} style={{ background: 'var(--ed-input-bg)', border: 'none', borderRadius: '6px', padding: '6px 12px', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--ed-text-sub)' }}>Expand All</button>
          </div>
        }
      />

      <div style={{ background: '#f0f7ff', border: '1px solid #d0e8ff', borderRadius: '10px', padding: '12px 16px', fontSize: '12px', color: '#444', lineHeight: 1.7 }}>
        Images: <code style={{ background: '#e8f4ff', padding: '2px 6px', borderRadius: '4px', fontSize: '11px' }}>/assets/blog/landing/</code>
        &nbsp;· Shown on the /blog page below the hero image and above the post list.
      </div>

      {(info.sections || []).map((section, si) => {
        const isCollapsed = !!collapsed[si]
        return (
          <div
            key={si}
            onDragOver={e => { if (dragIdx !== null) { e.preventDefault(); if (dropIdx !== si) setDropIdx(si) } }}
            onDrop={e => { e.preventDefault(); reorderSection(dragIdxRef.current, si); dragIdxRef.current = null; setDragIdx(null); setDropIdx(null) }}
            style={{ border: '1px solid var(--ed-card-border)', borderRadius: '12px', background: 'var(--ed-card-bg)', flexShrink: 0, opacity: dragIdx === si ? 0.4 : 1, boxShadow: (dropIdx === si && dragIdx !== null && dragIdx !== si) ? '0 0 0 2px #0087ED' : undefined, transition: 'box-shadow 0.12s ease, opacity 0.12s ease' }}>
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
                  <Field label="ID"><input style={s} value={section.id} onChange={e => updateSection(si, 'id', e.target.value)} /></Field>
                  <Field label="Label"><input style={s} value={section.label} onChange={e => updateSection(si, 'label', e.target.value)} /></Field>
                </Row>

                <TypeSelector value={section.type} onChange={v => updateSection(si, 'type', v)} />

                <BgColorField value={section.bgColor || ''} onChange={v => updateSection(si, 'bgColor', v)} />

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
                      <TextStyleRow
                        value={section.overlay || {}}
                        onChange={v => setInfo(i => { const sections = [...i.sections]; sections[si] = { ...sections[si], overlay: { ...(sections[si].overlay || {}), ...v } }; return { ...i, sections } })}
                      />
                    </div>
                  </div>
                )}

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

                {section.type === 'image-text-carousel' && (
                  <Row>
                    <Field label={`Card Width — ${section.cardSize || 70}%`}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {[20, 30, 40, 50, 60, 70, 80, 90, 100].map(v => {
                          const active = (section.cardSize || 70) === v
                          return (
                            <button
                              key={v}
                              onClick={() => updateSection(si, 'cardSize', v)}
                              style={{
                                padding: '5px 10px', borderRadius: '7px', cursor: 'pointer',
                                fontFamily: 'inherit', fontSize: '12px',
                                border: active ? '1.5px solid #0087ED' : '1.5px solid var(--ed-badge-border)',
                                background: active ? '#e8f4ff' : 'var(--ed-input-bg)',
                                color: active ? '#0087ED' : 'var(--ed-text-muted)',
                              }}
                            >{v}%</button>
                          )
                        })}
                      </div>
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
                        <ImagePicker
                          label="Images"
                          value={block.images || []}
                          onChange={v => updateBlock(si, bi, 'images', v)}
                          images={images}
                          basePath={basePath}
                          uploadUrl={uploadUrl}
                          onRefresh={refreshImages}
                        />
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
                        <TextStyleRow value={block} onChange={v => setInfo(i => { const sections = [...i.sections]; const blocks = [...(sections[si].blocks || [])]; blocks[bi] = { ...blocks[bi], ...v }; sections[si] = { ...sections[si], blocks }; return { ...i, sections } })} />
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
  )
}
