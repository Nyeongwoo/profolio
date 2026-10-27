import { useState, useEffect } from 'react'
import { API, EditorTopbar, EditorSectionNav, Field, Card, ImageField, SizeHint } from './EditorComponents'
import { ImageWithFallback } from '../../utils/getImage'

export default function EditorNotFound() {
  const [data, setData] = useState(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetch(`${API}/page/siteConfig`).then(r => r.json()).then(setData)
  }, [])

  const save = async () => {
    await fetch(`${API}/page/siteConfig`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
    setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  if (!data) return <div style={{ padding: '40px', color: 'var(--ed-text-xmuted)' }}>Loading...</div>

  const s = { border: '1px solid var(--ed-input-border)', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', fontFamily: 'inherit', color: 'var(--ed-text)', background: 'var(--ed-input-bg)', outline: 'none', width: '100%', boxSizing: 'border-box' }

  return (
    <div className="ed-page">
      <EditorTopbar title="404 Page" onSave={save} saved={saved} />
      <EditorSectionNav sections={[{ id: 'ed-nf-text', label: 'Text' }, { id: 'ed-nf-image', label: 'Image' }]} />

      {/* Preview */}
      <div style={{ border: '1px solid var(--ed-card-border)', borderRadius: '12px', background: '#111', padding: '40px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
        <ImageWithFallback
          basePath={(data.notFoundImage || '/maintenance').replace(/\.(gif|webp|png|jpg|jpeg|svg)$/i, '')}
          alt=""
          style={{ width: '56px', height: '56px', objectFit: 'contain' }}
        />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', textAlign: 'center' }}>
          <div style={{ fontSize: '22px', fontWeight: 700, color: '#fff', letterSpacing: '-0.02em' }}>
            {data.notFoundTitle || 'Page Not Found'}
          </div>
          <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', maxWidth: '320px', lineHeight: 1.8 }}>
            {data.notFoundDesc || ''}
          </div>
        </div>
        <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.2)', marginTop: '4px' }}>↑ Preview</div>
      </div>

      <Card id="ed-nf-text" title="Text" collapsible defaultOpen>
        <Field label="Title">
          <input style={s} value={data.notFoundTitle || ''} onChange={e => setData(d => ({ ...d, notFoundTitle: e.target.value }))} />
        </Field>
        <Field label="Description">
          <textarea style={{ ...s, resize: 'vertical' }} rows={3} value={data.notFoundDesc || ''} onChange={e => setData(d => ({ ...d, notFoundDesc: e.target.value }))} />
        </Field>
      </Card>

      <Card id="ed-nf-image" title="Image" collapsible defaultOpen>
        <ImageField
          label="404 Icon"
          value={data.notFoundImage || '/maintenance'}
          onChange={v => setData(d => ({ ...d, notFoundImage: v }))}
        />
        <SizeHint>Recommended: 160×160 — shown as a fixed 80×80px icon, same on every breakpoint (no mobile/tablet variant needed).</SizeHint>
      </Card>
    </div>
  )
}
