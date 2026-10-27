import { useState, useEffect, useRef } from 'react'
import { API, EditorTopbar, EditorSectionNav, Card, LinkField } from './EditorComponents'

function ElementRow({ label, hidden, onHidden, color, onColor, text, onText, textPlaceholder }) {
  const s = {
    border: '1px solid var(--ed-input-border)', borderRadius: '6px',
    padding: '5px 8px', fontSize: '12px', fontFamily: 'inherit',
    color: 'var(--ed-text)', background: 'var(--ed-input-bg)', outline: 'none',
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px', background: 'var(--ed-head-bg)', borderRadius: '8px', flexWrap: 'wrap' }}>
      <span style={{ fontSize: '13px', color: 'var(--ed-text-sub)', flex: '1 1 120px', minWidth: '100px' }}>{label}</span>
      {onText && (
        <input style={{ ...s, width: '160px' }} placeholder={textPlaceholder} value={text ?? ''} onChange={e => onText(e.target.value)} />
      )}
      {onColor && (
        <input type="color" value={color || '#000000'} onChange={e => onColor(e.target.value)}
          style={{ width: '28px', height: '28px', border: '1px solid var(--ed-input-border)', borderRadius: '6px', cursor: 'pointer', padding: '2px', background: 'none' }} />
      )}
      <button
        onClick={() => onHidden(!hidden)}
        style={{
          border: 'none', borderRadius: '20px', padding: '4px 14px', fontSize: '11px',
          cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600,
          background: hidden ? 'var(--ed-input-bg)' : '#111', color: hidden ? 'var(--ed-text-muted)' : '#fff',
        }}
      >{hidden ? 'Hidden' : 'Visible'}</button>
    </div>
  )
}

const DEFAULT_COLUMNS = [
  { title: 'Projects', items: [
    { label: 'Product', link: '/projects/product' },
    { label: 'Service', link: '/projects/service' },
  ] },
  { title: 'Originals', items: [
    { label: 'IP', link: '/originals/ip' },
    { label: 'Games', link: '/originals/games' },
    { label: 'Apps', link: '/originals/apps' },
  ] },
  { title: 'About', items: [
    { label: 'About', link: '/about' },
    { label: 'Contact', link: '/contacts' },
  ] },
  { title: 'Blog', items: [
    { label: 'Research', link: '/blog/research' },
    { label: 'Report', link: '/blog/report' },
    { label: 'Essay', link: '/blog/essay' },
  ] },
]

export default function EditorFooter() {
  const [config, setConfig] = useState(null)
  const [saved, setSaved] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef(null)

  useEffect(() => {
    fetch(`${API}/page/siteConfig`).then(r => r.json()).then(setConfig)
  }, [])

  const uploadIcon = async (file) => {
    if (!file) return
    setUploading(true)
    const reader = new FileReader()
    reader.onload = async (ev) => {
      const base64 = ev.target.result.split(',')[1]
      const res = await fetch(`${API}/footer-images/upload`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: file.name, data: base64 }),
      })
      const d = await res.json()
      if (d.ok) setConfig(cfg => ({ ...cfg, footerIconUrl: `${d.url}?v=${Date.now()}` }))
      setUploading(false)
    }
    reader.readAsDataURL(file)
  }

  const save = async () => {
    // Re-fetch fresh config first — other editor pages write to siteConfig
    // too, so a stale copy here could clobber edits made there.
    const fresh = await fetch(`${API}/page/siteConfig`).then(r => r.json())
    const merged = { ...fresh, ...config, footerColumns: config.footerColumns ?? fresh.footerColumns }
    await fetch(`${API}/page/siteConfig`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(merged),
    })
    setConfig(merged)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const s = {
    border: '1px solid var(--ed-input-border)', borderRadius: '8px',
    padding: '6px 10px', fontSize: '12px', fontFamily: 'inherit',
    color: 'var(--ed-text)', background: 'var(--ed-input-bg)',
    outline: 'none', flex: 1, minWidth: 0, boxSizing: 'border-box',
  }
  const btnSm = {
    border: '1px solid var(--ed-input-border)', borderRadius: '5px',
    padding: '3px 8px', cursor: 'pointer', fontSize: '11px',
    fontFamily: 'inherit', background: 'var(--ed-input-bg)', color: 'var(--ed-text-sub)',
  }

  if (!config) return <div style={{ padding: '40px', color: 'var(--ed-text-xmuted)' }}>Loading...</div>

  const columns = config.footerColumns || DEFAULT_COLUMNS

  const updateColumns = (next) => setConfig(cfg => ({ ...cfg, footerColumns: next }))

  const updateColTitle = (ci, title) => {
    const next = columns.map((c, i) => i === ci ? { ...c, title } : c)
    updateColumns(next)
  }
  const moveCol = (ci, dir) => {
    const next = [...columns]
    const t = ci + dir
    if (t < 0 || t >= next.length) return
    ;[next[ci], next[t]] = [next[t], next[ci]]
    updateColumns(next)
  }
  const removeCol = (ci) => updateColumns(columns.filter((_, i) => i !== ci))
  const toggleColHidden = (ci) => updateColumns(columns.map((c, i) => i === ci ? { ...c, hidden: !c.hidden } : c))
  const addCol = () => updateColumns([...columns, { title: 'New Column', items: [] }])

  const updateItem = (ci, ii, key, val) => {
    const next = columns.map((c, i) => {
      if (i !== ci) return c
      const items = c.items.map((it, j) => j === ii ? { ...it, [key]: val } : it)
      return { ...c, items }
    })
    updateColumns(next)
  }
  const moveItem = (ci, ii, dir) => {
    const next = columns.map((c, i) => {
      if (i !== ci) return c
      const items = [...c.items]
      const t = ii + dir
      if (t < 0 || t >= items.length) return c
      ;[items[ii], items[t]] = [items[t], items[ii]]
      return { ...c, items }
    })
    updateColumns(next)
  }
  const removeItem = (ci, ii) => {
    const next = columns.map((c, i) => i === ci ? { ...c, items: c.items.filter((_, j) => j !== ii) } : c)
    updateColumns(next)
  }
  const addItem = (ci) => {
    const next = columns.map((c, i) => i === ci ? { ...c, items: [...c.items, { label: '', link: '' }] } : c)
    updateColumns(next)
  }

  return (
    <div className="ed-page">
      <EditorTopbar title="Footer" onSave={save} saved={saved} />
      <EditorSectionNav sections={[
        { id: 'ed-footer-elements', label: 'Elements' },
        { id: 'ed-footer-text', label: 'Bottom Text' },
        { id: 'ed-footer-sizes', label: 'Sizes' },
        { id: 'ed-footer-columns', label: 'Columns & Links' },
      ]} />

      <Card id="ed-footer-elements" title="Elements" collapsible defaultOpen>
        <div style={{ fontSize: '12px', color: 'var(--ed-text-muted)', marginBottom: '4px' }}>
          Every piece of the footer, editable individually — color and visibility. The two divider lines share one color.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px', background: 'var(--ed-head-bg)', borderRadius: '8px' }}>
            <span style={{ fontSize: '13px', color: 'var(--ed-text-sub)', flex: 1 }}>Background</span>
            <input type="color" value={config.footerBgColor || '#f5f5f7'} onChange={e => setConfig(cfg => ({ ...cfg, footerBgColor: e.target.value }))}
              style={{ width: '28px', height: '28px', border: '1px solid var(--ed-input-border)', borderRadius: '6px', cursor: 'pointer', padding: '2px', background: 'none' }} />
          </div>
          <ElementRow label="Logo Icon" hidden={config.footerLogoHidden} onHidden={v => setConfig(cfg => ({ ...cfg, footerLogoHidden: v }))} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 12px', background: 'var(--ed-head-bg)', borderRadius: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '13px', color: 'var(--ed-text-sub)', flex: '1 1 120px', minWidth: '100px' }}>— Footer Icon Image</span>
            <div style={{ width: '32px', height: '32px', borderRadius: '6px', overflow: 'hidden', border: '1px solid var(--ed-input-border)', background: 'var(--ed-block-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <img src={config.footerIconUrl || '/assets/navbar/logo.svg'} alt="" style={{ maxWidth: '100%', maxHeight: '100%' }} />
            </div>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { uploadIcon(e.target.files[0]); e.target.value = '' }} />
            <button onClick={() => fileRef.current?.click()} disabled={uploading}
              style={{ border: '1px solid var(--ed-input-border)', background: 'var(--ed-input-bg)', color: 'var(--ed-text-sub)', borderRadius: '6px', padding: '5px 12px', fontSize: '11px', cursor: uploading ? 'default' : 'pointer', fontFamily: 'inherit' }}>
              {uploading ? 'Uploading…' : 'Upload'}
            </button>
            {config.footerIconUrl && (
              <button onClick={() => setConfig(cfg => ({ ...cfg, footerIconUrl: undefined }))}
                style={{ border: '1px solid var(--ed-input-border)', background: 'var(--ed-input-bg)', color: 'var(--ed-text-sub)', borderRadius: '6px', padding: '5px 12px', fontSize: '11px', cursor: 'pointer', fontFamily: 'inherit' }}>
                Reset to Navbar Logo
              </button>
            )}
          </div>
          <ElementRow label="— Hide Logo on Home only" hidden={!!config.footerLogoHideHome} onHidden={v => setConfig(cfg => ({ ...cfg, footerLogoHideHome: v }))} />
          <ElementRow label="Breadcrumb" hidden={config.footerBreadcrumbHidden}
            onHidden={v => setConfig(cfg => ({ ...cfg, footerBreadcrumbHidden: v }))}
            color={config.footerBreadcrumbColor} onColor={v => setConfig(cfg => ({ ...cfg, footerBreadcrumbColor: v }))} />
          <ElementRow label="Tagline" hidden={config.footerTaglineHidden}
            onHidden={v => setConfig(cfg => ({ ...cfg, footerTaglineHidden: v }))}
            color={config.footerTaglineColor} onColor={v => setConfig(cfg => ({ ...cfg, footerTaglineColor: v }))} />
          <ElementRow label="Archive Link" hidden={config.footerSitemapLinkHidden}
            onHidden={v => setConfig(cfg => ({ ...cfg, footerSitemapLinkHidden: v }))}
            color={config.footerSitemapLinkColor} onColor={v => setConfig(cfg => ({ ...cfg, footerSitemapLinkColor: v }))}
            text={config.footerSitemapLinkLabel} onText={v => setConfig(cfg => ({ ...cfg, footerSitemapLinkLabel: v }))} textPlaceholder="Archive" />
          <ElementRow label="Bottom Divider Line" hidden={config.footerBottomLineHidden}
            onHidden={v => setConfig(cfg => ({ ...cfg, footerBottomLineHidden: v }))}
            color={config.footerLineColor} onColor={v => setConfig(cfg => ({ ...cfg, footerLineColor: v }))} />
          <ElementRow label="Copyright" hidden={config.footerCopyrightHidden}
            onHidden={v => setConfig(cfg => ({ ...cfg, footerCopyrightHidden: v }))}
            color={config.footerCopyrightColor} onColor={v => setConfig(cfg => ({ ...cfg, footerCopyrightColor: v }))} />
          <ElementRow label="Language Label" hidden={config.footerLangHidden}
            onHidden={v => setConfig(cfg => ({ ...cfg, footerLangHidden: v }))}
            color={config.footerLangColor} onColor={v => setConfig(cfg => ({ ...cfg, footerLangColor: v }))}
            text={config.footerLangText} onText={v => setConfig(cfg => ({ ...cfg, footerLangText: v }))} textPlaceholder="English" />
        </div>
      </Card>

      <Card id="ed-footer-text" title="Bottom Text" collapsible defaultOpen>
        <div style={{ fontSize: '12px', color: 'var(--ed-text-muted)', marginBottom: '12px' }}>
          Copyright line uses the Site Name from the Navbar page automatically — only the tagline on the right is edited here.
        </div>
        <input
          style={s}
          placeholder="A short line, e.g. a motto (empty: the site’s tagline)"
          value={config.footerTagline ?? ''}
          onChange={e => setConfig(cfg => ({ ...cfg, footerTagline: e.target.value }))}
        />
      </Card>

      <Card id="ed-footer-sizes" title="Sizes" collapsible defaultOpen>
        <div style={{ fontSize: '12px', color: 'var(--ed-text-muted)', marginBottom: '12px' }}>
          Leave a field blank to use the default size.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ed-text-muted)', marginBottom: '4px' }}>Logo Size (e.g. 24px)</div>
            <input
              style={s}
              placeholder="24px"
              value={config.footerLogoSize ?? ''}
              onChange={e => setConfig(cfg => ({ ...cfg, footerLogoSize: e.target.value }))}
            />
          </div>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ed-text-muted)', marginBottom: '4px' }}>Column Gap (e.g. 32px)</div>
            <input
              style={s}
              placeholder="32px"
              value={config.footerColumnGap ?? ''}
              onChange={e => setConfig(cfg => ({ ...cfg, footerColumnGap: e.target.value }))}
            />
          </div>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ed-text-muted)', marginBottom: '4px' }}>Column Title Size (e.g. 13px)</div>
            <input
              style={s}
              placeholder="13px"
              value={config.footerTitleSize ?? ''}
              onChange={e => setConfig(cfg => ({ ...cfg, footerTitleSize: e.target.value }))}
            />
          </div>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ed-text-muted)', marginBottom: '4px' }}>Mobile/Tablet Accordion Row Padding (e.g. 8px)</div>
            <input
              style={s}
              placeholder="8px"
              value={config.footerAccordionRowPadding ?? ''}
              onChange={e => setConfig(cfg => ({ ...cfg, footerAccordionRowPadding: e.target.value }))}
            />
          </div>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ed-text-muted)', marginBottom: '4px' }}>Link Text Size (e.g. 13px)</div>
            <input
              style={s}
              placeholder="13px"
              value={config.footerLinkSize ?? ''}
              onChange={e => setConfig(cfg => ({ ...cfg, footerLinkSize: e.target.value }))}
            />
          </div>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ed-text-muted)', marginBottom: '4px' }}>Bottom Text Size (e.g. 12px)</div>
            <input
              style={s}
              placeholder="12px"
              value={config.footerBottomSize ?? ''}
              onChange={e => setConfig(cfg => ({ ...cfg, footerBottomSize: e.target.value }))}
            />
          </div>
        </div>
      </Card>

      <Card id="ed-footer-columns" title="Columns & Links" collapsible defaultOpen>
        <div style={{ fontSize: '12px', color: 'var(--ed-text-muted)', marginBottom: '12px' }}>
          Links accept internal paths (e.g. <code style={{ fontSize: '11px', background: 'var(--ed-block-bg)', padding: '1px 5px', borderRadius: '4px' }}>/projects/product</code>), external URLs, or an anchor to a specific section on a page (e.g. <code style={{ fontSize: '11px', background: 'var(--ed-block-bg)', padding: '1px 5px', borderRadius: '4px' }}>/about#Philosophy</code> — the part after <code>#</code> must exactly match that section's ID, visible in the About/Blog/etc. editor).
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {columns.map((col, ci) => (
            <div key={ci} style={{ border: '1px solid var(--ed-divider)', borderRadius: '10px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px', opacity: col.hidden ? 0.45 : 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  style={{ ...s, fontWeight: 600 }}
                  placeholder="Column Title"
                  value={col.title}
                  onChange={e => updateColTitle(ci, e.target.value)}
                />
                <button onClick={() => moveCol(ci, -1)} style={btnSm}>↑</button>
                <button onClick={() => moveCol(ci, 1)} style={btnSm}>↓</button>
                <button
                  onClick={() => toggleColHidden(ci)}
                  title={col.hidden ? 'Hidden from the footer — click to show' : 'Shown in the footer — click to hide (keeps its links)'}
                  style={{ ...btnSm, whiteSpace: 'nowrap', color: col.hidden ? 'var(--ed-text-muted)' : '#1a73e8', borderColor: col.hidden ? 'var(--ed-input-border)' : '#1a73e8' }}
                >{col.hidden ? '○ Hidden' : '● Shown'}</button>
                <button onClick={() => removeCol(ci)} style={{ ...btnSm, color: '#e53e3e', borderColor: '#ffccc7' }}>Remove Column</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {col.items.map((item, ii) => (
                  <div key={ii} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', background: 'var(--ed-block-bg)', borderRadius: '8px', padding: '8px', opacity: item.hidden ? 0.45 : 1 }}>
                    <input
                      style={{ ...s, flex: '0 0 120px' }}
                      placeholder="Label"
                      value={item.label}
                      onChange={e => updateItem(ci, ii, 'label', e.target.value)}
                    />
                    <div style={{ flex: 1 }}>
                      <LinkField value={item.link} onChange={v => updateItem(ci, ii, 'link', v)} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <button onClick={() => moveItem(ci, ii, -1)} style={btnSm}>↑</button>
                      <button onClick={() => moveItem(ci, ii, 1)} style={btnSm}>↓</button>
                      <button
                        onClick={() => updateItem(ci, ii, 'hidden', !item.hidden)}
                        style={{ ...btnSm, color: item.hidden ? 'var(--ed-text-muted)' : '#1a73e8', borderColor: item.hidden ? 'var(--ed-input-border)' : '#1a73e8' }}
                      >{item.hidden ? '○ Hide' : '● Show'}</button>
                      <button onClick={() => removeItem(ci, ii)} style={{ ...btnSm, color: '#e53e3e', borderColor: '#ffccc7' }}>✕</button>
                    </div>
                  </div>
                ))}
              </div>
              <button
                onClick={() => addItem(ci)}
                style={{ background: 'none', border: '1px dashed var(--ed-input-border)', borderRadius: '8px', padding: '6px 14px', fontSize: '12px', color: 'var(--ed-text-muted)', cursor: 'pointer', fontFamily: 'inherit', alignSelf: 'flex-start' }}
              >
                + Add Link
              </button>
            </div>
          ))}
        </div>
        <button
          onClick={addCol}
          style={{ marginTop: '14px', background: 'none', border: '1px dashed var(--ed-input-border)', borderRadius: '8px', padding: '8px 18px', fontSize: '13px', color: 'var(--ed-text-muted)', cursor: 'pointer', fontFamily: 'inherit' }}
        >
          + Add Column
        </button>
      </Card>
    </div>
  )
}
