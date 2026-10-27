import { useState, useEffect, useCallback, useRef } from 'react'
import { API, EditorTopbar, EditorSectionNav, TextField, Field, Row, Block, Card, ImageField, LinkField, SizeHint, ratioDims, FONT_SIZES, TierSizeRow, Toggle } from './EditorComponents'
import SectionsEditor from './EditorSectionsEditor'

const s = { border: '1px solid var(--ed-input-border)', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', fontFamily: 'inherit', color: 'var(--ed-text)', background: 'var(--ed-input-bg)', outline: 'none', width: '100%', boxSizing: 'border-box' }

function PhotosCard({ data, update, save }) {
  const [serverFiles, setServerFiles] = useState([])
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef(null)

  const refreshFiles = useCallback(() =>
    fetch(`${API}/about-photos`).then(r => r.json()).then(setServerFiles).catch(() => {}), [])

  useEffect(() => { refreshFiles() }, [])

  const items = data.photos.items || []

  const updateItem = (idx, key, val) => {
    const next = items.map((p, i) => i === idx ? { ...p, [key]: val } : p)
    update('photos.items', next)
  }
  const moveItem = (idx, dir) => {
    const next = [...items]
    const ti = idx + dir
    if (ti < 0 || ti >= next.length) return
    ;[next[idx], next[ti]] = [next[ti], next[idx]]
    update('photos.items', next)
  }
  const removeItem = (idx) => update('photos.items', items.filter((_, i) => i !== idx))

  const handleUpload = async (file) => {
    if (!file) return
    setUploading(true)
    const reader = new FileReader()
    reader.onload = async (ev) => {
      const base64 = ev.target.result.split(',')[1]
      const res = await fetch(`${API}/about-photos/upload`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: file.name, data: base64 }),
      })
      const d = await res.json()
      if (d.ok) {
        await refreshFiles()
        const baseName = d.baseName || file.name.replace(/\.[^.]+$/, '')
        if (!items.find(p => p.file === baseName)) {
          update('photos.items', [...items, { file: baseName, title: '', description: '', hidden: false }])
        }
      }
      setUploading(false)
    }
    reader.readAsDataURL(file)
  }

  const deleteFile = async (item, idx) => {
    const ext = serverFiles.find(f => f.startsWith(item.file + '.'))?.split('.').pop()
    if (ext) await fetch(`${API}/about-photos/${item.file}.${ext}`, { method: 'DELETE' })
    removeItem(idx)
    await refreshFiles()
  }

  const btnBase = { border: '1px solid var(--ed-input-border)', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontSize: '11px', fontFamily: 'inherit', background: 'var(--ed-input-bg)', color: 'var(--ed-text-sub)' }

  return (
    <Card id="ed-about-photos" title="Photos" collapsible defaultOpen>
      <TextField label="Heading"
        value={data.photos.heading || 'Photos'} onChange={v => update('photos.heading', v)}
        size={data.photos.headingSize} onSize={v => update('photos.headingSize', v)}
        weight={data.photos.headingWeight} onWeight={v => update('photos.headingWeight', v)}
        color={data.photos.headingColor} onColor={v => update('photos.headingColor', v)}
        font={data.photos.headingFont} onFont={v => update('photos.headingFont', v)} />
      <Row>
        <Field label="Gap Below Heading — desktop (px)">
          <input style={s} type="number" min="0" placeholder="Default (32)" value={data.photos.headingGap != null ? parseInt(data.photos.headingGap) : ''} onChange={e => update('photos.headingGap', e.target.value || undefined)} />
        </Field>
        <Field label="Gap Below Heading — tablet (px)">
          <input style={s} type="number" min="0" placeholder="Same as desktop" value={data.photos.headingGapTablet != null ? parseInt(data.photos.headingGapTablet) : ''} onChange={e => update('photos.headingGapTablet', e.target.value || undefined)} />
        </Field>
        <Field label="Gap Below Heading — mobile (px)">
          <input style={s} type="number" min="0" placeholder="Same as tablet/desktop" value={data.photos.headingGapMobile != null ? parseInt(data.photos.headingGapMobile) : ''} onChange={e => update('photos.headingGapMobile', e.target.value || undefined)} />
        </Field>
      </Row>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {items.map((item, idx) => (
          <div key={idx} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', padding: '10px', background: 'var(--ed-block-bg)', borderRadius: '8px', border: '1px solid var(--ed-block-border)', opacity: item.hidden ? 0.45 : 1 }}>
            {/* Thumbnail */}
            <div style={{ width: '64px', height: '64px', borderRadius: '6px', overflow: 'hidden', background: 'var(--ed-input-bg)', flexShrink: 0, border: '1px solid var(--ed-input-border)' }}>
              <img src={`/assets/about/photos/${serverFiles.find(f => f.startsWith(item.file + '.')) || item.file + '.webp'}`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onContextMenu={e => e.preventDefault()} draggable={false} />
            </div>
            {/* Fields */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0 }}>
              <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--ed-text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>{item.file}</div>
              <Row>
                <textarea style={{...s, resize: 'vertical'}} rows={1} placeholder="Title (optional)" value={item.title || ''} onChange={e => updateItem(idx, 'title', e.target.value)} />
                <input style={{...s, maxWidth: '100px'}} placeholder="Year" value={item.year || ''} onChange={e => updateItem(idx, 'year', e.target.value)} />
              </Row>
              <textarea style={{...s, resize: 'vertical'}} rows={2} placeholder="Description (optional)" value={item.description || ''} onChange={e => updateItem(idx, 'description', e.target.value)} />
              <LinkField value={item.link} onChange={v => updateItem(idx, 'link', v)} />
            </div>
            {/* Controls */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flexShrink: 0 }}>
              <button onClick={() => moveItem(idx, -1)} style={btnBase}>↑</button>
              <button onClick={() => moveItem(idx, 1)}  style={btnBase}>↓</button>
              <button
                onClick={() => updateItem(idx, 'hidden', !item.hidden)}
                style={{ ...btnBase, color: item.hidden ? 'var(--ed-text-muted)' : '#1a73e8', borderColor: item.hidden ? 'var(--ed-input-border)' : '#1a73e8' }}
              >{item.hidden ? '○ Hide' : '● Show'}</button>
              <button
                onClick={() => { if (confirm(`Delete "${item.file}"?`)) deleteFile(item, idx) }}
                style={{ ...btnBase, color: '#e53e3e', borderColor: '#ffccc7' }}
              >Delete</button>
            </div>
          </div>
        ))}
      </div>

      {/* Upload */}
      <div>
        <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
          onChange={async e => { for (const f of e.target.files) await handleUpload(f); e.target.value = '' }} />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          style={{ ...btnBase, padding: '7px 16px', fontSize: '12px', width: '100%', textAlign: 'center', borderStyle: 'dashed', color: 'var(--ed-text-muted)' }}
        >{uploading ? 'Uploading...' : '+ Upload Photos'}</button>
      </div>
    </Card>
  )
}

export default function EditorAbout() {
  const [data, setData] = useState(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetch(`${API}/page/about`).then(r => r.json()).then(setData)
  }, [])

  const update = (path, val) => {
    setData(d => {
      const n = JSON.parse(JSON.stringify(d))
      const keys = path.split('.')
      let obj = n
      for (let i = 0; i < keys.length - 1; i++) {
        const k = keys[i]
        obj = !isNaN(k) ? obj[parseInt(k)] : obj[k]
      }
      obj[keys[keys.length - 1]] = val
      return n
    })
  }

  const save = async () => {
    await fetch(`${API}/page/about`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
    setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  if (!data) return <div style={{ padding: '40px', color: 'var(--ed-text-xmuted)' }}>Loading...</div>

  return (
    <div className="ed-page">
      <EditorTopbar title="About" onSave={save} saved={saved} extra={
        <button onClick={() => update('maintenance', !data.maintenance)} title={data.maintenance ? 'Under maintenance — click to make this page public again' : 'Public — click to put just this page under maintenance'} style={{
          border: data.maintenance ? '1px solid #ffc8c8' : '1px solid var(--ed-input-border)',
          borderRadius: '6px', padding: '6px 12px', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600,
          background: data.maintenance ? '#fff0f0' : 'var(--ed-input-bg)',
          color: data.maintenance ? '#e53e3e' : 'var(--ed-text-sub)',
          transition: 'all 0.15s',
        }}>
          {data.maintenance ? '🔒 Maintenance' : '🌐 Public'}
        </button>
      } />
      <EditorSectionNav sections={[
        { id: 'ed-about-intro', label: 'Intro' },
        { id: 'ed-about-sections', label: 'Sections' },
        { id: 'ed-about-photos', label: 'Photos' },
      ]} />

      <Card id="ed-about-intro" title="Intro" collapsible defaultOpen>
        <Toggle
          label="Layout"
          checked={!!data.intro.alignPhotoBottom}
          onChange={v => update('intro.alignPhotoBottom', v || undefined)}
          onLabel="Align text bottom with photo (spacing fields below are ignored — title always stays at the top)"
          offLabel="Use the spacing fields below (title/description sit at the top, independent of the photo)"
        />
        <Row>
          <Field label={`Gap Above — desktop (px, space between navbar and this section)${data.intro.alignPhotoBottom ? ' — disabled while photo-align is on' : ''}`}>
            <input style={s} type="number" min="0" disabled={!!data.intro.alignPhotoBottom} placeholder="Default (60)" value={data.intro.topGap ? parseInt(data.intro.topGap) : ''} onChange={e => update('intro.topGap', e.target.value || undefined)} />
          </Field>
          <Field label={`Gap Above — mobile (px)${data.intro.alignPhotoBottom ? ' — disabled while photo-align is on' : ''}`}>
            <input style={s} type="number" min="0" disabled={!!data.intro.alignPhotoBottom} placeholder="Default (40)" value={data.intro.topGapMobile ? parseInt(data.intro.topGapMobile) : ''} onChange={e => update('intro.topGapMobile', e.target.value || undefined)} />
          </Field>
          <Field label={`Gap — title to description — desktop (px)${data.intro.alignPhotoBottom ? ' — disabled while photo-align is on' : ''}`}>
            <input style={s} type="number" min="0" disabled={!!data.intro.alignPhotoBottom} placeholder="Default (20)" value={data.intro.titleGap ? parseInt(data.intro.titleGap) : ''} onChange={e => update('intro.titleGap', e.target.value || undefined)} />
          </Field>
          <Field label={`Gap — title to description — mobile (px)${data.intro.alignPhotoBottom ? ' — disabled while photo-align is on' : ''}`}>
            <input style={s} type="number" min="0" disabled={!!data.intro.alignPhotoBottom} placeholder="Same as desktop" value={data.intro.titleGapMobile ? parseInt(data.intro.titleGapMobile) : ''} onChange={e => update('intro.titleGapMobile', e.target.value || undefined)} />
          </Field>
        </Row>
        <TextField label="Title" value={data.intro.title} onChange={v => update('intro.title', v)}
          size={data.intro.titleSize} onSize={v => update('intro.titleSize', v)}
          weight={data.intro.titleWeight} onWeight={v => update('intro.titleWeight', v)}
          color={data.intro.titleColor} onColor={v => update('intro.titleColor', v)}
          font={data.intro.titleFont} onFont={v => update('intro.titleFont', v)}  rich />
        <TierSizeRow label="Title" size={data.intro.titleSize}
          tabletValue={data.intro.titleSizeTablet} onTablet={v => update('intro.titleSizeTablet', v)}
          mobileValue={data.intro.titleSizeMobile} onMobile={v => update('intro.titleSizeMobile', v)} />
        <TextField label="Description" value={data.intro.description} onChange={v => update('intro.description', v)}
          size={data.intro.descSize} onSize={v => update('intro.descSize', v)}
          weight={data.intro.descWeight} onWeight={v => update('intro.descWeight', v)}
          color={data.intro.descColor} onColor={v => update('intro.descColor', v)}
          font={data.intro.descFont} onFont={v => update('intro.descFont', v)}
          multiline rows={4}  rich />
        <TierSizeRow label="Description" size={data.intro.descSize}
          tabletValue={data.intro.descSizeTablet} onTablet={v => update('intro.descSizeTablet', v)}
          mobileValue={data.intro.descSizeMobile} onMobile={v => update('intro.descSizeMobile', v)} />
        <ImageField label="Profile Image" value={data.intro.profileImage || '/assets/about/profile'} onChange={v => update('intro.profileImage', v)}
          desktopRatio={data.intro.profileDesktopRatio || '1/1'} mobileRatio={data.intro.profileMobileRatio || '1/1'}
          onDesktopRatio={v => update('intro.profileDesktopRatio', v)} onMobileRatio={v => update('intro.profileMobileRatio', v)} />
        <SizeHint>Recommended (Ratio dropdowns above set this): {ratioDims(720, data.intro.profileDesktopRatio || '1/1')}{(data.intro.profileMobileRatio || '1/1') !== (data.intro.profileDesktopRatio || '1/1') ? ` desktop · Mobile ${ratioDims(720, data.intro.profileMobileRatio || '1/1')}` : ''} — the square/box size below is what actually renders at each breakpoint; on mobile it always fills the full width instead.</SizeHint>
        <ImageField label="Profile Image (Mobile/Tablet override — optional)" value={data.intro.profileMobileImage || ''} onChange={v => update('intro.profileMobileImage', v || undefined)} />
        <Row>
          <Field label="Image Size — Tablet, 601–1024px (px)">
            <input style={s} type="number" min="0" placeholder="Default (300)" value={data.intro.profileSizeTablet ? parseInt(data.intro.profileSizeTablet) : ''} onChange={e => update('intro.profileSizeTablet', e.target.value || undefined)} />
          </Field>
          <Field label="Image Size — Desktop, 1025px+ (px)">
            <input style={s} type="number" min="0" placeholder="Default (360)" value={data.intro.profileSizeDesktop ? parseInt(data.intro.profileSizeDesktop) : ''} onChange={e => update('intro.profileSizeDesktop', e.target.value || undefined)} />
          </Field>
        </Row>
        <Field label="Tablet Images (default) — desktop or mobile set to fall back to at tablet width, when a block has no dedicated Tablet Override image">
          <select style={s} value={data.tabletImageMode || 'mobile'} onChange={e => update('tabletImageMode', e.target.value)}>
            <option value="mobile">Mobile</option>
            <option value="desktop">Desktop</option>
          </select>
        </Field>
      </Card>


      <Card id="ed-about-sections" title="Additional Sections" collapsible defaultOpen>
        <SectionsEditor
          sections={data.sections || []}
          onChange={v => update('sections', v)}
          basePath="/assets/about/sections"
          uploadUrl={`${API}/about-images/upload`}
          mobileBasePath="/assets/about/sections/mobile"
          mobileUploadUrl={`${API}/about-images/mobile/upload`}
          tabletBasePath="/assets/about/sections/tablet"
          tabletUploadUrl={`${API}/about-images/tablet/upload`}
          infoNote="shown below Philosophy·Strategy images, above Photos."
        />
      </Card>

      <PhotosCard data={data} update={update} save={save} />
    </div>
  )
}
