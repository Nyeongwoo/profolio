import { useState, useEffect } from 'react'
import { API, EditorTopbar, EditorSectionNav, Field, Card, ImageField, SizeHint } from './EditorComponents'

export default function EditorMaintenance() {
  const [data, setData] = useState(null)
  const [saved, setSaved] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

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
      <EditorTopbar title="Maintenance" onSave={save} saved={saved} />
      <EditorSectionNav sections={[{ id: 'ed-maint-text', label: 'Text' }, { id: 'ed-maint-image', label: 'Image' }, { id: 'ed-maint-password', label: 'Password' }]} />

      {/* Preview */}
      <div style={{ border: '1px solid var(--ed-card-border)', borderRadius: '12px', background: '#111', padding: '40px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
        <img
          src={data.maintenanceImage || '/maintenance.png'}
          alt=""
          style={{ width: '56px', height: '56px', objectFit: 'contain' }}
          onError={e => e.target.style.display = 'none'}
        />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', textAlign: 'center' }}>
          <div style={{ fontSize: '22px', fontWeight: 700, color: '#fff', letterSpacing: '-0.02em' }}>
            {data.maintenanceTitle || 'Under Maintenance'}
          </div>
          <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)', maxWidth: '320px', lineHeight: 1.8 }}>
            {data.maintenanceDesc || ''}
          </div>
        </div>
        <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.2)', marginTop: '4px' }}>↑ Preview</div>
      </div>

      <Card id="ed-maint-text" title="Text" collapsible defaultOpen>
        <Field label="Title">
          <input style={s} value={data.maintenanceTitle || ''} onChange={e => setData(d => ({ ...d, maintenanceTitle: e.target.value }))} />
        </Field>
        <Field label="Description">
          <textarea style={{ ...s, resize: 'vertical' }} rows={3} value={data.maintenanceDesc || ''} onChange={e => setData(d => ({ ...d, maintenanceDesc: e.target.value }))} />
        </Field>
      </Card>

      <Card id="ed-maint-image" title="Image" collapsible defaultOpen>
        <ImageField
          label="Maintenance Image"
          value={data.maintenanceImage || '/maintenance.png'}
          onChange={v => setData(d => ({ ...d, maintenanceImage: v }))}
        />
        <SizeHint>Recommended: 160×160 — shown as a fixed 80×80px icon, same on every breakpoint (no mobile/tablet variant needed).</SizeHint>
      </Card>

      <Card id="ed-maint-password" title="Password" collapsible defaultOpen>
        <Field label="Password (tap screen 3 times to show input)">
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input
              style={{ ...s, flex: 1, letterSpacing: showPassword ? 'normal' : '0.3em', fontFamily: showPassword ? 'inherit' : 'monospace' }}
              type={showPassword ? 'text' : 'password'}
              value={data.maintenancePassword || ''}
              onChange={e => setData(d => ({ ...d, maintenancePassword: e.target.value }))}
            />
            <button
              onClick={() => setShowPassword(v => !v)}
              style={{ border: '1px solid var(--ed-input-border)', background: 'var(--ed-input-bg)', borderRadius: '8px', padding: '8px 12px', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0, color: 'var(--ed-text-sub)' }}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
        </Field>
      </Card>
    </div>
  )
}
