import { useState, useEffect, useRef } from 'react'

const API = '/api'

const emptyBlock = () => ({ images: [], hoverImages: [], title: '', subtitle: '', content: '', annotations: [] })
const emptySection = () => ({ id: '', label: '', type: 'images', images: [], blocks: [emptyBlock()] })
const emptyAnnotation = () => ({ x: 50, y: 50, bendX: null, lineX: 20, lineY: 50, title: '', content: '', side: 'left', icon: '' })

const SECTION_DISPLAY = {
  'images': 'Full width · images only',
  'image-text': 'Mid size (side margins)',
  'image-text-carousel': 'Carousel cards',
  'scroll-animation': 'Scroll animation · frame sequence',
}

function AnnotationEditor({ si, bi, block, images, selected, updateAnnotation, addAnnotation, removeAnnotation }) {
  const imgRef = useRef(null)
  const annotations = block.annotations || []
  const [placing, setPlacing] = useState(null)
  const [placingIdx, setPlacingIdx] = useState(null)

  const getPercent = (e) => {
    const rect = imgRef.current.getBoundingClientRect()
    const x = Math.round(((e.clientX - rect.left) / rect.width) * 100)
    const y = Math.round(((e.clientY - rect.top) / rect.height) * 100)
    return { x, y }
  }

  const handleImgClick = (e) => {
    if (!placing || placingIdx === null) return
    const { x, y } = getPercent(e)
    if (placing === 'dot') {
      updateAnnotation(si, bi, placingIdx, 'x', x)
      updateAnnotation(si, bi, placingIdx, 'y', y)
    } else if (placing === 'bend') {
      updateAnnotation(si, bi, placingIdx, 'bendX', x)
    } else if (placing === 'label') {
      updateAnnotation(si, bi, placingIdx, 'lineX', x)
      updateAnnotation(si, bi, placingIdx, 'lineY', y)
    }
    setPlacing(null)
    setPlacingIdx(null)
  }

  const startPlacing = (ai, type) => { setPlacingIdx(ai); setPlacing(type) }

  const imgNum = block.images?.[0]
  const imgName = imgNum ? String(imgNum).padStart(2, '0') : null
  const imgFile = imgName ? images.find(f => f.name.startsWith(imgName)) : null
  const imgSrc = imgFile ? `/assets/projects/${selected.category}/${selected.id}/sections/${imgFile.name}` : null

  const hintText = { dot: '📍 Click dot position', bend: '↗️ Click bend X position', label: '📝 Click text position' }

  return (
    <div className="editor-annotation-wrap">
      <div className="editor-annotation-label">Annotations</div>
      {imgSrc && (
        <div
          ref={imgRef}
          className={`editor-ann-img-wrap${placing ? ' placing' : ''}`}
          onClick={handleImgClick}
        >
          <img src={imgSrc} alt="preview" style={{width:'100%', display:'block', borderRadius:'8px'}} />
          {placing && (
            <div className="editor-ann-placing-hint">{hintText[placing]}</div>
          )}
          {annotations.map((ann, ai) => (
            <div key={ai}>
              <div className="editor-ann-dot-preview" style={{left:`${ann.x}%`, top:`${ann.y}%`}} />
              <svg style={{position:'absolute',inset:0,width:'100%',height:'100%',pointerEvents:'none',overflow:'visible'}}>
                {ann.bendX != null
                  ? <path d={`M ${ann.x}% ${ann.y}% L ${ann.bendX}% ${ann.y}% L ${ann.bendX}% ${ann.lineY}% L ${ann.lineX}% ${ann.lineY}%`} fill="none" stroke="#4a90e2" strokeWidth="1.5" strokeDasharray="4,2" />
                  : <line x1={`${ann.x}%`} y1={`${ann.y}%`} x2={`${ann.lineX}%`} y2={`${ann.lineY}%`} stroke="#4a90e2" strokeWidth="1.5" strokeDasharray="4,2" />
                }
                {ann.bendX != null && (
                  <circle cx={`${ann.bendX}%`} cy={`${ann.y}%`} r="4" fill="#4a90e2" opacity="0.6" />
                )}
              </svg>
              <div className="editor-ann-label-preview" style={{left:`${ann.lineX}%`, top:`${ann.lineY}%`}}>
                {ai + 1}
              </div>
            </div>
          ))}
        </div>
      )}
      {annotations.map((ann, ai) => (
        <div key={ai} className="editor-ann-item">
          <div className="editor-ann-item-header">
            <span>#{ai + 1}</span>
            <div style={{display:'flex', gap:'8px', flexWrap:'wrap'}}>
              <button className={`editor-ann-place-btn${placing === 'dot' && placingIdx === ai ? ' active' : ''}`} onClick={() => startPlacing(ai, 'dot')}>📍 Dot</button>
              <button className={`editor-ann-place-btn${placing === 'bend' && placingIdx === ai ? ' active' : ''}`} onClick={() => startPlacing(ai, 'bend')}>↗️ Bend</button>
              <button className={`editor-ann-place-btn${placing === 'label' && placingIdx === ai ? ' active' : ''}`} onClick={() => startPlacing(ai, 'label')}>📝 Label</button>
              <button className="editor-ann-place-btn" style={{color:'#e00'}} onClick={() => updateAnnotation(si, bi, ai, 'bendX', null)}>Remove Bend</button>
              <button className="editor-remove-btn" onClick={() => removeAnnotation(si, bi, ai)}>✕</button>
            </div>
          </div>
          <div className="editor-field">
            <label>Icon (path, e.g. /assets/projects/product/olo/icons/a2.svg)</label>
            <input value={ann.icon || ''} onChange={e => updateAnnotation(si, bi, ai, 'icon', e.target.value)} />
          </div>
          <div className="editor-row">
            <div className="editor-field">
              <label>Title</label>
              <input value={ann.title || ''} onChange={e => updateAnnotation(si, bi, ai, 'title', e.target.value)} />
            </div>
            <div className="editor-field">
              <label>Side</label>
              <select value={ann.side || 'left'} onChange={e => updateAnnotation(si, bi, ai, 'side', e.target.value)}>
                <option value="left">left</option>
                <option value="right">right</option>
              </select>
              <div className="editor-field" style={{marginTop:'8px'}}>
                <label>Hover Mode</label>
                <select value={ann.hoverMode || 'hover'} onChange={e => updateAnnotation(si, bi, ai, 'hoverMode', e.target.value)}>
                  <option value="hover">hover — on hover</option>
                  <option value="always-on">always-on — always visible</option>
                  <option value="always-off">always-off — always hidden</option>
                </select>
              </div>
            </div>
          </div>
          <div className="editor-field">
            <label>Content</label>
            <textarea rows={2} value={ann.content || ''} onChange={e => updateAnnotation(si, bi, ai, 'content', e.target.value)} />
          </div>
          <div className="editor-row">
            <div className="editor-field">
              <label>Dot X / Y</label>
              <input value={`${ann.x}, ${ann.y}`} onChange={e => {
                const [x, y] = e.target.value.split(',').map(v => parseInt(v.trim()))
                if (!isNaN(x)) updateAnnotation(si, bi, ai, 'x', x)
                if (!isNaN(y)) updateAnnotation(si, bi, ai, 'y', y)
              }} />
            </div>
            <div className="editor-field">
              <label>Bend X</label>
              <input value={ann.bendX ?? ''} onChange={e => {
                const v = e.target.value.trim()
                updateAnnotation(si, bi, ai, 'bendX', v === '' ? null : parseInt(v))
              }} />
            </div>
            <div className="editor-field">
              <label>Label X / Y</label>
              <input value={`${ann.lineX}, ${ann.lineY}`} onChange={e => {
                const [x, y] = e.target.value.split(',').map(v => parseInt(v.trim()))
                if (!isNaN(x)) updateAnnotation(si, bi, ai, 'lineX', x)
                if (!isNaN(y)) updateAnnotation(si, bi, ai, 'lineY', y)
              }} />
            </div>
          </div>
        </div>
      ))}
      <button className="editor-add-btn" onClick={() => addAnnotation(si, bi)}>+ Add Annotation</button>
    </div>
  )
}

function BlockEditor({ si, section, images, selected, updateBlock, addBlock, removeBlock, updateAnnotation, addAnnotation, removeAnnotation }) {
  const blocks = section.blocks || []
  return (
    <div className="editor-blocks">
      {blocks.map((block, bi) => (
        <div key={bi} className="editor-block">
          <div className="editor-block-header">
            <span>Block {bi + 1} {blocks.length > 1 ? '· carousel' : '· single'}</span>
            <button className="editor-remove-btn" onClick={() => removeBlock(si, bi)}>✕</button>
          </div>
          <div className="editor-row">
            <div className="editor-field">
              <label>Images (numbers, comma-separated)</label>
              <input
                value={(block.images || []).join(', ')}
                onChange={e => updateBlock(si, bi, 'images', e.target.value.split(',').map(v => parseInt(v.trim())).filter(Boolean))}
              />
            </div>
            <div className="editor-field">
              <label>Hover Images</label>
              <input
                value={(block.hoverImages || []).join(', ')}
                onChange={e => updateBlock(si, bi, 'hoverImages', e.target.value.split(',').map(v => parseInt(v.trim())).filter(Boolean))}
              />
            </div>
          </div>
          <div className="editor-field">
            <label>Title</label>
            <input value={block.title || ''} onChange={e => updateBlock(si, bi, 'title', e.target.value)} />
          </div>
          <div className="editor-field">
            <label>Subtitle</label>
            <input value={block.subtitle || ''} onChange={e => updateBlock(si, bi, 'subtitle', e.target.value)} />
          </div>
          <div className="editor-field">
            <label>Content</label>
            <textarea rows={4} value={block.content || ''} onChange={e => updateBlock(si, bi, 'content', e.target.value)} />
          </div>
          <div className="editor-img-preview">
            {images.map(f => (
              <div key={f.name} className="editor-img-thumb" title={f.name}>
                <img src={`/assets/projects/${selected.category}/${selected.id}/sections/${f.name}`} alt={f.name} />
                <span className="editor-img-name">{f.name}</span>
                <span className="editor-img-size">{f.size}</span>
              </div>
            ))}
          </div>
          {section.type === 'image-text' && (
            <AnnotationEditor
              si={si} bi={bi} block={block}
              images={images} selected={selected}
              updateAnnotation={updateAnnotation}
              addAnnotation={addAnnotation}
              removeAnnotation={removeAnnotation}
            />
          )}
        </div>
      ))}
      <button className="editor-add-btn" onClick={() => addBlock(si)}>+ Add Block</button>
    </div>
  )
}

export default function Editor() {
  const [projects, setProjects] = useState([])
  const [selected, setSelected] = useState(null)
  const [info, setInfo] = useState(null)
  const [images, setImages] = useState([])
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetch(`${API}/projects`).then(r => r.json()).then(setProjects)
  }, [])

  const load = (proj) => {
    setSelected(proj)
    fetch(`${API}/info/${proj.category}/${proj.id}`).then(r => r.json()).then(setInfo)
    fetch(`${API}/images/${proj.category}/${proj.id}`).then(r => r.json()).then(setImages)
  }

  const save = async () => {
    await fetch(`${API}/info/${selected.category}/${selected.id}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(info)
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const updateMeta = (key, val) => setInfo(i => ({ ...i, [key]: val }))

  const updateSection = (si, key, val) => setInfo(i => {
    const sections = [...i.sections]
    sections[si] = { ...sections[si], [key]: val }
    return { ...i, sections }
  })

  const updateOverlay = (si, key, val) => setInfo(i => {
    const sections = [...i.sections]
    const overlay = { ...(sections[si].overlay || {}), [key]: val }
    sections[si] = { ...sections[si], overlay }
    return { ...i, sections }
  })

  const updateBlock = (si, bi, key, val) => setInfo(i => {
    const sections = [...i.sections]
    const blocks = [...(sections[si].blocks || [])]
    blocks[bi] = { ...blocks[bi], [key]: val }
    sections[si] = { ...sections[si], blocks }
    return { ...i, sections }
  })

  const updateAnnotation = (si, bi, ai, key, val) => setInfo(i => {
    const sections = [...i.sections]
    const blocks = [...(sections[si].blocks || [])]
    const annotations = [...(blocks[bi].annotations || [])]
    annotations[ai] = { ...annotations[ai], [key]: val }
    blocks[bi] = { ...blocks[bi], annotations }
    sections[si] = { ...sections[si], blocks }
    return { ...i, sections }
  })

  const addAnnotation = (si, bi) => setInfo(i => {
    const sections = [...i.sections]
    const blocks = [...(sections[si].blocks || [])]
    blocks[bi] = { ...blocks[bi], annotations: [...(blocks[bi].annotations || []), emptyAnnotation()] }
    sections[si] = { ...sections[si], blocks }
    return { ...i, sections }
  })

  const removeAnnotation = (si, bi, ai) => setInfo(i => {
    const sections = [...i.sections]
    const blocks = [...(sections[si].blocks || [])]
    blocks[bi] = { ...blocks[bi], annotations: blocks[bi].annotations.filter((_, idx) => idx !== ai) }
    sections[si] = { ...sections[si], blocks }
    return { ...i, sections }
  })

  const addSection = () => setInfo(i => ({ ...i, sections: [...(i.sections || []), emptySection()] }))
  const removeSection = (si) => setInfo(i => ({ ...i, sections: i.sections.filter((_, idx) => idx !== si) }))
  const moveSection = (si, dir) => setInfo(i => {
    const sections = [...i.sections]
    const target = si + dir
    if (target < 0 || target >= sections.length) return i
    ;[sections[si], sections[target]] = [sections[target], sections[si]]
    return { ...i, sections }
  })

  const addBlock = (si) => setInfo(i => {
    const sections = [...i.sections]
    sections[si] = { ...sections[si], blocks: [...(sections[si].blocks || []), emptyBlock()] }
    return { ...i, sections }
  })

  const removeBlock = (si, bi) => setInfo(i => {
    const sections = [...i.sections]
    sections[si] = { ...sections[si], blocks: sections[si].blocks.filter((_, idx) => idx !== bi) }
    return { ...i, sections }
  })

  return (
    <div className="editor-wrap">
      <div className="editor-sidebar">
        <div className="editor-sidebar-title">Projects</div>
        {projects.map(p => (
          <div
            key={`${p.category}/${p.id}`}
            className={`editor-proj-item${selected?.id === p.id ? ' active' : ''}`}
            onClick={() => load(p)}
          >
            <span className="editor-proj-cat">{p.category}</span>
            <span>{p.id}</span>
          </div>
        ))}
      </div>

      <div className="editor-main">
        {!info && <div className="editor-empty">← Select a project</div>}
        {info && (
          <>
            <div className="editor-topbar">
              <span className="editor-title">{selected.category} / {selected.id}</span>
              <button className="editor-save-btn" onClick={save}>{saved ? '✓ Saved' : 'Save'}</button>
            </div>

            <div className="editor-card">
              <div className="editor-card-title">Overview</div>
              <div className="editor-field">
                <label>Overview</label>
                <textarea rows={3} value={info.overview || ''} onChange={e => updateMeta('overview', e.target.value)} />
              </div>
              <div className="editor-row">
                <div className="editor-field">
                  <label>Type</label>
                  <input value={info.type || ''} onChange={e => updateMeta('type', e.target.value)} />
                </div>
                <div className="editor-field">
                  <label>Duration</label>
                  <input value={info.duration || ''} onChange={e => updateMeta('duration', e.target.value)} />
                </div>
                <div className="editor-field">
                  <label>Role</label>
                  <input value={info.role || ''} onChange={e => updateMeta('role', e.target.value)} />
                </div>
                <div className="editor-field">
                  <label>Team</label>
                  <input value={info.team || ''} onChange={e => updateMeta('team', e.target.value)} />
                </div>
              </div>
            </div>

            {(info.sections || []).map((section, si) => (
              <div key={si} className="editor-card">
                <div className="editor-card-header">
                  <div className="editor-card-title">Section {si + 1}</div>
                  <div style={{display:'flex', gap:'4px', alignItems:'center'}}>
                    <button className="editor-ann-place-btn" onClick={() => moveSection(si, -1)}>↑</button>
                    <button className="editor-ann-place-btn" onClick={() => moveSection(si, 1)}>↓</button>
                    <button className="editor-remove-btn" onClick={() => removeSection(si)}>✕</button>
                  </div>
                </div>
                <div className="editor-row">
                  <div className="editor-field">
                    <label>ID</label>
                    <input value={section.id} onChange={e => updateSection(si, 'id', e.target.value)} />
                  </div>
                  <div className="editor-field">
                    <label>Label (TOC)</label>
                    <input value={section.label} onChange={e => updateSection(si, 'label', e.target.value)} />
                  </div>
                  <div className="editor-field">
                    <label>Type</label>
                    <select value={section.type} onChange={e => updateSection(si, 'type', e.target.value)}>
                      <option value="images">images — images only</option>
                      <option value="image-text">image-text — mid size (side margins)</option>
                      <option value="image-text-carousel">image-text-carousel — carousel cards</option>
                      <option value="scroll-animation">scroll-animation — scroll animation</option>
                    </select>
                  </div>
                </div>

                <div className="editor-display-info">
                  Display: {SECTION_DISPLAY[section.type] || section.type}
                </div>

                {section.type === 'scroll-animation' && (
                  <div className="editor-card" style={{background:'#f9f9f9', marginTop:'8px'}}>
                    <div className="editor-card-title">Scroll Animation Settings</div>
                    <div className="editor-row">
                      <div className="editor-field">
                        <label>Frame Count</label>
                        <input
                          type="number"
                          value={section.frameCount || 72}
                          onChange={e => updateSection(si, 'frameCount', parseInt(e.target.value))}
                        />
                      </div>
                      <div className="editor-field">
                        <label>Scroll Index (folder number)</label>
                        <input
                          type="number"
                          min={1}
                          placeholder="leave blank for default scroll/"
                          value={section.scrollIndex ?? ''}
                          onChange={e => updateSection(si, 'scrollIndex', e.target.value === '' ? undefined : parseInt(e.target.value))}
                        />
                      </div>
                    </div>
                    <div className="editor-row">
                      <div className="editor-field">
                        <label>Canvas Position</label>
                        <select value={section.canvasPosition || 'left'} onChange={e => updateSection(si, 'canvasPosition', e.target.value)}>
                          <option value="left">Left</option>
                          <option value="center">Center</option>
                          <option value="right">Right</option>
                        </select>
                      </div>
                      <div className="editor-field">
                        <label>Text Position</label>
                        <select value={section.textPosition || 'left'} onChange={e => updateSection(si, 'textPosition', e.target.value)}>
                          <option value="left">Left</option>
                          <option value="center">Center</option>
                          <option value="right">Right</option>
                        </select>
                      </div>
                    </div>
                    <div className="editor-field">
                      <label>Title</label>
                      <input value={section.title || ''} onChange={e => updateSection(si, 'title', e.target.value)} />
                    </div>
                    <div className="editor-field">
                      <label>Subtitle</label>
                      <input value={section.subtitle || ''} onChange={e => updateSection(si, 'subtitle', e.target.value)} />
                    </div>
                    <div className="editor-field">
                      <label>Content</label>
                      <textarea rows={4} value={section.content || ''} onChange={e => updateSection(si, 'content', e.target.value)} />
                    </div>
                    <div className="editor-display-info">
                      Frame path: /assets/projects/{selected.category}/{selected.id}/{section.scrollIndex != null ? `scroll-${section.scrollIndex}` : 'scroll'}/frame-0001.webp ~ frame-{String(section.frameCount || 72).padStart(4,'0')}.webp
                    </div>
                  </div>
                )}

                {section.type === 'images' && (
                  <div className="editor-field">
                    <label>Images (numbers, comma-separated)</label>
                    <input
                      value={(section.images || []).join(', ')}
                      onChange={e => updateSection(si, 'images', e.target.value.split(',').map(v => parseInt(v.trim())).filter(Boolean))}
                    />
                    <div className="editor-img-preview">
                      {images.map(f => (
                        <div key={f.name} className="editor-img-thumb" title={f.name}>
                          <img src={`/assets/projects/${selected.category}/${selected.id}/sections/${f.name}`} alt={f.name} />
                          <span className="editor-img-name">{f.name}</span>
                          <span className="editor-img-size">{f.size}</span>
                        </div>
                      ))}
                    </div>
                    <div className="editor-overlay-wrap">
                      <div className="editor-annotation-label">Overlay Text (optional)</div>
                      <div className="editor-field">
                        <label>Position</label>
                        <select value={(section.overlay || {}).position || 'left'} onChange={e => updateOverlay(si, 'position', e.target.value)}>
                          <option value="left">Left</option>
                          <option value="center">Center</option>
                          <option value="right">Right</option>
                        </select>
                      </div>
                      <div className="editor-field">
                        <label>Title</label>
                        <input value={(section.overlay || {}).title || ''} onChange={e => updateOverlay(si, 'title', e.target.value)} />
                      </div>
                      <div className="editor-field">
                        <label>Subtitle</label>
                        <input value={(section.overlay || {}).subtitle || ''} onChange={e => updateOverlay(si, 'subtitle', e.target.value)} />
                      </div>
                      <div className="editor-field">
                        <label>Content</label>
                        <textarea rows={3} value={(section.overlay || {}).content || ''} onChange={e => updateOverlay(si, 'content', e.target.value)} />
                      </div>
                    </div>
                  </div>
                )}

                {(section.type === 'image-text' || section.type === 'image-text-carousel') && (
                  <BlockEditor
                    si={si} section={section}
                    images={images} selected={selected}
                    updateBlock={updateBlock} addBlock={addBlock} removeBlock={removeBlock}
                    updateAnnotation={updateAnnotation} addAnnotation={addAnnotation} removeAnnotation={removeAnnotation}
                  />
                )}
              </div>
            ))}

            <button className="editor-add-btn editor-add-section" onClick={addSection}>+ Add Section</button>
          </>
        )}
      </div>
    </div>
  )
}
