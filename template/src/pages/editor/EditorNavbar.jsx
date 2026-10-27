import { useState, useEffect } from 'react'
import { API, EditorTopbar, EditorSectionNav, Card, TogglePill, BgColorField } from './EditorComponents'

const BUILT_IN = [
  { label: 'About',    path: '/about' },
  { label: 'Projects', path: '/projects' },
  { label: 'Originals',path: '/originals' },
  { label: 'Blog',     path: '/blog' },
  { label: 'Contacts', path: '/contacts' },
]

export default function EditorNavbar() {
  const [config, setConfig] = useState(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetch(`${API}/page/siteConfig`).then(r => r.json()).then(setConfig)
  }, [])

  const save = async () => {
    await fetch(`${API}/page/siteConfig`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const hiddenBuiltin = config?.hiddenBuiltinNav || []
  const items = config?.navCustomItems || []

  const toggleBuiltin = (path) => setConfig(cfg => {
    const hidden = cfg.hiddenBuiltinNav || []
    return {
      ...cfg,
      hiddenBuiltinNav: hidden.includes(path) ? hidden.filter(p => p !== path) : [...hidden, path],
    }
  })

  const updateItem = (i, key, val) => setConfig(cfg => {
    const next = [...(cfg.navCustomItems || [])]
    next[i] = { ...next[i], [key]: val }
    return { ...cfg, navCustomItems: next }
  })

  const moveItem = (i, dir) => setConfig(cfg => {
    const next = [...(cfg.navCustomItems || [])]
    const t = i + dir
    if (t < 0 || t >= next.length) return cfg
    ;[next[i], next[t]] = [next[t], next[i]]
    return { ...cfg, navCustomItems: next }
  })

  const removeItem = (i) => setConfig(cfg => ({
    ...cfg,
    navCustomItems: (cfg.navCustomItems || []).filter((_, idx) => idx !== i),
  }))

  const addItem = () => setConfig(cfg => ({
    ...cfg,
    navCustomItems: [...(cfg.navCustomItems || []), { label: '', path: '' }],
  }))

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

  return (
    <div className="ed-page">
      <EditorTopbar title="Navbar" onSave={save} saved={saved} />
      <EditorSectionNav sections={[
        { id: 'ed-navbar-name', label: 'Site Name' },
        { id: 'ed-navbar-appearance', label: 'Appearance' },
        { id: 'ed-navbar-builtin', label: 'Built-in Tabs' },
        { id: 'ed-navbar-custom', label: 'Custom Tabs' },
      ]} />

      {/* Site Name */}
      <Card id="ed-navbar-name" title="Site Name" collapsible defaultOpen>
        <div style={{ fontSize: '12px', color: 'var(--ed-text-muted)', marginBottom: '12px' }}>
          Used in the footer copyright. The hero title on the Home page is edited separately under Home → Hero.
        </div>
        <input
          style={s}
          placeholder="Your Name"
          value={config.name || ''}
          onChange={e => setConfig(cfg => ({ ...cfg, name: e.target.value }))}
        />
      </Card>

      {/* Appearance */}
      <Card id="ed-navbar-appearance" title="Appearance" collapsible defaultOpen>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ed-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Menu Font Size</label>
            <input
              style={{ ...s, width: '90px', flex: 'none' }}
              placeholder="e.g. 12px"
              value={config.navFontSize || ''}
              onChange={e => setConfig(cfg => ({ ...cfg, navFontSize: e.target.value || undefined }))}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ed-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Logo Icon Size</label>
            <input
              style={{ ...s, width: '90px', flex: 'none' }}
              placeholder="e.g. 28px"
              value={config.navIconSize || ''}
              onChange={e => setConfig(cfg => ({ ...cfg, navIconSize: e.target.value || undefined }))}
            />
          </div>
        </div>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginTop: '16px' }}>
          <BgColorField
            label="Navbar BG"
            value={config.navBgColor || ''}
            onChange={v => setConfig(cfg => ({ ...cfg, navBgColor: v || undefined }))}
          />
        </div>
        <div style={{ fontSize: '11px', color: 'var(--ed-text-xmuted)', marginTop: '4px' }}>
          Background behind the top navbar. Leave empty to use the default (white, or black when a project sets Dark Nav).
        </div>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginTop: '16px' }}>
          <BgColorField
            label="Sub-bar BG"
            value={config.navBottomBgColor || ''}
            onChange={v => setConfig(cfg => ({ ...cfg, navBottomBgColor: v || undefined }))}
          />
        </div>
        <div style={{ fontSize: '11px', color: 'var(--ed-text-xmuted)', marginTop: '4px' }}>
          Background behind the secondary bar shown under the navbar on project/original detail pages (the back arrow + title row). Supports transparency, e.g. <code style={{ fontSize: '10px', background: 'var(--ed-block-bg)', padding: '1px 5px', borderRadius: '4px' }}>rgba(245,245,247,0.72)</code>.
        </div>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginTop: '16px' }}>
          <BgColorField
            label="Behind-Bar BG"
            value={config.navBehindBgColor || ''}
            onChange={v => setConfig(cfg => ({ ...cfg, navBehindBgColor: v || undefined }))}
          />
        </div>
        <div style={{ fontSize: '11px', color: 'var(--ed-text-xmuted)', marginTop: '4px' }}>
          Not the bars' own color — this fills the area <em>behind</em> them, visible through their translucency wherever no page content has scrolled under yet (by default that's just the page's white background, which reads as flat grey through the Sub-bar's blur). Leave empty to keep that default.
        </div>
      </Card>

      {/* Built-in tabs */}
      <Card id="ed-navbar-builtin" title="Built-in Tabs" collapsible defaultOpen>
        <div style={{ fontSize: '12px', color: 'var(--ed-text-muted)', marginBottom: '12px' }}>
          Toggle visibility of each tab. Changes take effect after Save + Deploy.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {BUILT_IN.map(tab => {
            const isHidden = hiddenBuiltin.includes(tab.path)
            return (
              <div key={tab.path} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: '8px', background: isHidden ? 'var(--ed-head-bg)' : 'var(--ed-card-bg)', border: '1px solid var(--ed-divider)' }}>
                <span style={{ fontSize: '13px', fontWeight: 500, color: isHidden ? 'var(--ed-text-xmuted)' : 'var(--ed-text)' }}>{tab.label}</span>
                <TogglePill checked={!isHidden} onChange={() => toggleBuiltin(tab.path)} />
              </div>
            )
          })}
        </div>
      </Card>

      {/* Custom tabs */}
      <Card id="ed-navbar-custom" title="Custom Tabs" collapsible defaultOpen>
        <div style={{ fontSize: '12px', color: 'var(--ed-text-muted)', marginBottom: '12px' }}>
          Added after the built-in tabs. Set a <strong>Forward URL</strong> to auto-redirect when visiting <code style={{ fontSize: '11px', background: 'var(--ed-block-bg)', padding: '1px 5px', borderRadius: '4px' }}>nnwoo.com/path</code>.
        </div>

        {/* Preview */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '16px', padding: '10px 12px', background: 'var(--ed-block-bg)', borderRadius: '8px' }}>
          <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--ed-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', alignSelf: 'center', marginRight: '4px' }}>Preview</span>
          {BUILT_IN.filter(t => !hiddenBuiltin.includes(t.path)).map(t => (
            <span key={t.path} style={{ padding: '4px 10px', background: 'var(--ed-input-bg)', border: '1px solid var(--ed-input-border)', borderRadius: '6px', fontSize: '12px', color: 'var(--ed-text-muted)' }}>{t.label}</span>
          ))}
          {items.map((item, i) => item.label && (
            <span key={i} style={{ padding: '4px 10px', background: '#111', border: '1px solid #111', borderRadius: '6px', fontSize: '12px', color: '#fff' }}>
              {item.label}
              {item.href && <span style={{ marginLeft: '4px', fontSize: '10px', opacity: 0.6 }}>↗</span>}
            </span>
          ))}
        </div>

        {/* Column headers */}
        {items.length > 0 && (
          <div style={{ display: 'flex', gap: '8px', marginBottom: '4px', paddingLeft: '2px' }}>
            <span style={{ flex: '0 0 120px', fontSize: '10px', fontWeight: 600, color: 'var(--ed-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Label</span>
            <span style={{ flex: '0 0 140px', fontSize: '10px', fontWeight: 600, color: 'var(--ed-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Path (slug)</span>
            <span style={{ flex: 1, fontSize: '10px', fontWeight: 600, color: 'var(--ed-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Forward URL (optional)</span>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {items.map((item, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                style={{ ...s, flex: '0 0 120px' }}
                placeholder="Label"
                value={item.label}
                onChange={e => updateItem(i, 'label', e.target.value)}
              />
              <input
                style={{ ...s, flex: '0 0 140px' }}
                placeholder="/ig"
                value={item.path}
                onChange={e => updateItem(i, 'path', e.target.value)}
              />
              <input
                style={s}
                placeholder="https://instagram.com/..."
                value={item.href || ''}
                onChange={e => updateItem(i, 'href', e.target.value)}
              />
              <button onClick={() => moveItem(i, -1)} style={btnSm}>↑</button>
              <button onClick={() => moveItem(i, 1)} style={btnSm}>↓</button>
              <button onClick={() => removeItem(i)} style={{ ...btnSm, color: '#e53e3e', borderColor: '#ffccc7' }}>✕</button>
            </div>
          ))}
          {items.length === 0 && (
            <div style={{ fontSize: '12px', color: 'var(--ed-text-xmuted)', padding: '4px 0' }}>No custom tabs added yet.</div>
          )}
        </div>
        <button
          onClick={addItem}
          style={{ marginTop: '10px', background: 'none', border: '1px dashed var(--ed-input-border)', borderRadius: '8px', padding: '7px 16px', fontSize: '12px', color: 'var(--ed-text-muted)', cursor: 'pointer', fontFamily: 'inherit' }}
        >
          + Add Tab
        </button>
      </Card>
    </div>
  )
}
