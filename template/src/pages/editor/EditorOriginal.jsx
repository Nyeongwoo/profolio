import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { API, EditorTopbar, EditorSectionNav, TextField, Field, Row, Block, Card, TagInput, TextStyleRow, BgColorField, ImagePicker, MobileOverridePicker, PositionPicker, RatioRow, RATIOS, TextLinesEditor, autoConvertToLines, SectionDots, MaxWidthInput, remapCollapsedOnReorder, TierSizeRow, FONT_WEIGHTS } from './EditorComponents'
import { ThumbnailIconCard, AllThumbnailCard } from './EditorProject'
import { safeGet, safeSet } from '../../utils/safeStorage'
import { extractYoutubeId } from '../../utils/youtube'

const emptyBlock = () => ({ images: [], mobileImages: [], hoverImages: [], title: '', subtitle: '', content: '', overlayTitle: '', overlayContent: '', titleSize: '', subtitleSize: '', contentSize: '' })
const emptySection = () => ({ id: '', label: '', type: 'images', images: [], blocks: [emptyBlock()] })

const s = {border:'1px solid var(--ed-input-border)', borderRadius:'8px', padding:'8px 12px', fontSize:'13px', fontFamily:'inherit', color:'var(--ed-text)', background:'var(--ed-input-bg)', outline:'none', width:'100%', boxSizing:'border-box'}

function SectionPreviewThumb({ section, category, id, images }) {
  const firstImg = (section.type === 'images' || section.type === 'image-grid') ? section.images?.[0] : section.blocks?.[0]?.images?.[0]
  if (!firstImg) return null
  const name = String(firstImg).padStart(2, '0')
  const file = images.find(f => f.name.startsWith(name))
  if (!file) return null
  return <img src={`/assets/originals/${category}/${id}/sections/${file.name}`} style={{width:'48px', height:'32px', objectFit:'cover', borderRadius:'4px', flexShrink:0, border:'1px solid var(--ed-card-border)'}} alt="" />
}

const ORIGINAL_CATEGORIES = ['ip', 'games', 'apps']

export default function EditorProject() {
  const { category, id } = useParams()
  const navigate = useNavigate()
  const [info, setInfo] = useState(null)
  const [images, setImages] = useState([])
  const [hoverImages, setHoverImages] = useState([])
  const [mobileImages, setMobileImages] = useState([])
  const [tags, setTags] = useState([])
  const [year, setYear] = useState('')
  const [saved, setSaved] = useState(false)
  const [collapsed, setCollapsed] = useState({})
  const [dragIdx, setDragIdx] = useState(null)
  const [dropIdx, setDropIdx] = useState(null)
  const dragIdxRef = useRef(null)
  const [hidden, setHidden] = useState(false)
  const [editCategory, setEditCategory] = useState(category)

  useEffect(() => { setEditCategory(category) }, [category])

  const basePath       = `/assets/originals/${category}/${id}/sections`
  const hoverBasePath  = `/assets/originals/${category}/${id}/hover`
  const mobileBasePath = `/assets/originals/${category}/${id}/mobile`
  const uploadUrl = `${API}/original-images/${category}/${id}/upload`

  const refreshImages = useCallback(() =>
    fetch(`${API}/original-images/${category}/${id}`).then(r => r.json()).then(setImages),
    [category, id]
  )
  const refreshHoverImages = useCallback(() =>
    fetch(`${API}/original-images/${category}/${id}/hover`).then(r => r.json()).then(setHoverImages),
    [category, id]
  )
  const refreshMobileImages = useCallback(() =>
    fetch(`${API}/original-images/${category}/${id}/mobile`).then(r => r.json()).then(setMobileImages),
    [category, id]
  )

  const collapseStorageKey = `editor-collapsed-original-${category}-${id}`
  const [scrollToSection, setScrollToSection] = useState(null)

  useEffect(() => {
    if (scrollToSection == null) return
    const el = document.getElementById(`ed-section-${scrollToSection}`)
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

  useEffect(() => {
    fetch(`${API}/original-info/${category}/${id}`).then(r => r.json()).then(d => {
      setInfo(d)
      // See EditorProject.jsx's identical fallback for why this is guarded —
      // a corrupted stored value here used to throw uncaught inside this
      // fetch .then(), leaving the page broken until site data was cleared.
      let saved = null
      try { saved = JSON.parse(safeGet(`editor-collapsed-original-${category}-${id}`) || 'null') } catch { /* corrupted — fall back to null */ }
      const c = {}
      ;(d.sections || []).forEach((_, i) => { c[i] = saved && i in saved ? saved[i] : true })
      setCollapsed(c)
    })
    refreshImages()
    refreshHoverImages()
    refreshMobileImages()
    fetch(`${API}/originals`).then(r => r.json()).then(list => {
      const entry = list.find(o => o.category === category && o.id === id)
      setHidden(!!entry?.hidden)
      setTags(entry?.tags || [])
      setYear(entry?.year || '')
    })
  }, [category, id])

  const save = async () => {
    await Promise.all([
      fetch(`${API}/original-info/${category}/${id}`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(info) }),
      fetch(`${API}/original-tags/${category}/${id}`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ tags }) }),
      fetch(`${API}/original-year/${category}/${id}`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ year }) }),
    ])
    try { const bc = new BroadcastChannel('nnwoo-content'); bc.postMessage({ category, id }); bc.close() } catch { /* unsupported */ }
    setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  const moveCategory = async () => {
    if (!confirm(`Move category from "${category}" → "${editCategory}"?\n(Folder and thumbnail files will also be moved.)`)) return
    const res = await fetch(`${API}/original-category/${category}/${id}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newCategory: editCategory })
    })
    if (!res.ok) { alert('Move failed'); return }
    navigate(`/editor/originals/${editCategory}/${id}`)
  }

  const updateMeta = (key, val) => setInfo(i => ({...i, [key]: val}))
  const updateSection = (si, key, val) => setInfo(i => { const sections = [...i.sections]; sections[si] = {...sections[si], [key]: val}; return {...i, sections} })
  const updateOverlay = (si, key, val) => setInfo(i => { const sections = [...i.sections]; const overlay = {...(sections[si].overlay || {}), [key]: val}; sections[si] = {...sections[si], overlay}; return {...i, sections} })
  const updateBlock = (si, bi, key, val) => setInfo(i => { const sections = [...i.sections]; const blocks = [...(sections[si].blocks||[])]; blocks[bi] = {...blocks[bi], [key]: val}; sections[si] = {...sections[si], blocks}; return {...i, sections} })
  const addSection = () => setInfo(i => { const sections = [...(i.sections||[]), emptySection()]; setCollapsed(c => { const next = {...c, [sections.length-1]: false}; safeSet(collapseStorageKey, JSON.stringify(next)); return next }); return {...i, sections} })
  const removeSection    = (si) => setInfo(i => ({...i, sections: i.sections.filter((_,idx) => idx !== si)}))
  const duplicateSection = (si) => setInfo(i => { const sections = [...i.sections]; const copy = JSON.parse(JSON.stringify(sections[si])); copy.id = copy.id ? copy.id + '-copy' : ''; sections.splice(si + 1, 0, copy); return {...i, sections} })
  const moveSection = (si, dir) => setInfo(i => { const sections = [...i.sections]; const t = si+dir; if(t<0||t>=sections.length) return i; [sections[si],sections[t]]=[sections[t],sections[si]]; return {...i, sections} })
  const reorderSection = (from, to) => {
    if (from == null || to == null || from === to) return
    setInfo(i => { const sections = [...i.sections]; const [moved] = sections.splice(from, 1); sections.splice(to, 0, moved); return {...i, sections} })
    setCollapsed(c => {
      const next = remapCollapsedOnReorder(c, from, to, (info.sections || []).length)
      safeSet(collapseStorageKey, JSON.stringify(next)); return next
    })
  }
  const addBlock = (si) => setInfo(i => { const sections = [...i.sections]; sections[si] = {...sections[si], blocks: [...(sections[si].blocks||[]), emptyBlock()]}; return {...i, sections} })
  const removeBlock    = (si, bi) => setInfo(i => { const sections = [...i.sections]; sections[si] = {...sections[si], blocks: sections[si].blocks.filter((_,idx) => idx !== bi)}; return {...i, sections} })
  const duplicateBlock = (si, bi) => setInfo(i => { const sections = [...i.sections]; const blocks = [...(sections[si].blocks||[])]; blocks.splice(bi + 1, 0, JSON.parse(JSON.stringify(blocks[bi]))); sections[si] = {...sections[si], blocks}; return {...i, sections} })
  const moveBlock      = (si, bi, dir) => setInfo(i => { const sections = [...i.sections]; const blocks = [...(sections[si].blocks||[])]; const j = bi + dir; if (j < 0 || j >= blocks.length) return i; [blocks[bi], blocks[j]] = [blocks[j], blocks[bi]]; sections[si] = {...sections[si], blocks}; return {...i, sections} })

  const collapseAll = () => { const c = {}; (info.sections||[]).forEach((_,i) => {c[i]=true}); safeSet(collapseStorageKey, JSON.stringify(c)); setCollapsed(c) }
  const expandAll = () => { safeSet(collapseStorageKey, JSON.stringify({})); setCollapsed({}) }

  const toggleHidden = async () => {
    const next = !hidden
    try {
      const res = await fetch(`${API}/original-hidden/${category}/${id}`, {
        method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ hidden: next })
      })
      if (!res.ok) throw new Error(`${res.status}`)
      setHidden(next)
    } catch (e) {
      alert(`Failed to hide: ${e.message}\nPlease check that the server is running.`)
    }
  }

  if (!info) return <div style={{padding:'40px', color:'var(--ed-text-xmuted)'}}>Loading...</div>

  return (
    <div className="ed-page">
      <EditorTopbar title={`${category} / ${id}`} onSave={save} saved={saved} extra={
        <div style={{display:'flex', gap:'6px'}}>
          <button onClick={collapseAll} style={{background:'var(--ed-input-bg)', border:'none', borderRadius:'6px', padding:'6px 12px', fontSize:'12px', cursor:'pointer', fontFamily:'inherit', color:'var(--ed-text-sub)'}}>Collapse All</button>
          <button onClick={expandAll} style={{background:'var(--ed-input-bg)', border:'none', borderRadius:'6px', padding:'6px 12px', fontSize:'12px', cursor:'pointer', fontFamily:'inherit', color:'var(--ed-text-sub)'}}>Expand All</button>
          <button onClick={toggleHidden} style={{
            border: hidden ? '1px solid #ffc8c8' : '1px solid var(--ed-input-border)',
            borderRadius:'6px', padding:'6px 12px', fontSize:'12px', cursor:'pointer', fontFamily:'inherit', fontWeight:600,
            background: hidden ? '#fff0f0' : 'var(--ed-input-bg)',
            color: hidden ? '#e53e3e' : 'var(--ed-text-sub)',
            transition:'all 0.15s',
          }}>
            {hidden ? '🙈 Hidden' : '👁 Visible'}
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
            borderRadius:'6px', padding:'6px 12px', fontSize:'12px', cursor:'pointer', fontFamily:'inherit', fontWeight:600,
            background: info.maintenance ? '#fff0f0' : 'var(--ed-input-bg)',
            color: info.maintenance ? '#e53e3e' : 'var(--ed-text-sub)',
            transition:'all 0.15s',
          }}>
            {info.maintenance ? '🔒 Maintenance' : '🌐 Public'}
          </button>
        </div>
      } />
      <EditorSectionNav sections={[
        { id: 'ed-orig-overview', label: 'Overview' },
        { id: 'ed-orig-sections', label: 'Sections' },
      ]} />

      <Card id="ed-orig-overview" title="Overview" collapsible defaultOpen>
        <TextField label="Nav Label (default: title — year)" value={info.navLabel||''} onChange={v => updateMeta('navLabel', v)} size={info.navLabelSize||''} onSize={v => updateMeta('navLabelSize', v)} weight={info.navLabelWeight||''} onWeight={v => updateMeta('navLabelWeight', v)} italic={info.navLabelItalic} onItalic={v => updateMeta('navLabelItalic', v)} sizePlaceholder="Default (13px)" weightPlaceholder="Default (400)" />
        <TextField label="Overview Title" value={info.overviewTitle||''} onChange={v => updateMeta('overviewTitle', v)} size={info.overviewTitleSize||''} onSize={v => updateMeta('overviewTitleSize', v)} sizePlaceholder="Default (22px)" weight={info.overviewTitleWeight||''} onWeight={v => updateMeta('overviewTitleWeight', v)} weightPlaceholder="Default (700)" italic={info.overviewTitleItalic} onItalic={v => updateMeta('overviewTitleItalic', v)} />
        <TierSizeRow label="Overview Title" size={info.overviewTitleSize}
          tabletValue={info.overviewTitleSizeTablet} onTablet={v => updateMeta('overviewTitleSizeTablet', v)}
          mobileValue={info.overviewTitleSizeMobile} onMobile={v => updateMeta('overviewTitleSizeMobile', v)} />
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
        <TextField label="Sub Title (shown between Overview Title and Overview)" value={info.overviewSubtitle||''} onChange={v => updateMeta('overviewSubtitle', v)} size={info.overviewSubtitleSize||''} onSize={v => updateMeta('overviewSubtitleSize', v)} sizePlaceholder="Default (13px)" weight={info.overviewSubtitleWeight||''} onWeight={v => updateMeta('overviewSubtitleWeight', v)} weightPlaceholder="Default (600)" italic={info.overviewSubtitleItalic} onItalic={v => updateMeta('overviewSubtitleItalic', v)} rich />
        <TierSizeRow label="Sub Title" size={info.overviewSubtitleSize}
          tabletValue={info.overviewSubtitleSizeTablet} onTablet={v => updateMeta('overviewSubtitleSizeTablet', v)}
          mobileValue={info.overviewSubtitleSizeMobile} onMobile={v => updateMeta('overviewSubtitleSizeMobile', v)} />
        <TextField label="Overview" value={info.overview||''} onChange={v => updateMeta('overview', v)} size={info.overviewSize||''} onSize={v => updateMeta('overviewSize', v)} sizePlaceholder="Default (18px)" weight={info.overviewWeight||''} onWeight={v => updateMeta('overviewWeight', v)} weightPlaceholder="Default (400)" italic={info.overviewItalic} onItalic={v => updateMeta('overviewItalic', v)} multiline rows={4} rich />
        <TierSizeRow label="Overview" size={info.overviewSize}
          tabletValue={info.overviewSizeTablet} onTablet={v => updateMeta('overviewSizeTablet', v)}
          mobileValue={info.overviewSizeMobile} onMobile={v => updateMeta('overviewSizeMobile', v)} />
        <Row>
          <MaxWidthInput label="Overview Max Width (only applies at 1920px+)" placeholder="Default (none)" value={info.overviewMaxWidth||''} onChange={v => updateMeta('overviewMaxWidth', v || undefined)} />
        </Row>
        <Row>
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
          <TextField label="Type" value={info.type||''} onChange={v => updateMeta('type', v)} size={info.typeSize||''} onSize={v => updateMeta('typeSize', v)} weight={info.typeWeight||''} onWeight={v => updateMeta('typeWeight', v)} italic={info.typeItalic} onItalic={v => updateMeta('typeItalic', v)} sizePlaceholder="Default (17px)" weightPlaceholder="Default (400)" />
          <TextField label="Year" value={info.duration||''} onChange={v => updateMeta('duration', v)} size={info.durationSize||''} onSize={v => updateMeta('durationSize', v)} weight={info.durationWeight||''} onWeight={v => updateMeta('durationWeight', v)} italic={info.durationItalic} onItalic={v => updateMeta('durationItalic', v)} sizePlaceholder="Default (17px)" weightPlaceholder="Default (400)" />
          <TextField label="Role" value={info.role||''} onChange={v => updateMeta('role', v)} size={info.roleSize||''} onSize={v => updateMeta('roleSize', v)} weight={info.roleWeight||''} onWeight={v => updateMeta('roleWeight', v)} italic={info.roleItalic} onItalic={v => updateMeta('roleItalic', v)} sizePlaceholder="Default (17px)" weightPlaceholder="Default (400)" />
          <TextField label="Team" value={info.team||''} onChange={v => updateMeta('team', v)} size={info.teamSize||''} onSize={v => updateMeta('teamSize', v)} weight={info.teamWeight||''} onWeight={v => updateMeta('teamWeight', v)} italic={info.teamItalic} onItalic={v => updateMeta('teamItalic', v)} sizePlaceholder="Default (17px)" weightPlaceholder="Default (400)" />
        </Row>
        <Row>
          <TierSizeRow label="Type" size={info.typeSize} tabletValue={info.typeSizeTablet} onTablet={v => updateMeta('typeSizeTablet', v)} mobileValue={info.typeSizeMobile} onMobile={v => updateMeta('typeSizeMobile', v)} />
          <TierSizeRow label="Year" size={info.durationSize} tabletValue={info.durationSizeTablet} onTablet={v => updateMeta('durationSizeTablet', v)} mobileValue={info.durationSizeMobile} onMobile={v => updateMeta('durationSizeMobile', v)} />
          <TierSizeRow label="Role" size={info.roleSize} tabletValue={info.roleSizeTablet} onTablet={v => updateMeta('roleSizeTablet', v)} mobileValue={info.roleSizeMobile} onMobile={v => updateMeta('roleSizeMobile', v)} />
          <TierSizeRow label="Team" size={info.teamSize} tabletValue={info.teamSizeTablet} onTablet={v => updateMeta('teamSizeTablet', v)} mobileValue={info.teamSizeMobile} onMobile={v => updateMeta('teamSizeMobile', v)} />
        </Row>
        <Row>
          <Field label="Year (shown on card hover in All tab)">
            <input style={s} type="number" placeholder="e.g. 2026" value={year} onChange={e => setYear(e.target.value)} />
          </Field>
        </Row>
        <Field label="Tags"><TagInput value={tags} onChange={setTags} /></Field>
        <Row>
          <Field label="Category">
            <select style={s} value={editCategory} onChange={e => setEditCategory(e.target.value)}>
              {ORIGINAL_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          {editCategory !== category && (
            <Field label=" ">
              <button onClick={moveCategory} style={{...s, background:'#111', color:'#fff', cursor:'pointer', fontWeight:600, border:'none'}}>
                Move to "{editCategory}"
              </button>
            </Field>
          )}
        </Row>
      </Card>

      <ThumbnailIconCard type="originals" category={category} id={id} />
      <AllThumbnailCard type="originals" category={category} id={id} />

      <div id="ed-orig-sections" style={{ scrollMarginTop: '76px' }} />
      <div style={{ display:'flex', gap:'14px', alignItems:'flex-start' }}>
        {(info.sections||[]).length > 0 && (
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
      {(info.sections||[]).map((section, si) => {
        const isCollapsed = !!collapsed[si]
        return (
          <div
            key={si}
            id={`ed-section-${si}`}
            onDragOver={e => { if (dragIdx !== null) { e.preventDefault(); if (dropIdx !== si) setDropIdx(si) } }}
            onDrop={e => { e.preventDefault(); reorderSection(dragIdxRef.current, si); dragIdxRef.current = null; setDragIdx(null); setDropIdx(null) }}
            style={{border:'1px solid var(--ed-card-border)', borderRadius:'12px', background:'var(--ed-card-bg)', flexShrink:0, overflow:'visible', opacity: dragIdx === si ? 0.4 : section.hidden ? 0.5 : 1, boxShadow: (dropIdx === si && dragIdx !== null && dragIdx !== si) ? '0 0 0 2px #0087ED' : undefined, transition:'box-shadow 0.12s ease, opacity 0.12s ease', scrollMarginTop:'88px'}}>
            <div
              className="ed-section-hd" style={{display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 20px', background:'var(--ed-head-bg)', borderRadius: isCollapsed ? '12px' : '12px 12px 0 0', userSelect:'none'}}>
              <div style={{display:'flex', alignItems:'center', gap:'8px', flex:1, minWidth:0, overflow:'hidden'}}>
                <span draggable onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; dragIdxRef.current = si; setDragIdx(si) }} onDragEnd={() => { dragIdxRef.current = null; setDragIdx(null); setDropIdx(null) }} title="Drag to reorder" style={{cursor:'grab', color:'var(--ed-text-xmuted)', fontSize:'15px', flexShrink:0, padding:'0 2px', lineHeight:1, userSelect:'none'}}>⠿</span>
                <SectionDots section={section} />
                <span style={{overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1, display:'flex', flexDirection:'column', gap:'1px', minWidth:0}}>
                  <span style={{fontSize:'13px', fontWeight:600, color:'var(--ed-text)'}}>{section.label||section.id||'(No title)'}</span>
                  {isCollapsed && section.id && (
                    <span style={{fontSize:'10px', color:'var(--ed-text-muted)', fontFamily:'monospace'}}>{section.id}</span>
                  )}
                </span>
                <button
                  onClick={() => setCollapsed(c => { const next = {...c, [si]: !c[si]}; safeSet(collapseStorageKey, JSON.stringify(next)); return next })}
                  style={{background:'none', border:'none', borderRadius:'5px', padding:'3px 6px', cursor:'pointer', color:'var(--ed-text-muted)', flexShrink:0, display:'flex', alignItems:'center'}}
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" style={{display:'block', transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition:'transform 0.15s'}}><polygon points="1,2 11,2 6,10"/></svg>
                </button>
              </div>
              <div style={{display:'flex', alignItems:'center', gap:'4px', flexShrink:0, marginLeft:'8px'}}>
                <SectionPreviewThumb section={section} category={category} id={id} images={images} />
                <button onClick={() => moveSection(si,-1)} style={{background:'var(--ed-input-bg)', border:'none', borderRadius:'5px', padding:'3px 8px', cursor:'pointer', fontSize:'12px', color:'var(--ed-text-sub)'}}>↑</button>
                <button onClick={() => moveSection(si,1)} style={{background:'var(--ed-input-bg)', border:'none', borderRadius:'5px', padding:'3px 8px', cursor:'pointer', fontSize:'12px', color:'var(--ed-text-sub)'}}>↓</button>
                <button onClick={() => updateSection(si, 'hidden', !section.hidden)} title={section.hidden ? 'Show section' : 'Hide section'} style={{background:'var(--ed-input-bg)', border:'none', borderRadius:'5px', padding:'3px 8px', cursor:'pointer', color: section.hidden ? 'var(--ed-accent)' : 'var(--ed-text-sub)', display:'flex', alignItems:'center'}}>
                  {section.hidden ? (
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M1 8s3-5 7-5 7 5 7 5-3 5-7 5-7-5-7-5z"/><circle cx="8" cy="8" r="2.5"/><line x1="2" y1="2" x2="14" y2="14"/></svg>
                  ) : (
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M1 8s3-5 7-5 7 5 7 5-3 5-7 5-7-5-7-5z"/><circle cx="8" cy="8" r="2.5"/></svg>
                  )}
                </button>
                <button onClick={() => duplicateSection(si)} style={{background:'var(--ed-input-bg)', border:'none', color:'var(--ed-text-sub)', cursor:'pointer', padding:'3px 8px', borderRadius:'5px', display:'flex', alignItems:'center'}}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>
                <button onClick={() => removeSection(si)} style={{background:'none', border:'none', color:'#e53e3e', cursor:'pointer', padding:'3px 8px', borderRadius:'5px', display:'flex', alignItems:'center'}}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg></button>
              </div>
            </div>

            {!isCollapsed && (
              <div style={{padding:'20px 24px', display:'flex', flexDirection:'column', gap:'16px', borderTop:'1px solid var(--ed-divider)'}}>
                <Row>
                  <Field label="ID"><input style={s} value={section.id} onChange={e => updateSection(si,'id',e.target.value)} /></Field>
                  <Field label="Label (TOC)"><input style={s} value={section.label} onChange={e => updateSection(si,'label',e.target.value)} /></Field>
                  <Field label="Type">
                    <select style={s} value={section.type} onChange={e => updateSection(si,'type',e.target.value)}>
                      <option value="images">images — images only</option>
                      <option value="image-text">image-text — mid size</option>
                      <option value="image-text-carousel">image-text-carousel — carousel</option>
                      <option value="image-grid">image-grid — grid tiles</option>
                      <option value="scroll-animation">scroll-animation — scroll animation</option>
                      <option value="model-viewer">model-viewer — 3D model</option>
                      <option value="interactive">interactive — lab piece embed</option>
                      <option value="text">text — text only</option>
                      <option value="text-columns">text-columns — 2–4 col layout</option>
                      <option value="tab-switcher">tab-switcher — tabbed content</option>
                      <option value="feature-tabs">feature-tabs — icon pill tabs</option>
                      <option value="accordion">accordion — expand/collapse</option>
                      <option value="image-tab">image-tab — tab image+text switcher</option>
                      <option value="video-background">video-background — autoplay video</option>
                      <option value="stats">stats — number highlights</option>
                    </select>
                  </Field>
                </Row>

                <BgColorField value={section.bgColor || ''} onChange={v => updateSection(si, 'bgColor', v)} />

                <Row>
                  <Field label="Spacing Top (e.g. 80px, 0)">
                    <input style={s} placeholder="default (80px)" value={section.paddingTop ?? ''} onChange={e => updateSection(si, 'paddingTop', e.target.value)} onBlur={e => { if (!e.target.value) updateSection(si, 'paddingTop', '80px') }} />
                  </Field>
                  <Field label="Spacing Bottom (e.g. 80px, 0)">
                    <input style={s} placeholder="default (80px)" value={section.paddingBottom ?? ''} onChange={e => updateSection(si, 'paddingBottom', e.target.value)} onBlur={e => { if (!e.target.value) updateSection(si, 'paddingBottom', '80px') }} />
                  </Field>
                </Row>

                {section.type === 'text' && (
                  <div style={{display:'flex', flexDirection:'column', gap:'12px'}}>
                    <Row>
                      <Field label="Text Max Width">
                        <MaxWidthInput placeholder="Default (700)" value={section.textMaxWidth} onChange={v => updateSection(si,'textMaxWidth',v)} />
                      </Field>
                    </Row>
                    <TextStyleRow value={section} onChange={v => setInfo(i => { const sections=[...i.sections]; sections[si]={...sections[si],...v}; return {...i,sections} })} />
                    <TextLinesEditor
                      lines={section.lines != null ? section.lines : autoConvertToLines(section)}
                      onChange={lines => updateSection(si, 'lines', lines)}
                    />
                  </div>
                )}

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

                {section.type === 'scroll-animation' && (
                  <div style={{background:'var(--ed-block-bg)', borderRadius:'10px', padding:'16px', display:'flex', flexDirection:'column', gap:'12px'}}>
                    <div style={{fontSize:'11px', fontWeight:600, color:'var(--ed-text-muted)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'4px'}}>Scroll Animation</div>
                    <Field label="Frame Count"><input style={s} type="number" value={section.frameCount||72} onChange={e => updateSection(si,'frameCount',parseInt(e.target.value))} /></Field>
                    <Field label="Text Panel Width">
                      <MaxWidthInput placeholder="Default (300px)" value={section.textMaxWidth} onChange={v => updateSection(si,'textMaxWidth',v)} />
                    </Field>
                    <TextLinesEditor
                      lines={section.lines != null ? section.lines : autoConvertToLines(section)}
                      onChange={lines => updateSection(si, 'lines', lines)}
                    />
                    <div style={{fontSize:'12px', color:'var(--ed-text-xmuted)'}}>Path: /assets/originals/{category}/{id}/scroll/frame-0001.webp ~ frame-{String(section.frameCount||72).padStart(4,'0')}.webp</div>
                  </div>
                )}

                {section.type === 'model-viewer' && (
                  <div style={{background:'var(--ed-block-bg)', borderRadius:'10px', padding:'16px', display:'flex', flexDirection:'column', gap:'12px'}}>
                    <div style={{fontSize:'11px', fontWeight:600, color:'var(--ed-text-muted)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:'4px'}}>3D Model</div>
                    <Field label="Model File (e.g. model.glb)"><input style={s} value={section.modelFile||''} onChange={e => updateSection(si,'modelFile',e.target.value)} placeholder="model.glb" /></Field>
                    <Field label="Auto Rotate"><select style={s} value={section.autoRotate!==false?'true':'false'} onChange={e => updateSection(si,'autoRotate',e.target.value==='true')}><option value="true">On</option><option value="false">Off</option></select></Field>
                    <TextLinesEditor
                      lines={section.lines != null ? section.lines : autoConvertToLines(section)}
                      onChange={lines => updateSection(si, 'lines', lines)}
                    />
                  </div>
                )}

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

                {section.type === 'video-background' && (
                  <div style={{background:'var(--ed-block-bg)', borderRadius:'10px', padding:'16px', display:'flex', flexDirection:'column', gap:'12px'}}>
                    <div style={{fontSize:'11px', fontWeight:600, color:'var(--ed-text-muted)', textTransform:'uppercase', letterSpacing:'0.06em'}}>Video Background</div>
                    <Field label="Source">
                      <select style={s} value={section.videoType==='youtube'?'youtube':'file'} onChange={e => updateSection(si,'videoType', e.target.value === 'youtube' ? 'youtube' : undefined)}>
                        <option value="file">Video File</option>
                        <option value="youtube">YouTube</option>
                      </select>
                    </Field>
                    {section.videoType === 'youtube' ? (
                      <>
                        <Field label="YouTube URL or Video ID">
                          <input style={s} value={section.youtubeId||''} onChange={e => updateSection(si,'youtubeId',extractYoutubeId(e.target.value))} placeholder="https://youtube.com/watch?v=... or bare ID" />
                        </Field>
                        <Field label="Thumbnail (optional — defaults to YouTube's own)">
                          <input style={s} value={section.videoThumbnail||''} onChange={e => updateSection(si,'videoThumbnail',e.target.value)} placeholder="thumbnail.jpg" />
                        </Field>
                      </>
                    ) : (
                      <Field label="Video File (from category folder)">
                        <input style={s} value={section.videoSrc||''} onChange={e => updateSection(si,'videoSrc',e.target.value)} placeholder="video.mp4" />
                      </Field>
                    )}
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
                    <Field label="Content Width">
                      <label style={{display:'flex', alignItems:'center', gap:'8px', cursor:'pointer', fontSize:'13px', color:'var(--ed-text)'}}>
                        <input type="checkbox" checked={!!section.matchTextPadding} onChange={e => updateSection(si, 'matchTextPadding', e.target.checked || undefined)} />
                        Respect page padding (unchecked = full-bleed edge to edge)
                      </label>
                    </Field>
                    <TextLinesEditor
                      lines={section.lines != null ? section.lines : autoConvertToLines(section)}
                      onChange={lines => updateSection(si, 'lines', lines)}
                    />
                    <MaxWidthInput label="Text Max Width" value={section.textMaxWidth||''} onChange={v => updateSection(si,'textMaxWidth',v)} />
                  </div>
                )}

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

                {section.type === 'images' && (
                  <div style={{display:'flex', flexDirection:'column', gap:'16px'}}>
                    <RatioRow
                      desktopRatio={section.desktopRatio || ''}
                      mobileRatio={section.mobileRatio || ''}
                      onDesktopRatio={v => updateSection(si, 'desktopRatio', v || undefined)}
                      onMobileRatio={v => updateSection(si, 'mobileRatio', v || undefined)}
                    />
                    <Field label="Content Width">
                      <label style={{display:'flex', alignItems:'center', gap:'8px', cursor:'pointer', fontSize:'13px', color:'var(--ed-text)'}}>
                        <input type="checkbox" checked={!!section.matchTextPadding} onChange={e => updateSection(si, 'matchTextPadding', e.target.checked || undefined)} />
                        Respect page padding (unchecked = full-bleed edge to edge)
                      </label>
                    </Field>
                    <ImagePicker
                      label="Images"
                      value={section.images || []}
                      onChange={v => updateSection(si, 'images', v)}
                      images={images}
                      basePath={basePath}
                      uploadUrl={uploadUrl}
                      onRefresh={refreshImages}
                      ratio={section.desktopRatio}
                    />
                    <MobileOverridePicker
                      desktopNums={section.images || []}
                      value={section.mobileImages || []}
                      onChange={v => updateSection(si, 'mobileImages', v)}
                      images={mobileImages}
                      basePath={mobileBasePath}
                      uploadUrl={`${API}/original-images/${category}/${id}/mobile/upload`}
                      onRefresh={refreshMobileImages}
                      ratio={section.mobileRatio || section.desktopRatio}
                    />
                    <div style={{paddingTop:'12px', borderTop:'1px dashed var(--ed-divider)', display:'flex', flexDirection:'column', gap:'12px'}}>
                      <div style={{fontSize:'11px', fontWeight:600, color:'var(--ed-text-muted)', textTransform:'uppercase', letterSpacing:'0.06em'}}>Overlay Text (optional)</div>
                      <PositionPicker value={(section.overlay||{}).position} onChange={v => updateOverlay(si,'position',v)} label="Position" />
                      <Row>
                        <Field label="Max Width (Desktop)"><MaxWidthInput placeholder="Default (320px)" value={(section.overlay||{}).textMaxWidth} onChange={v => updateOverlay(si,'textMaxWidth',v)} /></Field>
                        <Field label="Max Width (Mobile)"><MaxWidthInput placeholder="Default (320px)" value={(section.overlay||{}).mobileTextMaxWidth} onChange={v => updateOverlay(si,'mobileTextMaxWidth',v)} /></Field>
                      </Row>
                      <TextField label="Title" value={(section.overlay||{}).title||''} onChange={v => updateOverlay(si,'title',v)}
                        size={(section.overlay||{}).titleSize} onSize={v => updateOverlay(si,'titleSize',v)}
                        weight={(section.overlay||{}).titleWeight} onWeight={v => updateOverlay(si,'titleWeight',v)}
                        color={(section.overlay||{}).titleColor} onColor={v => updateOverlay(si,'titleColor',v)}
                        font={(section.overlay||{}).titleFont} onFont={v => updateOverlay(si,'titleFont',v)}
                        italic={(section.overlay||{}).titleItalic} onItalic={v => updateOverlay(si,'titleItalic',v)}  rich />
                      <TextField label="Content" value={(section.overlay||{}).content||''} onChange={v => updateOverlay(si,'content',v)}
                        size={(section.overlay||{}).contentSize} onSize={v => updateOverlay(si,'contentSize',v)}
                        weight={(section.overlay||{}).contentWeight} onWeight={v => updateOverlay(si,'contentWeight',v)}
                        color={(section.overlay||{}).contentColor} onColor={v => updateOverlay(si,'contentColor',v)}
                        font={(section.overlay||{}).contentFont} onFont={v => updateOverlay(si,'contentFont',v)}
                        italic={(section.overlay||{}).contentItalic} onItalic={v => updateOverlay(si,'contentItalic',v)}
                        multiline rows={3}  rich />
                      <TextStyleRow
                        value={section.overlay || {}}
                        onChange={v => setInfo(i => { const sections=[...i.sections]; sections[si]={...sections[si], overlay:{...(sections[si].overlay||{}),...v}}; return {...i,sections} })}
                      />
                    </div>
                  </div>
                )}

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
                      <Field label="Gap">
                        <input style={s} placeholder="Default (4px)" value={section.gap||''} onChange={e => updateSection(si,'gap',e.target.value)} onBlur={e => { if (!e.target.value) updateSection(si,'gap','4px') }} />
                      </Field>
                    </Row>
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
                      uploadUrl={uploadUrl}
                      onRefresh={refreshImages}
                      ratio={section.desktopRatio}
                    />
                  </div>
                )}

                {section.type === 'image-text' && (
                  <Field label="Content Width">
                    <label style={{display:'flex', alignItems:'center', gap:'8px', cursor:'pointer', fontSize:'13px', color:'var(--ed-text)'}}>
                      <input type="checkbox" checked={!!section.matchTextPadding} onChange={e => updateSection(si, 'matchTextPadding', e.target.checked || undefined)} />
                      Respect page padding (unchecked = full-bleed edge to edge)
                    </label>
                  </Field>
                )}

                {section.type === 'image-text' && (
                  <Row>
                    <Field label="Fixed Card Height (px) — empty = ratio mode">
                      <input style={s} type="number" min="0" placeholder="e.g. 480 (leave empty to disable)" value={section.cardHeight||''} onChange={e => updateSection(si,'cardHeight', e.target.value ? Number(e.target.value) : undefined)} />
                    </Field>
                    <Field label="Fixed Card Height — Tablet (px)">
                      <input style={s} type="number" min="0" placeholder="Same as Desktop" value={section.cardHeightTablet||''} onChange={e => updateSection(si,'cardHeightTablet', e.target.value ? Number(e.target.value) : undefined)} />
                    </Field>
                  </Row>
                )}

                {section.type === 'image-text-carousel' && (
                  <>
                    <Row>
                      <Field label={`Card Width${section.cardHeight ? ' (ignored — height mode)' : ''}`}><select style={s} value={section.cardSize||'medium'} onChange={e => updateSection(si,'cardSize',e.target.value)} disabled={!!section.cardHeight}><option value="small">Small — 40%</option><option value="medium">Medium — 70%</option><option value="large">Large — 90%</option></select></Field>
                      <Field label="Card Ratio (fallback)"><select style={s} value={section.cardRatio||''} onChange={e => updateSection(si,'cardRatio',e.target.value || undefined)}><option value="">Default (16:9)</option><option value="16/9">16:9</option><option value="1/1">1:1</option><option value="5/4">5:4</option><option value="3/2">3:2</option></select></Field>
                    </Row>
                    <Field label="Fixed Card Height (px) — height stays constant, width follows each block's ratio. Empty = width mode.">
                      <input style={s} type="number" min="0" placeholder="e.g. 480 (leave empty to disable)" value={section.cardHeight||''} onChange={e => updateSection(si,'cardHeight', e.target.value ? Number(e.target.value) : undefined)} />
                    </Field>
                    <Field label="Fixed Card Height — Tablet (px)">
                      <input style={s} type="number" min="0" placeholder="Same as Desktop" value={section.cardHeightTablet||''} onChange={e => updateSection(si,'cardHeightTablet', e.target.value ? Number(e.target.value) : undefined)} />
                    </Field>
                  </>
                )}

                {(section.type === 'image-text' || section.type === 'image-text-carousel') && (
                  <div style={{display:'flex', flexDirection:'column', gap:'12px'}}>
                    {(section.blocks||[]).map((block, bi) => (
                      <Block key={bi} label={`Block ${bi+1}`} onRemove={() => removeBlock(si,bi)} onDuplicate={() => duplicateBlock(si,bi)} onMoveUp={bi > 0 ? () => moveBlock(si,bi,-1) : undefined} onMoveDown={bi < (section.blocks.length-1) ? () => moveBlock(si,bi,1) : undefined} collapsible hidden={block.hidden} onToggleHidden={() => updateBlock(si,bi,"hidden",!block.hidden)}>
                        <RatioRow
                          desktopRatio={block.desktopRatio || ''}
                          mobileRatio={block.mobileRatio || ''}
                          onDesktopRatio={v => updateBlock(si, bi, 'desktopRatio', v || undefined)}
                          onMobileRatio={v => updateBlock(si, bi, 'mobileRatio', v || undefined)}
                        />
                        {section.type === 'image-text-carousel' && (
                          <Row>
                            <Field label="Grid Columns">
                              <select style={s} value={block.gridColumns||1} onChange={e => updateBlock(si,bi,'gridColumns', Number(e.target.value) > 1 ? Number(e.target.value) : undefined)}>
                                <option value={1}>None (single)</option>
                                {[2,3,4].map(n => <option key={n} value={n}>{n}</option>)}
                              </select>
                            </Field>
                            <Field label="Grid Rows">
                              <select style={s} value={block.gridRows||''} onChange={e => updateBlock(si,bi,'gridRows', e.target.value ? Number(e.target.value) : undefined)}>
                                <option value="">Auto</option>
                                {[2,3,4].map(n => <option key={n} value={n}>{n}</option>)}
                              </select>
                            </Field>
                            <Field label="Grid Gap">
                              <input style={s} placeholder="2px" value={block.gridGap||''} onChange={e => updateBlock(si,bi,'gridGap', e.target.value || undefined)} />
                            </Field>
                          </Row>
                        )}
                        {section.type === 'image-text' && (
                          <Row>
                            <Field label="Image Width (desktop — centered; mobile stays full)">
                              <select style={s} value={block.imgWidth || 'full'} onChange={e => updateBlock(si, bi, 'imgWidth', e.target.value === 'full' ? undefined : e.target.value)}>
                                <option value="full">Full — 100%</option>
                                <option value="large">Large — 90%</option>
                                <option value="medium">Medium — 70%</option>
                                <option value="small">Small — 50%</option>
                              </select>
                            </Field>
                            <Field label="Corners (mobile)">
                              <label style={{display:'flex', alignItems:'center', gap:'6px', fontSize:'13px', color:'var(--ed-text)', cursor:'pointer'}}>
                                <input type="checkbox" checked={!!block.mobileSquare} onChange={e => updateBlock(si,bi,'mobileSquare', e.target.checked || undefined)} />
                                Remove rounded corners on mobile
                              </label>
                            </Field>
                          </Row>
                        )}
                        <ImagePicker
                          label="🖥 Desktop Images"
                          value={block.images || []}
                          onChange={v => updateBlock(si, bi, 'images', v)}
                          images={images}
                          basePath={basePath}
                          uploadUrl={uploadUrl}
                          onRefresh={refreshImages}
                          ratio={block.desktopRatio}
                        />
                        <MobileOverridePicker
                          desktopNums={block.images || []}
                          value={block.mobileImages || []}
                          onChange={v => updateBlock(si, bi, 'mobileImages', v)}
                          images={mobileImages}
                          basePath={mobileBasePath}
                          uploadUrl={`${API}/original-images/${category}/${id}/mobile/upload`}
                          onRefresh={refreshMobileImages}
                          ratio={block.mobileRatio || block.desktopRatio}
                        />
                        <ImagePicker
                          label="Hover Images"
                          value={block.hoverImages || []}
                          onChange={v => updateBlock(si, bi, 'hoverImages', v)}
                          images={hoverImages}
                          basePath={hoverBasePath}
                          uploadUrl={`${API}/original-images/${category}/${id}/hover/upload`}
                          onRefresh={refreshHoverImages}
                          ratio={block.desktopRatio}
                        />
                        <TextField label="Title" value={block.title||''} onChange={v => updateBlock(si,bi,'title',v)}
                          size={block.titleSize} onSize={v => updateBlock(si,bi,'titleSize',v)}
                          weight={block.titleWeight} onWeight={v => updateBlock(si,bi,'titleWeight',v)}
                          color={block.titleColor} onColor={v => updateBlock(si,bi,'titleColor',v)}
                          font={block.titleFont} onFont={v => updateBlock(si,bi,'titleFont',v)}
                          italic={block.titleItalic} onItalic={v => updateBlock(si,bi,'titleItalic',v)}  rich />
                        <TextField label="Subtitle" value={block.subtitle||''} onChange={v => updateBlock(si,bi,'subtitle',v)}
                          size={block.subtitleSize} onSize={v => updateBlock(si,bi,'subtitleSize',v)}
                          weight={block.subtitleWeight} onWeight={v => updateBlock(si,bi,'subtitleWeight',v)}
                          color={block.subtitleColor} onColor={v => updateBlock(si,bi,'subtitleColor',v)}
                          font={block.subtitleFont} onFont={v => updateBlock(si,bi,'subtitleFont',v)}
                          italic={block.subtitleItalic} onItalic={v => updateBlock(si,bi,'subtitleItalic',v)}  rich />
                        <TextField label="Content" value={block.content||''} onChange={v => updateBlock(si,bi,'content',v)}
                          size={block.contentSize} onSize={v => updateBlock(si,bi,'contentSize',v)}
                          weight={block.contentWeight} onWeight={v => updateBlock(si,bi,'contentWeight',v)}
                          color={block.contentColor} onColor={v => updateBlock(si,bi,'contentColor',v)}
                          font={block.contentFont} onFont={v => updateBlock(si,bi,'contentFont',v)}
                          italic={block.contentItalic} onItalic={v => updateBlock(si,bi,'contentItalic',v)}
                          multiline rows={4}  rich />
                        <TextStyleRow value={block} onChange={v => setInfo(i => { const sections=[...i.sections]; const blocks=[...(sections[si].blocks||[])]; blocks[bi]={...blocks[bi],...v}; sections[si]={...sections[si],blocks}; return {...i,sections} })} />
                        {(section.type === 'image-text-carousel' || section.type === 'image-text') && (
                          <Field label="Text Max Width">
                            <MaxWidthInput placeholder="Default (480)" value={block.textMaxWidth} onChange={v => updateBlock(si,bi,'textMaxWidth',v)} />
                          </Field>
                        )}
                        <div style={{background:'var(--ed-block-bg)', borderRadius:'8px', padding:'12px', display:'flex', flexDirection:'column', gap:'10px'}}>
                          <div style={{fontSize:'11px', fontWeight:600, color:'var(--ed-text-muted)', textTransform:'uppercase', letterSpacing:'0.06em'}}>Hover Overlay</div>
                          <Field label="Overlay Title"><input style={s} value={block.overlayTitle||''} onChange={e => updateBlock(si,bi,'overlayTitle',e.target.value)} /></Field>
                          <Field label="Overlay Content"><textarea style={{...s,resize:'vertical'}} rows={3} value={block.overlayContent||''} onChange={e => updateBlock(si,bi,'overlayContent',e.target.value)} /></Field>
                        </div>
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
        </div>
      </div>
    </div>
  )
}
