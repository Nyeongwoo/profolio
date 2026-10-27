import { useState, useEffect, useRef } from 'react'
import { API, EditorTopbar, Field, Row, Card, TogglePill } from './EditorComponents'

// Portfolio versions and news entries for /archive. Projects are listed
// there automatically from projects.json, so they aren't edited here.
const s = { border: '1px solid var(--ed-input-border)', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', fontFamily: 'inherit', color: 'var(--ed-text)', background: 'var(--ed-input-bg)', outline: 'none', width: '100%', boxSizing: 'border-box' }
const btn = { border: '1px solid var(--ed-input-border)', borderRadius: '6px', padding: '5px 12px', cursor: 'pointer', fontSize: '12px', fontFamily: 'inherit', background: 'var(--ed-input-bg)', color: 'var(--ed-text-sub)' }
const TYPE_COLOR = { portfolio: '#1e8e3e', news: '#0073EB' }

const today = () => new Date().toISOString().slice(0, 10)
const newItem = (type) => ({
  id: `${type}-${Date.now()}`,
  type,
  date: type === 'portfolio' ? today().slice(0, 4) : today(),
  title: '',
  description: '',
  link: '',
  file: '',
  image: '',
  ...(type === 'portfolio' ? { access: 'public' } : {}),
  hidden: false,
})

function readAsBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(',')[1])
    r.onerror = reject
    r.readAsDataURL(file)
  })
}

function UploadField({ label, value, onChange, accept, hint }) {
  const inputRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const upload = async (file) => {
    if (!file) return
    setBusy(true)
    try {
      const res = await fetch(`${API}/archive/upload`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: file.name, data: await readAsBase64(file) }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || res.status)
      onChange(d.src)
    } catch (e) {
      alert(`Upload failed: ${e.message}`)
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }
  return (
    <Field label={label}>
      <div style={{ display: 'flex', gap: '6px' }}>
        <input style={s} value={value || ''} onChange={e => onChange(e.target.value)} placeholder={hint} />
        <button type="button" style={{ ...btn, flexShrink: 0 }} disabled={busy} onClick={() => inputRef.current?.click()}>{busy ? '…' : 'Upload'}</button>
        {value && <a href={value} target="_blank" rel="noreferrer" style={{ ...btn, flexShrink: 0, textDecoration: 'none' }}>View</a>}
        <input ref={inputRef} type="file" accept={accept} style={{ display: 'none' }} onChange={e => upload(e.target.files?.[0])} />
      </div>
    </Field>
  )
}

export default function EditorArchive() {
  const [data, setData] = useState(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetch(`${API}/page/archive`).then(r => r.json()).then(d => setData({ title: 'Archive', description: '', items: [], ...d }))
  }, [])

  const save = async () => {
    const res = await fetch(`${API}/page/archive`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
    if (!res.ok) { alert('Save failed — is the editor server running (and restarted since Archive was added)?'); return }
    setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  if (!data) return <div style={{ padding: '40px', color: 'var(--ed-text-xmuted)' }}>Loading...</div>

  const setField = (k, v) => setData(d => ({ ...d, [k]: v }))
  const updateItem = (id, k, v) => setData(d => ({ ...d, items: d.items.map(it => it.id === id ? { ...it, [k]: v } : it) }))
  const addItem = (type) => setData(d => ({ ...d, items: [newItem(type), ...d.items] }))
  const removeItem = (id) => {
    if (!confirm('Delete this entry? (Uploaded files stay in /assets/archive.)')) return
    setData(d => ({ ...d, items: d.items.filter(it => it.id !== id) }))
  }

  // Shown newest first, same as the public page. Entries with no date yet
  // (just added) stay on top.
  const items = [...data.items].sort((a, b) => (b.date || '9999').localeCompare(a.date || '9999'))

  return (
    <div className="ed-page">
      <EditorTopbar title="Archive" onSave={save} saved={saved} extra={
        <a href="/archive" target="_blank" rel="noreferrer" style={{ ...btn, textDecoration: 'none' }}>View /archive ↗</a>
      } />

      <Card title="Page">
        <Row>
          <Field label="Title"><input style={s} value={data.title || ''} onChange={e => setField('title', e.target.value)} placeholder="Archive" /></Field>
        </Row>
        <Field label="Description (optional)">
          <textarea style={{ ...s, resize: 'vertical' }} rows={2} value={data.description || ''} onChange={e => setField('description', e.target.value)} />
        </Field>
        <div style={{ fontSize: '11px', color: 'var(--ed-text-muted)', lineHeight: 1.6 }}>
          Projects are listed on /archive automatically (every project with a year, except globally hidden ones), so only Portfolios and News are edited here.
        </div>
      </Card>

      <Card title={`Entries (${data.items.length})`}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button style={btn} onClick={() => addItem('portfolio')}>+ Portfolio</button>
          <button style={btn} onClick={() => addItem('news')}>+ News</button>
        </div>
        {items.length === 0 && <div style={{ fontSize: '12px', color: 'var(--ed-text-xmuted)' }}>No entries yet.</div>}
        {items.map(it => (
          <div key={it.id} style={{ border: '1px solid var(--ed-card-border)', borderRadius: '10px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '12px', opacity: it.hidden ? 0.5 : 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: TYPE_COLOR[it.type] }}>{it.type}</span>
              <span style={{ flex: 1, minWidth: 0, fontSize: '13px', fontWeight: 600, color: 'var(--ed-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.title || '(untitled)'}</span>
              <TogglePill checked={!it.hidden} onChange={() => updateItem(it.id, 'hidden', !it.hidden)} />
              <button onClick={() => removeItem(it.id)} style={{ ...btn, border: '1px solid #ffccc7', color: '#e53e3e', background: 'none' }}>Delete</button>
            </div>
            <Row>
              <Field label={it.type === 'portfolio' ? 'Year (or YYYY-MM)' : 'Date (YYYY-MM-DD, or YYYY-MM)'}>
                <input style={s} value={it.date || ''} onChange={e => updateItem(it.id, 'date', e.target.value)} placeholder={it.type === 'portfolio' ? '2025' : '2026-03-14'} />
              </Field>
              <Field label="Title">
                <input style={s} value={it.title || ''} onChange={e => updateItem(it.id, 'title', e.target.value)} placeholder={it.type === 'portfolio' ? 'Portfolio 2025' : 'Won the … award'} />
              </Field>
            </Row>
            <Field label="Description (optional)">
              <input style={s} value={it.description || ''} onChange={e => updateItem(it.id, 'description', e.target.value)} />
            </Field>
            {it.type === 'portfolio' && (
              <Row>
                <Field label="Access">
                  <select style={s} value={it.access || 'public'} onChange={e => updateItem(it.id, 'access', e.target.value)}>
                    <option value="public">Public — link to the file</option>
                    <option value="request">Available on request — links to Contacts, file not linked</option>
                  </select>
                </Field>
              </Row>
            )}
            {it.type === 'portfolio' && (
              <UploadField label="PDF" value={it.file} onChange={v => updateItem(it.id, 'file', v)} accept="application/pdf" hint="/assets/archive/…pdf" />
            )}
            <Row>
              <Field label="Link (optional — used when there's no file)">
                <input style={s} value={it.link || ''} onChange={e => updateItem(it.id, 'link', e.target.value)} placeholder="https://… or /projects/…" />
              </Field>
            </Row>
            <UploadField label="Thumbnail image (optional)" value={it.image} onChange={v => updateItem(it.id, 'image', v)} accept="image/*" hint="/assets/archive/…" />
          </div>
        ))}
      </Card>
    </div>
  )
}
