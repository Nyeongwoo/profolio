import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useState, useEffect, useRef, useCallback } from 'react'
import { EditorActionCtx } from './EditorActionCtx'
import siteConfig from '../../data/siteConfig.json'
import { enabledLanguages } from '../../i18n/languages'
import { safeGet, safeSet, safeRemove } from '../../utils/safeStorage'

import { EMBED } from './pofole'

const API = '/api'

// Apple.com-derived tokens: single Action Blue accent, parchment/white
// surfaces, near-black ink — see design-system notes for the source mapping.
const LIGHT = {
  '--ed-bg':              '#f5f5f7', // canvas-parchment
  '--ed-sidebar-bg':      '#ffffff', // canvas
  '--ed-sidebar-border':  '#e0e0e0', // hairline
  '--ed-card-bg':         '#ffffff',
  '--ed-card-border':     '#e0e0e0',
  '--ed-head-bg':         '#fafafc', // surface-pearl
  '--ed-block-bg':        '#f5f5f7',
  '--ed-block-border':    '#e5e5e7',
  '--ed-input-bg':        '#ffffff',
  '--ed-input-border':    '#e0e0e0',
  '--ed-text':            '#1d1d1f', // ink
  '--ed-text-sub':        '#333333', // ink-muted-80
  '--ed-text-muted':      '#6e6e73',
  '--ed-text-xmuted':     '#a1a1a6',
  '--ed-topbar-bg':       '#ffffff',
  '--ed-topbar-border':   '#e0e0e0',
  '--ed-nav-active-bg':   '#1d1d1f',
  '--ed-nav-active-text': '#ffffff',
  '--ed-nav-hover-bg':    '#f5f5f7',
  '--ed-nav-text':        '#1d1d1f',
  '--ed-nav-muted':       '#a1a1a6',
  '--ed-badge-border':    '#e0e0e0',
  '--ed-divider':         '#f0f0f0', // divider-soft
  '--ed-accent':          '#0066cc', // Action Blue
}

const DARK = {
  '--ed-bg':              '#1e1e1e', // surface-black replacement — not pure black
  '--ed-sidebar-bg':      '#1e1e1e',
  '--ed-sidebar-border':  '#3a3a3a',
  '--ed-card-bg':         '#2c2c2c', // near-black tile replacement
  '--ed-card-border':     '#3a3a3a',
  '--ed-head-bg':         '#262626',
  '--ed-block-bg':        '#333333',
  '--ed-block-border':    '#3e3e3e',
  '--ed-input-bg':        '#2c2c2c',
  '--ed-input-border':    '#4a4a4a',
  '--ed-text':            '#ffffff',
  '--ed-text-sub':        '#cccccc', // body-muted
  '--ed-text-muted':      '#a1a1a6',
  '--ed-text-xmuted':     '#8a8a8a',
  '--ed-topbar-bg':       '#1e1e1e',
  '--ed-topbar-border':   '#3a3a3a',
  '--ed-nav-active-bg':   '#3a3a3a',
  '--ed-nav-active-text': '#ffffff',
  '--ed-nav-hover-bg':    '#2c2c2c',
  '--ed-nav-text':        '#f5f5f7',
  '--ed-nav-muted':       '#8a8a8a',
  '--ed-badge-border':    '#4a4a4a',
  '--ed-divider':         '#3a3a3a',
  '--ed-accent':          '#2997ff', // Sky Link Blue (dark-surface variant)
}

// Muted, low-saturation tints — quiet content-category tags, not action
// signals, so they deliberately stay far from the single Action Blue accent.
const CATEGORY_BADGE = {
  'product':     { color: '#eef3ef', text: '#4c7a5c' },
  'mobility':    { color: '#eef1f6', text: '#4d6a94' },
  'service':     { color: '#f5f0e6', text: '#93752f' },
  'ip':          { color: '#f1eef5', text: '#7a5c94' },
  'apps':        { color: '#eaf2f2', text: '#3f7a7a' },
  'games':       { color: '#f5efe6', text: '#96692f' },
}

function CategoryBadge({ category }) {
  const badge = CATEGORY_BADGE[category] || { color: 'var(--ed-block-bg)', text: 'var(--ed-text-muted)' }
  return (
    <span style={{
      fontSize:'9px', fontWeight:600, padding:'2px 7px', borderRadius:'9999px',
      background: badge.color, color: badge.text, flexShrink:0, textTransform:'uppercase', letterSpacing:'0.04em'
    }}>{category}</span>
  )
}

const PREVIEW_BASE = window.location.origin

// Editor language mode. EN edits the site itself; KO/ZH turn every page
// editor into a translation editor for that language: the editor server
// (server/index.js, "Localization") serves text fields translated and saves
// edits into the language's dictionary instead of the English files, and
// refuses changes to shared data. Every /api request carries the language
// as a header, set once here so no page editor needs to know about it.
// The site's languages (siteConfig.languages); the picker shows once there
// is more than English.
const EDIT_LANGS = enabledLanguages(siteConfig).map(l => ({ ...l, label: l.code.toUpperCase() }))
const EDIT_LANG = EDIT_LANGS.find(l => l.code === safeGet('editorLang')) || EDIT_LANGS[0]
if (EDIT_LANG.code !== 'en' && !window.__editLangFetch) {
  const baseFetch = window.fetch.bind(window)
  window.__editLangFetch = true
  window.fetch = (input, init = {}) => {
    const url = typeof input === 'string' ? input : input?.url || ''
    if (!/^(\/api\/|https?:\/\/[^/]+\/api\/)/.test(url)) return baseFetch(input, init)
    const headers = new Headers(init.headers || (typeof input !== 'string' ? input.headers : undefined))
    headers.set('X-Edit-Lang', EDIT_LANG.code)
    return baseFetch(input, { ...init, headers }).then(res => {
      if (res.status === 409) res.clone().json().then(d => { if (d?.langBlocked) alert(d.error) }).catch(() => {})
      return res
    })
  }
}
// Page documents (/api/page/<name>, e.g. siteConfig) are edited by several
// editor pages, and most of them save the whole document they loaded when
// they opened — which reverted anything another page (or a per-project
// toggle) had changed since. So each page's first load of a document is kept
// as its base, and a save sends only the top-level keys that differ from it,
// merged server-side onto the current file (X-Merge). The base is per editor
// route: opening another page starts fresh.
if (EDIT_LANG.code === 'en' && !window.__pageMergeFetch) {
  const baseFetch = window.fetch.bind(window)
  const bases = {} // page -> { route, doc }
  const pageOf = (url) => url.match(/\/api\/page\/([\w-]+)(?:\?|$)/)?.[1]
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
  window.__pageMergeFetch = true
  window.fetch = (input, init = {}) => {
    const url = typeof input === 'string' ? input : input?.url || ''
    const page = pageOf(url)
    if (!page) return baseFetch(input, init)
    const route = window.location.pathname
    const method = (init.method || 'GET').toUpperCase()
    if (method === 'GET') {
      return baseFetch(input, init).then(res => {
        if (res.ok && bases[page]?.route !== route) {
          res.clone().json().then(doc => { if (doc && typeof doc === 'object' && !Array.isArray(doc)) bases[page] = { route, doc } }).catch(() => {})
        }
        return res
      })
    }
    const base = bases[page]
    if (method !== 'POST' || !base || base.route !== route || typeof init.body !== 'string') return baseFetch(input, init)
    let doc
    try { doc = JSON.parse(init.body) } catch { return baseFetch(input, init) }
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return baseFetch(input, init)
    const set = {}
    Object.keys(doc).forEach(k => { if (!same(doc[k], base.doc[k])) set[k] = doc[k] })
    const unset = Object.keys(base.doc).filter(k => !(k in doc))
    const headers = new Headers(init.headers)
    headers.set('X-Merge', '1')
    headers.set('Content-Type', 'application/json')
    return baseFetch(input, { ...init, headers, body: JSON.stringify({ set, unset }) }).then(res => {
      if (res.ok) bases[page] = { route, doc }
      return res
    })
  }
}
const setEditLang = (code) => {
  if (code === EDIT_LANG.code) return
  safeSet('editorLang', code)
  window.location.reload()
}
const PREVIEW_MIN_W = 280
const PREVIEW_DEFAULT_W = 420
// The preview panel's width was only ever floored (PREVIEW_MIN_W), never
// capped — dragging it wide, or just moving the same stored width from a
// big external display to a laptop screen, could leave it wider than the
// window itself. Flexbox then has nothing left to give the sidebar/main
// columns (flex:1 clamps at 0), so they silently vanish and the preview
// panel alone fills the whole window — no error, just a broken-looking
// layout that persisted (via localStorage) until the value was cleared.
// Reserving this much for sidebar (240px, if open) + a usable main column
// keeps that from happening again on any window size.
const PREVIEW_MIN_MAIN_RESERVE = 480
// The form column's controls (section headers with ↑ ↓ 👁 Copy Delete, the
// sticky section TOC, two-field rows) are laid out for roughly this much
// width. On a laptop screen with the preview open, the column can shrink to
// PREVIEW_MIN_MAIN_RESERVE and those rows clip off the right edge — so below
// this width the column's content is zoomed out (CSS zoom reflows layout,
// unlike transform) instead of squeezing the preview.
const MAIN_DESIGN_W = 640
const MAIN_MIN_ZOOM = 0.75

function clampPreviewWidth(w) {
  const max = Math.max(PREVIEW_MIN_W, window.innerWidth - PREVIEW_MIN_MAIN_RESERVE)
  return Math.min(Math.max(PREVIEW_MIN_W, w), max)
}

function editorPathToPreview(pathname) {
  const m =
    pathname.match(/^\/editor\/projects\/([^/]+)\/([^/]+)/) ||
    pathname.match(/^\/editor\/originals\/([^/]+)\/([^/]+)/)
  if (m) {
    const kind = pathname.includes('/originals/') ? 'originals' : 'projects'
    return `/${kind}/${m[1]}/${m[2]}`
  }
  if (pathname.match(/^\/editor\/blog-post\/([^/]+)/)) return `/blog/${pathname.split('/').pop()}`
  if (pathname.startsWith('/editor/home')) return '/'
  if (pathname.startsWith('/editor/about')) return '/about'
  if (pathname.startsWith('/editor/contacts')) return '/contacts'
  if (pathname.startsWith('/editor/archive')) return '/archive'
  if (pathname.startsWith('/editor/blog')) return '/blog'
  if (pathname.match(/^\/editor\/projects-cat\/([^/]+)/)) return `/projects/${pathname.split('/').pop()}`
  if (pathname.match(/^\/editor\/originals-cat\/([^/]+)/)) return `/originals/${pathname.split('/').pop()}`
  if (pathname.startsWith('/editor/all-projects')) return '/projects'
  if (pathname.startsWith('/editor/all-originals')) return '/originals'
  return '/'
}

// vh = a realistic viewport HEIGHT for that device/width, not "however tall
// the preview panel happens to be". Sections that size themselves with vh
// units (scroll-driven sticky panels, full-height heroes) read genuinely
// wrong if the iframe's internal height doesn't match a real device.
// Only views that land on a distinct layout are kept: one per site
// breakpoint (mobile ≤600, tablet 601–1024, desktop), plus a 4K screen,
// wider than the site's 1920px max-width, to see the side margins. Every
// view is shown whole, scaled to fit the panel's width and height
// (letterboxed).
const VIEWPORT_PRESETS = [
  { label: 'Mobile',  vw: 390,  vh: 844  },
  { label: 'Tablet',  vw: 820,  vh: 1180 },
  { label: 'Desktop', vw: 1440, vh: 810  },
  { label: '4K',      vw: 3840, vh: 2160 },
]
const DEFAULT_VW = 1440

// The Pages/Projects/Originals/Blog tab switcher + search + list — shared
// between the main sidebar and the optional quick-nav panel under the
// preview iframe, so both stay in sync off the same state instead of
// forking into two copies that can drift.
// A per-page todo checklist for the preview panel — "things I meant to do on
// this project detail page" rather than a global note. Keyed off the
// editor's own route (one list per project/page tab) and persisted to
// localStorage, so it's local scratch space rather than data that needs a
// server round-trip.
function MemoPanel({ storageKey, boxed }) {
  const [items, setItems] = useState(() => {
    try { return JSON.parse(safeGet(storageKey) || '[]') } catch { return [] }
  })
  const [draft, setDraft] = useState('')

  useEffect(() => {
    try { setItems(JSON.parse(safeGet(storageKey) || '[]')) } catch { setItems([]) }
  }, [storageKey])

  const persist = (next) => {
    setItems(next)
    safeSet(storageKey, JSON.stringify(next))
  }

  const addItem = () => {
    const text = draft.trim()
    if (!text) return
    persist([...items, { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, text, done: false }])
    setDraft('')
  }

  const toggleItem = (id) => persist(items.map(it => it.id === id ? { ...it, done: !it.done } : it))
  const removeItem = (id) => persist(items.filter(it => it.id !== id))
  const clearDone = () => persist(items.filter(it => !it.done))

  const doneCount = items.filter(it => it.done).length

  return (
    <div className="ed-preview-memopanel" style={boxed
      ? { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: 'var(--ed-sidebar-bg)', border: '1px solid var(--ed-sidebar-border)', overflow: 'hidden' }
      : { width: '100%', flexShrink: 0, maxHeight: '260px', display: 'flex', flexDirection: 'column', background: 'var(--ed-sidebar-bg)', borderTop: '1px solid var(--ed-sidebar-border)' }
    }>
      <div style={{ display: 'flex', gap: '6px', padding: '10px 12px', borderBottom: '1px solid var(--ed-sidebar-border)', flexShrink: 0 }}>
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') addItem() }}
          placeholder="Add a to-do..."
          style={{ flex: 1, border: '1px solid var(--ed-input-border)', borderRadius: '6px', padding: '6px 10px', fontSize: '12px', fontFamily: 'inherit', outline: 'none', background: 'var(--ed-input-bg)', color: 'var(--ed-text)', boxSizing: 'border-box' }}
        />
        <button
          onClick={addItem}
          title="Add"
          style={{ flexShrink: 0, width: '30px', height: '30px', border: 'none', borderRadius: '6px', background: '#111', color: '#fff', fontSize: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}
        >+</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
        {items.length === 0 && (
          <div style={{ padding: '14px 16px', fontSize: '12px', color: 'var(--ed-text-xmuted)' }}>No items yet</div>
        )}
        {items.map(it => (
          <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px', margin: '1px 6px', borderRadius: '6px' }}>
            <input type="checkbox" checked={it.done} onChange={() => toggleItem(it.id)} style={{ flexShrink: 0, cursor: 'pointer' }} />
            <span style={{
              flex: 1, fontSize: '13px', wordBreak: 'break-word',
              color: it.done ? 'var(--ed-text-xmuted)' : 'var(--ed-text)',
              textDecoration: it.done ? 'line-through' : 'none',
            }}>{it.text}</span>
            <button onClick={() => removeItem(it.id)} title="Remove" style={{ flexShrink: 0, background: 'none', border: 'none', color: 'var(--ed-text-xmuted)', cursor: 'pointer', fontSize: '14px', padding: '2px 4px', lineHeight: 1 }}>×</button>
          </div>
        ))}
      </div>

      {doneCount > 0 && (
        <div style={{ padding: '6px 12px', borderTop: '1px solid var(--ed-sidebar-border)', flexShrink: 0 }}>
          <button onClick={clearDone} style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '6px', border: '1px solid var(--ed-input-border)', background: 'var(--ed-input-bg)', color: 'var(--ed-text-sub)', cursor: 'pointer', fontFamily: 'inherit' }}>
            Clear {doneCount} completed
          </button>
        </div>
      )}
    </div>
  )
}

function NavBrowser({ tab, setTab, search, setSearch, pages, filteredProjects, filteredOriginals, blogs, projectCats, originalCats, blogCategories, creating, setCreating, handleCreated }) {
  return (
    <>
      {/* Tabs */}
      <div style={{display:'flex', gap:'3px', padding:'8px 10px'}}>
        {['pages', 'projects', 'originals', 'blog'].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            flex:1, padding:'5px 0', fontSize:'11px', fontWeight:600, border:'none', borderRadius:'6px', cursor:'pointer',
            background: tab === t ? 'var(--ed-nav-active-bg)' : 'transparent',
            color: tab === t ? 'var(--ed-nav-active-text)' : 'var(--ed-text-muted)',
            fontFamily:'inherit', transition:'background 0.15s, color 0.15s',
          }}>{t === 'pages' ? 'Pages' : t === 'projects' ? 'Projects' : t === 'originals' ? 'Originals' : 'Blog'}</button>
        ))}
      </div>

      {/* Search + add button */}
      {(tab === 'projects' || tab === 'originals' || tab === 'blog') && (
        <div style={{padding:'0 12px 8px', display:'flex', gap:'6px'}}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..."
            style={{flex:1, border:'1px solid var(--ed-input-border)', borderRadius:'6px', padding:'6px 10px', fontSize:'12px', fontFamily:'inherit', outline:'none', background:'var(--ed-input-bg)', color:'var(--ed-text)', boxSizing:'border-box'}} />
          <button
            onClick={() => setCreating(tab === 'projects' ? 'project' : tab === 'originals' ? 'original' : 'blog')}
            title="Add new"
            style={{ flexShrink:0, width:'30px', height:'30px', border:'none', borderRadius:'6px', background:'#111', color:'#fff', fontSize:'16px', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', lineHeight:1 }}
          >+</button>
        </div>
      )}

      {creating && <CreateModal type={creating} projectCategories={projectCats} originalCategories={originalCats} blogCategories={blogCategories} onClose={() => setCreating(null)} onCreated={handleCreated} />}

      {/* List */}
      <div style={{flex:1, overflowY:'auto'}}>
        {tab === 'pages' && pages.map((p, i) => {
          if (p.divider) return (
            <div key={`div-${i}`} style={{
              padding: i === 0 ? '10px 16px 6px' : '18px 16px 6px',
              marginTop: i === 0 ? 0 : '6px',
              borderTop: i === 0 ? 'none' : '1px solid var(--ed-divider)',
              fontSize: '11px', fontWeight: 700, color: 'var(--ed-text-xmuted)',
              textTransform: 'uppercase', letterSpacing: '0.06em',
            }}>
              {p.divider}
            </div>
          )
          return (
            <NavLink key={p.path} to={p.path} className={({ isActive }) => `ed-nav-item${isActive ? ' active' : ''}`} style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 16px', fontSize: '13px', fontWeight: 500,
              color: isActive ? 'var(--ed-nav-active-text)' : 'var(--ed-nav-text)',
              background: isActive ? 'var(--ed-nav-active-bg)' : 'transparent',
              textDecoration: 'none', borderRadius: '6px', margin: '1px 6px',
            })}>
              {({ isActive }) => (
                <>
                  {p.badge && !isActive && <CategoryBadge category={p.badge} />}
                  <span>{p.label}</span>
                </>
              )}
            </NavLink>
          )
        })}

        {tab === 'projects' && filteredProjects.length > 0 && (
          <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(120px, 1fr))', gap:'0 8px', padding:'0 6px'}}>
            {projectCats.map(cat => (
              <div key={cat}>
                <div style={{padding:'8px 10px 4px'}}><CategoryBadge category={cat} /></div>
                {filteredProjects.filter(p => p.category === cat).map(p => (
                  <NavLink key={`${p.category}/${p.id}`} to={`/editor/projects/${p.category}/${p.id}`}
                    className={({isActive}) => `ed-nav-item${isActive ? ' active' : ''}`}
                    style={({isActive}) => ({
                      display:'flex', alignItems:'center', gap:'8px', padding:'7px 10px',
                      color: isActive ? 'var(--ed-nav-active-text)' : p.hidden ? 'var(--ed-text-xmuted)' : 'var(--ed-nav-text)',
                      background: isActive ? 'var(--ed-nav-active-bg)' : 'transparent',
                      textDecoration:'none', borderRadius:'6px', margin:'1px 0',
                      opacity: !isActive && p.hidden ? 0.5 : 1,
                    })}>
                    <span style={{fontSize:'13px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{p.id}</span>
                    {p.hidden && <span style={{fontSize:'10px', flexShrink:0, color:'#f87171'}}>hidden</span>}
                  </NavLink>
                ))}
              </div>
            ))}
          </div>
        )}

        {tab === 'originals' && filteredOriginals.length > 0 && (
          <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(120px, 1fr))', gap:'0 8px', padding:'0 6px'}}>
            {originalCats.map(cat => (
              <div key={cat}>
                <div style={{padding:'8px 10px 4px'}}><CategoryBadge category={cat} /></div>
                {filteredOriginals.filter(o => o.category === cat).map(o => (
                  <NavLink key={`${o.category}/${o.id}`} to={`/editor/originals/${o.category}/${o.id}`}
                    className={({isActive}) => `ed-nav-item${isActive ? ' active' : ''}`}
                    style={({isActive}) => ({
                      display:'flex', alignItems:'center', gap:'8px', padding:'7px 10px',
                      color: isActive ? 'var(--ed-nav-active-text)' : o.hidden ? 'var(--ed-text-xmuted)' : 'var(--ed-nav-text)',
                      background: isActive ? 'var(--ed-nav-active-bg)' : 'transparent',
                      textDecoration:'none', borderRadius:'6px', margin:'1px 0',
                      opacity: !isActive && o.hidden ? 0.5 : 1,
                    })}>
                    <span style={{fontSize:'13px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{o.id}</span>
                    {o.hidden && <span style={{fontSize:'10px', flexShrink:0, color:'#f87171'}}>hidden</span>}
                  </NavLink>
                ))}
              </div>
            ))}
          </div>
        )}

        {tab === 'blog' && (
          <>
            <NavLink to="/editor/blog" end className={({ isActive }) => `ed-nav-item${isActive ? ' active' : ''}`} style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 16px',
              color: isActive ? 'var(--ed-nav-active-text)' : 'var(--ed-text-sub)',
              background: isActive ? 'var(--ed-nav-active-bg)' : 'transparent',
              textDecoration: 'none', fontSize: '12px', fontWeight: 600,
              borderRadius: '6px', margin: '1px 6px',
            })}>
              All Blog
            </NavLink>
            <NavLink to="/editor/blog-landing" className={({ isActive }) => `ed-nav-item${isActive ? ' active' : ''}`} style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 16px',
              color: isActive ? 'var(--ed-nav-active-text)' : 'var(--ed-text-sub)',
              background: isActive ? 'var(--ed-nav-active-bg)' : 'transparent',
              textDecoration: 'none', fontSize: '12px', fontWeight: 600,
              borderRadius: '6px', margin: '1px 6px',
            })}>
              Landing Page
            </NavLink>
            {blogs
              .filter(b => `${b.id} ${b.title}`.toLowerCase().includes(search.toLowerCase()))
              .map(b => (
                <NavLink key={b.id} to={`/editor/blog-post/${b.id}`}
                  className={({ isActive }) => `ed-nav-item${isActive ? ' active' : ''}`}
                  style={({ isActive }) => ({
                    display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 16px',
                    color: isActive ? 'var(--ed-nav-active-text)' : 'var(--ed-nav-text)',
                    background: isActive ? 'var(--ed-nav-active-bg)' : 'transparent',
                    textDecoration: 'none', borderRadius: '6px', margin: '1px 6px',
                  })}>
                  {({ isActive }) => (
                    <>
                      {!isActive && <CategoryBadge category={b.category} />}
                      <span style={{ fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.title || b.id}</span>
                    </>
                  )}
                </NavLink>
              ))
            }
            {blogs.filter(b => `${b.id} ${b.title}`.toLowerCase().includes(search.toLowerCase())).length === 0 && (
              <div style={{ padding: '12px 16px', fontSize: '12px', color: 'var(--ed-text-xmuted)' }}>No results</div>
            )}
          </>
        )}

        {tab === 'projects' && filteredProjects.length === 0 && (
          <div style={{padding:'12px 16px', fontSize:'12px', color:'var(--ed-text-xmuted)'}}>No results</div>
        )}
        {tab === 'originals' && filteredOriginals.length === 0 && (
          <div style={{padding:'12px 16px', fontSize:'12px', color:'var(--ed-text-xmuted)'}}>No results</div>
        )}
      </div>
    </>
  )
}

function PreviewPanel({ width, onResizeStart, showNav, onToggleNav, navProps, uiZoom = 1 }) {
  const location = useLocation()
  const containerRef = useRef(null)
  const navPanelRef = useRef(null)
  const [key, setKey] = useState(0)
  // A stored width from a removed view (Auto/Laptop/Wide/Ultra) falls back
  // to Desktop.
  const [vwPreset, setVwPreset] = useState(() => {
    const v = parseInt(safeGet('editorPreviewVW'))
    return VIEWPORT_PRESETS.some(p => p.vw === v) ? v : DEFAULT_VW
  })
  const previewPath = editorPathToPreview(location.pathname)
  const src = `${PREVIEW_BASE}${EDIT_LANG.prefix}${previewPath === '/' && EDIT_LANG.prefix ? '' : previewPath}`
  const [memoOpen, setMemoOpen] = useState(() => safeGet('editorPreviewMemo') === 'true')
  const toggleMemo = () => setMemoOpen(o => { const next = !o; safeSet('editorPreviewMemo', String(next)); return next })

  const reload = () => setKey(k => k + 1)

  const isMobile = vwPreset <= 430
  const presetVH = VIEWPORT_PRESETS.find(p => p.vw === vwPreset).vh
  const [area, setArea] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    // clientWidth/Height include the container's padding (16px around the
    // phone frame), which the scaled device box can't overlap.
    const measure = () => {
      const cs = getComputedStyle(el)
      setArea({
        w: el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight),
        h: el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom),
      })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const scale = area.w && area.h ? Math.min(area.w / vwPreset, area.h / presetVH) : width / vwPreset

  // Preview chrome (toolbar, nav, memo) follows the form column's zoom so the
  // two sides read at the same size; the rendered page itself is untouched.
  const chromeZoom = uiZoom < 1 ? { zoom: uiZoom } : {}

  const selectVW = (vw) => {
    setVwPreset(vw)
    safeSet('editorPreviewVW', String(vw))
  }

  const btnStyle = (active) => ({
    border: `1px solid ${active ? 'var(--ed-accent)' : 'var(--ed-input-border)'}`,
    borderRadius: '5px', padding: '2px 6px', cursor: 'pointer', fontFamily: 'inherit',
    fontSize: '10px', fontWeight: 600, lineHeight: 1.6,
    background: active ? 'color-mix(in srgb, var(--ed-accent) 12%, transparent)' : 'var(--ed-input-bg)',
    color: active ? 'var(--ed-accent)' : 'var(--ed-text-muted)',
  })

  return (
    <div style={{ width, flexShrink: 0, display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--ed-sidebar-border)', background: 'var(--ed-bg)', height: '100vh', position: 'relative' }}>
      {/* Resize handle */}
      <div
        onMouseDown={onResizeStart}
        style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '4px', cursor: 'col-resize', zIndex: 10 }}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--ed-accent)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      />

      {/* Toolbar */}
      <div style={{ padding: '6px 10px', borderBottom: '1px solid var(--ed-sidebar-border)', display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0, flexWrap: 'wrap', ...chromeZoom }}>
        <span style={{ fontSize: '11px', color: 'var(--ed-text-muted)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{previewPath}</span>
        <div style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
          {VIEWPORT_PRESETS.map(p => (
            <button key={p.label} onClick={() => selectVW(p.vw)} title={`${p.vw}×${p.vh}`} style={btnStyle(vwPreset === p.vw)}>{p.label}</button>
          ))}
        </div>
        <button onClick={reload} title="Reload" style={{ border: '1px solid var(--ed-input-border)', borderRadius: '6px', background: 'var(--ed-input-bg)', color: 'var(--ed-text-muted)', cursor: 'pointer', fontSize: '13px', padding: '2px 6px', lineHeight: 1 }}>↺</button>
        <a href={src} target="_blank" rel="noreferrer" title="Open in new tab" style={{ border: '1px solid var(--ed-input-border)', borderRadius: '6px', background: 'var(--ed-input-bg)', color: 'var(--ed-text-muted)', fontSize: '11px', padding: '2px 6px', textDecoration: 'none', lineHeight: 1.6 }}>↗</a>
        <button onClick={onToggleNav} title={showNav ? 'Hide quick nav' : 'Show quick nav below the preview'} className="ed-preview-nav-toggle" style={btnStyle(showNav)}>
          Nav
        </button>
        <button onClick={toggleMemo} title={memoOpen ? 'Hide memo' : 'Show per-page memo checklist'} style={btnStyle(memoOpen)}>
          Memo
        </button>
      </div>

      {/* Device area — the device is always scaled to fit whole inside it;
          Nav/Memo are docked below (outside it) so they stay put. */}
      <div ref={containerRef} style={{ flex: 1, minHeight: 0, overflow: 'hidden', background: '#26262b', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: isMobile ? '16px' : '0' }}>
        {/* Fixed, device-realistic width×height (not "whatever fills the
           panel") so vh-based layouts (sticky scroll panels, full-height
           heroes) size themselves the same way they would on a real device
           — then scaled visually to fit. */}
        <div style={{ width: `${vwPreset * scale}px`, height: `${presetVH * scale}px`, flexShrink: 0, overflow: 'hidden', ...(isMobile ? { borderRadius: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' } : {}) }}>
          <div style={{ width: `${vwPreset}px`, height: `${presetVH}px`, transformOrigin: 'top left', transform: `scale(${scale})` }}>
            <iframe
              key={`${key}-${previewPath}`}
              src={src}
              style={{ border: 'none', display: 'block', background: '#fff', width: '100%', height: '100%' }}
              title="Preview"
            />
          </div>
        </div>
      </div>

      {/* Nav and Memo are docked at the bottom of the panel, outside the
          device area, so they don't scroll away. Side by side when both are
          open, each full-width when only one is on. */}
      {(showNav || memoOpen) && (
        <div style={{ height: '320px', flexShrink: 0, display: 'flex', flexDirection: showNav && memoOpen ? 'row' : 'column', gap: 0, ...chromeZoom }}>
          {showNav && (
            <div ref={navPanelRef} className="ed-preview-navpanel" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: 'var(--ed-sidebar-bg)', border: '1px solid var(--ed-sidebar-border)', overflow: 'hidden' }}>
              <NavBrowser {...navProps} />
            </div>
          )}
          {memoOpen && <MemoPanel storageKey={`editorMemo:${location.pathname}`} boxed />}
        </div>
      )}
    </div>
  )
}

const BLOG_CATEGORIES = ['research', 'report', 'essay', 'others']

const NEW_CATEGORY_VALUE = '__new__'

function CreateModal({ type, projectCategories, originalCategories, blogCategories, onClose, onCreated }) {
  const categories = type === 'project' ? projectCategories : type === 'original' ? originalCategories : (blogCategories.length ? blogCategories : BLOG_CATEGORIES)
  const [category, setCategory] = useState(categories[0] || NEW_CATEGORY_VALUE)
  const [newCategory, setNewCategory] = useState('')
  const [id, setId] = useState('')
  const [title, setTitle] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const s = { border: '1px solid var(--ed-input-border)', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', fontFamily: 'inherit', color: 'var(--ed-text)', background: 'var(--ed-input-bg)', outline: 'none', width: '100%', boxSizing: 'border-box' }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const isNewCategory = category === NEW_CATEGORY_VALUE
    const finalCategory = isNewCategory
      ? newCategory.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
      : category
    const slug = id.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    if (isNewCategory && !finalCategory) return setError('New category name is required')
    if (!slug || !title.trim()) return setError('ID and Title are required')
    setLoading(true)
    let endpoint, body
    if (type === 'project') { endpoint = 'project-create'; body = { category: finalCategory, id: slug, title: title.trim() } }
    else if (type === 'original') { endpoint = 'original-create'; body = { category: finalCategory, id: slug, title: title.trim() } }
    else { endpoint = 'blog-post-create'; body = { id: slug, title: title.trim(), category: finalCategory } }
    const res = await fetch(`${API}/${endpoint}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error || 'Error occurred'); setLoading(false); return }
    onCreated({ category: finalCategory, id: slug })
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center' }} onClick={onClose}>
      <div style={{ background:'var(--ed-card-bg)', borderRadius:'16px', padding:'28px', width:'360px', boxShadow:'0 20px 60px rgba(0,0,0,0.2)' }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize:'15px', fontWeight:700, marginBottom:'20px', color:'var(--ed-text)' }}>New {type === 'project' ? 'Project' : type === 'original' ? 'Original' : 'Blog Post'}</div>
        <form onSubmit={handleSubmit} style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
          <div>
            <label style={{ fontSize:'11px', fontWeight:600, color:'var(--ed-text-muted)', textTransform:'uppercase', letterSpacing:'0.06em', display:'block', marginBottom:'6px' }}>Category</label>
            <select style={s} value={category} onChange={e => setCategory(e.target.value)}>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
              <option value={NEW_CATEGORY_VALUE}>+ New category…</option>
            </select>
            {category === NEW_CATEGORY_VALUE && (
              <input
                style={{ ...s, marginTop: '8px' }}
                value={newCategory}
                onChange={e => setNewCategory(e.target.value)}
                placeholder="new-category-name"
              />
            )}
          </div>
          <div>
            <label style={{ fontSize:'11px', fontWeight:600, color:'var(--ed-text-muted)', textTransform:'uppercase', letterSpacing:'0.06em', display:'block', marginBottom:'6px' }}>ID (slug)</label>
            <input style={s} value={id} onChange={e => setId(e.target.value)} placeholder="my-project" autoFocus />
          </div>
          <div>
            <label style={{ fontSize:'11px', fontWeight:600, color:'var(--ed-text-muted)', textTransform:'uppercase', letterSpacing:'0.06em', display:'block', marginBottom:'6px' }}>Title</label>
            <input style={s} value={title} onChange={e => setTitle(e.target.value)} placeholder="My Project" />
          </div>
          {error && <div style={{ fontSize:'12px', color:'#e53e3e' }}>{error}</div>}
          <div style={{ display:'flex', gap:'8px', marginTop:'4px' }}>
            <button type="button" onClick={onClose} style={{ flex:1, padding:'9px', border:'1px solid var(--ed-input-border)', borderRadius:'8px', background:'var(--ed-input-bg)', fontSize:'13px', cursor:'pointer', fontFamily:'inherit', color:'var(--ed-text-sub)' }}>Cancel</button>
            <button type="submit" disabled={loading} style={{ flex:1, padding:'9px', border:'none', borderRadius:'8px', background:'#111', fontSize:'13px', cursor:'pointer', fontFamily:'inherit', color:'#fff', fontWeight:600 }}>
              {loading ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function EditorLayout() {
  const navigate = useNavigate()
  const [projects, setProjects] = useState([])
  const [originals, setOriginals] = useState([])
  const [blogs, setBlogs] = useState([])
  const [tab, setTab] = useState('pages')
  const [search, setSearch] = useState('')
  const [maintenance, setMaintenance] = useState(null)
  const [serverOn, setServerOn] = useState(null)
  const [creating, setCreating] = useState(null) // 'project' | 'original' | 'blog' | null
  // Defaults to dark (Figma/Framer-style editor chrome) — still a one-click
  // toggle back to light. One-time migration: any *previously* saved
  // 'editorTheme' predates this default ever existing (it was only ever
  // written by clicking the toggle in the old light-default build, often
  // just while testing it), so it shouldn't silently pin someone to light
  // forever — forget it exactly once, then respect whatever's chosen from
  // here on exactly as before.
  const [dark, setDark] = useState(() => {
    if (safeGet('editorThemeDefaultMigrated') !== 'true') {
      safeRemove('editorTheme')
      safeSet('editorThemeDefaultMigrated', 'true')
      return true
    }
    return safeGet('editorTheme') !== 'light'
  })
  const [sidebarOpen, setSidebarOpen] = useState(() => safeGet('editorSidebar') !== 'false')
  const toggleSidebar = () => setSidebarOpen(o => { const next = !o; safeSet('editorSidebar', String(next)); return next })
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [globalMemo, setGlobalMemo] = useState(() => safeGet('editorGlobalMemo') || '')
  const updateGlobalMemo = (v) => { setGlobalMemo(v); safeSet('editorGlobalMemo', v) }
  const clearGlobalMemo = () => { setGlobalMemo(''); safeRemove('editorGlobalMemo') }
  const [previewOpen, setPreviewOpen] = useState(() => safeGet('editorPreview') === 'true')
  const [previewWidth, setPreviewWidth] = useState(() => clampPreviewWidth(parseInt(safeGet('editorPreviewW') || PREVIEW_DEFAULT_W) || PREVIEW_DEFAULT_W))
  const [previewNavOpen, setPreviewNavOpen] = useState(() => safeGet('editorPreviewNav') === 'true')
  const togglePreviewNav = () => setPreviewNavOpen(o => { const next = !o; safeSet('editorPreviewNav', String(next)); return next })
  const resizingRef = useRef(false)
  const mainScrollRef = useRef(null)
  const [mainZoom, setMainZoom] = useState(1)
  useEffect(() => {
    const el = mainScrollRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width
      setMainZoom(Math.min(1, Math.max(EMBED ? 0.6 : MAIN_MIN_ZOOM, Math.round((w / MAIN_DESIGN_W) * 100) / 100)))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const [aiBlocking, setAiBlocking] = useState(null)
  const [fileSize, setFileSize] = useState(null)
  const [blogCategories, setBlogCategories] = useState([])
  // Categories that exist (folder + siteConfig text entry, via "+ Add" on
  // All Projects/Originals) but have no items in them yet — projectCats/
  // originalCats below are derived from live items, so a brand-new empty
  // category would otherwise be invisible everywhere else in the editor,
  // including the "New Project/Original" modal's category picker.
  const [emptyProjectCats, setEmptyProjectCats] = useState([])
  const [emptyOriginalCats, setEmptyOriginalCats] = useState([])
  const [gitInfo, setGitInfo] = useState({ lastCommit: null, lastDeploy: null })
  const toggleDark = () => setDark(d => { const next = !d; safeSet('editorTheme', next ? 'dark' : 'light'); return next })
  const togglePreview = () => setPreviewOpen(o => { const next = !o; safeSet('editorPreview', String(next)); return next })

  // previewWidth is otherwise a fixed px value the user only changes by
  // dragging the handle — maximizing/resizing the browser window left it
  // untouched, so a wider window just grew empty space to its right instead
  // of the preview. Piping the window's own resize delta into previewWidth
  // keeps the sidebar/form column's width constant and hands all of that
  // extra (or reclaimed) room straight to the preview panel, so the manual
  // drag position still acts as the baseline rather than being overridden.
  // The public site's `body { max-width: 1920px; margin: 0 auto }` (index.css)
  // applies to every route by default, including /editor — so on a wide
  // monitor the whole editor chrome (sidebar, form, preview) was capped and
  // centered with dead margins on both sides, same as the public pages used
  // to be. The editor is a tool, not the public design, so it should just
  // use the full window instead.
  useEffect(() => {
    document.body.classList.add('editor-mode')
    return () => document.body.classList.remove('editor-mode')
  }, [])

  useEffect(() => {
    let lastWidth = window.innerWidth
    const onWindowResize = () => {
      const delta = window.innerWidth - lastWidth
      lastWidth = window.innerWidth
      if (delta === 0) return
      setPreviewWidth(w => {
        const next = clampPreviewWidth(w + delta)
        safeSet('editorPreviewW', String(next))
        return next
      })
    }
    window.addEventListener('resize', onWindowResize)
    return () => window.removeEventListener('resize', onWindowResize)
  }, [])

  const handleResizeStart = useCallback((e) => {
    e.preventDefault()
    resizingRef.current = true
    const startX = e.clientX
    const startW = previewWidth
    const onMove = (e) => {
      if (!resizingRef.current) return
      const delta = startX - e.clientX
      const next = clampPreviewWidth(startW + delta)
      setPreviewWidth(next)
      safeSet('editorPreviewW', String(next))
    }
    const onUp = () => { resizingRef.current = false; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [previewWidth])
  const theme = dark ? DARK : LIGHT

  const [editorActions, setEditorActions] = useState({ save: null, saved: false, deploy: null, deployState: 'idle' })

  useEffect(() => {
    const onKey = (e) => {
      if (!e.metaKey && !e.ctrlKey) return
      if (e.key === '/') { e.preventDefault(); togglePreview() }
      if (e.key === '\\') { e.preventDefault(); toggleSidebar() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const fmtDate = (iso) => {
    if (!iso) return '—'
    const d = new Date(iso)
    const mo = (d.getMonth() + 1).toString().padStart(2, '0')
    const day = d.getDate().toString().padStart(2, '0')
    const h = d.getHours().toString().padStart(2, '0')
    const m = d.getMinutes().toString().padStart(2, '0')
    return `${mo}/${day} ${h}:${m}`
  }

  useEffect(() => {
    fetch(`${API}/total-size`)
      .then(r => r.json())
      .then(({ bytes }) => {
        if (bytes < 1024 * 1024) setFileSize(`${(bytes / 1024).toFixed(1)} KB`)
        else if (bytes < 1024 * 1024 * 1024) setFileSize(`${(bytes / (1024 * 1024)).toFixed(1)} MB`)
        else setFileSize(`${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`)
      })
      .catch(() => {})
    fetch(`${API}/git-info`)
      .then(r => r.json())
      .then(setGitInfo)
      .catch(() => {})
  }, [])

  const refreshSiteConfig = () => {
    fetch(`${API}/page/siteConfig`)
      .then(r => r.json())
      .then(cfg => {
        if (cfg.blogCategories?.length) setBlogCategories(cfg.blogCategories.map(c => c.id))
        setEmptyProjectCats(Object.keys(cfg.projectsCategoryText || {}))
        setEmptyOriginalCats(Object.keys(cfg.originalsCategoryText || {}))
      })
      .catch(() => {})
  }

  useEffect(() => {
    fetch(`${API}/ai-blocking`)
      .then(r => r.json())
      .then(d => setAiBlocking(d.enabled))
      .catch(() => {})
  }, [])

  useEffect(() => {
    let wasOn = null
    const checkServer = () =>
      fetch(`${API}/maintenance`, { signal: AbortSignal.timeout(2000) })
        .then(r => r.json())
        .then(d => {
          setServerOn(true)
          setMaintenance(d.maintenance)
          if (wasOn === false) window.dispatchEvent(new Event('server-online'))
          wasOn = true
        })
        .catch(() => { setServerOn(false); setMaintenance(null); wasOn = false })
    checkServer()
    const interval = setInterval(checkServer, 5000)
    return () => clearInterval(interval)
  }, [])

  const toggleAiBlocking = async () => {
    const next = !aiBlocking
    setAiBlocking(next)
    await fetch(`${API}/ai-blocking`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: next }) })
  }

  const toggleMaintenance = async () => {
    const next = !maintenance
    await fetch(`${API}/maintenance`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ maintenance: next }) })
    setMaintenance(next)
  }

  const refreshLists = () => {
    fetch(`${API}/projects`).then(r => r.json()).then(setProjects).catch(() => {})
    fetch(`${API}/originals`).then(r => r.json()).then(setOriginals).catch(() => {})
    fetch(`${API}/page/blog`).then(r => r.json()).then(setBlogs).catch(() => {})
    refreshSiteConfig()
  }

  useEffect(() => {
    refreshLists()
    window.addEventListener('categories-changed', refreshLists)
    return () => window.removeEventListener('categories-changed', refreshLists)
  }, [])

  // Re-fetch once the server comes back online (e.g. after a restart) —
  // otherwise a list left empty by a mid-session outage never recovers.
  useEffect(() => { if (serverOn) refreshLists() }, [serverOn])

  const handleCreated = ({ category, id }) => {
    setCreating(null)
    refreshLists()
    let path
    if (creating === 'project') path = `/editor/projects/${category}/${id}`
    else if (creating === 'original') path = `/editor/originals/${category}/${id}`
    else path = `/editor/blog-post/${id}`
    navigate(path)
  }

  const filteredProjects = projects.filter(p =>
    `${p.category} ${p.id}`.toLowerCase().includes(search.toLowerCase())
  )

  const filteredOriginals = originals.filter(o =>
    `${o.category} ${o.id}`.toLowerCase().includes(search.toLowerCase())
  )

  const projectCats = [...new Set([...projects.map(p => p.category), ...emptyProjectCats])].sort()
  const originalCats = [...new Set([...originals.map(o => o.category), ...emptyOriginalCats])].sort()
  // Category tabs hidden from the live nav (see hiddenProjectCategories) have
  // no reason to show a "Category Page" settings entry in the sidebar either —
  // individual projects in that category are still editable via their own
  // project pages regardless.
  const hiddenCats = siteConfig.hiddenProjectCategories || []
  const visibleProjectCats = projectCats.filter(cat => !hiddenCats.includes(cat))

  const pages = [
    { divider: 'Pages' },
    { label: 'Home', path: '/editor/home' },
    { label: 'About', path: '/editor/about' },
    { label: 'Contacts', path: '/editor/contacts' },
    { label: 'Archive', path: '/editor/archive' },
    { label: 'Translations', path: '/editor/translations' },
    { divider: 'Site Settings' },
    { label: 'Navbar', path: '/editor/navbar' },
    { label: 'Footer', path: '/editor/footer' },
    { label: 'Maintenance', path: '/editor/maintenance' },
    { label: '404 Page', path: '/editor/not-found' },
    { divider: 'Projects' },
    { label: 'All Projects (layout, hover style, categories)', path: '/editor/all-projects' },
    ...visibleProjectCats.map(cat => ({ label: cat.charAt(0).toUpperCase() + cat.slice(1), path: `/editor/projects-cat/${cat}`, badge: cat })),
    { divider: 'Originals' },
    { label: 'All Originals (layout, hover style, categories)', path: '/editor/all-originals' },
    ...originalCats.map(cat => ({ label: cat.charAt(0).toUpperCase() + cat.slice(1), path: `/editor/originals-cat/${cat}`, badge: cat })),
  ]

  return (
    <EditorActionCtx.Provider value={setEditorActions}>
    <div style={{display:'flex', height:'100vh', overflow:'hidden', fontFamily:"-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', Inter, sans-serif", letterSpacing:'-0.01em', colorScheme: dark ? 'dark' : 'light', ...theme}}>
    <style>{`
      .ed-nav-item { transition: background 0.1s; }
      .ed-nav-item:hover { background: var(--ed-nav-hover-bg) !important; }
      .ed-nav-item.active { background: var(--ed-nav-active-bg) !important; color: var(--ed-nav-active-text) !important; }
      .ed-input:focus { outline: none; border-color: var(--ed-accent) !important; box-shadow: 0 0 0 3px color-mix(in srgb, var(--ed-accent) 15%, transparent); }
      .ed-page { padding: 0 clamp(14px, 4%, 40px) 80px; display: flex; flex-direction: column; gap: 24px; container: ed-page / inline-size; }
      .ed-topbar { padding: 24px 0 0; margin-bottom: 8px; position: sticky; top: 0; background: var(--ed-topbar-bg); z-index: 10; }
      /* The quick-nav panel under the preview iframe duplicates the left
         sidebar's own nav — redundant once the editor window is narrow
         enough that the real sidebar is already the primary way to move
         around, so it (and its toggle) just disappear there. */
      @media (max-width: 768px) {
        .ed-preview-navpanel, .ed-preview-nav-toggle { display: none !important; }
      }
    `}</style>

      {/* Sidebar */}
      {!EMBED && (
      <div style={{width: sidebarOpen ? '240px' : '0', flexShrink:0, borderRight:'1px solid var(--ed-sidebar-border)', display:'flex', flexDirection:'column', background:'var(--ed-sidebar-bg)', height:'100vh', overflow:'hidden', transition:'width 0.2s ease'}}>

        {/* Header */}
        <div style={{padding:'12px 16px', borderBottom:'1px solid var(--ed-sidebar-border)', display:'flex', alignItems:'center', justifyContent:'space-between', gap:'8px', minWidth:'240px'}}>
          <div style={{display:'flex', alignItems:'center', gap:'6px'}}>
            <span style={{fontSize:'13px', fontWeight:700, color:'var(--ed-text)'}}>Editor</span>
            <span
              title={serverOn === null ? 'Checking...' : serverOn ? 'Server connected' : 'Server off — run node server/index.js'}
              style={{
                width:'7px', height:'7px', borderRadius:'50%', flexShrink:0,
                background: serverOn === null ? '#ccc' : serverOn ? '#34c759' : '#e53e3e',
                boxShadow: serverOn ? '0 0 0 2px rgba(52,199,89,0.25)' : 'none',
                transition:'background 0.3s',
              }}
            />
          </div>
          <div style={{display:'flex', alignItems:'center', gap:'4px'}}>
            <button
              onClick={toggleMaintenance}
              title={maintenance ? 'Under maintenance — click to go public' : 'Public — click to go under maintenance'}
              style={{
                display:'flex', alignItems:'center', gap:'4px',
                padding:'3px 8px', borderRadius:'6px', border:'none', cursor:'pointer',
                fontFamily:'inherit', fontSize:'10px', fontWeight:600,
                background: maintenance ? '#111' : 'var(--ed-input-bg)',
                color: maintenance ? '#fff' : 'var(--ed-text-muted)',
                transition:'all 0.15s',
                opacity: maintenance === null ? 0.4 : 1,
              }}
            >
              <span>{maintenance ? '🔒' : '🌐'}</span>
              <span>{maintenance ? 'Maintenance' : 'Public'}</span>
            </button>
            <a href="/" style={{fontSize:'11px', color:'var(--ed-text-muted)', textDecoration:'none', padding:'3px 5px'}} target="_blank">↗</a>
          </div>
        </div>

        <NavBrowser
          tab={tab} setTab={setTab} search={search} setSearch={setSearch}
          pages={pages} filteredProjects={filteredProjects} filteredOriginals={filteredOriginals} blogs={blogs}
          projectCats={projectCats} originalCats={originalCats} blogCategories={blogCategories}
          creating={creating} setCreating={setCreating} handleCreated={handleCreated}
        />

        {/* Footer */}
        <div style={{
          padding: '10px 14px', borderTop: '1px solid var(--ed-sidebar-border)',
          background: 'var(--ed-sidebar-bg)', flexShrink: 0,
          display: 'flex', flexDirection: 'column', gap: '8px',
        }}>
          {/* Commit / Deploy */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            {[
              { label: 'Commit', value: fmtDate(gitInfo.lastCommit) },
              { label: 'Deploy', value: fmtDate(gitInfo.lastDeploy) },
              { label: 'Assets', value: fileSize ?? '—' },
            ].map(({ label, value }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '10px', color: 'var(--ed-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>{label}</span>
                <span style={{ fontSize: '11px', color: 'var(--ed-text)', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
              </div>
            ))}
          </div>
          {/* AI blocking toggle */}
          <button
            onClick={toggleAiBlocking}
            title={aiBlocking ? 'AI crawlers blocked — click to allow' : 'AI crawlers allowed — click to block'}
            style={{
              background: aiBlocking ? '#111' : 'var(--ed-input-bg)',
              border: aiBlocking ? '1px solid transparent' : '1px solid var(--ed-input-border)',
              borderRadius: '7px', padding: '5px 10px', cursor: 'pointer',
              fontSize: '13px', lineHeight: 1,
              color: aiBlocking ? '#fff' : 'var(--ed-text-muted)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              fontFamily: 'inherit', width: '100%',
              opacity: aiBlocking === null ? 0.4 : 1,
            }}
          >
            <span>{aiBlocking ? '🤖' : '🤖'}</span>
            <span style={{ fontSize: '11px', fontWeight: 500 }}>{aiBlocking ? 'AI Blocked' : 'AI Allowed'}</span>
          </button>
          {/* Dark mode toggle */}
          <button
            onClick={toggleDark}
            title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            style={{
              background: 'var(--ed-input-bg)', border: '1px solid var(--ed-input-border)',
              borderRadius: '7px', padding: '5px 10px', cursor: 'pointer',
              fontSize: '13px', lineHeight: 1, color: 'var(--ed-text-muted)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              fontFamily: 'inherit', width: '100%',
            }}
          >
            <span>{dark ? '☀️' : '🌙'}</span>
            <span style={{ fontSize: '11px', fontWeight: 500 }}>{dark ? 'Light Mode' : 'Dark Mode'}</span>
          </button>
        </div>
      </div>
      )}

      {/* Main */}
      <div style={{flex:1, height:'100vh', display:'flex', flexDirection:'column', background:'var(--ed-bg)', minWidth: 0}}>
        {/* Global icon bar */}
        {!EMBED && (
        <div style={{display:'flex', alignItems:'center', gap:'4px', padding:'6px 10px', borderBottom:'1px solid var(--ed-topbar-border)', background:'var(--ed-topbar-bg)', flexShrink:0}}>
          {/* Sidebar toggle */}
          <IcoBtn onClick={toggleSidebar} title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="1.5" y="1.5" width="13" height="13" rx="2"/><line x1="5.5" y1="1.5" x2="5.5" y2="14.5"/>
            </svg>
          </IcoBtn>

          {/* Home/Dashboard — next to the sidebar toggle so it still reaches
              the dashboard even when the sidebar (and its old Home button)
              is collapsed. */}
          <IcoBtn onClick={() => navigate('/editor')} title="Dashboard">
            <svg width="15" height="15" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M1 7L7 2l6 5"/><path d="M3 6v5.5a.5.5 0 0 0 .5.5H6V9h2v3h2.5a.5.5 0 0 0 .5-.5V6"/></svg>
          </IcoBtn>

          <div style={{width:'1px', height:'16px', background:'var(--ed-divider)', margin:'0 4px'}}/>

          {/* Save — Apple's dark-utility-button treatment: ink fill, pill radius */}
          {editorActions.save && (
            <button onClick={editorActions.save} title="Save" style={{
              border:'none', borderRadius:'9999px', padding:'6px 16px', cursor:'pointer', fontFamily:'inherit',
              fontSize:'12px', fontWeight:400, lineHeight:1, letterSpacing:'-0.01em',
              background: editorActions.saved ? 'transparent' : 'var(--ed-text)',
              color: editorActions.saved ? 'var(--ed-text-muted)' : 'var(--ed-bg)',
              transition:'transform 0.1s, background 0.15s',
            }}
            onMouseDown={e => e.currentTarget.style.transform = 'scale(0.95)'}
            onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
            onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
            >
              {editorActions.saved ? '✓' : 'Save'}
            </button>
          )}

          {/* Deploy — the signature Action Blue pill CTA */}
          {editorActions.deploy && (() => {
            const ds = editorActions.deployState
            const color = {idle:'var(--ed-accent)', loading:'#8e8e93', done:'#1e8e3e', error:'#e53e3e'}[ds]
            const label = {idle:'Deploy', loading:'…', done:'✓', error:'✕'}[ds]
            return (
              <button onClick={ds === 'idle' || ds === 'done' || ds === 'error' ? editorActions.deploy : undefined}
                disabled={ds === 'loading'} title="Deploy to Vercel"
                style={{
                  border:'none', borderRadius:'9999px', padding:'6px 16px', cursor: ds === 'loading' ? 'not-allowed' : 'pointer',
                  fontFamily:'inherit', fontSize:'12px', fontWeight:400, lineHeight:1, letterSpacing:'-0.01em',
                  background: color, color:'#fff', transition:'transform 0.1s, background 0.2s', opacity: ds === 'loading' ? 0.7 : 1,
                }}
                onMouseDown={e => e.currentTarget.style.transform = 'scale(0.95)'}
                onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
                onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                >
                {label}
              </button>
            )
          })()}

          {/* Vercel account badge — rendered from context */}
          {editorActions.vercelBadge && editorActions.vercelBadge()}

          {/* Settings — surfaces the status readouts (assets size, AI
              blocking, dark mode, maintenance, backend server) that live in
              the sidebar footer and go invisible when the sidebar is
              collapsed. */}
          <div style={{ position: 'relative' }}>
            <IcoBtn onClick={() => setSettingsOpen(o => !o)} title="Settings" active={settingsOpen}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="8" cy="8" r="2.2"/>
                <path d="M8 1.5v1.6M8 12.9v1.6M14.5 8h-1.6M3.1 8H1.5M12.5 3.5l-1.1 1.1M4.6 11.4l-1.1 1.1M12.5 12.5l-1.1-1.1M4.6 4.6 3.5 3.5"/>
              </svg>
            </IcoBtn>
            {settingsOpen && (
              <>
                <div onClick={() => setSettingsOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 99 }} />
                <div style={{
                  position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 100, width: '220px',
                  background: 'var(--ed-card-bg)', border: '1px solid var(--ed-card-border)', borderRadius: '12px',
                  boxShadow: '0 12px 32px rgba(0,0,0,0.16)', padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px',
                }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    {[
                      { label: 'Server', value: serverOn === null ? 'Checking…' : serverOn ? 'Connected' : 'Offline' },
                      { label: 'Commit', value: fmtDate(gitInfo.lastCommit) },
                      { label: 'Deploy', value: fmtDate(gitInfo.lastDeploy) },
                      { label: 'Assets', value: fileSize ?? '—' },
                    ].map(({ label, value }) => (
                      <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '10px', color: 'var(--ed-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>{label}</span>
                        <span style={{ fontSize: '11px', color: 'var(--ed-text)', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={toggleMaintenance}
                    title={maintenance ? 'Under maintenance — click to go public' : 'Public — click to go under maintenance'}
                    style={{
                      background: maintenance ? '#111' : 'var(--ed-input-bg)',
                      border: maintenance ? '1px solid transparent' : '1px solid var(--ed-input-border)',
                      borderRadius: '7px', padding: '5px 10px', cursor: 'pointer',
                      fontSize: '13px', lineHeight: 1, color: maintenance ? '#fff' : 'var(--ed-text-muted)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                      fontFamily: 'inherit', width: '100%', opacity: maintenance === null ? 0.4 : 1,
                    }}
                  >
                    <span>{maintenance ? '🔒' : '🌐'}</span>
                    <span style={{ fontSize: '11px', fontWeight: 500 }}>{maintenance ? 'Maintenance' : 'Public'}</span>
                  </button>

                  <button
                    onClick={toggleAiBlocking}
                    title={aiBlocking ? 'AI crawlers blocked — click to allow' : 'AI crawlers allowed — click to block'}
                    style={{
                      background: aiBlocking ? '#111' : 'var(--ed-input-bg)',
                      border: aiBlocking ? '1px solid transparent' : '1px solid var(--ed-input-border)',
                      borderRadius: '7px', padding: '5px 10px', cursor: 'pointer',
                      fontSize: '13px', lineHeight: 1, color: aiBlocking ? '#fff' : 'var(--ed-text-muted)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                      fontFamily: 'inherit', width: '100%', opacity: aiBlocking === null ? 0.4 : 1,
                    }}
                  >
                    <span>🤖</span>
                    <span style={{ fontSize: '11px', fontWeight: 500 }}>{aiBlocking ? 'AI Blocked' : 'AI Allowed'}</span>
                  </button>

                  <button
                    onClick={toggleDark}
                    title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
                    style={{
                      background: 'var(--ed-input-bg)', border: '1px solid var(--ed-input-border)',
                      borderRadius: '7px', padding: '5px 10px', cursor: 'pointer',
                      fontSize: '13px', lineHeight: 1, color: 'var(--ed-text-muted)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                      fontFamily: 'inherit', width: '100%',
                    }}
                  >
                    <span>{dark ? '☀️' : '🌙'}</span>
                    <span style={{ fontSize: '11px', fontWeight: 500 }}>{dark ? 'Light Mode' : 'Dark Mode'}</span>
                  </button>

                  <div style={{ borderTop: '1px solid var(--ed-card-border)', paddingTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '10px', color: 'var(--ed-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Memo</span>
                      {globalMemo && (
                        <button onClick={clearGlobalMemo} title="Clear memo" style={{ background: 'none', border: 'none', color: 'var(--ed-text-xmuted)', cursor: 'pointer', fontSize: '11px', padding: '0 2px', fontFamily: 'inherit' }}>Clear</button>
                      )}
                    </div>
                    <textarea
                      value={globalMemo}
                      onChange={e => updateGlobalMemo(e.target.value)}
                      placeholder="Jot down a quick note…"
                      rows={4}
                      style={{
                        width: '100%', resize: 'vertical', border: '1px solid var(--ed-input-border)', borderRadius: '7px',
                        padding: '6px 8px', fontSize: '12px', fontFamily: 'inherit', outline: 'none',
                        background: 'var(--ed-input-bg)', color: 'var(--ed-text)', boxSizing: 'border-box',
                      }}
                    />
                  </div>
                </div>
              </>
            )}
          </div>

          <div style={{flex:1}}/>

          {/* Editor language — reloads the editor in that mode. */}
          {EDIT_LANGS.length > 1 && <div role="group" aria-label="Editing language" style={{ display:'flex', gap:'2px', padding:'2px', borderRadius:'8px', background:'var(--ed-input-bg)', border:'1px solid var(--ed-input-border)', marginRight:'4px' }}>
            {EDIT_LANGS.map(l => (
              <button key={l.code} onClick={() => setEditLang(l.code)} title={l.code === 'en' ? 'Edit the site (English)' : `Translate into ${l.name}`} aria-pressed={EDIT_LANG.code === l.code} style={{
                border:'none', borderRadius:'6px', padding:'3px 8px', cursor:'pointer', fontFamily:'inherit', fontSize:'11px', fontWeight:600,
                background: EDIT_LANG.code === l.code ? (l.code === 'en' ? 'var(--ed-text)' : '#d97706') : 'transparent',
                color: EDIT_LANG.code === l.code ? (l.code === 'en' ? 'var(--ed-bg)' : '#fff') : 'var(--ed-text-muted)',
              }}>{l.label}</button>
            ))}
          </div>}

          {/* Preview toggle */}
          <IcoBtn onClick={togglePreview} title={previewOpen ? 'Close preview' : 'Open preview'} active={previewOpen}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="1.5" y="1.5" width="13" height="13" rx="2"/><line x1="10.5" y1="1.5" x2="10.5" y2="14.5"/>
            </svg>
          </IcoBtn>
        </div>
        )}
        {EDIT_LANG.code !== 'en' && (
          <div style={{ flexShrink:0, padding:'8px 14px', background:'#fff7ed', borderBottom:'1px solid #fed7aa', color:'#9a3412', fontSize:'12px', lineHeight:1.5, display:'flex', gap:'10px', alignItems:'center', flexWrap:'wrap' }}>
            <strong style={{ fontWeight:700 }}>Translating: {EDIT_LANG.name}</strong>
            <span style={{ flex:1, minWidth:'200px' }}>Text you edit and save goes into the {EDIT_LANG.name} version only. Untranslated text shows in English. Layout, images and settings are shared with every language — changes to them are not saved in this mode.</span>
            <NavLink to="/editor/translations" style={{ color:'#9a3412', fontWeight:600 }}>Progress & images →</NavLink>
          </div>
        )}
        <div ref={mainScrollRef} style={{flex:1, overflowY:'auto'}}>
          <div style={mainZoom < 1 ? { zoom: mainZoom } : undefined}>
            <Outlet />
          </div>
        </div>
      </div>

      {/* Preview panel */}
      {previewOpen && !EMBED && (
        <PreviewPanel
          width={previewWidth}
          onResizeStart={handleResizeStart}
          showNav={previewNavOpen}
          onToggleNav={togglePreviewNav}
          uiZoom={mainZoom}
          navProps={{
            tab, setTab, search, setSearch,
            pages, filteredProjects, filteredOriginals, blogs,
            projectCats, originalCats, blogCategories,
            creating, setCreating, handleCreated,
          }}
        />
      )}
    </div>
    </EditorActionCtx.Provider>
  )
}

function IcoBtn({ onClick, title, active, children }) {
  return (
    <button onClick={onClick} title={title} style={{
      border:'none', background: active ? 'var(--ed-nav-active-bg)' : 'transparent',
      cursor:'pointer', padding:'4px', borderRadius:'6px',
      color: active ? 'var(--ed-nav-active-text)' : 'var(--ed-text-muted)',
      display:'flex', alignItems:'center', transition:'background 0.15s',
    }}>{children}</button>
  )
}
