import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { extractYoutubeId } from '../../utils/youtube'
import { safeGet, safeSet } from '../../utils/safeStorage'
import { API, EditorTopbar, TextField, Field, Row, Block, Card, ImagePicker, ImageField, MobileOverridePicker, PositionPicker, LayoutPicker, RatioRow, TagInput, TextStyleRow, BgColorField, TextLinesEditor, autoConvertToLines, SectionDots, MaxWidthInput, CropEditor, RATIOS, remapCollapsedOnReorder, TierSizeRow, FONT_WEIGHTS } from './EditorComponents'
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
  'interactive':          { label: 'LAB', color: '#e1f5fe', text: '#0277bd' },
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
  { value: 'interactive',         label: 'Interactive',      desc: 'Lab piece embed' },
  { value: 'text',                label: 'Text',             desc: 'Text only' },
  { value: 'text-columns',        label: 'Text Columns',     desc: '2–4 col layout' },
  { value: 'tab-switcher',        label: 'Tab Switcher',     desc: 'Tabbed content' },
  { value: 'feature-tabs',        label: 'Feature Tabs',     desc: 'Icon pill tabs' },
  { value: 'accordion',           label: 'Accordion',        desc: 'Expand/collapse' },
  { value: 'image-tab',          label: 'Image Tab',        desc: 'Tab image+text switcher' },
  { value: 'video-background',    label: 'Video BG',         desc: 'Autoplay video' },
  { value: 'stats',                label: 'Stats',            desc: 'Number highlights' },
]


const uid = () => Math.random().toString(36).slice(2, 9)
const emptyBlock = () => ({ _id: uid(), images: [], mobileImages: [], hoverImages: [], title: '', subtitle: '', content: '', overlayTitle: '', overlayContent: '', titleSize: '', subtitleSize: '', contentSize: '', imgWidth: 'medium', imgTextAlign: 'image' })
const emptySection = () => ({ id: '', label: '', type: 'images', images: [], blocks: [emptyBlock()] })

// Recommended vertical rhythm: 80px between distinct topics (the site's own
// CSS default for an unset paddingTop/paddingBottom), 0 between a text/title
// section and the content section directly under it — pairing two 80px
// gaps back to back (title's bottom + content's top) reads as a much bigger
// gap than intended, since visually they're one topic, not two. Bottom
// padding is left at 0 project-wide so gap is decided by a single number
// (the next section's top) rather than two independent values that can
// silently stack; the last section gets 80 back for breathing room before
// whatever follows (e.g. the "Others" footer).
function computeRecommendedSpacing(sections) {
  const list = sections || []
  return list.map((section, i) => {
    const prev = list[i - 1]
    const isLast = i === list.length - 1
    const tightTop = prev && prev.type === 'text'
    return { ...section, paddingTop: tightTop ? '0px' : '80px', paddingBottom: isLast ? '80px' : '0px' }
  })
}

const s = { border:'1px solid var(--ed-input-border)', borderRadius:'8px', padding:'8px 12px', fontSize:'13px', fontFamily:'inherit', color:'var(--ed-text)', background:'var(--ed-input-bg)', outline:'none', width:'100%', boxSizing:'border-box', transition:'border-color 0.15s, box-shadow 0.15s' }

const EXTS = ['gif', 'webp', 'png', 'jpg', 'jpeg', 'svg']

function BlockAnnotations({ block, onChangeKey, basePath, mobileBasePath, iconsBase }) {
  const [open, setOpen]   = useState(false)
  const [tab, setTab]     = useState('desktop')
  const [extIdx, setExtIdx] = useState(0)
  const [editIdx, setEditIdx] = useState(null)
  const [iconFiles, setIconFiles] = useState([])
  // clickMode: 'add' = click adds new annotation, 'label' = click moves selected annotation's label
  const [clickMode, setClickMode] = useState('add')
  // dragging: { annIdx, part: 'dot'|'label'|'mid', startP, startAnn }
  const [dragging, setDragging] = useState(null)
  const previewRef = useRef(null)

  // when selection clears, revert to add mode
  useEffect(() => { if (editIdx === null) setClickMode('add') }, [editIdx])
  useEffect(() => {
    if (!iconsBase) return
    const parts = iconsBase.split('/')  // /assets/projects/category/id/icons
    const category = parts[parts.length - 3]
    const id = parts[parts.length - 2]
    const load = () => fetch(`${API}/images/${category}/${id}/icons`).then(r => r.json()).then(setIconFiles).catch(() => {})
    load()
    window.addEventListener('focus', load)
    return () => window.removeEventListener('focus', load)
  }, [iconsBase])

  useEffect(() => { setExtIdx(0); setEditIdx(null) }, [tab])
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') setClickMode('add') }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const firstNum = (arr) => arr && arr.length > 0 ? String(arr[0]).padStart(2,'0') : null
  const imgBase = tab === 'desktop'
    ? (firstNum(block.images) ? `${basePath}/${firstNum(block.images)}` : null)
    : (firstNum(block.mobileImages)
        ? `${mobileBasePath}/${firstNum(block.mobileImages)}`
        : (firstNum(block.images) ? `${basePath}/${firstNum(block.images)}` : null))

  const annotations = tab === 'desktop' ? (block.annotations || []) : (block.mobileAnnotations || [])
  const setAnns = (v) => onChangeKey(tab === 'desktop' ? 'annotations' : 'mobileAnnotations', v)

  const pctFromEvent = (e) => {
    if (!previewRef.current) return null
    const rect = previewRef.current.getBoundingClientRect()
    return {
      x: parseFloat(Math.max(0, Math.min(100, (e.clientX - rect.left) / rect.width * 100)).toFixed(1)),
      y: parseFloat(Math.max(0, Math.min(100, (e.clientY - rect.top) / rect.height * 100)).toFixed(1)),
    }
  }

  // Snap to 90° axis when shift held: lock to the dominant axis from drag start
  const snapTo90 = (p, startP, shiftKey) => {
    if (!shiftKey || !startP) return p
    const dx = Math.abs(p.x - startP.x), dy = Math.abs(p.y - startP.y)
    return dx >= dy ? { x: p.x, y: startP.y } : { x: startP.x, y: p.y }
  }

  const handlePreviewClick = (e) => {
    if (dragging) return
    const p = pctFromEvent(e)
    if (!p) return
    if (editIdx !== null && clickMode === 'label') {
      updateBatch(editIdx, { lineX: p.x, lineY: p.y })
    } else {
      const newAnn = { x: p.x, y: p.y, lineX: Math.min(p.x + 15, 90), lineY: p.y, side: 'right', title: '', content: '', hoverMode: 'hover' }
      const next = [...annotations, newAnn]
      setAnns(next)
      setEditIdx(next.length - 1)
    }
  }

  const handleMouseMove = (e) => {
    if (!dragging) return
    const raw = pctFromEvent(e)
    if (!raw) return
    const { annIdx, part, startP, startAnn } = dragging
    const p = snapTo90(raw, startP, e.shiftKey)
    const ann = annotations[annIdx]
    if (part === 'dot') {
      // move dot; if shift, also move mid & label by same delta
      const dx = p.x - startAnn.x, dy = p.y - startAnn.y
      const patch = { x: p.x, y: p.y }
      if (e.shiftKey) {
        patch.lineX = startAnn.lineX + dx; patch.lineY = startAnn.lineY + dy
        if (startAnn.midX != null) { patch.midX = startAnn.midX + dx; patch.midY = startAnn.midY + dy }
      }
      setAnns(annotations.map((a, i) => i === annIdx ? {...a, ...patch} : a))
    } else if (part === 'label') {
      setAnns(annotations.map((a, i) => i === annIdx ? {...a, lineX: p.x, lineY: p.y} : a))
    } else if (part === 'mid') {
      setAnns(annotations.map((a, i) => i === annIdx ? {...a, midX: p.x, midY: p.y} : a))
    }
  }

  const startDrag = (e, annIdx, part) => {
    e.stopPropagation()
    const p = pctFromEvent(e)
    setEditIdx(annIdx)
    setDragging({ annIdx, part, startP: p, startAnn: {...annotations[annIdx]} })
  }

  const update = (idx, key, val) => setAnns(annotations.map((a, i) => i === idx ? {...a, [key]: val} : a))
  const updateBatch = (idx, patch) => setAnns(annotations.map((a, i) => i === idx ? {...a, ...patch} : a))
  const remove = (idx) => { setAnns(annotations.filter((_, i) => i !== idx)); if (editIdx === idx) setEditIdx(null) }

  const tabBtn = (t) => ({
    background: tab === t ? 'var(--ed-text)' : 'var(--ed-input-bg)',
    color: tab === t ? 'var(--ed-bg)' : 'var(--ed-text-sub)',
    border: 'none', borderRadius: '6px', padding: '4px 10px', fontSize: '11px',
    cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600,
  })

  return (
    <div style={{background:'var(--ed-block-bg)', borderRadius:'8px', padding:'12px', display:'flex', flexDirection:'column', gap:'10px'}}>
      <div style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
        <button onClick={() => setOpen(o => !o)} style={{display:'flex', alignItems:'center', gap:'6px', background:'none', border:'none', cursor:'pointer', padding:0, fontFamily:'inherit'}}>
          <span style={{fontSize:'11px', fontWeight:600, color:'var(--ed-text-muted)', textTransform:'uppercase', letterSpacing:'0.06em'}}>Annotations</span>
          <span style={{fontSize:'10px', color:'var(--ed-text-xmuted)'}}>{open ? '▲' : '▼'}</span>
        </button>
        {open && <div style={{display:'flex', gap:'4px'}}>
          <button onClick={() => setTab('desktop')} style={tabBtn('desktop')}>Desktop</button>
          <button onClick={() => setTab('mobile')}  style={tabBtn('mobile')}>Mobile</button>
        </div>}
      </div>

      {open && <>
        {/* Preview canvas */}
        <div
          ref={previewRef}
          style={{position:'relative', borderRadius:'8px', overflow:'hidden', background:'#f0f0f0', cursor: dragging ? 'grabbing' : (editIdx !== null && clickMode === 'label') ? 'cell' : 'crosshair', userSelect:'none'}}
          onClick={handlePreviewClick}
          onMouseMove={handleMouseMove}
          onMouseUp={() => setDragging(null)}
          onMouseLeave={() => setDragging(null)}
        >
          {imgBase ? (
            <img key={`${imgBase}-${extIdx}`} src={`${imgBase}.${EXTS[extIdx]}`} alt=""
              style={{width:'100%', display:'block', pointerEvents:'none'}}
              onError={() => { if (extIdx + 1 < EXTS.length) setExtIdx(i => i + 1) }}
            />
          ) : (
            <div style={{aspectRatio:'16/9', display:'flex', alignItems:'center', justifyContent:'center', color:'#aaa', fontSize:'12px'}}>
              Add an image above to use visual placement
            </div>
          )}

          {/* SVG lines */}
          <svg viewBox="0 0 100 100" preserveAspectRatio="none"
            style={{position:'absolute', inset:0, width:'100%', height:'100%', pointerEvents:'none', overflow:'visible'}}>
            {annotations.map((ann, i) => {
              const active = editIdx === i
              const hasMid = ann.midX != null
              const d = hasMid
                ? `M ${ann.x} ${ann.y} L ${ann.midX} ${ann.midY} L ${ann.lineX} ${ann.lineY}`
                : `M ${ann.x} ${ann.y} L ${ann.lineX} ${ann.lineY}`
              return (
                <path key={i} d={d} fill="none"
                  stroke={active ? '#0070f3' : '#fff'}
                  strokeWidth={active ? 0.45 : 0.3}
                  strokeDasharray={active ? undefined : '1.5 1'}
                  opacity={active ? 1 : 0.85}
                  style={{filter:'drop-shadow(0 0 0.5px #000)'}}
                />
              )
            })}
          </svg>

          {/* Handles */}
          {annotations.map((ann, i) => {
            const active = editIdx === i
            const dotColor = active ? '#0070f3' : '#333'
            // midpoint: existing mid or line center
            const midX = ann.midX != null ? ann.midX : (ann.x + ann.lineX) / 2
            const midY = ann.midY != null ? ann.midY : (ann.y + ann.lineY) / 2
            return (
              <div key={i}>
                {/* Origin dot */}
                <div onMouseDown={e => startDrag(e, i, 'dot')} onClick={e => e.stopPropagation()}
                  style={{position:'absolute', left:`${ann.x}%`, top:`${ann.y}%`, transform:'translate(-50%,-50%)',
                    width:18, height:18, borderRadius:'50%', background:dotColor, color:'#fff',
                    fontSize:'10px', fontWeight:600, display:'flex', alignItems:'center', justifyContent:'center',
                    cursor:'grab', zIndex:12, border:'2px solid #fff', boxSizing:'border-box'}}
                >{i+1}</div>
                {/* Midpoint / bend handle — diamond shape via rotation */}
                <div onMouseDown={e => startDrag(e, i, 'mid')} onClick={e => { e.stopPropagation(); setEditIdx(i) }}
                  title={ann.midX != null ? 'Drag to move bend · click to remove' : 'Drag to add bend point'}
                  onDoubleClick={e => { e.stopPropagation(); updateBatch(i, { midX: null, midY: null }) }}
                  style={{position:'absolute', left:`${midX}%`, top:`${midY}%`, transform:'translate(-50%,-50%) rotate(45deg)',
                    width:8, height:8, borderRadius:'1px',
                    background: ann.midX != null ? (active ? '#0070f3' : '#333') : 'transparent',
                    border: `1.5px solid ${active ? '#0070f3' : '#fff'}`,
                    cursor:'grab', zIndex:11, boxSizing:'border-box',
                    filter:'drop-shadow(0 0 1px #0004)'}}
                />
                {/* Label text — draggable, positioned like viewer */}
                <div
                  onMouseDown={e => startDrag(e, i, 'label')}
                  onClick={e => { e.stopPropagation(); setEditIdx(i) }}
                  style={{
                    position:'absolute',
                    left: ann.side !== 'left' ? `${ann.lineX}%` : 'auto',
                    right: ann.side === 'left' ? `${100 - ann.lineX}%` : 'auto',
                    top: `${ann.lineY}%`,
                    transform: 'translateY(-50%)',
                    maxWidth: 160,
                    background: active ? 'rgba(0,112,243,0.08)' : 'rgba(255,255,255,0.85)',
                    border: `1.5px solid ${active ? '#0070f3' : 'rgba(0,0,0,0.15)'}`,
                    borderRadius: 6,
                    padding: '4px 7px',
                    cursor: 'grab',
                    zIndex: 13,
                    boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
                    textAlign: ann.side === 'left' ? 'right' : 'left',
                    userSelect: 'none',
                    backdropFilter: 'blur(4px)',
                  }}
                >
                  {(ann.title || ann.content) ? <>
                    {ann.title && <div style={{fontSize:10, fontWeight:700, color: active ? '#0070f3' : '#333', lineHeight:1.3, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{ann.title}</div>}
                    {ann.content && <div style={{fontSize:9, color:'#666', lineHeight:1.3, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{ann.content}</div>}
                  </> : (
                    <div style={{fontSize:9, color:'#aaa', fontStyle:'italic', whiteSpace:'nowrap'}}>label {i+1}</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        <div style={{display:'flex', alignItems:'center', gap:'8px', flexWrap:'wrap'}}>
          <div style={{fontSize:'10px', color:'var(--ed-text-xmuted)', lineHeight:1.5, flex:1}}>
            {editIdx !== null && clickMode === 'label'
              ? 'Click image to move label · Press Esc or toggle to switch back'
              : 'Click image to add · Drag ● to move origin (Shift = move all together) · Drag ◆ to add bend · Drag ○ to move label · Double-click ◆ to remove bend'}
          </div>
          {editIdx !== null && (
            <button
              onClick={() => setClickMode(m => m === 'label' ? 'add' : 'label')}
              style={{
                fontSize:'10px', padding:'2px 8px', borderRadius:'4px', border:'1.5px solid',
                borderColor: clickMode === 'label' ? '#0070f3' : 'rgba(0,0,0,0.18)',
                background: clickMode === 'label' ? 'rgba(0,112,243,0.1)' : 'transparent',
                color: clickMode === 'label' ? '#0070f3' : 'var(--ed-text-xmuted)',
                cursor:'pointer', whiteSpace:'nowrap', flexShrink:0,
              }}
            >
              {clickMode === 'label' ? '○ Moving label' : '○ Move label'}
            </button>
          )}
        </div>

        {/* Always-visible annotation list */}
        <div style={{display:'flex', flexDirection:'column', gap:'4px'}}>
          {annotations.length === 0 && (
            <div style={{fontSize:'11px', color:'var(--ed-text-xmuted)', padding:'4px 0'}}>No annotations yet.</div>
          )}
          {annotations.map((ann, i) => (
            <div key={i}>
              {/* List row */}
              <div
                onClick={() => setEditIdx(editIdx === i ? null : i)}
                style={{
                  display:'flex', alignItems:'center', gap:'8px', padding:'6px 10px',
                  borderRadius:'6px', cursor:'pointer', userSelect:'none',
                  background: editIdx === i ? 'var(--ed-input-bg)' : 'transparent',
                  border: editIdx === i ? '1px solid var(--ed-card-border)' : '1px solid transparent',
                  transition:'all 0.1s',
                }}
              >
                <div style={{width:18, height:18, borderRadius:'50%', background: editIdx===i ? '#0070f3' : '#333',
                  color:'#fff', fontSize:'10px', fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0}}>
                  {i+1}
                </div>
                <span style={{flex:1, fontSize:'12px', color:'var(--ed-text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>
                  {ann.title || ann.content || <span style={{color:'var(--ed-text-xmuted)'}}>Annotation {i+1}</span>}
                </span>
                <span style={{fontSize:'10px', color:'var(--ed-text-xmuted)', flexShrink:0}}>
                  {ann.hoverMode === 'always-on' ? 'always' : ann.hoverMode === 'always-off' ? 'hidden' : 'hover'}
                </span>
                <button onClick={e => { e.stopPropagation(); remove(i) }}
                  style={{background:'none', border:'none', color:'#e53e3e', cursor:'pointer', padding:'0 2px', fontSize:'13px', lineHeight:1, flexShrink:0}}>×</button>
              </div>

              {/* Inline edit panel when selected */}
              {editIdx === i && (
                <div style={{padding:'10px 10px 10px 36px', display:'flex', flexDirection:'column', gap:'8px', borderLeft:'2px solid #0070f3', marginLeft:'9px', marginBottom:'4px'}}>
                  <Row>
                    <Field label="Dot X%"><input style={s} type="number" step="0.1" value={ann.x} onChange={e => update(i,'x',parseFloat(e.target.value)||0)} /></Field>
                    <Field label="Dot Y%"><input style={s} type="number" step="0.1" value={ann.y} onChange={e => update(i,'y',parseFloat(e.target.value)||0)} /></Field>
                  </Row>
                  {ann.midX != null && <Row>
                    <Field label="Bend X%"><input style={s} type="number" step="0.1" value={ann.midX} onChange={e => update(i,'midX',parseFloat(e.target.value)||0)} /></Field>
                    <Field label="Bend Y%"><input style={s} type="number" step="0.1" value={ann.midY} onChange={e => update(i,'midY',parseFloat(e.target.value)||0)} /></Field>
                  </Row>}
                  <Row>
                    <Field label="Label X%"><input style={s} type="number" step="0.1" value={ann.lineX??''} onChange={e => update(i,'lineX',parseFloat(e.target.value)||0)} /></Field>
                    <Field label="Label Y%"><input style={s} type="number" step="0.1" value={ann.lineY??''} onChange={e => update(i,'lineY',parseFloat(e.target.value)||0)} /></Field>
                  </Row>
                  <Row>
                    <Field label="Side">
                      <select style={s} value={ann.side||'right'} onChange={e => update(i,'side',e.target.value)}>
                        <option value="right">Right</option>
                        <option value="left">Left</option>
                      </select>
                    </Field>
                    <Field label="Show">
                      <select style={s} value={ann.hoverMode||'hover'} onChange={e => update(i,'hoverMode',e.target.value)}>
                        <option value="hover">On hover</option>
                        <option value="always-on">Always on</option>
                        <option value="always-off">Always off</option>
                      </select>
                    </Field>
                  </Row>
                  <Field label="Title"><input style={s} value={ann.title||''} onChange={e => update(i,'title',e.target.value)} /></Field>
                  <TextField label="Content" value={ann.content||''} onChange={v => update(i,'content',v)} multiline rows={2} rich />
                  {iconFiles.length > 0 && (
                    <Field label="Icon">
                      <div style={{display:'flex', flexWrap:'wrap', gap:'6px', alignItems:'center'}}>
                        <div
                          onClick={() => update(i,'icon',null)}
                          style={{width:36, height:36, border:`1.5px solid ${!ann.icon ? '#0070f3' : 'rgba(0,0,0,0.15)'}`, borderRadius:6, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', fontSize:10, color:'#aaa', background: !ann.icon ? 'rgba(0,112,243,0.07)' : '#fafafa'}}
                        >none</div>
                        {iconFiles.map(f => (
                          <div
                            key={f}
                            title={f}
                            onClick={() => update(i,'icon',f)}
                            style={{width:36, height:36, border:`1.5px solid ${ann.icon === f ? '#0070f3' : 'rgba(0,0,0,0.1)'}`, borderRadius:6, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', padding:4, background: ann.icon === f ? 'rgba(0,112,243,0.07)' : '#fafafa'}}
                          >
                            <img src={`${iconsBase}/${f}`} alt={f} style={{width:'100%', height:'100%', objectFit:'contain'}} />
                          </div>
                        ))}
                      </div>
                    </Field>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </>}
    </div>
  )
}

function SectionPreviewThumb({ section, category, id, images }) {
  const firstImg = (section.type === 'images' || section.type === 'image-grid') ? section.images?.[0] : section.blocks?.[0]?.images?.[0]
  if (!firstImg) return null
  const name = String(firstImg).padStart(2, '0')
  const file = images.find(f => f.name.startsWith(name))
  if (!file) return null
  return <img src={`/assets/projects/${category}/${id}/sections/${file.name}`} style={{width:'48px', height:'32px', objectFit:'cover', borderRadius:'4px', flexShrink:0, border:'1px solid var(--ed-card-border)'}} alt="" />
}


function TypeSelector({ value, onChange }) {
  return (
    <div style={{display:'flex', flexDirection:'column', gap:'6px'}}>
      <label style={{fontSize:'11px', fontWeight:600, color:'var(--ed-text-muted)', textTransform:'uppercase', letterSpacing:'0.06em'}}>Type</label>
      <div style={{display:'flex', flexWrap:'wrap', gap:'6px'}}>
        {TYPE_OPTS.map(opt => {
          const badge = TYPE_BADGE[opt.value] || {}
          const active = value === opt.value
          return (
            <button
              key={opt.value}
              onClick={() => onChange(opt.value)}
              style={{
                display:'flex', flexDirection:'column', gap:'2px', alignItems:'flex-start',
                padding:'8px 12px', borderRadius:'9px', cursor:'pointer',
                border: active ? `1.5px solid ${badge.text}` : '1.5px solid var(--ed-badge-border)',
                background: active ? badge.color : 'var(--ed-input-bg)',
                color: active ? badge.text : 'var(--ed-text-muted)',
                fontFamily:'inherit', transition:'all 0.1s',
              }}
            >
              <span style={{fontSize:'11px', fontWeight:700}}>{opt.label}</span>
              <span style={{fontSize:'10px', opacity:0.7}}>{opt.desc}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function ScrollAnimEditor({ section, category, id, onUpdate }) {
  const folderName = section.scrollFolder || (section.scrollIndex != null ? `scroll-${section.scrollIndex}` : 'scroll')
  const [frameInfo, setFrameInfo] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(null)
  const [showCrop, setShowCrop] = useState(false)
  const [showMobileCrop, setShowMobileCrop] = useState(false)
  const [availFolders, setAvailFolders] = useState(null)
  const [addingFolder, setAddingFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [sectionImages, setSectionImages] = useState([])
  const fileInputRef = useRef(null)
  const onUpdateRef = useRef(onUpdate)
  useEffect(() => { onUpdateRef.current = onUpdate })
  const sectionScrollFolderRef = useRef(section.scrollFolder)
  useEffect(() => { sectionScrollFolderRef.current = section.scrollFolder }, [section.scrollFolder])

  useEffect(() => {
    fetch(`${API}/scroll-folder-list/${category}/${id}`)
      .then(r => r.json())
      .then(d => {
        const folders = d.folders || []
        setAvailFolders(folders)
        if (folders.length > 0 && !sectionScrollFolderRef.current) {
          onUpdateRef.current('scrollFolder', folders[0])
          onUpdateRef.current('scrollIndex', undefined)
        }
      })
      .catch(() => setAvailFolders([]))
  }, [category, id])

  useEffect(() => {
    const load = () => fetch(`${API}/images/${category}/${id}`)
      .then(r => r.json())
      .then(files => setSectionImages(files || []))
      .catch(() => {})
    load()
    window.addEventListener('focus', load)
    return () => window.removeEventListener('focus', load)
  }, [category, id])

  // URL of first frame for CropEditor preview
  const firstFrameSrc = frameInfo?.frames?.[0]
    ? `/assets/projects/${category}/${id}/${folderName}/${frameInfo.frames[0]}`
    : null
  const mobileFolder = section.mobileScrollFolder
  const mobileFirstFrameSrc = mobileFolder && frameInfo?.frames?.[0]
    ? `/assets/projects/${category}/${id}/${mobileFolder}/${frameInfo.frames[0]}`
    : firstFrameSrc

  const refreshFrames = useCallback(() => {
    fetch(`${API}/scroll-frames/${category}/${id}/${folderName}`)
      .then(r => r.json())
      .then(d => setFrameInfo(d))
      .catch(() => {})
  }, [category, id, folderName])

  useEffect(() => { refreshFrames() }, [refreshFrames])

  const uploadFiles = async (files) => {
    const frameFiles = Array.from(files)
      .filter(f => /\.(webp|png|jpe?g)$/i.test(f.name))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
    if (frameFiles.length === 0) return
    setUploading(true)
    setUploadProgress({ done: 0, total: frameFiles.length })
    for (let i = 0; i < frameFiles.length; i++) {
      const file = frameFiles[i]
      const data = await new Promise(res => {
        const r = new FileReader()
        r.onload = e => res(e.target.result.split(',')[1])
        r.readAsDataURL(file)
      })
      await fetch(`${API}/scroll-frames/${category}/${id}/${folderName}/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: file.name, data, frameNum: i + 1 }),
      })
      setUploadProgress({ done: i + 1, total: frameFiles.length })
    }
    setUploading(false)
    setUploadProgress(null)
    refreshFrames()
    onUpdate('frameCount', frameFiles.length)
  }

  const onFilePick = (e) => {
    uploadFiles(e.target.files)
    e.target.value = ''
  }

  return (
    <div style={{background:'var(--ed-block-bg)', borderRadius:'10px', padding:'16px', display:'flex', flexDirection:'column', gap:'16px'}}>
      <div style={{fontSize:'11px', fontWeight:600, color:'var(--ed-text-muted)', textTransform:'uppercase', letterSpacing:'0.06em'}}>Scroll Animation</div>

      <Row>
        <Field label="Folder">
          {availFolders === null ? (
            <span style={{fontSize:'12px', color:'var(--ed-text-muted)'}}>Loading...</span>
          ) : addingFolder ? (
            <div style={{display:'flex', gap:'6px'}}>
              <input
                style={{...s, flex:1}}
                placeholder="e.g. scroll/003"
                value={newFolderName}
                autoFocus
                onChange={e => setNewFolderName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    const name = newFolderName.trim()
                    if (!name) return
                    onUpdate('scrollFolder', name)
                    onUpdate('scrollIndex', undefined)
                    setAddingFolder(false)
                    setNewFolderName('')
                  } else if (e.key === 'Escape') {
                    setAddingFolder(false)
                    setNewFolderName('')
                  }
                }}
              />
              <button
                onClick={() => {
                  const name = newFolderName.trim()
                  if (!name) return
                  onUpdate('scrollFolder', name)
                  onUpdate('scrollIndex', undefined)
                  setAddingFolder(false)
                  setNewFolderName('')
                }}
                style={{fontSize:'12px', padding:'0 12px', borderRadius:'8px', border:'none', background:'#111', color:'#fff', cursor:'pointer', fontFamily:'inherit'}}
              >Use</button>
              <button
                onClick={() => { setAddingFolder(false); setNewFolderName('') }}
                style={{fontSize:'12px', padding:'0 12px', borderRadius:'8px', border:'1px solid var(--ed-input-border)', background:'var(--ed-input-bg)', color:'var(--ed-text-sub)', cursor:'pointer', fontFamily:'inherit'}}
              >Cancel</button>
            </div>
          ) : (
            <div style={{display:'flex', gap:'6px'}}>
              {availFolders.length === 0 ? (
                <span style={{fontSize:'12px', color:'var(--ed-text-muted)', flex:1, display:'flex', alignItems:'center'}}>No folders found — frames upload once the folder is used below</span>
              ) : (
                <select style={{...s, flex:1, cursor:'pointer'}}
                  value={section.scrollFolder ?? (section.scrollIndex != null ? `scroll-${section.scrollIndex}` : availFolders[0])}
                  onChange={e => { onUpdate('scrollFolder', e.target.value); onUpdate('scrollIndex', undefined) }}
                >
                  {availFolders.map(f => <option key={f} value={f}>{f}</option>)}
                  {section.scrollFolder && !availFolders.includes(section.scrollFolder) && (
                    <option value={section.scrollFolder}>{section.scrollFolder} (new — upload frames below)</option>
                  )}
                </select>
              )}
              <button
                onClick={() => setAddingFolder(true)}
                title="Add a new folder — it appears in this list once you upload frames into it"
                style={{fontSize:'12px', padding:'0 12px', borderRadius:'8px', border:'1px solid var(--ed-input-border)', background:'var(--ed-input-bg)', color:'var(--ed-text-sub)', cursor:'pointer', fontFamily:'inherit', flexShrink:0}}
              >+ New</button>
            </div>
          )}
        </Field>
        <Field label="Frame Count">
          <input style={s} type="number" value={section.frameCount || 72} onChange={e => onUpdate('frameCount', parseInt(e.target.value))} />
        </Field>
      </Row>

      <Row>
        <Field label="Scroll Height">
          <select style={s} value={section.scrollVh || 4} onChange={e => onUpdate('scrollVh', Number(e.target.value))}>
            <option value={2}>2× viewport</option>
            <option value={3}>3× viewport</option>
            <option value={4}>4× viewport (default)</option>
            <option value={5}>5× viewport</option>
            <option value={6}>6× viewport</option>
          </select>
        </Field>
        <Field label="Mobile Scroll Height">
          <select style={s} value={section.mobileScrollVh || ''} onChange={e => onUpdate('mobileScrollVh', e.target.value ? Number(e.target.value) : undefined)}>
            <option value="">— same as desktop —</option>
            <option value={1}>1× viewport</option>
            <option value={2}>2× viewport</option>
            <option value={3}>3× viewport</option>
            <option value={4}>4× viewport</option>
          </select>
        </Field>
        <Field label="Content top gap (desktop, px)">
          <input style={s} type="number" placeholder="Auto (centered)" min={0} max={400} value={section.stickyPaddingTop ?? ''} onChange={e => onUpdate('stickyPaddingTop', e.target.value !== '' ? Number(e.target.value) : undefined)} />
        </Field>
        <Field label="Sticky offset from top (desktop, px)">
          <input style={s} type="number" placeholder="Default (94 — clears navbar)" min={0} max={400} value={section.stickyTopOffset ?? ''} onChange={e => onUpdate('stickyTopOffset', e.target.value !== '' ? Number(e.target.value) : undefined)} />
        </Field>
        <Field label="Mobile sticky top (vh)">
          <input style={s} type="number" placeholder="0" min={0} max={80} value={section.mobileStickyTop ?? ''} onChange={e => onUpdate('mobileStickyTop', e.target.value !== '' ? Number(e.target.value) : undefined)} />
        </Field>
        <Field label="Mobile gap before (px)">
          <input style={s} type="number" placeholder="0" value={section.mobileGapBefore ?? ''} onChange={e => onUpdate('mobileGapBefore', e.target.value !== '' ? Number(e.target.value) : undefined)} />
        </Field>
        <Field label="Mobile gap after (px)">
          <input style={s} type="number" placeholder="0" value={section.mobileGapAfter ?? ''} onChange={e => onUpdate('mobileGapAfter', e.target.value !== '' ? Number(e.target.value) : undefined)} />
        </Field>
        <Field label="Start Frame %">
          <input style={s} type="number" min={0} max={99} value={section.scrollStart ?? 0} onChange={e => onUpdate('scrollStart', Math.max(0, Math.min(99, Number(e.target.value))))} />
        </Field>
        <Field label="Hold Start %">
          <input style={s} type="number" min={0} max={99} value={section.scrollHold ?? 0} onChange={e => onUpdate('scrollHold', Math.max(0, Math.min(99, Number(e.target.value))))} />
        </Field>
      </Row>

      {/* Frame upload */}
      <div>
        <input ref={fileInputRef} type="file" accept=".webp,.png,.jpg,.jpeg" multiple style={{display:'none'}} onChange={onFilePick} />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          style={{fontSize:'12px', border:'1px dashed var(--ed-input-border)', background:'var(--ed-input-bg)', color:'var(--ed-text-sub)', borderRadius:'8px', padding:'8px 14px', cursor: uploading ? 'default' : 'pointer', fontFamily:'inherit', width:'100%'}}
        >
          {uploading && uploadProgress
            ? `Uploading… ${uploadProgress.done} / ${uploadProgress.total}`
            : `Upload frames to /${folderName}/ (select all frame files at once)`}
        </button>
        {frameInfo && (
          <div style={{fontSize:'11px', color:'var(--ed-text-muted)', marginTop:'5px'}}>
            {frameInfo.count > 0
              ? `${frameInfo.count} frames found — ${frameInfo.frames[0]} … ${frameInfo.frames[frameInfo.frames.length - 1]}`
              : `No frames found in /${folderName}/`}
          </div>
        )}
      </div>

      {/* Crop & scale */}
      <Row>
        <Field label="Canvas Width (e.g. 60%, 500px)">
          <MaxWidthInput placeholder="Default (fill)" value={section.canvasMaxWidth} onChange={v => onUpdate('canvasMaxWidth', v)} />
        </Field>
        <Field label="Crop Frames">
          <button
            onClick={() => firstFrameSrc && setShowCrop(true)}
            disabled={!firstFrameSrc}
            style={{fontSize:'12px', border:'1px solid var(--ed-input-border)', background: section.canvasCrop ? 'var(--ed-accent)' : 'var(--ed-input-bg)', color: section.canvasCrop ? '#fff' : 'var(--ed-text-sub)', borderRadius:'8px', padding:'7px 14px', cursor: firstFrameSrc ? 'pointer' : 'default', fontFamily:'inherit', width:'100%'}}
          >
            {section.canvasCrop ? `Cropped (${Math.round(section.canvasCrop.x1)}–${Math.round(section.canvasCrop.x2)}% / ${Math.round(section.canvasCrop.y1)}–${Math.round(section.canvasCrop.y2)}%)` : 'Crop…'}
          </button>
        </Field>
      </Row>

      {showCrop && firstFrameSrc && (
        <CropEditor
          src={firstFrameSrc}
          initialCrop={section.canvasCrop || null}
          onSave={(crop, ratio) => { onUpdate('canvasCrop', crop); if (ratio) onUpdate('canvasAspect', ratio) }}
          onClose={() => setShowCrop(false)}
        />
      )}

      {/* Mobile overrides */}
      <div style={{borderTop:'1px solid var(--ed-input-border)', paddingTop:'12px', display:'flex', flexDirection:'column', gap:'10px'}}>
        <div style={{fontSize:'11px', fontWeight:600, color:'var(--ed-text-muted)', textTransform:'uppercase', letterSpacing:'0.06em'}}>Mobile Overrides</div>
        <Row>
          <Field label="Mobile Folder (optional)">
            {availFolders && availFolders.length > 0 ? (
              <select style={{...s, cursor:'pointer'}}
                value={section.mobileScrollFolder || ''}
                onChange={e => onUpdate('mobileScrollFolder', e.target.value || undefined)}
              >
                <option value="">— same as desktop —</option>
                {availFolders.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            ) : (
              <input style={s} value={section.mobileScrollFolder || ''} onChange={e => onUpdate('mobileScrollFolder', e.target.value || undefined)} placeholder="e.g. scroll-mobile" />
            )}
          </Field>
          <Field label="Mobile Frame Count">
            <input style={s} type="number" placeholder={section.frameCount || 72} value={section.mobileFrameCount || ''} onChange={e => onUpdate('mobileFrameCount', e.target.value ? parseInt(e.target.value) : undefined)} />
          </Field>
        </Row>
        <Row>
          <Field label="Mobile Crop">
            <button
              onClick={() => mobileFirstFrameSrc && setShowMobileCrop(true)}
              disabled={!mobileFirstFrameSrc}
              style={{fontSize:'12px', border:'1px solid var(--ed-input-border)', background: section.mobileCanvasCrop ? 'var(--ed-accent)' : 'var(--ed-input-bg)', color: section.mobileCanvasCrop ? '#fff' : 'var(--ed-text-sub)', borderRadius:'8px', padding:'7px 14px', cursor: mobileFirstFrameSrc ? 'pointer' : 'default', fontFamily:'inherit', width:'100%'}}
            >
              {section.mobileCanvasCrop ? `Cropped (${Math.round(section.mobileCanvasCrop.x1)}–${Math.round(section.mobileCanvasCrop.x2)}% / ${Math.round(section.mobileCanvasCrop.y1)}–${Math.round(section.mobileCanvasCrop.y2)}%)` : 'Mobile Crop…'}
            </button>
          </Field>
        </Row>
      </div>

      {showMobileCrop && mobileFirstFrameSrc && (
        <CropEditor
          src={mobileFirstFrameSrc}
          initialCrop={section.mobileCanvasCrop || null}
          onSave={(crop, ratio) => { onUpdate('mobileCanvasCrop', crop); if (ratio) onUpdate('mobileCanvasAspect', ratio) }}
          onClose={() => setShowMobileCrop(false)}
        />
      )}

      <LayoutPicker canvasValue={section.canvasPosition} onCanvasChange={v => onUpdate('canvasPosition', v)} />
      <BgColorField value={section.bgColor||''} onChange={v => onUpdate('bgColor', v)} />
      <Row>
        <PositionPicker value={section.textPosition} onChange={v => onUpdate('textPosition', v)} label="Text Align" />
        <Field label="Text Panel Width">
          <MaxWidthInput placeholder="Default (300px)" value={section.textMaxWidth} onChange={v => onUpdate('textMaxWidth', v)} />
        </Field>
      </Row>

      <TextLinesEditor
        lines={section.lines != null ? section.lines : autoConvertToLines(section)}
        onChange={lines => onUpdate('lines', lines)}
      />

      {/* Side Items */}
      <Row>
        <MaxWidthInput label="Side Items Width" placeholder="Default (280px)" value={section.sideItemsWidth} onChange={v => onUpdate('sideItemsWidth', v)} />
        <Field label="Side Items Align">
          <select style={s} value={section.sideItemsAlign || 'left'} onChange={e => onUpdate('sideItemsAlign', e.target.value)}>
            <option value="left">Left</option>
            <option value="center">Center</option>
          </select>
        </Field>
      </Row>
      <Row>
        <Field label="Mobile layout">
          <div style={{display:'flex', gap:'6px'}}>
            <button
              onClick={() => { onUpdate('mobileShowSideItems', false); onUpdate('mobileStatic', false) }}
              style={{flex:1, padding:'5px 8px', borderRadius:'6px', border:'1px solid var(--ed-input-border)', fontSize:'11px', fontFamily:'inherit', cursor:'pointer', fontWeight: (!section.mobileShowSideItems && !section.mobileStatic) ? 600 : 400, background: (!section.mobileShowSideItems && !section.mobileStatic) ? 'var(--ed-accent)' : 'var(--ed-input-bg)', color: (!section.mobileShowSideItems && !section.mobileStatic) ? '#fff' : 'var(--ed-text-sub)' }}
            >Tabs</button>
            <button
              onClick={() => { onUpdate('mobileShowSideItems', true); onUpdate('mobileStatic', false) }}
              style={{flex:1, padding:'5px 8px', borderRadius:'6px', border:'1px solid var(--ed-input-border)', fontSize:'11px', fontFamily:'inherit', cursor:'pointer', fontWeight: (section.mobileShowSideItems && !section.mobileStatic) ? 600 : 400, background: (section.mobileShowSideItems && !section.mobileStatic) ? 'var(--ed-accent)' : 'var(--ed-input-bg)', color: (section.mobileShowSideItems && !section.mobileStatic) ? '#fff' : 'var(--ed-text-sub)' }}
            >Side Items</button>
            <button
              onClick={() => onUpdate('mobileStatic', true)}
              style={{flex:1, padding:'5px 8px', borderRadius:'6px', border:'1px solid var(--ed-input-border)', fontSize:'11px', fontFamily:'inherit', cursor:'pointer', fontWeight: section.mobileStatic ? 600 : 400, background: section.mobileStatic ? 'var(--ed-accent)' : 'var(--ed-input-bg)', color: section.mobileStatic ? '#fff' : 'var(--ed-text-sub)' }}
            >Static (no scroll)</button>
          </div>
        </Field>
      </Row>
      <div>
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'8px'}}>
          <div style={{fontSize:'11px', fontWeight:600, color:'var(--ed-text-muted)', textTransform:'uppercase', letterSpacing:'0.06em'}}>
            Side Items {(section.sideItems?.length || 0) > 0 && <span style={{color:'var(--ed-accent)', marginLeft:4}}>({section.sideItems.length})</span>}
          </div>
          <button
            onClick={() => onUpdate('sideItems', [...(section.sideItems||[]), {title:'', subtitle:''}])}
            disabled={(section.sideItems?.length||0) >= 4}
            style={{fontSize:'11px', padding:'3px 10px', borderRadius:'6px', border:'1px solid var(--ed-input-border)', background:'var(--ed-input-bg)', color: (section.sideItems?.length||0) >= 4 ? 'var(--ed-text-xmuted)' : 'var(--ed-text-sub)', cursor: (section.sideItems?.length||0) >= 4 ? 'default' : 'pointer', fontFamily:'inherit', opacity: (section.sideItems?.length||0) >= 4 ? 0.5 : 1}}
          >{(section.sideItems?.length||0) >= 4 ? 'Max 4 items' : '+ Add item'}</button>
        </div>
        {(section.sideItems||[]).map((item, i) => {
          const updateItem = (key, val) => {
            const next = [...(section.sideItems||[])]
            next[i] = {...next[i], [key]: val}
            onUpdate('sideItems', next)
          }
          return (
            <div key={i} style={{marginBottom:'6px', background:'var(--ed-card-bg)', borderRadius:'8px', padding:'8px', display:'flex', flexDirection:'column', gap:'6px'}}>
              <div style={{display:'flex', gap:'6px', alignItems:'flex-start'}}>
                <div style={{flex:1, display:'flex', flexDirection:'column', gap:'5px'}}>
                  {/* Title */}
                  <div style={{fontSize:'10px', color:'var(--ed-text-xmuted)', fontWeight:600}}>TITLE</div>
                  <input style={{...s, fontWeight:600}} placeholder="Title text" value={item.title||''} onChange={e => updateItem('title', e.target.value)} />
                  <div style={{display:'flex', gap:'4px'}}>
                    <select style={{...s, flex:1}} value={item.titleSize||''} onChange={e => updateItem('titleSize', e.target.value || undefined)}>
                      <option value="">Default (22px)</option>
                      {['12px','14px','16px','17px','18px','20px','22px','24px','28px','32px','36px','40px','48px'].map(sz => <option key={sz} value={sz}>{sz}</option>)}
                    </select>
                    <input style={{...s, flex:1}} placeholder="Color (#111)" value={item.titleColor||''} onChange={e => updateItem('titleColor', e.target.value)} />
                  </div>
                  <div style={{display:'flex', gap:'4px', alignItems:'center'}}>
                    <span style={{fontSize:'10px', color:'var(--ed-text-xmuted)', flexShrink:0}}>Title–Body gap</span>
                    <select style={{...s, flex:1}} value={item.titleGap ?? ''} onChange={e => updateItem('titleGap', e.target.value !== '' ? Number(e.target.value) : undefined)}>
                      <option value="">Default (4px)</option>
                      {[0,2,4,6,8,10,12,16,20,24,28,32].map(v => <option key={v} value={v}>{v}px</option>)}
                    </select>
                  </div>
                  {/* Body */}
                  <div style={{fontSize:'10px', color:'var(--ed-text-xmuted)', fontWeight:600, marginTop:'2px'}}>BODY</div>
                  <TextField value={item.subtitle||''} onChange={v => updateItem('subtitle', v)} multiline rows={3} rich />
                  <div style={{display:'flex', gap:'4px'}}>
                    <select style={{...s, flex:1}} value={item.subtitleSize||''} onChange={e => updateItem('subtitleSize', e.target.value || undefined)}>
                      <option value="">Default (17px)</option>
                      {['10px','11px','12px','13px','14px','15px','16px','17px','18px','20px','22px','24px'].map(sz => <option key={sz} value={sz}>{sz}</option>)}
                    </select>
                    <input style={{...s, flex:1}} placeholder="Color (#888)" value={item.subtitleColor||''} onChange={e => updateItem('subtitleColor', e.target.value)} />
                  </div>
                  {/* Spacing & Image height */}
                  <div style={{display:'flex', gap:'4px', marginTop:'2px'}}>
                    <div style={{flex:1}}>
                      <div style={{fontSize:'10px', color:'var(--ed-text-xmuted)', marginBottom:'3px'}}>Gap after (px)</div>
                      <input style={s} type="number" placeholder="40" min={0} max={200} value={item.gapAfter ?? ''} onChange={e => updateItem('gapAfter', e.target.value ? Number(e.target.value) : undefined)} />
                    </div>
                    {item.image && (
                      <div style={{flex:1}}>
                        <div style={{fontSize:'10px', color:'var(--ed-text-xmuted)', marginBottom:'3px'}}>Image height (px)</div>
                        <input style={s} type="number" placeholder="120" min={20} max={600} value={item.imageHeight||''} onChange={e => updateItem('imageHeight', e.target.value ? Number(e.target.value) : null)} />
                      </div>
                    )}
                  </div>
                </div>
                <button onClick={() => { const next = [...(section.sideItems||[])]; next.splice(i,1); onUpdate('sideItems', next) }} style={{fontSize:'14px', background:'none', border:'none', color:'var(--ed-text-xmuted)', cursor:'pointer', padding:'2px 4px', lineHeight:1, flexShrink:0}}>×</button>
              </div>
              {/* Image picker from sections folder */}
              {sectionImages.length > 0 && (
                <div>
                  <div style={{fontSize:'10px', color:'var(--ed-text-xmuted)', marginBottom:'4px'}}>Image (optional)</div>
                  <div style={{display:'flex', flexWrap:'wrap', gap:'4px', alignItems:'center'}}>
                    <div onClick={() => updateItem('image', null)} style={{width:32, height:32, border:`1.5px solid ${!item.image ? '#0070f3' : 'rgba(0,0,0,0.12)'}`, borderRadius:5, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', fontSize:9, color:'#aaa', background: !item.image ? 'rgba(0,112,243,0.07)' : 'var(--ed-input-bg)', flexShrink:0}}>none</div>
                    {sectionImages.map(f => (
                      <div key={f.name} title={f.name} onClick={() => updateItem('image', f.name)} style={{width:32, height:32, border:`1.5px solid ${item.image === f.name ? '#0070f3' : 'rgba(0,0,0,0.1)'}`, borderRadius:5, overflow:'hidden', cursor:'pointer', background: item.image === f.name ? 'rgba(0,112,243,0.07)' : 'var(--ed-input-bg)', flexShrink:0}}>
                        <img src={`/assets/projects/${category}/${id}/sections/${f.name}`} alt={f.name} style={{width:'100%', height:'100%', objectFit:'cover'}} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div style={{fontSize:'11px', color:'var(--ed-text-muted)', borderRadius:'6px', padding:'6px 10px', fontFamily:'monospace', background:'var(--ed-card-bg)'}}>
        {folderName}/frame-0001.[webp|png|jpg] … frame-{String(section.frameCount || 72).padStart(4, '0')}.*
      </div>
    </div>
  )
}

function DropZone({ label, src, onFile }) {
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef(null)

  const upload = (file) => {
    if (!file || !file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = (e) => {
      const base64 = e.target.result.split(',')[1]
      onFile({ name: file.name, data: base64 })
    }
    reader.readAsDataURL(file)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
      <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ed-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); upload(e.dataTransfer.files[0]) }}
        style={{
          width: '120px', height: '120px', borderRadius: '12px', overflow: 'hidden', cursor: 'pointer',
          border: dragging ? '2px dashed #0087ED' : '2px dashed var(--ed-input-border)',
          background: dragging ? '#f0f7ff' : 'var(--ed-block-bg)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s',
          position: 'relative',
        }}
      >
        {src
          ? <img src={`${src}?t=${Date.now()}`} style={{ width: '100%', height: '100%', objectFit: 'contain' }} alt={label} />
          : <span style={{ fontSize: '11px', color: 'var(--ed-text-xmuted)', textAlign: 'center', lineHeight: 1.5 }}>Click or<br/>drag</span>
        }
      </div>
      <div style={{ fontSize: '10px', color: 'var(--ed-text-xmuted)' }}>{src ? src.split('/').pop() : 'none'}</div>
      <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }}
        onChange={e => { upload(e.target.files[0]); e.target.value = '' }} />
    </div>
  )
}

export function AllThumbnailCard({ type, category, id }) {
  const [paths, setPaths] = useState({ src: null, hoverSrc: null })
  const [status, setStatus] = useState({})

  const refresh = () => {
    fetch(`${API}/all-thumbnail/${type}/${category}/${id}?t=${Date.now()}`)
      .then(r => r.json())
      .then(setPaths)
  }

  useEffect(() => { refresh() }, [type, category, id])

  const handleFile = async (slot, { name, data }) => {
    setStatus(s => ({ ...s, [slot]: 'saving' }))
    const res = await fetch(`${API}/all-thumbnail/${type}/${category}/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slot, name, data })
    })
    const d = await res.json()
    if (d.ok) {
      setStatus(s => ({ ...s, [slot]: 'done' }))
      setTimeout(() => setStatus(s => ({ ...s, [slot]: null })), 2000)
      refresh()
    }
  }

  return (
    <Card title="All Thumbnail (Grid)" collapsible defaultOpen={false}>
      <div style={{ display: 'flex', gap: '32px', alignItems: 'flex-start' }}>
        <DropZone label="Default" src={paths.src} onFile={f => handleFile('main', f)} />
        <DropZone label="Hover" src={paths.hoverSrc} onFile={f => handleFile('hover', f)} />
        <div style={{ fontSize: '11px', color: 'var(--ed-text-xmuted)', alignSelf: 'flex-end', paddingBottom: '24px', lineHeight: 1.8 }}>
          <div>{category}-{id}.ext</div>
          <div>{category}-{id}-hover.ext <span style={{opacity:0.6}}>(gif supported — animates on hover)</span></div>
          <div style={{ marginTop: '4px', opacity: 0.7 }}>Shown in All / category grid — cropped to the site's All-tab image ratio (currently set under All Projects → Layout)</div>
          <div style={{ marginTop: '4px', opacity: 0.7 }}>Recommended: ~1920×1080 (16:9) or larger, 2x for retina (3840×2160)</div>
          {(status.main === 'done' || status.hover === 'done') && <div style={{ color: '#1e8e3e', marginTop: '6px' }}>✓ Saved</div>}
        </div>
      </div>
    </Card>
  )
}

export function ThumbnailIconCard({ type, category, id }) {
  const [paths, setPaths] = useState({ main: null, hover: null })
  const [status, setStatus] = useState({})

  const refresh = () => {
    fetch(`${API}/thumbnail/${type}/${category}/${id}?t=${Date.now()}`)
      .then(r => r.json())
      .then(setPaths)
  }

  useEffect(() => { refresh() }, [type, category, id])

  const handleFile = async (slot, { name, data }) => {
    setStatus(s => ({ ...s, [slot]: 'saving' }))
    const res = await fetch(`${API}/thumbnail/${type}/${category}/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slot, name, data })
    })
    const d = await res.json()
    if (d.ok) {
      setStatus(s => ({ ...s, [slot]: 'done' }))
      setTimeout(() => setStatus(s => ({ ...s, [slot]: null })), 2000)
      refresh()
    }
  }

  return (
    <Card title="Thumbnail Icon" collapsible defaultOpen={false}>
      <div style={{ display: 'flex', gap: '32px', alignItems: 'flex-start' }}>
        <DropZone label="Default" src={paths.main} onFile={f => handleFile('main', f)} />
        <DropZone label="Hover" src={paths.hover} onFile={f => handleFile('hover', f)} />
        <div style={{ fontSize: '11px', color: 'var(--ed-text-xmuted)', alignSelf: 'flex-end', paddingBottom: '24px', lineHeight: 1.8 }}>
          <div>{id}-thumbnail.ext</div>
          <div>{id}-thumbnail-hover.ext</div>
          {(status.main === 'done' || status.hover === 'done') && (
            <div style={{ color: '#1e8e3e', marginTop: '6px' }}>✓ Saved</div>
          )}
        </div>
      </div>
    </Card>
  )
}

export default function EditorProject() {
  const { category, id } = useParams()
  const navigate = useNavigate()
  const [info, setInfo] = useState(null)
  const [images, setImages] = useState([])
  const [hoverImages, setHoverImages] = useState([])
  const [mobileImages, setMobileImages] = useState([])
  const [tabletImages, setTabletImages] = useState([])
  const [videos, setVideos] = useState([])
  const [videoCropEditorFor, setVideoCropEditorFor] = useState(null)
  const [tags, setTags] = useState([])
  const [year, setYear] = useState('')
  const [title, setTitle] = useState('')
  const [saved, setSaved] = useState(false)
  const [collapsed, setCollapsed] = useState({})
  const [dragIdx, setDragIdx] = useState(null)
  const [dropIdx, setDropIdx] = useState(null)
  const dragIdxRef = useRef(null)
  const [hidden, setHidden] = useState(false)
  const [featured, setFeatured] = useState(true)
  const [editCategory, setEditCategory] = useState(category)
  const [scrollToSection, setScrollToSection] = useState(null)

  // Jump from a Sections Overview chip to that section's edit form: expand it
  // if collapsed, then scroll to it once the expand has actually rendered
  // (collapsed is a dependency so this reruns after that layout change lands).
  useEffect(() => {
    if (scrollToSection == null) return
    const el = document.getElementById(`ed-section-${scrollToSection}`)
    // Expanding a collapsed section changes its height by thousands of px in
    // the same tick this effect runs. A `smooth` scroll started right as that
    // layout shift lands gets its target invalidated mid-animation and simply
    // never moves — `instant` sidesteps that entirely.
    if (el) el.scrollIntoView({ behavior: 'instant', block: 'start' })
    setScrollToSection(null)
  }, [scrollToSection, collapsed])

  const jumpToSection = (si) => {
    setCollapsed(c => {
      if (!c[si]) return c
      const next = { ...c, [si]: false }
      safeSet(collapseStorageKey, JSON.stringify(next))
      return next
    })
    setScrollToSection(si)
  }
  useProfolioSectionSelect(jumpToSection)

  // Section TOC on/off, remembered across visits.
  const [showSectionToc, setShowSectionToc] = useState(() => safeGet('editor-show-section-toc') !== '0')
  const toggleSectionToc = () => setShowSectionToc(v => { safeSet('editor-show-section-toc', v ? '0' : '1'); return !v })

  const basePath        = `/assets/projects/${category}/${id}/sections`
  const hoverBasePath   = `/assets/projects/${category}/${id}/hover`
  const mobileBasePath  = `/assets/projects/${category}/${id}/mobile`
  const tabletBasePath  = `/assets/projects/${category}/${id}/tablet`
  const iconsBase       = `/assets/projects/${category}/${id}/icons`

  const refreshImages       = useCallback(() => fetch(`${API}/images/${category}/${id}`).then(r => r.json()).then(setImages), [category, id])
  const refreshHoverImages  = useCallback(() => fetch(`${API}/images/${category}/${id}/hover`).then(r => r.json()).then(setHoverImages), [category, id])
  const refreshMobileImages = useCallback(() => fetch(`${API}/images/${category}/${id}/mobile`).then(r => r.json()).then(setMobileImages), [category, id])
  const refreshTabletImages = useCallback(() => fetch(`${API}/images/${category}/${id}/tablet`).then(r => r.json()).then(setTabletImages), [category, id])
  const refreshVideos       = useCallback(() => fetch(`${API}/videos/${category}/${id}`).then(r => r.json()).then(setVideos), [category, id])

  const collapseStorageKey = `editor-collapsed-project-${category}-${id}`

  useEffect(() => {
    fetch(`${API}/info/${category}/${id}`).then(r => r.json()).then(d => {
      setInfo(d)
      // A malformed stored value here (e.g. corrupted after an earlier
      // interrupted write) used to throw a SyntaxError from inside this
      // fetch .then() — an unhandled rejection that React can't recover
      // from as a render error, so the section list never populated and the
      // only fix was clearing site data. Falling back to null instead just
      // means every section starts collapsed, which is what happens anyway
      // when nothing was ever saved.
      let saved = null
      try { saved = JSON.parse(safeGet(`editor-collapsed-project-${category}-${id}`) || 'null') } catch { /* corrupted — fall back to null */ }
      const c = {}
      ;(d.sections || []).forEach((_, i) => { c[i] = saved && i in saved ? saved[i] : true })
      setCollapsed(c)
    })
    refreshImages()
    refreshHoverImages()
    refreshMobileImages()
    refreshTabletImages()
    refreshVideos()
    fetch(`${API}/projects`).then(r => r.json()).then(list => {
      const entry = list.find(p => p.category === category && p.id === id)
      setHidden(!!entry?.hidden)
      setFeatured(entry?.featured !== false)
      setTags(entry?.tags || [])
      setYear(entry?.year || '')
      setTitle(entry?.title || '')
    })
  }, [category, id])

  useEffect(() => {
    const onFocus = () => { refreshImages(); refreshHoverImages(); refreshMobileImages(); refreshTabletImages(); refreshVideos() }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refreshImages, refreshHoverImages, refreshMobileImages, refreshTabletImages, refreshVideos])

  useEffect(() => { setEditCategory(category) }, [category])

  const [knownCategories, setKnownCategories] = useState([])
  useEffect(() => {
    fetch(`${API}/projects`)
      .then(r => r.json())
      .then(list => setKnownCategories([...new Set(list.map(p => p.category))].sort()))
      .catch(() => {})
  }, [])

  const moveCategory = async () => {
    const target = editCategory.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    if (!target) return alert('Category name is required')
    if (!confirm(`Move category from "${category}" → "${target}"?\n(Folder and thumbnail files will also be moved.)`)) return
    const res = await fetch(`${API}/project-category/${category}/${id}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newCategory: target })
    })
    if (!res.ok) { alert('Move failed'); return }
    navigate(`/editor/projects/${target}/${id}`)
  }

  const save = async () => {
    // fetch() only rejects on a network failure — a 404/400 response (e.g.
    // this project's category was renamed elsewhere and this tab is still
    // on the old URL) resolves normally, so Promise.all here used to swallow
    // a failed write silently and still flash "Saved". Checking res.ok per
    // request surfaces that instead of lying about what got persisted.
    const [infoRes, tagsRes, yearRes, titleRes] = await Promise.all([
      fetch(`${API}/info/${category}/${id}`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(info) }),
      fetch(`${API}/project-tags/${category}/${id}`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ tags }) }),
      fetch(`${API}/project-year/${category}/${id}`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ year }) }),
      fetch(`${API}/project-title/${category}/${id}`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ title }) }),
    ])
    const failed = [['Info', infoRes], ['Tags', tagsRes], ['Year', yearRes], ['Title', titleRes]].filter(([, r]) => !r.ok)
    if (failed.length) {
      alert(`Save failed for: ${failed.map(([label]) => label).join(', ')}.\n\nThis usually means "${category}/${id}" no longer exists under that URL (e.g. its category was renamed elsewhere). Reopen this project from the sidebar and try again.`)
      return
    }
    try { const bc = new BroadcastChannel('nnwoo-content'); bc.postMessage({ category, id }); bc.close() } catch { /* unsupported */ }
    setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  const updateMeta    = (key, val) => setInfo(i => ({...i, [key]: val}))
  const updateSection = (si, key, val) => setInfo(i => { const sections = [...i.sections]; sections[si] = {...sections[si], [key]: val}; return {...i, sections} })
  const updateOverlay = (si, key, val) => setInfo(i => { const sections = [...i.sections]; const overlay = {...(sections[si].overlay || {}), [key]: val}; sections[si] = {...sections[si], overlay}; return {...i, sections} })
  const updateBlock   = (si, bi, key, val) => setInfo(i => { const sections = [...i.sections]; const blocks = [...(sections[si].blocks||[])]; blocks[bi] = {...blocks[bi], [key]: val}; sections[si] = {...sections[si], blocks}; return {...i, sections} })
  const addSection    = () => setInfo(i => { const sections = [...(i.sections||[]), emptySection()]; setCollapsed(c => { const next = {...c, [sections.length-1]: false}; safeSet(collapseStorageKey, JSON.stringify(next)); return next }); return {...i, sections} })
  const removeSection    = (si) => setInfo(i => ({...i, sections: i.sections.filter((_,idx) => idx !== si)}))
  const duplicateSection = (si) => setInfo(i => { const sections = [...i.sections]; const copy = JSON.parse(JSON.stringify(sections[si])); copy.id = copy.id ? copy.id + '-copy' : ''; sections.splice(si + 1, 0, copy); return {...i, sections} })
  const moveSection   = (si, dir) => setInfo(i => { const sections = [...i.sections]; const t = si+dir; if(t<0||t>=sections.length) return i; [sections[si],sections[t]]=[sections[t],sections[si]]; return {...i, sections} })
  const reorderSection = (from, to) => {
    if (from == null || to == null || from === to) return
    setInfo(i => { const sections = [...i.sections]; const [moved] = sections.splice(from, 1); sections.splice(to, 0, moved); return {...i, sections} })
    setCollapsed(c => {
      const next = remapCollapsedOnReorder(c, from, to, (info.sections || []).length)
      safeSet(collapseStorageKey, JSON.stringify(next)); return next
    })
  }
  const addBlock      = (si) => setInfo(i => { const sections = [...i.sections]; sections[si] = {...sections[si], blocks: [...(sections[si].blocks||[]), emptyBlock()]}; return {...i, sections} })
  const removeBlock     = (si, bi) => setInfo(i => { const sections = [...i.sections]; sections[si] = {...sections[si], blocks: sections[si].blocks.filter((_,idx) => idx !== bi)}; return {...i, sections} })
  const duplicateBlock  = (si, bi) => setInfo(i => { const sections = [...i.sections]; const blocks = [...(sections[si].blocks||[])]; blocks.splice(bi + 1, 0, JSON.parse(JSON.stringify(blocks[bi]))); sections[si] = {...sections[si], blocks}; return {...i, sections} })
  const moveBlock       = (si, bi, dir) => setInfo(i => { const sections = [...i.sections]; const blocks = [...(sections[si].blocks||[])]; const j = bi + dir; if (j < 0 || j >= blocks.length) return i; [blocks[bi], blocks[j]] = [blocks[j], blocks[bi]]; sections[si] = {...sections[si], blocks}; return {...i, sections} })

  const collapseAll = () => { const c = {}; (info.sections||[]).forEach((_,i) => {c[i]=true}); safeSet(collapseStorageKey, JSON.stringify(c)); setCollapsed(c) }
  const expandAll   = () => { safeSet(collapseStorageKey, JSON.stringify({})); setCollapsed({}) }

  const toggleHidden = async () => {
    const next = !hidden
    try {
      const res = await fetch(`${API}/project-hidden/${category}/${id}`, {
        method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ hidden: next })
      })
      if (!res.ok) throw new Error(`${res.status}`)
      setHidden(next)
    } catch (e) {
      alert(`Failed to hide: ${e.message}\nPlease check that the server is running.`)
    }
  }

  const toggleFeatured = async () => {
    const next = !featured
    try {
      const res = await fetch(`${API}/project-featured/${category}/${id}`, {
        method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ featured: next })
      })
      if (!res.ok) throw new Error(`${res.status}`)
      setFeatured(next)
    } catch (e) {
      alert(`Failed to update Featured: ${e.message}\nPlease check that the server is running.`)
    }
  }

  const deleteProject = async () => {
    if (!confirm(`Permanently delete "${info.title || id}"?\n\nThis removes it from the project list AND deletes its entire asset folder (all images, video, sections). This cannot be undone from the editor.\n\nType-checked below — click OK only if you're sure.`)) return
    if (!confirm(`Really delete "${category}/${id}"? Last chance to cancel.`)) return
    try {
      const res = await fetch(`${API}/project-delete/${category}/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error(`${res.status}`)
      // EditorLayout's own sidebar/quick-nav project list is fetched once on
      // mount and otherwise only refreshed on this event (see EditorAllItems
      // — the same one fires after adding/removing a category) — without it
      // the just-deleted project keeps showing there until a full reload.
      window.dispatchEvent(new CustomEvent('categories-changed'))
      navigate(`/editor/projects-cat/${category}`)
    } catch (e) {
      alert(`Failed to delete: ${e.message}\nPlease check that the server is running.`)
    }
  }

  const [showBackups, setShowBackups] = useState(false)
  const [backups, setBackups] = useState([])

  const scrollStorageKey = `editor-scroll-${category}-${id}`

  // Restore last scroll position on load
  useEffect(() => {
    const saved = sessionStorage.getItem(scrollStorageKey)
    if (saved) { requestAnimationFrame(() => window.scrollTo(0, Number(saved))) }
    const onScroll = () => sessionStorage.setItem(scrollStorageKey, String(window.scrollY))
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [scrollStorageKey])

  const openBackups = async () => {
    const data = await fetch(`${API}/backups/${category}/${id}`).then(r => r.json())
    setBackups(data)
    setShowBackups(true)
  }

  const restoreBackup = async (filename) => {
    if (!confirm(`Restore backup from "${formatTs(filename)}"?\nCurrent unsaved changes will be lost. (You still need to Save.)`)) return
    const data = await fetch(`${API}/backups/${category}/${id}/${filename}`).then(r => r.json())
    setInfo(data)
    setShowBackups(false)
  }

  const formatTs = (filename) => {
    // 2025-06-13T15-30-00-000Z.json → 2025.06.13 15:30:00
    try {
      const s = filename.replace('.json', '')
      const iso = s.replace(/T(\d{2})-(\d{2})-(\d{2})-\d+Z/, 'T$1:$2:$3Z')
      const d = new Date(iso)
      return d.toLocaleString('ko-KR', { year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit' })
    } catch { return filename }
  }

  if (!info) return <div style={{padding:'40px', color:'var(--ed-text-xmuted)'}}>Loading...</div>

  return (
    <div className="ed-page">
      <EditorTopbar title={`${category} / ${id}`} onSave={save} saved={saved} extra={
        <div style={{display:'flex', gap:'6px'}}>
          {(() => {
            const icoBtn = (onClick, title, svg, active) => (
              <button onClick={onClick} title={title} style={{border: active ? '1px solid var(--ed-accent)' : '1px solid var(--ed-input-border)', background: active ? 'var(--ed-accent)' : 'var(--ed-input-bg)', borderRadius:'6px', padding:'5px 7px', cursor:'pointer', color: active ? '#fff' : 'var(--ed-text-sub)', display:'flex', alignItems:'center'}}>
                {svg}
              </button>
            )
            return (<>
              {icoBtn(collapseAll, 'Collapse All', <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="5" x2="7.5" y2="10"/><line x1="12" y1="5" x2="7.5" y2="10"/></svg>)}
              {icoBtn(expandAll,   'Expand All',   <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="10" x2="7.5" y2="5"/><line x1="12" y1="10" x2="7.5" y2="5"/></svg>)}
              {icoBtn(openBackups, 'Load Backup',  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 7.5A5.5 5.5 0 1 1 7.5 13"/><polyline points="2,4.5 2,7.5 5,7.5"/></svg>)}
              {icoBtn(toggleSectionToc, showSectionToc ? 'Hide Section TOC' : 'Show Section TOC', <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="3" cy="4" r="1" fill="currentColor" stroke="none"/><circle cx="3" cy="7.5" r="1" fill="currentColor" stroke="none"/><circle cx="3" cy="11" r="1" fill="currentColor" stroke="none"/><line x1="6.5" y1="4" x2="13" y2="4"/><line x1="6.5" y1="7.5" x2="13" y2="7.5"/><line x1="6.5" y1="11" x2="13" y2="11"/></svg>, showSectionToc)}
              {icoBtn(() => {
                if (!confirm('Apply recommended spacing to every section?\n\n80px between topics, 0px between a text/title section and the content directly under it. This overwrites each section\'s current Spacing Top/Bottom.')) return
                setInfo(i => ({ ...i, sections: computeRecommendedSpacing(i.sections || []) }))
              }, 'Apply Recommended Spacing (80px between topics, 0px title-to-content)', <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="2" y1="3" x2="13" y2="3"/><line x1="2" y1="7.5" x2="9" y2="7.5"/><line x1="2" y1="12" x2="13" y2="12"/></svg>)}
            </>)
          })()}
          <button onClick={toggleHidden} title={hidden ? 'Hidden — click to make visible' : 'Visible — click to hide'} style={{
            border: hidden ? '1px solid #ffc8c8' : '1px solid var(--ed-input-border)',
            borderRadius:'6px', padding:'5px 7px', cursor:'pointer',
            background: hidden ? '#fff0f0' : 'var(--ed-input-bg)',
            color: hidden ? '#e53e3e' : 'var(--ed-text-sub)',
            transition:'all 0.15s', display:'flex', alignItems:'center',
          }}>
            {hidden
              ? <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 1l13 13"/><path d="M6.5 3.5C4 4.5 2 7.5 2 7.5s2.5 4 5.5 4c1.2 0 2.3-.5 3.2-1.2"/><path d="M10.5 10.5C12 9.5 13 7.5 13 7.5s-2.5-4-5.5-4"/></svg>
              : <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 7.5S4.5 3 7.5 3s5.5 4.5 5.5 4.5S10.5 12 7.5 12 2 7.5 2 7.5z"/><circle cx="7.5" cy="7.5" r="1.5"/></svg>
            }
          </button>
          <select
            value={info.toc === true ? 'on' : info.toc === false ? 'off' : 'default'}
            onChange={e => updateMeta('toc', e.target.value === 'on' ? true : e.target.value === 'off' ? false : undefined)}
            title="Section TOC on this page — Default follows the site-wide setting (Home editor → TOC Settings)"
            style={{ border:'1px solid var(--ed-input-border)', borderRadius:'6px', padding:'4px 6px', fontSize:'11px', fontFamily:'inherit', background:'var(--ed-input-bg)', color:'var(--ed-text-sub)', cursor:'pointer' }}
          >
            <option value="default">TOC: Default</option>
            <option value="on">TOC: On</option>
            <option value="off">TOC: Off</option>
          </select>
          <button onClick={() => updateMeta('maintenance', !info.maintenance)} title={info.maintenance ? 'Under maintenance — click to make this page public again' : 'Public — click to put just this page under maintenance'} style={{
            border: info.maintenance ? '1px solid #ffc8c8' : '1px solid var(--ed-input-border)',
            borderRadius:'6px', padding:'5px 7px', cursor:'pointer',
            background: info.maintenance ? '#fff0f0' : 'var(--ed-input-bg)',
            color: info.maintenance ? '#e53e3e' : 'var(--ed-text-sub)',
            transition:'all 0.15s', display:'flex', alignItems:'center',
          }}>
            {info.maintenance ? '🔒' : '🌐'}
          </button>
          <button onClick={deleteProject} title="Permanently delete this project (removes it from the list and deletes its whole asset folder — cannot be undone from the editor)" style={{
            border: '1px solid #ffc8c8', borderRadius:'6px', padding:'5px 7px', cursor:'pointer',
            background: '#fff0f0', color: '#e53e3e',
            transition:'all 0.15s', display:'flex', alignItems:'center',
          }}>
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 4h10"/><path d="M5.5 4V2.5h4V4"/><path d="M3.5 4l.5 8.5a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1l.5-8.5"/><line x1="6.5" y1="6.5" x2="6.5" y2="10.5"/><line x1="8.5" y1="6.5" x2="8.5" y2="10.5"/></svg>
          </button>
        </div>
      } />

      {/* The page header above just shows "{category}/{id}" — the folder
          slug, which can't be changed here. The actual display name (Title,
          used in nav/cards/the category page) used to live only inside the
          collapsed-by-default Overview card far below, which made it very
          hard to find. Surfacing it right under the header, always visible,
          fixes that — same `title`/`setTitle` state as the field still in
          Overview, so either one stays in sync and Save persists it. */}
      <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
        <label style={{fontSize:'12px', fontWeight:600, color:'var(--ed-text-muted)', flexShrink:0}}>Title</label>
        <input
          style={{border:'1px solid var(--ed-input-border)', borderRadius:'8px', padding:'8px 12px', fontSize:'14px', fontWeight:600, fontFamily:'inherit', color:'var(--ed-text)', background:'var(--ed-input-bg)', outline:'none', width:'320px', maxWidth:'100%', boxSizing:'border-box'}}
          value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Desk Lamp"
        />
        <button onClick={toggleFeatured} title={featured ? 'Shown in the Featured tab — click to remove' : 'Not in the Featured tab — click to add'} style={{
          border: `1px solid ${featured ? 'var(--ed-accent)' : 'var(--ed-input-border)'}`,
          borderRadius:'8px', padding:'7px 12px', cursor:'pointer', fontFamily:'inherit', fontSize:'12px', fontWeight:600, flexShrink:0,
          background: featured ? 'color-mix(in srgb, var(--ed-accent) 12%, transparent)' : 'var(--ed-input-bg)',
          color: featured ? 'var(--ed-accent)' : 'var(--ed-text-muted)',
        }}>
          {featured ? '★ Featured' : '☆ Not featured'}
        </button>
      </div>

      {/* Section TOC — a vertical dot nav, `position: sticky` within this
          flex row rather than `position: fixed` against the viewport. Sticky
          positions itself relative to normal document flow, so it needs no
          left-offset tracking at all: the editor's collapsible sidebar
          reflows this whole row like anything else on the page, for free.
          (The earlier fixed version had to poll the sidebar's width because
          it doesn't resize .ed-page or use a CSS transition — sticky sidesteps
          that entire class of problem.) */}
      <div style={{ display:'flex', gap:'14px', alignItems:'flex-start' }}>
        {showSectionToc && (info.sections||[]).length > 0 && (
          <nav
            className="detail-toc toc-visible ed-section-toc"
            style={{ position:'sticky', top:'88px', left:'auto', transform:'none', flexShrink:0, maxHeight:'calc(100vh - 140px)', overflowY:'auto', overscrollBehavior:'contain', scrollbarWidth:'none' }}
          >
            {(info.sections||[]).map((section, si) => (
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

      {/* Backup panel */}
      {showBackups && (
        <div style={{border:'1px solid var(--ed-card-border)', borderRadius:'12px', background:'var(--ed-head-bg)', padding:'16px 20px', display:'flex', flexDirection:'column', gap:'10px'}}>
          <div style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
            <span style={{fontSize:'13px', fontWeight:600, color:'var(--ed-text)'}}>Backups</span>
            <button onClick={() => setShowBackups(false)} style={{background:'none', border:'none', color:'var(--ed-text-xmuted)', cursor:'pointer', fontSize:'16px'}}>✕</button>
          </div>
          {backups.length === 0 && (
            <div style={{fontSize:'13px', color:'var(--ed-text-xmuted)'}}>No backups. Created automatically on Save.</div>
          )}
          {backups.map(b => (
            <div key={b.name} style={{display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 12px', background:'var(--ed-card-bg)', borderRadius:'8px', border:'1px solid var(--ed-card-border)'}}>
              <span style={{fontSize:'12px', color:'var(--ed-text-sub)', fontFamily:'monospace'}}>{formatTs(b.name)}</span>
              <button
                onClick={() => restoreBackup(b.name)}
                style={{background:'#111', color:'#fff', border:'none', borderRadius:'6px', padding:'5px 12px', fontSize:'12px', cursor:'pointer', fontFamily:'inherit'}}
              >Load</button>
            </div>
          ))}
          <div style={{fontSize:'11px', color:'var(--ed-text-xmuted)'}}>Click Save after loading to apply changes.</div>
        </div>
      )}

      <Card title="Overview" collapsible defaultOpen={false}>
        <ImageField label="Hero Image" value={info.heroImage || `/assets/projects/${category}/${id}/hero`} onChange={v => updateMeta('heroImage', v || undefined)} />
        <ImageField label="Hero Image (Mobile override)" value={info.heroMobileImage||''} onChange={v => updateMeta('heroMobileImage', v || undefined)} />
        <ImageField label="Hero Image (Tablet override — optional, empty falls back to Tablet Images below)" value={info.heroTabletImage||''} onChange={v => updateMeta('heroTabletImage', v || undefined)} />
        <Field label="Tablet Images (default) — desktop or mobile set to fall back to at tablet width, when a block has no dedicated Tablet Override image">
          <select style={s} value={info.tabletImageMode || 'mobile'} onChange={e => updateMeta('tabletImageMode', e.target.value)}>
            <option value="mobile">Mobile</option>
            <option value="desktop">Desktop</option>
          </select>
        </Field>
        {/* Title now lives in the always-visible field under the page header
            (same state) — moved out of here since this card is collapsed by
            default, which made Title hard to find. */}
        <TextField label="Nav Label (default: title — year)" value={info.navLabel||''} onChange={v => updateMeta('navLabel', v)} size={info.navLabelSize||''} onSize={v => updateMeta('navLabelSize', v)} weight={info.navLabelWeight||''} onWeight={v => updateMeta('navLabelWeight', v)} italic={info.navLabelItalic} onItalic={v => updateMeta('navLabelItalic', v)} sizePlaceholder="Default (13px)" weightPlaceholder="Default (600)" />
        <TextField label="Overview Title" value={info.overviewTitle||''} onChange={v => updateMeta('overviewTitle', v)} size={info.overviewTitleSize||''} onSize={v => updateMeta('overviewTitleSize', v)} sizePlaceholder="Default (22px)" weight={info.overviewTitleWeight||''} onWeight={v => updateMeta('overviewTitleWeight', v)} weightPlaceholder="Default (700)" italic={info.overviewTitleItalic} onItalic={v => updateMeta('overviewTitleItalic', v)} />
        <TierSizeRow label="Overview Title" size={info.overviewTitleSize}
          tabletValue={info.overviewTitleSizeTablet} onTablet={v => updateMeta('overviewTitleSizeTablet', v)}
          mobileValue={info.overviewTitleSizeMobile} onMobile={v => updateMeta('overviewTitleSizeMobile', v)} />
        <ImageField
          label="Overview Logo (SVG or image, optional — replaces the text title above with this image when set)"
          value={info.overviewLogo || ''}
          onChange={v => updateMeta('overviewLogo', v || undefined)}
          uploadUrl={`${API}/images/${category}/${id}/sections/upload`}
          uploadDir={`/assets/projects/${category}/${id}/sections`}
          accept="image/*,.svg"
        />
        {info.overviewLogo && (
          <Field label="Logo Height (px)">
            <input style={s} type="number" min="0" placeholder="Default (40)" value={info.overviewLogoHeight ?? ''} onChange={e => updateMeta('overviewLogoHeight', e.target.value !== '' ? Number(e.target.value) : undefined)} />
          </Field>
        )}
        <Row>
          <Field label="Gap — Overview Title to Sub Title — desktop (px)">
            <input style={s} type="number" min="0" placeholder="Default (16)" value={info.overviewTitleGap ?? ''} onChange={e => updateMeta('overviewTitleGap', e.target.value !== '' ? Number(e.target.value) : undefined)} />
          </Field>
          <Field label="Gap — Overview Title to Sub Title — tablet (px)">
            <input style={s} type="number" min="0" placeholder="Same as desktop" value={info.overviewTitleGapTablet ?? ''} onChange={e => updateMeta('overviewTitleGapTablet', e.target.value !== '' ? Number(e.target.value) : undefined)} />
          </Field>
          <Field label="Gap — Overview Title to Sub Title — mobile (px)">
            <input style={s} type="number" min="0" placeholder="Same as tablet/desktop" value={info.overviewTitleGapMobile ?? ''} onChange={e => updateMeta('overviewTitleGapMobile', e.target.value !== '' ? Number(e.target.value) : undefined)} />
          </Field>
        </Row>
        <TextField label="Sub Title (shown as a small box between Overview Title and Overview)" value={info.overviewSubtitle||''} onChange={v => updateMeta('overviewSubtitle', v)} size={info.overviewSubtitleSize||''} onSize={v => updateMeta('overviewSubtitleSize', v)} sizePlaceholder="Default (13px)" weight={info.overviewSubtitleWeight||''} onWeight={v => updateMeta('overviewSubtitleWeight', v)} weightPlaceholder="Default (600)" italic={info.overviewSubtitleItalic} onItalic={v => updateMeta('overviewSubtitleItalic', v)} rich />
        <TierSizeRow label="Sub Title" size={info.overviewSubtitleSize}
          tabletValue={info.overviewSubtitleSizeTablet} onTablet={v => updateMeta('overviewSubtitleSizeTablet', v)}
          mobileValue={info.overviewSubtitleSizeMobile} onMobile={v => updateMeta('overviewSubtitleSizeMobile', v)} />
        <TextField label="Overview" value={info.overview||''} onChange={v => updateMeta('overview', v)} size={info.overviewSize||''} onSize={v => updateMeta('overviewSize', v)} sizePlaceholder="Default (14px)" weight={info.overviewWeight||''} onWeight={v => updateMeta('overviewWeight', v)} weightPlaceholder="Default (400)" italic={info.overviewItalic} onItalic={v => updateMeta('overviewItalic', v)} multiline rows={4} rich />
        <TierSizeRow label="Overview" size={info.overviewSize}
          tabletValue={info.overviewSizeTablet} onTablet={v => updateMeta('overviewSizeTablet', v)}
          mobileValue={info.overviewSizeMobile} onMobile={v => updateMeta('overviewSizeMobile', v)} />
        <Row>
          <MaxWidthInput label="Overview Max Width" placeholder="Default (none)" value={info.overviewMaxWidth||''} onChange={v => updateMeta('overviewMaxWidth', v || undefined)} />
        </Row>
        <Row>
          <Field label="Meta Label Size (px)">
            <input type="number" min="8" max="24" placeholder="Default (11px)"
              value={info.metaLabelSize ? parseInt(info.metaLabelSize) : ''}
              onChange={e => updateMeta('metaLabelSize', e.target.value ? `${e.target.value}px` : undefined)}
              style={{ border: '1px solid var(--ed-input-border)', borderRadius: '6px', padding: '5px 8px', fontSize: '12px', fontFamily: 'inherit', background: 'var(--ed-input-bg)', color: 'var(--ed-text)', width: '100%', boxSizing: 'border-box' }}
            />
          </Field>
          <Field label="Meta Label Weight">
            <select
              value={info.metaLabelWeight || ''}
              onChange={e => updateMeta('metaLabelWeight', e.target.value || undefined)}
              style={{ border: '1px solid var(--ed-input-border)', borderRadius: '6px', padding: '5px 8px', fontSize: '12px', fontFamily: 'inherit', background: 'var(--ed-input-bg)', color: 'var(--ed-text)', width: '100%', boxSizing: 'border-box' }}
            >
              <option value="">Default (600)</option>
              {FONT_WEIGHTS.filter(w => w.value).map(w => <option key={w.value} value={w.value}>{w.label}</option>)}
            </select>
          </Field>
        </Row>
        <Row>
          <TextField label="Team" value={info.team||''} onChange={v => updateMeta('team', v)} size={info.teamSize||''} onSize={v => updateMeta('teamSize', v)} weight={info.teamWeight||''} onWeight={v => updateMeta('teamWeight', v)} italic={info.teamItalic} onItalic={v => updateMeta('teamItalic', v)} sizePlaceholder="Default (17px)" weightPlaceholder="Default (400)" />
          <TextField label="Duration" value={info.duration||''} onChange={v => updateMeta('duration', v)} size={info.durationSize||''} onSize={v => updateMeta('durationSize', v)} weight={info.durationWeight||''} onWeight={v => updateMeta('durationWeight', v)} italic={info.durationItalic} onItalic={v => updateMeta('durationItalic', v)} sizePlaceholder="Default (17px)" weightPlaceholder="Default (400)" />
          <TextField label="Role" value={info.role||''} onChange={v => updateMeta('role', v)} size={info.roleSize||''} onSize={v => updateMeta('roleSize', v)} weight={info.roleWeight||''} onWeight={v => updateMeta('roleWeight', v)} italic={info.roleItalic} onItalic={v => updateMeta('roleItalic', v)} sizePlaceholder="Default (17px)" weightPlaceholder="Default (400)" />
        </Row>
        <Row>
          <TierSizeRow label="Team" size={info.teamSize} tabletValue={info.teamSizeTablet} onTablet={v => updateMeta('teamSizeTablet', v)} mobileValue={info.teamSizeMobile} onMobile={v => updateMeta('teamSizeMobile', v)} />
          <TierSizeRow label="Duration" size={info.durationSize} tabletValue={info.durationSizeTablet} onTablet={v => updateMeta('durationSizeTablet', v)} mobileValue={info.durationSizeMobile} onMobile={v => updateMeta('durationSizeMobile', v)} />
          <TierSizeRow label="Role" size={info.roleSize} tabletValue={info.roleSizeTablet} onTablet={v => updateMeta('roleSizeTablet', v)} mobileValue={info.roleSizeMobile} onMobile={v => updateMeta('roleSizeMobile', v)} />
        </Row>
        <Row>
          <Field label="Year (shown on card hover in All tab)">
            <input style={s} type="number" placeholder="e.g. 2026" value={year} onChange={e => setYear(e.target.value)} />
          </Field>
        </Row>
        <Field label="Tags"><TagInput value={tags} onChange={setTags} /></Field>
        <Row>
          <Field label="Overview Background Color">
            <div style={{display:'flex', alignItems:'center', gap:'6px'}}>
              <input type="color" value={info.overviewBgColor||'#ffffff'} onChange={e => updateMeta('overviewBgColor', e.target.value)} style={{width:'36px', height:'36px', border:'1px solid var(--ed-input-border)', borderRadius:'6px', cursor:'pointer', padding:'2px', background:'none'}} />
              <input style={{...s, flex:1}} value={info.overviewBgColor||''} onChange={e => updateMeta('overviewBgColor', e.target.value)} placeholder="Default (#ffffff)" />
              {info.overviewBgColor && <button onClick={() => updateMeta('overviewBgColor', undefined)} style={{background:'none', border:'1px solid var(--ed-input-border)', borderRadius:'6px', padding:'5px 10px', fontSize:'12px', color:'var(--ed-text-muted)', cursor:'pointer', fontFamily:'inherit'}}>Reset</button>}
            </div>
          </Field>
          <Field label="Overview Text Color">
            <div style={{display:'flex', alignItems:'center', gap:'6px'}}>
              <input type="color" value={info.overviewTextColor||'#111111'} onChange={e => updateMeta('overviewTextColor', e.target.value)} style={{width:'36px', height:'36px', border:'1px solid var(--ed-input-border)', borderRadius:'6px', cursor:'pointer', padding:'2px', background:'none'}} />
              <input style={{...s, flex:1}} value={info.overviewTextColor||''} onChange={e => updateMeta('overviewTextColor', e.target.value)} placeholder="Default (#111111)" />
              {info.overviewTextColor && <button onClick={() => updateMeta('overviewTextColor', undefined)} style={{background:'none', border:'1px solid var(--ed-input-border)', borderRadius:'6px', padding:'5px 10px', fontSize:'12px', color:'var(--ed-text-muted)', cursor:'pointer', fontFamily:'inherit'}}>Reset</button>}
            </div>
          </Field>
          <Field label="Navbar (this project only)">
            <label style={{display:'flex', alignItems:'center', gap:'8px', cursor:'pointer', fontSize:'13px', color:'var(--ed-text)', height:'36px'}}>
              <input type="checkbox" checked={!!info.darkNav} onChange={e => updateMeta('darkNav', e.target.checked || undefined)} />
              Dark Nav (dark bg, dark logo, off-white text)
            </label>
          </Field>
        </Row>
        <Row>
          <Field label="Navbar BG (this project only)">
            <div style={{display:'flex', alignItems:'center', gap:'6px'}}>
              <input type="color" value={info.navBgColor||'#ffffff'} onChange={e => updateMeta('navBgColor', e.target.value)} style={{width:'36px', height:'36px', border:'1px solid var(--ed-input-border)', borderRadius:'6px', cursor:'pointer', padding:'2px', background:'none'}} />
              <input style={{...s, flex:1}} value={info.navBgColor||''} onChange={e => updateMeta('navBgColor', e.target.value || undefined)} placeholder="Default (site-wide Navbar BG, or white/black)" />
              {info.navBgColor && <button onClick={() => updateMeta('navBgColor', undefined)} style={{background:'none', border:'1px solid var(--ed-input-border)', borderRadius:'6px', padding:'5px 10px', fontSize:'12px', color:'var(--ed-text-muted)', cursor:'pointer', fontFamily:'inherit'}}>Reset</button>}
            </div>
          </Field>
          <Field label="Sub-bar BG (this project only)">
            <div style={{display:'flex', alignItems:'center', gap:'6px'}}>
              <input type="color" value={info.navBottomBgColor||'#f5f5f7'} onChange={e => updateMeta('navBottomBgColor', e.target.value)} style={{width:'36px', height:'36px', border:'1px solid var(--ed-input-border)', borderRadius:'6px', cursor:'pointer', padding:'2px', background:'none'}} />
              <input style={{...s, flex:1}} value={info.navBottomBgColor||''} onChange={e => updateMeta('navBottomBgColor', e.target.value || undefined)} placeholder="Default (site-wide Sub-bar BG). Supports rgba(...)" />
              {info.navBottomBgColor && <button onClick={() => updateMeta('navBottomBgColor', undefined)} style={{background:'none', border:'1px solid var(--ed-input-border)', borderRadius:'6px', padding:'5px 10px', fontSize:'12px', color:'var(--ed-text-muted)', cursor:'pointer', fontFamily:'inherit'}}>Reset</button>}
            </div>
          </Field>
          <Field label="Behind-Bar BG (this project only)">
            <div style={{display:'flex', alignItems:'center', gap:'6px'}}>
              <input type="color" value={info.navBehindBgColor||'#ffffff'} onChange={e => updateMeta('navBehindBgColor', e.target.value)} style={{width:'36px', height:'36px', border:'1px solid var(--ed-input-border)', borderRadius:'6px', cursor:'pointer', padding:'2px', background:'none'}} />
              <input style={{...s, flex:1}} value={info.navBehindBgColor||''} onChange={e => updateMeta('navBehindBgColor', e.target.value || undefined)} placeholder="Default (site-wide Behind-Bar BG, or white)" />
              {info.navBehindBgColor && <button onClick={() => updateMeta('navBehindBgColor', undefined)} style={{background:'none', border:'1px solid var(--ed-input-border)', borderRadius:'6px', padding:'5px 10px', fontSize:'12px', color:'var(--ed-text-muted)', cursor:'pointer', fontFamily:'inherit'}}>Reset</button>}
            </div>
          </Field>
        </Row>
        <div style={{ fontSize: '11px', color: 'var(--ed-text-xmuted)', marginTop: '-10px' }}>
          Behind-Bar BG fills the area behind the Navbar + Sub-bar (visible through their translucency before the hero/content has scrolled under them) — not the bars' own background.
        </div>
        <Row>
          <Field label="Category">
            <input
              style={s} value={editCategory} onChange={e => setEditCategory(e.target.value)}
              list="ed-project-known-categories" placeholder="category-name"
            />
            <datalist id="ed-project-known-categories">
              {knownCategories.map(c => <option key={c} value={c} />)}
            </datalist>
          </Field>
          {editCategory.trim() && editCategory.trim() !== category && (
            <Field label=" ">
              <button onClick={moveCategory} style={{...s, background:'#111', color:'#fff', cursor:'pointer', fontWeight:600, border:'none'}}>
                Move to "{editCategory.trim()}"
              </button>
            </Field>
          )}
        </Row>
      </Card>

      <ThumbnailIconCard type="projects" category={category} id={id} />
      <AllThumbnailCard type="projects" category={category} id={id} />

      {(info.sections||[]).map((section, si) => {
        const isCollapsed = !!collapsed[si]
        return (
          <div
            key={si}
            id={`ed-section-${si}`}
            onDragOver={e => { if (dragIdx !== null) { e.preventDefault(); if (dropIdx !== si) setDropIdx(si) } }}
            onDrop={e => { e.preventDefault(); reorderSection(dragIdxRef.current, si); dragIdxRef.current = null; setDragIdx(null); setDropIdx(null) }}
            style={{
              border:'1px solid var(--ed-card-border)', borderRadius:'18px', background:'var(--ed-card-bg)', flexShrink:0, overflow:'visible',
              opacity: dragIdx === si ? 0.4 : section.hidden ? 0.5 : 1,
              boxShadow: (dropIdx === si && dragIdx !== null && dragIdx !== si) ? '0 0 0 2px #0087ED' : undefined,
              transition: 'box-shadow 0.12s ease, opacity 0.12s ease',
              scrollMarginTop: '16px',
            }}
          >
            {/* Section header */}
            <div
              className="ed-section-hd" style={{display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 20px', background:'var(--ed-head-bg)', borderRadius: isCollapsed ? '18px' : '18px 18px 0 0', userSelect:'none'}}
            >
              <div style={{display:'flex', alignItems:'center', gap:'8px', flex:1, minWidth:0, overflow:'hidden'}}>
                <span
                  draggable
                  onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; dragIdxRef.current = si; setDragIdx(si) }}
                  onDragEnd={() => { dragIdxRef.current = null; setDragIdx(null); setDropIdx(null) }}
                  title="Drag to reorder"
                  style={{cursor:'grab', color:'var(--ed-text-xmuted)', fontSize:'15px', flexShrink:0, padding:'0 2px', lineHeight:1, userSelect:'none'}}
                >⠿</span>
                <SectionDots section={section} />
                <span style={{overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1, display:'flex', flexDirection:'column', gap:'1px', minWidth:0}}>
                  <span style={{fontSize:'13px', fontWeight:600, color:'var(--ed-text)'}}>{section.label||section.id||'(No title)'}</span>
                  {isCollapsed && section.id && (
                    <span style={{fontSize:'10px', color:'var(--ed-text-muted)', fontFamily:'monospace'}}>{section.id}</span>
                  )}
                </span>
                <button
                  onClick={() => { setCollapsed(c => { const next = {...c, [si]: !c[si]}; safeSet(collapseStorageKey, JSON.stringify(next)); return next }) }}
                  style={{background:'none', border:'none', borderRadius:'5px', padding:'3px 6px', cursor:'pointer', color:'var(--ed-text-muted)', flexShrink:0, display:'flex', alignItems:'center'}}
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" style={{display:'block', transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition:'transform 0.15s'}}><polygon points="1,2 11,2 6,10"/></svg>
                </button>
              </div>
              <div style={{display:'flex', alignItems:'center', gap:'4px', flexShrink:0, marginLeft:'8px'}}>
                <SectionPreviewThumb section={section} category={category} id={id} images={images} />
                <button onClick={() => moveSection(si,-1)} style={{background:'var(--ed-input-bg)', border:'none', borderRadius:'5px', padding:'3px 8px', cursor:'pointer', fontSize:'12px', color:'var(--ed-text-sub)'}}>↑</button>
                <button onClick={() => moveSection(si,1)}  style={{background:'var(--ed-input-bg)', border:'none', borderRadius:'5px', padding:'3px 8px', cursor:'pointer', fontSize:'12px', color:'var(--ed-text-sub)'}}>↓</button>
                <button onClick={() => updateSection(si, 'hidden', !section.hidden)} title={section.hidden ? 'Show section' : 'Hide section'} style={{background:'var(--ed-input-bg)', border:'none', borderRadius:'5px', padding:'3px 8px', cursor:'pointer', color: section.hidden ? 'var(--ed-accent)' : 'var(--ed-text-sub)', display:'flex', alignItems:'center'}}>
                  {section.hidden ? (
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M1 8s3-5 7-5 7 5 7 5-3 5-7 5-7-5-7-5z"/><circle cx="8" cy="8" r="2.5"/><line x1="2" y1="2" x2="14" y2="14"/></svg>
                  ) : (
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M1 8s3-5 7-5 7 5 7 5-3 5-7 5-7-5-7-5z"/><circle cx="8" cy="8" r="2.5"/></svg>
                  )}
                </button>
                <button onClick={() => duplicateSection(si)} style={{background:'var(--ed-input-bg)', border:'none', color:'var(--ed-text-sub)', cursor:'pointer', padding:'3px 8px', borderRadius:'5px', display:'flex', alignItems:'center'}}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>
                <button onClick={() => removeSection(si)}  style={{background:'none', border:'none', color:'#e53e3e', cursor:'pointer', padding:'3px 8px', borderRadius:'5px', display:'flex', alignItems:'center'}}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg></button>
              </div>
            </div>

            {!isCollapsed && (
              <div style={{padding:'20px 24px', display:'flex', flexDirection:'column', gap:'20px', borderTop:'1px solid var(--ed-divider)'}}>
                {/* ID / Label / Type */}
                <Row>
                  <Field label="ID"><input style={s} value={section.id} onChange={e => updateSection(si,'id',e.target.value)} /></Field>
                  <Field label="Label (TOC)"><input style={s} value={section.label} onChange={e => updateSection(si,'label',e.target.value)} /></Field>
                </Row>
                <TypeSelector value={section.type} onChange={v => updateSection(si,'type',v)} />

                <Field label="Background Image (optional — filename or path)">
                  <input
                    style={s}
                    value={section.bgImage || ''}
                    onChange={e => updateSection(si, 'bgImage', e.target.value)}
                    placeholder="e.g. bg.webp  or  /assets/projects/…/bg.webp"
                  />
                </Field>
                <BgColorField value={section.bgColor || ''} onChange={v => updateSection(si, 'bgColor', v)} />

                <Row>
                  <Field label="Spacing Top (e.g. 80px, 0)">
                    <input style={s} placeholder="default (80px)" value={section.paddingTop ?? ''} onChange={e => updateSection(si, 'paddingTop', e.target.value)} onBlur={e => { if (!e.target.value) updateSection(si, 'paddingTop', '80px') }} />
                  </Field>
                  <Field label="Spacing Bottom (e.g. 80px, 0)">
                    <input style={s} placeholder="default (80px)" value={section.paddingBottom ?? ''} onChange={e => updateSection(si, 'paddingBottom', e.target.value)} onBlur={e => { if (!e.target.value) updateSection(si, 'paddingBottom', '80px') }} />
                  </Field>
                </Row>

                {section.type === 'image-text' && (
                  <>
                    <Field label="Layout">
                      <label style={{display:'flex', alignItems:'center', gap:'8px', cursor:'pointer', fontSize:'13px', color:'var(--ed-text)'}}>
                        <input type="checkbox" checked={!!section.iconList} onChange={e => updateSection(si, 'iconList', e.target.checked || undefined)} />
                        Icon list (small round icon left, text right — e.g. resume entries)
                      </label>
                    </Field>
                    <Field label="Layout — Columns (desktop)">
                      <select style={s} value={section.columns||1} onChange={e => updateSection(si,'columns', Number(e.target.value) > 1 ? Number(e.target.value) : undefined)}>
                        <option value={1}>Stacked (1 per row)</option>
                        <option value={2}>2 columns</option>
                        <option value={3}>3 columns</option>
                        <option value={4}>4 columns</option>
                      </select>
                    </Field>
                    {section.columns > 1 && (
                      <>
                        <Field label="Switch to Carousel Below (px)">
                          <input style={s} type="number" min="0" placeholder="Default (768 — the site's normal mobile width)" value={section.carouselBreakpoint ?? ''} onChange={e => updateSection(si,'carouselBreakpoint', e.target.value !== '' ? Number(e.target.value) : undefined)} />
                        </Field>
                        <Row>
                          <Field label="Column Gap (px)">
                            <input style={s} type="number" min="0" placeholder="Default (40)" value={section.columnGap ?? ''} onChange={e => updateSection(si,'columnGap', e.target.value !== '' ? Number(e.target.value) : undefined)} />
                          </Field>
                          <Field label="Row Gap (px)">
                            <input style={s} type="number" min="0" placeholder="Default (60)" value={section.rowGap ?? ''} onChange={e => updateSection(si,'rowGap', e.target.value !== '' ? Number(e.target.value) : undefined)} />
                          </Field>
                        </Row>
                        <Row>
                          <Field label="Image Size in Column (%)">
                            <input style={s} type="number" min="10" max="100" placeholder="Default (100)" value={section.gridImageWidth ?? ''} onChange={e => updateSection(si,'gridImageWidth', e.target.value !== '' ? Number(e.target.value) : undefined)} />
                          </Field>
                          <Field label="Image–Caption Gap (px)">
                            <input style={s} type="number" min="0" placeholder="Default (20)" value={section.imageGap ?? ''} onChange={e => updateSection(si,'imageGap', e.target.value !== '' ? Number(e.target.value) : undefined)} />
                          </Field>
                        </Row>
                        <Field label="Side Padding">
                          <select style={s} value={section.gridPadding||''} onChange={e => updateSection(si,'gridPadding', e.target.value || undefined)}>
                            <option value="">Default (15%, matches other sections)</option>
                            <option value="0">Full width (0)</option>
                          </select>
                        </Field>
                        <Field label="Text">
                          <label style={{display:'flex', alignItems:'center', gap:'8px', cursor:'pointer', fontSize:'13px', color:'var(--ed-text)'}}>
                            <input type="checkbox" checked={!!section.sharedText} onChange={e => updateSection(si, 'sharedText', e.target.checked || undefined)} />
                            One shared caption below all columns (instead of per-image text)
                          </label>
                        </Field>
                        {section.sharedText && (
                          <div style={{background:'var(--ed-block-bg)', borderRadius:'10px', padding:'16px', display:'flex', flexDirection:'column', gap:'12px'}}>
                            <div style={{fontSize:'11px', fontWeight:600, color:'var(--ed-text-muted)', textTransform:'uppercase', letterSpacing:'0.06em'}}>Shared Caption</div>
                            <TextLinesEditor
                              lines={section.sharedLines != null ? section.sharedLines : autoConvertToLines(section)}
                              onChange={lines => updateSection(si, 'sharedLines', lines)}
                            />
                          </div>
                        )}
                      </>
                    )}
                    <Row>
                      <Field label="No vertical padding">
                        <label style={{display:'flex', alignItems:'center', gap:'8px', cursor:'pointer', fontSize:'13px', color:'var(--ed-text)'}}>
                          <input type="checkbox" checked={!!section.noPaddingDesktop} onChange={e => updateSection(si, 'noPaddingDesktop', e.target.checked || undefined)} />
                          Desktop
                        </label>
                      </Field>
                      <Field label=" ">
                        <label style={{display:'flex', alignItems:'center', gap:'8px', cursor:'pointer', fontSize:'13px', color:'var(--ed-text)'}}>
                          <input type="checkbox" checked={!!section.noPaddingMobile} onChange={e => updateSection(si, 'noPaddingMobile', e.target.checked || undefined)} />
                          Mobile
                        </label>
                      </Field>
                    </Row>
                    <Row>
                      <Field label="Fixed Card Height (px) — height stays constant, width follows each block's ratio. Empty = width mode.">
                        <input style={s} type="number" min="0" placeholder="e.g. 480 (leave empty to disable)" value={section.cardHeight||''} onChange={e => updateSection(si,'cardHeight', e.target.value ? Number(e.target.value) : undefined)} />
                      </Field>
                      <Field label="Fixed Card Height — Tablet (px)">
                        <input style={s} type="number" min="0" placeholder="Same as Desktop" value={section.cardHeightTablet||''} onChange={e => updateSection(si,'cardHeightTablet', e.target.value ? Number(e.target.value) : undefined)} />
                      </Field>
                    </Row>
                    <Field label="Image–Text Gap (px)">
                      <input style={s} type="number" min="0" placeholder="Default (40)" value={section.imageTextGap ?? ''} onChange={e => updateSection(si,'imageTextGap', e.target.value !== '' ? Number(e.target.value) : undefined)} />
                    </Field>
                    <Field label="Section Padding">
                      <label style={{display:'flex', alignItems:'center', gap:'8px', cursor:'pointer', fontSize:'13px', color:'var(--ed-text)'}}>
                        <input type="checkbox" checked={!!section.matchTextPadding} onChange={e => updateSection(si, 'matchTextPadding', e.target.checked || undefined)} />
                        Match text sections' side padding (15%)
                      </label>
                    </Field>
                  </>
                )}

                {/* ── Text section ── */}
                {section.type === 'text' && (
                  <div style={{display:'flex', flexDirection:'column', gap:'12px'}}>
                    <Row>
                      <Field label=" ">
                        <PositionPicker value={section.textAlign || 'left'} onChange={v => updateSection(si, 'textAlign', v)} label="Text Align" />
                      </Field>
                      <Field label="Max Width">
                        <MaxWidthInput placeholder="Default (560px)" value={section.textMaxWidth} onChange={v => updateSection(si, 'textMaxWidth', v)} />
                      </Field>
                    </Row>
                    <TextStyleRow value={section} onChange={v => setInfo(i => { const sections=[...i.sections]; sections[si]={...sections[si],...v}; return {...i,sections} })} />
                    <TextLinesEditor
                      lines={section.lines != null ? section.lines : autoConvertToLines(section)}
                      onChange={lines => updateSection(si, 'lines', lines)}
                    />
                    <div style={{paddingTop:'12px', borderTop:'1px dashed var(--ed-divider)', display:'flex', flexDirection:'column', gap:'12px'}}>
                      <div style={{fontSize:'11px', fontWeight:600, color:'var(--ed-text-muted)', textTransform:'uppercase', letterSpacing:'0.06em'}}>Link (optional)</div>
                      <Row>
                        <Field label="URL">
                          <input style={s} value={(section.link||{}).url||''} onChange={e => updateSection(si,'link', {...(section.link||{}), url: e.target.value})} placeholder="https://example.com" />
                        </Field>
                        <Field label="Label">
                          <input style={s} value={(section.link||{}).label||''} onChange={e => updateSection(si,'link', {...(section.link||{}), label: e.target.value})} placeholder="Visit Website" />
                        </Field>
                      </Row>
                      <Row>
                        <Field label="Style">
                          <select style={s} value={(section.link||{}).style||'button'} onChange={e => updateSection(si,'link', {...(section.link||{}), style: e.target.value})}>
                            <option value="button">Button</option>
                            <option value="text">Text link</option>
                          </select>
                        </Field>
                        <Field label="Open in">
                          <select style={s} value={(section.link||{}).newTab === false ? 'same' : 'new'} onChange={e => updateSection(si,'link', {...(section.link||{}), newTab: e.target.value !== 'same'})}>
                            <option value="new">New tab</option>
                            <option value="same">Same tab</option>
                          </select>
                        </Field>
                      </Row>
                    </div>
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
                {section.type === 'scroll-animation' && (
                  <ScrollAnimEditor
                    section={section}
                    category={category}
                    id={id}
                    onUpdate={(key, val) => updateSection(si, key, val)}
                  />
                )}

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

                {/* ── Interactive (lab embed) ── */}
                {section.type === 'interactive' && (
                  <div style={{background:'var(--ed-block-bg)', borderRadius:'10px', padding:'16px', display:'flex', flexDirection:'column', gap:'12px'}}>
                    <div style={{fontSize:'11px', fontWeight:600, color:'var(--ed-text-muted)', textTransform:'uppercase', letterSpacing:'0.06em'}}>Interactive</div>
                    <Field label="Lab piece (folder in public/lab)"><input style={s} value={section.labSlug||''} onChange={e => updateSection(si,'labSlug',e.target.value)} placeholder="particles" /></Field>
                    <Field label="Height (px)"><input style={s} type="number" value={section.height||''} onChange={e => updateSection(si,'height',e.target.value ? Number(e.target.value) : undefined)} placeholder="600" /></Field>
                    <Field label="Mobile height (px)"><input style={s} type="number" value={section.mobileHeight||''} onChange={e => updateSection(si,'mobileHeight',e.target.value ? Number(e.target.value) : undefined)} placeholder="Same as desktop" /></Field>
                    <Field label="Full screen link">
                      <select style={s} value={section.hideOpenLink?'false':'true'} onChange={e => updateSection(si,'hideOpenLink',e.target.value==='false' || undefined)}>
                        <option value="true">Show</option>
                        <option value="false">Hide</option>
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
                          <Field label="Icon Image (from sections folder)">
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
                            uploadUrl={`${API}/images/${category}/${id}/sections/upload`}
                            onRefresh={refreshImages}
                            ratio={item.desktopRatio}
                            cropData={item.cropData||{}}
                            onCropChange={(num, crop) => updateItem(ii,'cropData', crop ? {...(item.cropData||{}), [num]: crop} : Object.fromEntries(Object.entries(item.cropData||{}).filter(([k]) => String(k) !== String(num))))}
                            onRatioChange={v => updateItem(ii,'desktopRatio',v)}
                          />
                          <MobileOverridePicker
                            desktopNums={item.images||[]}
                            value={item.mobileImages||[]}
                            onChange={v => updateItem(ii,'mobileImages',v)}
                            images={mobileImages} basePath={mobileBasePath}
                            uploadUrl={`${API}/images/${category}/${id}/mobile/upload`}
                            onRefresh={refreshMobileImages}
                            ratio={item.mobileRatio||item.desktopRatio}
                            cropData={item.mobileCropData||{}}
                            onCropChange={(num, crop) => updateItem(ii,'mobileCropData', crop ? {...(item.mobileCropData||{}), [num]: crop} : Object.fromEntries(Object.entries(item.mobileCropData||{}).filter(([k]) => String(k) !== String(num))))}
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
                            label="Desktop Images"
                            value={tab.images||[]}
                            onChange={v => updateTab(ti,'images',v)}
                            images={images}
                            basePath={basePath}
                            uploadUrl={`${API}/images/${category}/${id}/sections/upload`}
                            onRefresh={refreshImages}
                            ratio={tab.desktopRatio}
                            cropData={tab.cropData||{}}
                            onCropChange={(num, crop) => updateTab(ti,'cropData', crop ? {...(tab.cropData||{}), [num]: crop} : Object.fromEntries(Object.entries(tab.cropData||{}).filter(([k]) => String(k) !== String(num))))}
                            onRatioChange={v => updateTab(ti,'desktopRatio', v)}
                          />
                          <MobileOverridePicker
                            desktopNums={tab.images||[]}
                            value={tab.mobileImages||[]}
                            onChange={v => updateTab(ti,'mobileImages',v)}
                            images={mobileImages}
                            basePath={mobileBasePath}
                            uploadUrl={`${API}/images/${category}/${id}/mobile/upload`}
                            onRefresh={refreshMobileImages}
                            ratio={tab.mobileRatio || tab.desktopRatio}
                            cropData={tab.mobileCropData||{}}
                            onCropChange={(num, crop) => updateTab(ti,'mobileCropData', crop ? {...(tab.mobileCropData||{}), [num]: crop} : Object.fromEntries(Object.entries(tab.mobileCropData||{}).filter(([k]) => String(k) !== String(num))))}
                          />
                          <TextStyleRow value={tab} onChange={v => setTabs(tabs.map((t, i) => i === ti ? {...t, ...v} : t))} />
                          <TextLinesEditor
                            lines={tab.lines != null ? tab.lines : autoConvertToLines(tab)}
                            onChange={lines => updateTab(ti, 'lines', lines)}
                          />
                          <div style={{borderTop:'1px dashed var(--ed-divider)', marginTop:'4px', paddingTop:'12px', display:'flex', flexDirection:'column', gap:'12px'}}>
                            <div style={{fontSize:'11px', color:'var(--ed-text-xmuted)'}}>Description image — shown below the tab bar whenever this tab is active (e.g. an explainer graphic for this swatch).</div>
                            <RatioRow
                              desktopRatio={tab.descRatio || ''}
                              mobileRatio={tab.descMobileRatio || ''}
                              onDesktopRatio={v => updateTab(ti,'descRatio', v || undefined)}
                              onMobileRatio={v => updateTab(ti,'descMobileRatio', v || undefined)}
                            />
                            <ImagePicker
                              label="Description Image"
                              value={tab.descImages||[]}
                              onChange={v => updateTab(ti,'descImages',v)}
                              images={images}
                              basePath={basePath}
                              uploadUrl={`${API}/images/${category}/${id}/sections/upload`}
                              onRefresh={refreshImages}
                              ratio={tab.descRatio}
                              cropData={tab.descCropData||{}}
                              onCropChange={(num, crop) => updateTab(ti,'descCropData', crop ? {...(tab.descCropData||{}), [num]: crop} : Object.fromEntries(Object.entries(tab.descCropData||{}).filter(([k]) => String(k) !== String(num))))}
                              onRatioChange={v => updateTab(ti,'descRatio', v)}
                            />
                          </div>
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
                            uploadUrl={`${API}/images/${category}/${id}/sections/upload`}
                            onRefresh={refreshImages}
                            ratio={item.desktopRatio}
                            cropData={item.cropData||{}}
                            onCropChange={(num, crop) => updateItem(ii,'cropData', crop ? {...(item.cropData||{}), [num]: crop} : Object.fromEntries(Object.entries(item.cropData||{}).filter(([k]) => String(k) !== String(num))))}
                            onRatioChange={v => updateItem(ii,'desktopRatio',v)}
                          />
                          <MobileOverridePicker
                            desktopNums={item.images||[]}
                            value={item.mobileImages||[]}
                            onChange={v => updateItem(ii,'mobileImages',v)}
                            images={mobileImages} basePath={mobileBasePath}
                            uploadUrl={`${API}/images/${category}/${id}/mobile/upload`}
                            onRefresh={refreshMobileImages}
                            ratio={item.mobileRatio||item.desktopRatio}
                            cropData={item.mobileCropData||{}}
                            onCropChange={(num, crop) => updateItem(ii,'mobileCropData', crop ? {...(item.mobileCropData||{}), [num]: crop} : Object.fromEntries(Object.entries(item.mobileCropData||{}).filter(([k]) => String(k) !== String(num))))}
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
                {section.type === 'video-background' && (() => {
                  const isYoutube = section.videoType === 'youtube'
                  return (
                  <div style={{background:'var(--ed-block-bg)', borderRadius:'10px', padding:'16px', display:'flex', flexDirection:'column', gap:'12px'}}>
                    <div style={{fontSize:'11px', fontWeight:600, color:'var(--ed-text-muted)', textTransform:'uppercase', letterSpacing:'0.06em'}}>Video Background</div>
                    <Field label="Source">
                      <select style={s} value={section.videoType === 'youtube' ? 'youtube' : 'upload'} onChange={e => updateSection(si,'videoType', e.target.value === 'youtube' ? 'youtube' : undefined)}>
                        <option value="upload">Uploaded file</option>
                        <option value="youtube">YouTube</option>
                      </select>
                    </Field>
                    {isYoutube ? (
                      <>
                        <Field label="YouTube URL or Video ID">
                          <input style={s} value={section.youtubeId||''} onChange={e => updateSection(si,'youtubeId', extractYoutubeId(e.target.value))} placeholder="https://youtube.com/watch?v=... or dQw4w9WgXcQ" />
                        </Field>
                        <ImageField
                          label="Thumbnail (shown before play — defaults to YouTube's own thumbnail if left blank)"
                          value={section.videoThumbnail||''}
                          onChange={v => updateSection(si,'videoThumbnail', v || undefined)}
                        />
                      </>
                    ) : (
                      <Field label="Video File (from sections/ folder)">
                        <select style={s} value={section.videoSrc||''} onChange={e => updateSection(si,'videoSrc',e.target.value)}>
                          <option value="">— Select a video —</option>
                          {videos.map(f => <option key={f.name} value={f.name}>{f.name} ({f.size})</option>)}
                        </select>
                      </Field>
                    )}
                    <Row>
                      <Field label="Aspect Ratio">
                        <select style={s} value={section.videoRatio || (isYoutube ? '16/9' : '')} onChange={e => updateSection(si,'videoRatio', e.target.value || undefined)}>
                          {!isYoutube && <option value="">Full background (cover)</option>}
                          {RATIOS.filter(r => r.value).map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                        </select>
                      </Field>
                      {!isYoutube && (
                        <Field label="Sound">
                          <select style={s} value={section.videoMuted === false ? 'sound' : 'muted'} onChange={e => updateSection(si,'videoMuted', e.target.value !== 'sound')}>
                            <option value="muted">Muted (autoplay)</option>
                            <option value="sound">With sound (requires click to play)</option>
                          </select>
                        </Field>
                      )}
                    </Row>
                    {!isYoutube && (
                      <Field label="Playback">
                        <select style={s} value={section.videoLoop === false ? 'once' : 'loop'} onChange={e => updateSection(si,'videoLoop', e.target.value !== 'once')}>
                          <option value="loop">Loop</option>
                          <option value="once">Play once</option>
                        </select>
                      </Field>
                    )}
                    <Row>
                      <Field label="Text Align">
                        <select style={s} value={section.overlayPosition||'center'} onChange={e => updateSection(si,'overlayPosition',e.target.value)}>
                          <option value="center">Center</option>
                          <option value="left">Left</option>
                          <option value="right">Right</option>
                        </select>
                      </Field>
                      {(section.videoRatio || isYoutube) && (
                        <Field label="Text Position">
                          <select style={s} value={section.videoTextPosition === 'below' ? 'below' : 'above'} onChange={e => updateSection(si,'videoTextPosition',e.target.value)}>
                            <option value="above">Above Video</option>
                            <option value="below">Below Video</option>
                          </select>
                        </Field>
                      )}
                    </Row>
                    {(section.videoRatio || isYoutube) && (
                      <MaxWidthInput label="Video Max Width" placeholder="Default (900px)" value={section.videoMaxWidth||''} onChange={v => updateSection(si,'videoMaxWidth',v || undefined)} />
                    )}
                    {section.videoSrc && section.videoRatio && (
                      <Field label="Crop">
                        <button
                          onClick={() => setVideoCropEditorFor(si)}
                          style={{fontSize:'12px', border:'1px solid var(--ed-input-border)', background:'var(--ed-input-bg)', color:'var(--ed-text-sub)', borderRadius:'8px', padding:'8px 14px', cursor:'pointer', fontFamily:'inherit', alignSelf:'flex-start'}}
                        >Edit Crop{section.videoCropData ? ' (adjusted)' : ''}</button>
                      </Field>
                    )}
                    <TextLinesEditor
                      lines={section.lines != null ? section.lines : autoConvertToLines(section)}
                      onChange={lines => updateSection(si, 'lines', lines)}
                    />
                    <MaxWidthInput label="Text Max Width" value={section.textMaxWidth||''} onChange={v => updateSection(si,'textMaxWidth',v)} />
                  </div>
                  )
                })()}

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
                          <Field label="Icon Image (optional, from sections folder)">
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

                {/* ── Images section ── */}
                {section.type === 'images' && (
                  <div style={{display:'flex', flexDirection:'column', gap:'16px'}}>
                    <RatioRow
                      desktopRatio={section.desktopRatio || ''}
                      mobileRatio={section.mobileRatio || ''}
                      onDesktopRatio={v => updateSection(si,'desktopRatio',v || undefined)}
                      onMobileRatio={v => updateSection(si,'mobileRatio',v || undefined)}
                    />
                    <Field label="Content Width">
                      <label style={{display:'flex', alignItems:'center', gap:'8px', cursor:'pointer', fontSize:'13px', color:'var(--ed-text)'}}>
                        <input type="checkbox" checked={!!section.matchTextPadding} onChange={e => updateSection(si, 'matchTextPadding', e.target.checked || undefined)} />
                        Respect page padding (unchecked = full-bleed edge to edge)
                      </label>
                    </Field>
                    <ImagePicker
                      label="Images"
                      value={section.images||[]}
                      onChange={v => updateSection(si,'images',v)}
                      images={images}
                      basePath={basePath}
                      uploadUrl={`${API}/images/${category}/${id}/sections/upload`}
                      onRefresh={refreshImages}
                      ratio={section.desktopRatio}
                      cropData={section.cropData||{}}
                      onCropChange={(num, crop) => updateSection(si,'cropData', crop ? {...(section.cropData||{}), [num]: crop} : Object.fromEntries(Object.entries(section.cropData||{}).filter(([k]) => String(k) !== String(num))))}
                      onRatioChange={v => updateSection(si,'desktopRatio', v)}
                    />
                    <MobileOverridePicker
                      desktopNums={section.images||[]}
                      value={section.mobileImages||[]}
                      onChange={v => updateSection(si,'mobileImages',v)}
                      images={mobileImages}
                      basePath={mobileBasePath}
                      uploadUrl={`${API}/images/${category}/${id}/mobile/upload`}
                      onRefresh={refreshMobileImages}
                      ratio={section.mobileRatio || section.desktopRatio}
                      cropData={section.mobileCropData||{}}
                      onCropChange={(num, crop) => updateSection(si,'mobileCropData', crop ? {...(section.mobileCropData||{}), [num]: crop} : Object.fromEntries(Object.entries(section.mobileCropData||{}).filter(([k]) => String(k) !== String(num))))}
                    />
                    <MobileOverridePicker
                      icon="💻"
                      label="Tablet Override (optional) — empty falls back to the page's Tablet Images setting"
                      desktopNums={section.images||[]}
                      value={section.tabletImages||[]}
                      onChange={v => updateSection(si,'tabletImages',v)}
                      images={tabletImages}
                      basePath={tabletBasePath}
                      uploadUrl={`${API}/images/${category}/${id}/tablet/upload`}
                      onRefresh={refreshTabletImages}
                      ratio={section.desktopRatio}
                      cropData={section.tabletCropData||{}}
                      onCropChange={(num, crop) => updateSection(si,'tabletCropData', crop ? {...(section.tabletCropData||{}), [num]: crop} : Object.fromEntries(Object.entries(section.tabletCropData||{}).filter(([k]) => String(k) !== String(num))))}
                    />

                    {/* Overlay text */}
                    <div style={{paddingTop:'12px', borderTop:'1px dashed var(--ed-divider)', display:'flex', flexDirection:'column', gap:'12px'}}>
                      <div style={{fontSize:'11px', fontWeight:600, color:'var(--ed-text-muted)', textTransform:'uppercase', letterSpacing:'0.06em'}}>Overlay Text (optional)</div>
                      <PositionPicker value={(section.overlay||{}).position} onChange={v => updateOverlay(si,'position',v)} label="Position" />
                      <Row>
                        <Field label="Max Width (Desktop)">
                          <MaxWidthInput placeholder="Default (320px)" value={(section.overlay||{}).textMaxWidth} onChange={v => updateOverlay(si,'textMaxWidth',v)} />
                        </Field>
                        <Field label="Max Width (Mobile)">
                          <MaxWidthInput placeholder="Default (320px)" value={(section.overlay||{}).mobileTextMaxWidth} onChange={v => updateOverlay(si,'mobileTextMaxWidth',v)} />
                        </Field>
                      </Row>
                      <TextLinesEditor
                        lines={(section.overlay||{}).lines != null ? (section.overlay||{}).lines : autoConvertToLines(section.overlay||{})}
                        onChange={lines => updateOverlay(si, 'lines', lines)}
                      />
                    </div>
                  </div>
                )}

                {/* ── Grid ── */}
                {section.type === 'image-grid' && (
                  <div style={{display:'flex', flexDirection:'column', gap:'16px'}}>
                    <Row>
                      <Field label="Columns (desktop)">
                        <select style={s} value={section.columns||4} onChange={e => updateSection(si,'columns',Number(e.target.value))}>
                          {[1,2,3,4,5,6].map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                      </Field>
                      <Field label="Rows (desktop)">
                        <select style={s} value={section.rows||''} onChange={e => updateSection(si,'rows', e.target.value ? Number(e.target.value) : undefined)}>
                          <option value="">Auto</option>
                          {[1,2,3,4,5,6].map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                      </Field>
                    </Row>
                    <Row>
                      <Field label="Columns (tablet)">
                        <select style={s} value={section.tabletColumns||0} onChange={e => updateSection(si,'tabletColumns', Number(e.target.value) > 1 ? Number(e.target.value) : undefined)}>
                          <option value={0}>Default (3)</option>
                          {[1,2,3,4,5,6].map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                      </Field>
                      <Field label="Rows (tablet)">
                        <select style={s} value={section.tabletRows||''} onChange={e => updateSection(si,'tabletRows', e.target.value ? Number(e.target.value) : undefined)}>
                          <option value="">Auto</option>
                          {[1,2,3,4,5,6].map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                      </Field>
                    </Row>
                    <Row>
                      <Field label="Columns (mobile)">
                        <select style={s} value={section.mobileColumns||2} onChange={e => updateSection(si,'mobileColumns',Number(e.target.value))}>
                          {[1,2,3,4].map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                      </Field>
                      <Field label="Rows (mobile)">
                        <select style={s} value={section.mobileRows||''} onChange={e => updateSection(si,'mobileRows', e.target.value ? Number(e.target.value) : undefined)}>
                          <option value="">Auto</option>
                          {[1,2,3,4].map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                      </Field>
                    </Row>
                    <Row>
                      <Field label="Gap (desktop)">
                        <input style={s} placeholder="Default (4px)" value={section.gap||''} onChange={e => updateSection(si,'gap',e.target.value)} onBlur={e => { if (!e.target.value) updateSection(si,'gap','4px') }} />
                      </Field>
                      <Field label="Gap (mobile)">
                        <input style={s} placeholder="Same as desktop" value={section.mobileGap||''} onChange={e => updateSection(si,'mobileGap',e.target.value || undefined)} />
                      </Field>
                    </Row>
                    <Field label="Side Padding (mobile, px)">
                      <input style={s} type="number" min="0" placeholder="Default (20)" value={section.mobilePadding ?? ''} onChange={e => updateSection(si,'mobilePadding', e.target.value !== '' ? Number(e.target.value) : undefined)} />
                    </Field>
                    <RatioRow
                      desktopRatio={section.desktopRatio||''}
                      mobileRatio={section.mobileRatio||''}
                      onDesktopRatio={v => updateSection(si,'desktopRatio',v||undefined)}
                      onMobileRatio={v => updateSection(si,'mobileRatio',v||undefined)}
                    />
                    <ImagePicker
                      label="Images"
                      value={section.images||[]}
                      onChange={v => updateSection(si,'images',v)}
                      images={images}
                      basePath={basePath}
                      uploadUrl={`${API}/images/${category}/${id}/sections/upload`}
                      onRefresh={refreshImages}
                      ratio={section.desktopRatio}
                      cropData={section.cropData||{}}
                      onCropChange={(num, crop) => updateSection(si,'cropData', crop ? {...(section.cropData||{}), [num]: crop} : Object.fromEntries(Object.entries(section.cropData||{}).filter(([k]) => String(k) !== String(num))))}
                      onRatioChange={v => updateSection(si,'desktopRatio', v)}
                    />
                    <MobileOverridePicker
                      desktopNums={section.images||[]}
                      value={section.mobileImages||[]}
                      onChange={v => updateSection(si,'mobileImages',v)}
                      images={mobileImages}
                      basePath={mobileBasePath}
                      uploadUrl={`${API}/images/${category}/${id}/mobile/upload`}
                      onRefresh={refreshMobileImages}
                      ratio={section.mobileRatio || section.desktopRatio}
                      cropData={section.mobileCropData||{}}
                      onCropChange={(num, crop) => updateSection(si,'mobileCropData', crop ? {...(section.mobileCropData||{}), [num]: crop} : Object.fromEntries(Object.entries(section.mobileCropData||{}).filter(([k]) => String(k) !== String(num))))}
                    />
                    <MobileOverridePicker
                      icon="💻"
                      label="Tablet Override (optional) — empty falls back to the page's Tablet Images setting"
                      desktopNums={section.images||[]}
                      value={section.tabletImages||[]}
                      onChange={v => updateSection(si,'tabletImages',v)}
                      images={tabletImages}
                      basePath={tabletBasePath}
                      uploadUrl={`${API}/images/${category}/${id}/tablet/upload`}
                      onRefresh={refreshTabletImages}
                      ratio={section.desktopRatio}
                      cropData={section.tabletCropData||{}}
                      onCropChange={(num, crop) => updateSection(si,'tabletCropData', crop ? {...(section.tabletCropData||{}), [num]: crop} : Object.fromEntries(Object.entries(section.tabletCropData||{}).filter(([k]) => String(k) !== String(num))))}
                    />
                    <ImagePicker
                      label="Hover Images (optional) — hover/ folder"
                      value={section.hoverImages||[]}
                      onChange={v => updateSection(si,'hoverImages',v)}
                      images={hoverImages}
                      basePath={hoverBasePath}
                      uploadUrl={`${API}/images/${category}/${id}/hover/upload`}
                      onRefresh={refreshHoverImages}
                      ratio={section.desktopRatio}
                    />
                  </div>
                )}

                {/* ── Carousel options ── */}
                {section.type === 'image-text-carousel' && (
                  <>
                    <Row>
                      <Field label={`Card Width${section.cardHeight ? ' (ignored — height mode)' : ''}`}>
                        <select style={s} value={section.cardSize||'medium'} onChange={e => updateSection(si,'cardSize',e.target.value)} disabled={!!section.cardHeight}>
                          <option value="small">Small — 40%</option>
                          <option value="medium">Medium — 70%</option>
                          <option value="large">Large — 90%</option>
                        </select>
                      </Field>
                      <Field label="Card Ratio (fallback)">
                        <select style={s} value={section.cardRatio||''} onChange={e => updateSection(si,'cardRatio',e.target.value || undefined)}>
                          <option value="">Default (16:9)</option>
                          <option value="16/9">16:9</option>
                          <option value="1/1">1:1</option>
                          <option value="5/4">5:4</option>
                          <option value="3/2">3:2</option>
                          <option value="9/19.5">iPhone (9:19.5 — portrait)</option>
                          <option value="19.5/9">iPhone (19.5:9 — landscape)</option>
                        </select>
                      </Field>
                    </Row>
                    <Row>
                      <Field label="Fixed Card Height (px) — height stays constant, width follows each block's ratio. Empty = width mode.">
                        <input style={s} type="number" min="0" placeholder="e.g. 480 (leave empty to disable)" value={section.cardHeight||''} onChange={e => updateSection(si,'cardHeight', e.target.value ? Number(e.target.value) : undefined)} />
                      </Field>
                      <Field label="Fixed Card Height — Tablet (px)">
                        <input style={s} type="number" min="0" placeholder="Same as Desktop" value={section.cardHeightTablet||''} onChange={e => updateSection(si,'cardHeightTablet', e.target.value ? Number(e.target.value) : undefined)} />
                      </Field>
                    </Row>
                    <Field label="Max Width (px) — caps how wide the row gets on a wide/ultra-wide screen, so it keeps acting like a carousel (last card clipped, nav arrows) instead of just spreading out to fit everything">
                      <input style={s} type="number" min="0" placeholder="Default (1600)" value={section.carouselMaxWidth||''} onChange={e => updateSection(si,'carouselMaxWidth', e.target.value ? Number(e.target.value) : undefined)} />
                    </Field>
                  </>
                )}

                {/* ── Blocks (image-text / carousel) ── */}
                {(section.type === 'image-text' || section.type === 'image-text-carousel') && (
                  <div style={{display:'flex', flexDirection:'column', gap:'12px'}}>
                    {(section.blocks||[]).map((block, bi) => (
                      <Block key={block._id || bi} label={`Block ${bi+1}`} onRemove={() => removeBlock(si,bi)} onDuplicate={() => duplicateBlock(si,bi)} onMoveUp={bi > 0 ? () => moveBlock(si,bi,-1) : undefined} onMoveDown={bi < (section.blocks.length-1) ? () => moveBlock(si,bi,1) : undefined} collapsible hidden={block.hidden} onToggleHidden={() => updateBlock(si,bi,"hidden",!block.hidden)}>
                        <RatioRow
                          desktopRatio={block.desktopRatio || ''}
                          mobileRatio={block.mobileRatio || ''}
                          onDesktopRatio={v => updateBlock(si,bi,'desktopRatio',v || undefined)}
                          onMobileRatio={v => updateBlock(si,bi,'mobileRatio',v || undefined)}
                        />
                        {section.type === 'image-text' && (
                          <Row>
                            <Field label="Image Width (desktop)">
                              <select style={s} value={block.imgWidth || 'medium'} onChange={e => updateBlock(si,bi,'imgWidth', e.target.value)}>
                                <option value="full">Full — 100%</option>
                                <option value="medium">Medium — 70%</option>
                                <option value="small">Small — 50%</option>
                              </select>
                            </Field>
                            <Field label="Text Align">
                              <select style={s} value={block.imgTextAlign || 'image'} onChange={e => updateBlock(si,bi,'imgTextAlign', e.target.value)}>
                                <option value="image">Align with image</option>
                                <option value="left">Full left</option>
                              </select>
                            </Field>
                            <Field label="Block Layout (desktop)">
                              <select style={s} value={block.blockAlign || ''} onChange={e => updateBlock(si,bi,'blockAlign', e.target.value || undefined)}>
                                <option value="">Center</option>
                                <option value="left">Left indent</option>
                                <option value="right">Right indent</option>
                                <option value="inset">Inset — 22% both sides</option>
                              </select>
                            </Field>
                            <Field label="Text Max Width (overrides image width)">
                              <MaxWidthInput placeholder="Same as image" value={block.textMaxWidth} onChange={v => updateBlock(si,bi,'textMaxWidth', v || undefined)} />
                            </Field>
                            <Field label="Corners (mobile)">
                              <label style={{display:'flex', alignItems:'center', gap:'6px', fontSize:'13px', color:'var(--ed-text)', cursor:'pointer'}}>
                                <input type="checkbox" checked={!!block.mobileSquare} onChange={e => updateBlock(si,bi,'mobileSquare', e.target.checked || undefined)} />
                                Remove rounded corners on mobile
                              </label>
                            </Field>
                          </Row>
                        )}
                        {section.type === 'image-text-carousel' && (
                          <Field label="Corners">
                            <label style={{display:'flex', alignItems:'center', gap:'8px', cursor:'pointer', fontSize:'13px', color:'var(--ed-text)', height:'36px'}}>
                              <input type="checkbox" checked={block.rounded !== false} onChange={e => updateBlock(si,bi,'rounded', e.target.checked ? undefined : false)} />
                              Rounded
                            </label>
                          </Field>
                        )}
                        <ImagePicker
                          label="Desktop Images"
                          value={block.images||[]}
                          onChange={v => updateBlock(si,bi,'images',v)}
                          images={images}
                          basePath={basePath}
                          uploadUrl={`${API}/images/${category}/${id}/sections/upload`}
                          onRefresh={refreshImages}
                          ratio={block.desktopRatio}
                          cropData={block.cropData||{}}
                          onCropChange={(num, crop) => updateBlock(si,bi,'cropData', crop ? {...(block.cropData||{}), [num]: crop} : Object.fromEntries(Object.entries(block.cropData||{}).filter(([k]) => String(k) !== String(num))))}
                          onRatioChange={v => updateBlock(si,bi,'desktopRatio', v)}
                        />
                        <MobileOverridePicker
                          desktopNums={block.images||[]}
                          value={block.mobileImages||[]}
                          onChange={v => updateBlock(si,bi,'mobileImages',v)}
                          images={mobileImages}
                          basePath={mobileBasePath}
                          uploadUrl={`${API}/images/${category}/${id}/mobile/upload`}
                          onRefresh={refreshMobileImages}
                          ratio={block.mobileRatio || block.desktopRatio}
                          cropData={block.mobileCropData||{}}
                          onCropChange={(num, crop) => updateBlock(si,bi,'mobileCropData', crop ? {...(block.mobileCropData||{}), [num]: crop} : Object.fromEntries(Object.entries(block.mobileCropData||{}).filter(([k]) => String(k) !== String(num))))}
                        />
                        <MobileOverridePicker
                          icon="💻"
                          label="Tablet Override (optional) — empty falls back to the page's Tablet Images setting"
                          desktopNums={block.images||[]}
                          value={block.tabletImages||[]}
                          onChange={v => updateBlock(si,bi,'tabletImages',v)}
                          images={tabletImages}
                          basePath={tabletBasePath}
                          uploadUrl={`${API}/images/${category}/${id}/tablet/upload`}
                          onRefresh={refreshTabletImages}
                          ratio={block.desktopRatio}
                          cropData={block.tabletCropData||{}}
                          onCropChange={(num, crop) => updateBlock(si,bi,'tabletCropData', crop ? {...(block.tabletCropData||{}), [num]: crop} : Object.fromEntries(Object.entries(block.tabletCropData||{}).filter(([k]) => String(k) !== String(num))))}
                        />
                        <ImagePicker
                          label="Hover Images (optional) — hover/ folder"
                          value={block.hoverImages||[]}
                          onChange={v => updateBlock(si,bi,'hoverImages',v)}
                          images={hoverImages}
                          basePath={hoverBasePath}
                          uploadUrl={`${API}/images/${category}/${id}/hover/upload`}
                          onRefresh={refreshHoverImages}
                          ratio={block.desktopRatio}
                        />
                        <TextStyleRow value={block} onChange={v => setInfo(i => { const sections=[...i.sections]; const blocks=[...(sections[si].blocks||[])]; blocks[bi]={...blocks[bi],...v}; sections[si]={...sections[si],blocks}; return {...i,sections} })} />
                        <TextLinesEditor
                          lines={block.lines != null ? block.lines : autoConvertToLines(block)}
                          onChange={lines => updateBlock(si, bi, 'lines', lines)}
                        />
                        <div style={{background:'var(--ed-block-bg)', borderRadius:'8px', padding:'12px', display:'flex', flexDirection:'column', gap:'10px'}}>
                          <div style={{fontSize:'11px', fontWeight:600, color:'var(--ed-text-muted)', textTransform:'uppercase', letterSpacing:'0.06em'}}>Hover Overlay</div>
                          <Field label="Overlay Title"><input style={s} value={block.overlayTitle||''} onChange={e => updateBlock(si,bi,'overlayTitle',e.target.value)} /></Field>
                          <TextField label="Overlay Content" value={block.overlayContent||''} onChange={v => updateBlock(si,bi,'overlayContent',v)} multiline rows={3} rich />
                        </div>
                        {section.type === 'image-text' && (
                          <BlockAnnotations
                            block={block}
                            onChangeKey={(key, val) => updateBlock(si, bi, key, val)}
                            basePath={basePath}
                            mobileBasePath={mobileBasePath}
                            iconsBase={iconsBase}
                          />
                        )}
                      </Block>
                    ))}
                    <button onClick={() => addBlock(si)} style={{background:'none', border:'1px dashed var(--ed-input-border)', borderRadius:'8px', padding:'8px 16px', fontSize:'13px', color:'var(--ed-text-muted)', cursor:'pointer', alignSelf:'flex-start', fontFamily:'inherit'}}>+ Add Block</button>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}

      <button onClick={addSection} style={{background:'none', border:'1px dashed var(--ed-input-border)', borderRadius:'8px', padding:'10px 20px', fontSize:'13px', color:'var(--ed-text-muted)', cursor:'pointer', alignSelf:'flex-start', fontFamily:'inherit'}}>+ Add Section</button>

      <Card title="Footnote" collapsible defaultOpen={false}>
        <TextLinesEditor
          lines={info.footnoteLines != null ? info.footnoteLines : autoConvertToLines({content: info.footnote})}
          onChange={lines => updateMeta('footnoteLines', lines)}
        />
        <Field label="Footnote Background Color">
          <div style={{display:'flex', alignItems:'center', gap:'6px'}}>
            <input type="color" value={info.footnoteBgColor||'#ffffff'} onChange={e => updateMeta('footnoteBgColor', e.target.value)} style={{width:'36px', height:'36px', border:'1px solid var(--ed-input-border)', borderRadius:'6px', cursor:'pointer', padding:'2px', background:'none'}} />
            <input style={{...s, flex:1}} value={info.footnoteBgColor||''} onChange={e => updateMeta('footnoteBgColor', e.target.value)} placeholder="Default (transparent)" />
            {info.footnoteBgColor && <button onClick={() => updateMeta('footnoteBgColor', undefined)} style={{background:'none', border:'1px solid var(--ed-input-border)', borderRadius:'6px', padding:'5px 10px', fontSize:'12px', color:'var(--ed-text-muted)', cursor:'pointer', fontFamily:'inherit'}}>Reset</button>}
          </div>
        </Field>
      </Card>
      {videoCropEditorFor != null && info.sections[videoCropEditorFor] && (
        <CropEditor
          mediaType="video"
          src={`/assets/projects/${category}/${id}/sections/${info.sections[videoCropEditorFor].videoSrc}`}
          initialRatio={info.sections[videoCropEditorFor].videoRatio || '16/9'}
          initialCrop={info.sections[videoCropEditorFor].videoCropData}
          onSave={(crop, ratioStr) => {
            updateSection(videoCropEditorFor, 'videoCropData', crop || undefined)
            if (ratioStr) updateSection(videoCropEditorFor, 'videoRatio', ratioStr)
          }}
          onClose={() => setVideoCropEditorFor(null)}
        />
      )}
        </div>
      </div>
    </div>
  )
}
