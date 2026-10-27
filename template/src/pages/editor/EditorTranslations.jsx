import { useState, useEffect, useMemo, useRef } from 'react'
import { API, EditorTopbar } from './EditorComponents'
import siteConfig from '../../data/siteConfig.json'
import { enabledLanguages } from '../../i18n/languages'

// Translation overview: progress per page, side-by-side KO/ZH editing of
// every text string, per-language image replacements, and outdated entries
// (translations whose English was since edited). Page editors in KO/ZH mode
// edit the same dictionaries in context; this page is for the overview and
// the bits those can't do (images, untranslated-list, cleanup).
// The site's languages besides English (siteConfig.languages).
const LANGS = enabledLanguages(siteConfig).filter(l => l.code !== 'en').map(l => ({ code: l.code, label: l.name }))

const input = { border: '1px solid var(--ed-input-border)', borderRadius: '8px', padding: '7px 10px', fontSize: '13px', fontFamily: 'inherit', color: 'var(--ed-text)', background: 'var(--ed-input-bg)', outline: 'none', width: '100%', boxSizing: 'border-box', resize: 'vertical', lineHeight: 1.5 }
const btn = { border: '1px solid var(--ed-input-border)', borderRadius: '6px', padding: '5px 12px', cursor: 'pointer', fontSize: '12px', fontFamily: 'inherit', background: 'var(--ed-input-bg)', color: 'var(--ed-text-sub)' }
const chip = (active) => ({ ...btn, padding: '4px 10px', fontSize: '11px', fontWeight: 600, background: active ? 'var(--ed-text)' : 'var(--ed-input-bg)', color: active ? 'var(--ed-bg)' : 'var(--ed-text-muted)', border: active ? '1px solid transparent' : btn.border })

function Progress({ done, total }) {
  const pct = total ? Math.round((done / total) * 100) : 100
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '10px', color: 'var(--ed-text-muted)', fontVariantNumeric: 'tabular-nums' }}>
      <span style={{ width: '36px', height: '4px', borderRadius: '2px', background: 'var(--ed-divider)', overflow: 'hidden' }}>
        <span style={{ display: 'block', height: '100%', width: `${pct}%`, background: pct === 100 ? '#1e8e3e' : '#d97706' }} />
      </span>
      {done}/{total}
    </span>
  )
}

function readAsBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(',')[1])
    r.onerror = reject
    r.readAsDataURL(file)
  })
}

function ImageRow({ img, onChanged }) {
  const refs = useRef({})
  const upload = async (lang, file) => {
    if (!file) return
    const res = await fetch(`${API}/i18n/image`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lang, basePath: img.basePath, name: file.name, data: await readAsBase64(file) }),
    })
    if (!res.ok) alert('Upload failed')
    onChanged()
  }
  const remove = async (lang) => {
    if (!confirm(`Remove the ${lang.toUpperCase()} replacement? The original image will be used again.`)) return
    await fetch(`${API}/i18n/image`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lang, basePath: img.basePath }) })
    onChanged()
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '88px 1fr', gap: '12px', padding: '10px', border: '1px solid var(--ed-divider)', borderRadius: '10px', alignItems: 'center' }}>
      <img src={img.src} alt="" loading="lazy" style={{ width: '88px', height: '60px', objectFit: 'cover', borderRadius: '6px', background: 'var(--ed-input-bg)' }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0 }}>
        <span style={{ fontSize: '11px', color: 'var(--ed-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={img.basePath}>{img.basePath.split('/').slice(-2).join('/')}</span>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {LANGS.map(l => (
            <span key={l.code} style={{ display: 'inline-flex', gap: '4px', alignItems: 'center' }}>
              <span style={{ fontSize: '10px', fontWeight: 700, color: img[l.code] ? '#d97706' : 'var(--ed-text-xmuted)' }}>{l.code.toUpperCase()}</span>
              <button style={{ ...btn, padding: '3px 8px', fontSize: '11px' }} onClick={() => refs.current[l.code]?.click()}>{img[l.code] ? 'Replace' : 'Upload'}</button>
              {img[l.code] && <button style={{ ...btn, padding: '3px 8px', fontSize: '11px', color: '#e53e3e' }} onClick={() => remove(l.code)}>×</button>}
              <input ref={el => { refs.current[l.code] = el }} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { upload(l.code, e.target.files?.[0]); e.target.value = '' }} />
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function EditorTranslations() {
  const [status, setStatus] = useState(null)
  const [selected, setSelected] = useState(() => new URLSearchParams(window.location.search).get('source') || 'ui')
  const [rows, setRows] = useState([])
  const [draft, setDraft] = useState({}) // `${lang}\u0000${src}` -> value
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState('text')
  const [images, setImages] = useState([])
  const [outdated, setOutdated] = useState(null)
  const [saved, setSaved] = useState(false)

  const loadStatus = () => fetch(`${API}/i18n/status`).then(r => r.json()).then(setStatus)
  const loadRows = (id) => fetch(`${API}/i18n/source?id=${encodeURIComponent(id)}`).then(r => r.json()).then(d => { setRows(d.strings || []); setDraft({}) })
  const source = status?.sources.find(s => s.id === selected)
  const loadImages = () => fetch(`${API}/i18n/images?dir=${encodeURIComponent(source.assets)}`).then(r => r.json()).then(d => setImages(d.images || []))

  useEffect(() => { loadStatus() }, [])
  useEffect(() => { if (selected !== '__outdated') loadRows(selected) }, [selected])
  useEffect(() => { if (tab === 'images' && source?.assets) loadImages() }, [tab, source?.assets])
  useEffect(() => { if (selected === '__outdated') fetch(`${API}/i18n/outdated`).then(r => r.json()).then(setOutdated) }, [selected])

  const dirty = Object.keys(draft).length > 0
  const valueOf = (row, lang) => draft[`${lang}\u0000${row.src}`] ?? row[lang]
  const setValue = (row, lang, v) => setDraft(d => {
    const k = `${lang}\u0000${row.src}`
    const next = { ...d }
    if (v === row[lang]) delete next[k]; else next[k] = v
    return next
  })

  const save = async () => {
    const byLang = {}
    Object.entries(draft).forEach(([k, v]) => {
      const [lang, src] = k.split('\u0000')
      ;(byLang[lang] ||= {})[src] = v
    })
    for (const [lang, entries] of Object.entries(byLang)) {
      await fetch(`${API}/i18n/strings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lang, entries }) })
    }
    await Promise.all([loadRows(selected), loadStatus()])
    setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  const pick = (id) => {
    if (dirty && !confirm('Discard unsaved translations on this page?')) return
    setSelected(id); setFilter('all'); setQuery(''); setTab('text')
    const url = new URL(window.location.href); url.searchParams.set('source', id); window.history.replaceState(null, '', url)
  }

  const visible = useMemo(() => rows.filter(r => {
    if (filter !== 'all' && valueOf(r, filter)) return false
    if (query) {
      const q = query.toLowerCase()
      if (![r.src, r.ko, r.zh].some(v => (v || '').toLowerCase().includes(q))) return false
    }
    return true
  }), [rows, filter, query, draft])

  const groups = useMemo(() => {
    const g = {}
    ;(status?.sources || []).forEach(s => { (g[s.group] ||= []).push(s) })
    return Object.entries(g)
  }, [status])

  const totals = useMemo(() => {
    const t = { total: 0, ko: 0, zh: 0 }
    ;(status?.sources || []).forEach(s => { t.total += s.total; t.ko += s.done.ko; t.zh += s.done.zh })
    return t
  }, [status])

  const removeOutdated = async (lang, src) => {
    await fetch(`${API}/i18n/strings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lang, entries: { [src]: '' } }) })
    fetch(`${API}/i18n/outdated`).then(r => r.json()).then(setOutdated)
    loadStatus()
  }

  return (
    <div className="ed-page">
      <EditorTopbar title="Translations" onSave={dirty ? save : undefined} saved={saved} />

      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '12px', color: 'var(--ed-text-muted)', alignItems: 'center' }}>
        <span>Whole site:</span>
        <span>KO <Progress done={totals.ko} total={totals.total} /></span>
        <span>ZH <Progress done={totals.zh} total={totals.total} /></span>
        <span style={{ flex: 1 }} />
        <span>Tip: switch the editor to KO/ZH (top right) to translate right inside each page editor, with the preview in that language.</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 240px) minmax(0, 1fr)', gap: '16px', alignItems: 'start' }}>
        {/* Source list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', position: 'sticky', top: '12px', maxHeight: 'calc(100vh - 140px)', overflowY: 'auto' }}>
          {groups.map(([group, list]) => (
            <div key={group}>
              <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--ed-text-xmuted)', marginBottom: '4px' }}>{group}</div>
              {list.map(s => (
                <button key={s.id} onClick={() => pick(s.id)} style={{
                  display: 'flex', flexDirection: 'column', gap: '3px', width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                  padding: '6px 8px', borderRadius: '7px', background: selected === s.id ? 'var(--ed-nav-active-bg)' : 'transparent',
                  color: selected === s.id ? 'var(--ed-nav-active-text)' : 'var(--ed-text)',
                }}>
                  <span style={{ fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>{s.label}</span>
                  <span style={{ display: 'flex', gap: '8px' }}>
                    <span style={{ fontSize: '10px' }}>KO</span><Progress done={s.done.ko} total={s.total} />
                    <span style={{ fontSize: '10px' }}>ZH</span><Progress done={s.done.zh} total={s.total} />
                  </span>
                </button>
              ))}
            </div>
          ))}
          {status && (status.outdated.ko + status.outdated.zh > 0) && (
            <button onClick={() => pick('__outdated')} style={{ ...btn, textAlign: 'left', color: '#d97706', borderColor: '#fed7aa' }}>
              Outdated translations ({status.outdated.ko + status.outdated.zh})
            </button>
          )}
        </div>

        {/* Selected source */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', minWidth: 0 }}>
          {selected === '__outdated' ? (
            <>
              <div style={{ fontSize: '12px', color: 'var(--ed-text-muted)', lineHeight: 1.6 }}>
                Translations whose English text no longer appears anywhere — usually because the English was edited afterwards. The page now shows that text in English until it's translated again; copy anything useful from here, then remove the old entry.
              </div>
              {outdated && LANGS.map(l => (outdated[l.code] || []).length > 0 && (
                <div key={l.code} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ fontSize: '12px', fontWeight: 700 }}>{l.label}</div>
                  {outdated[l.code].map(o => (
                    <div key={o.src} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '10px', padding: '8px 10px', border: '1px solid var(--ed-divider)', borderRadius: '8px', fontSize: '12px', alignItems: 'start' }}>
                      <span style={{ color: 'var(--ed-text-muted)', wordBreak: 'break-word' }}>{o.src}</span>
                      <span style={{ wordBreak: 'break-word', userSelect: 'all' }}>{o.value}</span>
                      <button style={{ ...btn, color: '#e53e3e' }} onClick={() => removeOutdated(l.code, o.src)}>Remove</button>
                    </div>
                  ))}
                </div>
              ))}
            </>
          ) : (
            <>
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                <strong style={{ fontSize: '14px', marginRight: '6px' }}>{source?.label || selected}</strong>
                <button style={chip(tab === 'text')} onClick={() => setTab('text')}>Text</button>
                {source?.assets && <button style={chip(tab === 'images')} onClick={() => setTab('images')}>Images</button>}
              </div>

              {tab === 'text' ? (
                <>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <button style={chip(filter === 'all')} onClick={() => setFilter('all')}>All ({rows.length})</button>
                    {LANGS.map(l => (
                      <button key={l.code} style={chip(filter === l.code)} onClick={() => setFilter(l.code)}>Missing {l.code.toUpperCase()} ({rows.filter(r => !valueOf(r, l.code)).length})</button>
                    ))}
                    <input style={{ ...input, width: '200px', marginLeft: 'auto', resize: 'none' }} placeholder="Search…" value={query} onChange={e => setQuery(e.target.value)} />
                  </div>
                  {dirty && <div style={{ fontSize: '12px', color: '#d97706' }}>Unsaved changes — press Save (top) or ⌘S.</div>}
                  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)', gap: '8px', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--ed-text-xmuted)' }}>
                    <span>English</span>{LANGS.map(l => <span key={l.code}>{l.label}</span>)}
                  </div>
                  {visible.length === 0 && <div style={{ fontSize: '12px', color: 'var(--ed-text-xmuted)' }}>Nothing to show.</div>}
                  {visible.map(r => (
                    <div key={r.src} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)', gap: '8px', alignItems: 'start' }}>
                      <div style={{ fontSize: '13px', lineHeight: 1.5, padding: '7px 0', color: 'var(--ed-text)', wordBreak: 'break-word' }}>{r.src}</div>
                      {LANGS.map(l => {
                        const v = valueOf(r, l.code)
                        return (
                          <textarea key={l.code} rows={Math.min(8, Math.max(1, Math.ceil(r.src.length / 38)))} style={{ ...input, borderColor: v ? input.border.split(' ').pop() : '#fed7aa', background: v ? input.background : 'color-mix(in srgb, #fff7ed 60%, var(--ed-input-bg))' }}
                            placeholder="(shows English)" value={v} onChange={e => setValue(r, l.code, e.target.value)} />
                        )
                      })}
                    </div>
                  ))}
                </>
              ) : (
                <>
                  <div style={{ fontSize: '12px', color: 'var(--ed-text-muted)', lineHeight: 1.6 }}>
                    Upload a replacement to use a different image on the Korean or Chinese site; images without one use the original. Replacements are stored next to the original in a <code>ko/</code> or <code>zh/</code> folder.
                  </div>
                  {images.length === 0 && <div style={{ fontSize: '12px', color: 'var(--ed-text-xmuted)' }}>No images in {source?.assets}.</div>}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '8px' }}>
                    {images.map(img => <ImageRow key={img.basePath} img={img} onChanged={loadImages} />)}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
