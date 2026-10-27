import { useState, useCallback, useEffect, useRef, useContext } from 'react'
import { ImageWithFallback, PLACEHOLDER_IMG } from '../../utils/getImage'
import { EditorActionCtx } from './EditorActionCtx'
import { safeGet, safeSet } from '../../utils/safeStorage'
import { EMBED, markSaved } from './pofole'

// Remaps a sparse {index: true} "collapsed" map after an item moves from
// index `from` to `to` within a `length`-long list (drag-reorder) — the same
// re-index-by-position logic was copy-pasted across every editor page with a
// reorderable list of collapsible blocks/sections.
export function remapCollapsedOnReorder(collapsed, from, to, length) {
  const arr = Array.from({ length }, (_, idx) => !!collapsed[idx])
  const [moved] = arr.splice(from, 1)
  arr.splice(to, 0, moved)
  const next = {}
  arr.forEach((v, idx) => { if (v) next[idx] = true })
  return next
}

export const RATIOS = [
  { label: 'Default (Desktop 16:9 / Mobile 5:4)', value: '' },
  { label: '10:3', value: '10/3' },
  { label: '2:1', value: '2/1' },
  { label: '16:9', value: '16/9' },
  { label: '16:10', value: '16/10' },
  { label: '3:2', value: '3/2' },
  { label: '4:3', value: '4/3' },
  { label: '5:4', value: '5/4' },
  { label: '1:1', value: '1/1' },
  { label: '4:5', value: '4/5' },
  { label: '3:4', value: '3/4' },
  { label: '2:3', value: '2/3' },
  { label: '9:16', value: '9/16' },
  { label: 'iPhone 9:19.5 (portrait)', value: '9/19.5' },
  { label: 'iPhone 19.5:9 (landscape)', value: '19.5/9' },
]

export const HERO_RATIOS = [
  { label: 'Fullscreen', value: 'full' },
  { label: '2:1', value: '2/1' },
  { label: '16:9', value: '16/9' },
  { label: '16:10', value: '16/10' },
  { label: '3:2', value: '3/2' },
  { label: '4:3', value: '4/3' },
  { label: '5:4', value: '5/4' },
  { label: '1:1', value: '1/1' },
  { label: '4:5', value: '4/5' },
  { label: '3:4', value: '3/4' },
  { label: '2:3', value: '2/3' },
  { label: '9:16', value: '9/16' },
]

const ratioSel = { border: '1px solid var(--ed-input-border)', borderRadius: '6px', padding: '3px 6px', fontSize: '11px', fontFamily: 'inherit', background: 'var(--ed-input-bg)', color: 'var(--ed-text)', cursor: 'pointer', outline: 'none' }

const GAP_OPTIONS = [
  { label: 'Default', value: '' },
  { label: '0', value: '0' },
  { label: '2px', value: '2px' },
  { label: '4px', value: '4px' },
  { label: '6px', value: '6px' },
  { label: '8px', value: '8px' },
  { label: '10px', value: '10px' },
  { label: '12px', value: '12px' },
  { label: '16px', value: '16px' },
  { label: '20px', value: '20px' },
  { label: '24px', value: '24px' },
]

export function GapRow({ desktopGap, mobileGap, onDesktopGap, onMobileGap }) {
  return (
    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center', padding: '8px 0', borderTop: '1px solid var(--ed-divider)', marginTop: '4px' }}>
      <span style={{ fontSize: '12px', color: 'var(--ed-text-muted)', flexShrink: 0, fontWeight: 500 }}>Gap</span>
      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--ed-text-sub)' }}>
        Desktop
        <select style={ratioSel} value={desktopGap || ''} onChange={e => onDesktopGap(e.target.value)}>
          {GAP_OPTIONS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
        </select>
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--ed-text-sub)' }}>
        Mobile
        <select style={ratioSel} value={mobileGap || ''} onChange={e => onMobileGap(e.target.value)}>
          {GAP_OPTIONS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
        </select>
      </label>
    </div>
  )
}

export function RatioRow({ desktopRatio, tabletRatio, mobileRatio, onDesktopRatio, onTabletRatio, onMobileRatio, ratioOptions = RATIOS }) {
  return (
    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center', padding: '8px 0', borderTop: '1px solid var(--ed-divider)', marginTop: '4px' }}>
      <span style={{ fontSize: '12px', color: 'var(--ed-text-muted)', flexShrink: 0, fontWeight: 500 }}>Ratio</span>
      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--ed-text-sub)' }}>
        Desktop
        <select style={ratioSel} value={desktopRatio || ''} onChange={e => onDesktopRatio(e.target.value)}>
          {ratioOptions.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
      </label>
      {onTabletRatio && (
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--ed-text-sub)' }}>
          Tablet
          <select style={ratioSel} value={tabletRatio || ''} onChange={e => onTabletRatio(e.target.value)}>
            <option value="">Same as desktop</option>
            {ratioOptions.filter(r => r.value).map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </label>
      )}
      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--ed-text-sub)' }}>
        Mobile
        <select style={ratioSel} value={mobileRatio || ''} onChange={e => onMobileRatio(e.target.value)}>
          {ratioOptions.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
      </label>
    </div>
  )
}

export function Thumb({ path, onLoad }) {
  if (!path) return null
  const base = path.replace(/\.(gif|webp|png|jpg|jpeg|svg)$/i, '')
  return <ImageWithFallback basePath={base} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onLoad={onLoad} />
}

function FileBrowser({ currentPath, onSelect, onClose }) {
  const guessDir = (p) => {
    if (!p) return 'assets'
    const s = p.replace(/^\//, '').replace(/\.(gif|webp|png|jpg|jpeg|svg)$/i, '')
    const idx = s.lastIndexOf('/')
    return idx >= 0 ? s.substring(0, idx) : 'assets'
  }

  const [dir, setDir] = useState(() => guessDir(currentPath))
  const [items, setItems] = useState({ dirs: [], files: [] })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    fetch(`${API}/browse?dir=${encodeURIComponent(dir)}`)
      .then(r => r.json())
      .then(data => { setItems(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [dir])

  const goUp = () => {
    const parts = dir.split('/').filter(Boolean)
    parts.pop()
    setDir(parts.length ? parts.join('/') : 'assets')
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}>
      <div style={{ background: 'var(--ed-card-bg)', borderRadius: '16px', width: '620px', maxHeight: '75vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.18)' }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding: '13px 18px', borderBottom: '1px solid var(--ed-divider)', display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
          <button onClick={goUp} disabled={dir === 'assets'}
            style={{ border: '1px solid var(--ed-input-border)', background: 'var(--ed-input-bg)', borderRadius: '6px', padding: '4px 10px', cursor: dir === 'assets' ? 'not-allowed' : 'pointer', fontSize: '12px', color: dir === 'assets' ? 'var(--ed-text-xmuted)' : 'var(--ed-text-sub)', fontFamily: 'inherit' }}>↑ Up</button>
          <code style={{ flex: 1, fontSize: '11px', color: 'var(--ed-text-muted)' }}>/{dir}</code>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: '18px', cursor: 'pointer', color: 'var(--ed-text-xmuted)', lineHeight: 1 }}>✕</button>
        </div>

        {/* Content */}
        <div style={{ overflow: 'auto', padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {loading && <div style={{ textAlign: 'center', color: 'var(--ed-text-xmuted)', padding: '24px', fontSize: '13px' }}>Loading...</div>}

          {/* Directories */}
          {items.dirs?.length > 0 && (
            <div>
              <div style={{ fontSize: '10px', color: 'var(--ed-text-muted)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Folders</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {items.dirs.map(d => (
                  <button key={d} onClick={() => setDir(`${dir}/${d}`)}
                    style={{ border: '1px solid var(--ed-input-border)', background: 'var(--ed-block-bg)', borderRadius: '8px', padding: '6px 12px', cursor: 'pointer', fontSize: '12px', color: 'var(--ed-text-sub)', fontFamily: 'inherit' }}>
                    📁 {d}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Image files */}
          {items.files?.length > 0 ? (
            <div>
              <div style={{ fontSize: '10px', color: 'var(--ed-text-muted)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Images</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                {items.files.map(f => (
                  <button key={f.name} onClick={() => onSelect(f.basePath)}
                    style={{ border: '1.5px solid var(--ed-badge-border)', borderRadius: '10px', overflow: 'hidden', cursor: 'pointer', background: 'var(--ed-card-bg)', padding: 0, textAlign: 'left' }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = '#0087ED'}
                    onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--ed-badge-border)'}>
                    <div style={{ height: '70px', background: 'var(--ed-block-bg)', overflow: 'hidden' }}>
                      <ImageWithFallback basePath={f.basePath} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                    <div style={{ padding: '5px 8px' }}>
                      <div style={{ fontSize: '9px', color: '#0087ED', fontWeight: 700 }}>{f.ext.replace('.', '').toUpperCase()}</div>
                      <div style={{ fontSize: '10px', color: 'var(--ed-text-sub)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name.replace(f.ext, '')}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : !loading && (
            <div style={{ textAlign: 'center', color: 'var(--ed-text-xmuted)', padding: '24px', fontSize: '13px' }}>No images</div>
          )}
        </div>
      </div>
    </div>
  )
}

export function ImageField({ label, value, onChange,
  desktopRatio, tabletRatio, mobileRatio, onDesktopRatio, onTabletRatio, onMobileRatio, ratioOptions = RATIOS,
  // Optional direct-upload slot — when both are given, an "Upload" button
  // appears next to Browse. `uploadUrl` is the same kind of per-project
  // `/api/images/.../sections/upload` endpoint ImagePicker posts to (returns
  // { ok, filename }); `uploadDir` is the public path the uploaded file
  // lands under (e.g. `/assets/projects/${category}/${id}/sections`), used
  // to build the final `${uploadDir}/${filename}` value passed to onChange.
  uploadUrl, uploadDir, accept = 'image/*',
}) {
  const [showBrowser, setShowBrowser] = useState(false)
  const [dims, setDims] = useState(null)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef(null)
  const prevValue = useRef(value)

  useEffect(() => {
    if (prevValue.current !== value) { setDims(null); prevValue.current = value }
  }, [value])

  const doUpload = (file) => {
    if (!uploadUrl || !file) return
    setUploading(true)
    const reader = new FileReader()
    reader.onload = async (ev) => {
      const data = ev.target.result.split(',')[1]
      try {
        const res = await fetch(uploadUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: file.name, data }),
        })
        const d = await res.json()
        if (d.ok) onChange(`${uploadDir}/${d.filename}`)
      } finally {
        setUploading(false)
      }
    }
    reader.readAsDataURL(file)
  }

  const inp = { border: '1px solid var(--ed-input-border)', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', fontFamily: 'inherit', color: 'var(--ed-text)', background: 'var(--ed-input-bg)', outline: 'none', flex: 1, minWidth: 0 }
  const showRatios = onDesktopRatio || onTabletRatio || onMobileRatio
  return (
    <Field label={label}>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <input style={inp} value={value || ''} onChange={e => { onChange(e.target.value); setDims(null) }} />
        {uploadUrl && (
          <>
            <input
              ref={fileInputRef} type="file" accept={accept} style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) doUpload(f); e.target.value = '' }}
            />
            <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
              style={{ border: '1px solid var(--ed-input-border)', background: 'var(--ed-input-bg)', borderRadius: '8px', padding: '8px 12px', fontSize: '12px', cursor: uploading ? 'default' : 'pointer', fontFamily: 'inherit', flexShrink: 0, color: 'var(--ed-text-sub)', opacity: uploading ? 0.6 : 1 }}>
              {uploading ? 'Uploading…' : 'Upload'}
            </button>
          </>
        )}
        <button onClick={() => setShowBrowser(true)}
          style={{ border: '1px solid var(--ed-input-border)', background: 'var(--ed-input-bg)', borderRadius: '8px', padding: '8px 12px', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0, color: 'var(--ed-text-sub)' }}>
          Browse
        </button>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', flexShrink: 0 }}>
          <div style={{ width: '72px', height: '50px', borderRadius: '6px', overflow: 'hidden', border: '1px solid var(--ed-badge-border)', background: 'var(--ed-block-bg)' }}>
            <Thumb path={value} onLoad={e => setDims({ w: e.target.naturalWidth, h: e.target.naturalHeight })} />
          </div>
          {dims && <span style={{ fontSize: '9px', color: 'var(--ed-text-xmuted)', whiteSpace: 'nowrap' }}>{dims.w} × {dims.h}</span>}
        </div>
      </div>
      {showRatios && (
        <div style={{ display: 'flex', gap: '14px', alignItems: 'center', marginTop: '6px' }}>
          {onDesktopRatio && (
            <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: 'var(--ed-text-sub)' }}>
              🖥 <select style={ratioSel} value={desktopRatio || ''} onChange={e => onDesktopRatio(e.target.value)}>
                {ratioOptions.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </label>
          )}
          {onTabletRatio && (
            <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: 'var(--ed-text-sub)' }}>
              💻 <select style={ratioSel} value={tabletRatio || ''} onChange={e => onTabletRatio(e.target.value)}>
                <option value="">Same as desktop</option>
                {ratioOptions.filter(r => r.value).map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </label>
          )}
          {onMobileRatio && (
            <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: 'var(--ed-text-sub)' }}>
              📱 <select style={ratioSel} value={mobileRatio || ''} onChange={e => onMobileRatio(e.target.value)}>
                {ratioOptions.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </label>
          )}
        </div>
      )}
      {showBrowser && (
        <FileBrowser
          currentPath={value}
          onSelect={p => { onChange(p); setShowBrowser(false); setDims(null) }}
          onClose={() => setShowBrowser(false)}
        />
      )}
    </Field>
  )
}

// Recommended-resolution hint shown right under an image field — 2x the
// image's actual rendered size on this site's 1920px-wide container, so
// it stays crisp on retina displays without needing to guess.
export function SizeHint({ children }) {
  return <div style={{ fontSize: '11px', color: 'var(--ed-text-xmuted)', margin: '-8px 0 4px', lineHeight: 1.6 }}>📐 {children}</div>
}

// Turns a target width + a section's actual configured aspect-ratio (e.g.
// "2/1") into a "W×H" recommendation string. Deliberately reads the ratio
// the section is ALREADY set to, rather than assuming a fixed shape —
// a hardcoded recommendation (e.g. always 16:9) silently goes stale the
// moment someone picks a different ratio in the Ratio dropdown above it,
// and under Apple-style/nativeSize that mismatch isn't just "slightly
// cropped", it leaves visible gray gaps where the image falls short of the
// container on one axis (see ImageBreakpointOptions — no CSS scaling means
// the source must already be shaped like its container, not just large).
export function ratioDims(width, ratio) {
  const [a, b] = String(ratio || '1/1').split('/').map(Number)
  if (!a || !b) return `${width}px wide`
  return `${width}×${Math.round(width * b / a)} (${ratio})`
}

// Shared block for an image field's per-breakpoint options. Mobile/Tablet
// Image overrides work under normal cover scaling just as well as under
// Apple-style — ImageWithFallback swaps basePath per tier independently of
// nativeSize — so they're always available, not gated behind the checkbox.
// Apple-style itself (no CSS resize — center + clip, like Apple's hero) is
// opt-in per image since it only behaves correctly when the image's own
// aspect ratio already matches its container's at every breakpoint it's
// shown at (a fluid/vw-width container has no single "correct" width to
// match, so it's typically only worth it for a fixed-size container).
// `sizeHint` is section-specific copy telling the author what resolution to
// prepare.
export function ImageBreakpointOptions({ mobileValue, onMobileChange, tabletValue, onTabletChange, nativeSize, onNativeSize, hideOnMobile, onHideOnMobile, sizeHint, containerRatio }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '10px 14px', background: 'var(--ed-block-bg)', borderRadius: '8px', border: '1px solid var(--ed-block-border)' }}>
      {sizeHint && (
        <div style={{ fontSize: '11px', color: 'var(--ed-text-xmuted)' }}>{sizeHint}</div>
      )}
      <ImageField label="Mobile Image (optional — falls back to the desktop image)" value={mobileValue} onChange={v => onMobileChange(v || undefined)} />
      <ImageField label="Tablet Image (optional — falls back to the desktop image)" value={tabletValue} onChange={v => onTabletChange(v || undefined)} />
      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', color: 'var(--ed-text-sub)' }}>
        <input type="checkbox" checked={!!nativeSize} onChange={e => onNativeSize(e.target.checked || undefined)} />
        Apple-style (native size, no scaling — centers the image at its own pixel size and clips overflow, instead of stretching to fill)
      </label>
      {nativeSize && containerRatio && (
        <div style={{ fontSize: '11px', color: '#e08a00', paddingLeft: '22px' }}>
          ⚠ Since this doesn't scale, your image's own aspect ratio must match the container's ({containerRatio}, set in the Ratio row above) at every breakpoint it's shown at — narrower and you'll see gray gaps top/bottom; wider and it'll crop tighter on the sides. If the container is fluid width (most cards here are), this generally can't be made to match on every screen — cover mode (leave unchecked) is usually the safer choice.
        </div>
      )}
      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', color: 'var(--ed-text-sub)' }}>
        <input type="checkbox" checked={!!hideOnMobile} onChange={e => onHideOnMobile(e.target.checked || undefined)} />
        Hide this image on mobile
      </label>
    </div>
  )
}

export const HOVER_STYLES = [
  { value: 'overlay', label: 'Color Overlay', desc: 'Blue tint fades in, caption on top' },
  { value: 'zoom', label: 'Zoom + Text', desc: 'Image scales up, caption slides in — no color layer' },
  { value: 'plain', label: 'Image Only', desc: 'No caption, no hover effect' },
]

export const FONT_SIZES = [
  '',
  ...Array.from({ length: 19 }, (_, i) => `${i + 12}px`),
  '32px', '36px', '40px', '44px', '48px',
]

export const FONT_WEIGHTS = [
  { value: '', label: 'Weight' },
  { value: '300', label: '300' },
  { value: '400', label: '400' },
  { value: '500', label: '500' },
  { value: '600', label: '600' },
  { value: '700', label: '700' },
  { value: '800', label: '800' },
  { value: '900', label: '900' },
]

export const API = '/api'

const STEPS = [
  { key: 'git-add',    label: 'Staging' },
  { key: 'git-commit', label: 'Commit' },
  { key: 'git-push',   label: 'Push' },
  { key: 'vercel',     label: 'Deploy' },
]

function fmtElapsed(secs) {
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `0:${String(s).padStart(2, '0')}`
}

function VercelAccountBadge() {
  const [data, setData] = useState({ active: '', profiles: [] })
  const [open, setOpen] = useState(false)
  const [switching, setSwitching] = useState(false)
  const ref = useRef(null)

  const load = () => {
    fetch(`${API}/vercel-profiles`).then(r => r.json()).then(setData).catch(() => {})
  }

  useEffect(() => {
    load()
    const handleClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const switchTo = async (profile) => {
    setSwitching(true)
    setOpen(false)
    await fetch(`${API}/vercel-switch`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile }) })
    await load()
    setSwitching(false)
  }

  if (!data.profiles.length) return null

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          border: '1px solid var(--ed-input-border)', background: 'var(--ed-input-bg)',
          color: 'var(--ed-text-sub)', borderRadius: '8px', padding: '7px 12px',
          fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit',
          display: 'flex', alignItems: 'center', gap: '5px',
        }}
      >
        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#1e8e3e', flexShrink: 0 }} />
        {switching ? '...' : (data.active || 'vercel')}
        <span style={{ fontSize: '9px', opacity: 0.5 }}>▾</span>
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 100,
          background: 'var(--ed-card-bg)', border: '1px solid var(--ed-divider)',
          borderRadius: '10px', padding: '6px', minWidth: '160px',
          boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
        }}>
          {data.profiles.map(p => (
            <button
              key={p}
              onClick={() => switchTo(p)}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                width: '100%', padding: '8px 10px', borderRadius: '7px',
                border: 'none', background: p === data.active ? 'var(--ed-nav-active-bg)' : 'transparent',
                color: p === data.active ? 'var(--ed-nav-active-text)' : 'var(--ed-text)',
                fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
              }}
            >
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: p === data.active ? '#1e8e3e' : 'var(--ed-input-border)', flexShrink: 0 }} />
              {p}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function EditorTopbar({ title, onSave, saved, extra, onHome }) {
  const setEditorActions = useContext(EditorActionCtx)
  const [deployState, setDeployState] = useState('idle') // idle | loading | done | error
  const [log, setLog] = useState([])
  const [progress, setProgress] = useState(0)
  const [currentStep, setCurrentStep] = useState(null)
  const [elapsed, setElapsed] = useState(0)
  const timerRef = useRef(null)
  const [reauthState, setReauthState] = useState('idle') // idle | loading | done | error
  const [reauthLog, setReauthLog] = useState([])
  const [reauthUrl, setReauthUrl] = useState(null)

  const deploy = useCallback(async () => {
    setDeployState('loading')
    setLog([])
    setProgress(0)
    setCurrentStep(null)
    setElapsed(0)

    const startTime = Date.now()
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000))
    }, 1000)

    try {
      const res = await fetch(`${API}/deploy`, { method: 'POST' })
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop()
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const data = JSON.parse(line.slice(6))
            if (data.step) setCurrentStep(data.step)
            if (data.log) setLog(l => [...l, data.log])
            if (data.progress !== undefined) setProgress(data.progress)
            if (data.done) setDeployState(data.ok ? 'done' : 'error')
          } catch {}
        }
      }
    } catch (e) {
      setDeployState('error')
      setLog(l => [...l, `Connection failed: ${e.message}`])
    } finally {
      clearInterval(timerRef.current)
    }
  }, [])

  const reauth = useCallback(async () => {
    setReauthState('loading')
    setReauthLog([])
    setReauthUrl(null)
    try {
      const res = await fetch(`${API}/vercel-reauth`, { method: 'POST' })
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop()
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const data = JSON.parse(line.slice(6))
            if (data.url) setReauthUrl(data.url)
            if (data.log) setReauthLog(l => [...l, data.log])
            if (data.done) setReauthState(data.ok ? 'done' : 'error')
          } catch {}
        }
      }
    } catch (e) {
      setReauthState('error')
      setReauthLog(l => [...l, `Connection failed: ${e.message}`])
    }
  }, [])

  useEffect(() => () => clearInterval(timerRef.current), [])

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Enter' && document.activeElement?.tagName === 'INPUT') {
        onSave()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onSave])

  // Profolio's File ▸ Save (⌘S) asks the embedded form to save.
  useEffect(() => {
    if (!EMBED || !onSave) return
    const onMessage = (e) => { if (e.data && e.data.type === 'pofole:save') { onSave(); markSaved() } }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [onSave])

  useEffect(() => {
    setEditorActions?.(prev => ({ ...prev, save: onSave, saved, deploy, deployState, vercelBadge: () => <VercelAccountBadge /> }))
  }, [onSave, saved, deploy, deployState, setEditorActions])

  useEffect(() => () => {
    setEditorActions?.({ save: null, saved: false, deploy: null, deployState: 'idle', vercelBadge: null })
  }, [])

  const btnBase = {
    border:'none', padding:'8px 20px', borderRadius:'8px',
    fontSize:'13px', cursor:'pointer', fontFamily:'inherit',
  }
  const deployColor = { idle:'#0087ED', loading:'#999', done:'#1e8e3e', error:'#e53e3e' }
  const deployLabel = { idle:'Deploy', loading:'Deploying...', done:'✓ Deployed', error:'✕ Error' }

  const logColor = (line) => {
    if (line.includes('✓')) return '#1e8e3e'
    if (line.includes('error') || line.includes('Error') || line.includes('failed') || line.includes('Failed')) return '#e53e3e'
    if (line.includes('skipped')) return '#999'
    return 'var(--ed-text-sub)'
  }

  const barColor = deployState === 'error' ? '#e53e3e' : deployState === 'done' ? '#1e8e3e' : '#0087ED'
  const showPanel = deployState !== 'idle'

  return (
    <div className="ed-topbar">
      {/* Title row */}
      <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', paddingBottom:'18px', borderBottom:'1px solid var(--ed-topbar-border)'}}>
        <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
          {onHome && (
            <button onClick={onHome} title="Editor Home" style={{background:'none', border:'1px solid var(--ed-input-border)', borderRadius:'6px', padding:'4px 8px', cursor:'pointer', color:'var(--ed-text-muted)', display:'flex', alignItems:'center', lineHeight:1}}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M1 7L7 2l6 5"/><path d="M3 6v5.5a.5.5 0 0 0 .5.5H6V9h2v3h2.5a.5.5 0 0 0 .5-.5V6"/></svg>
            </button>
          )}
          <span style={{fontSize:'16px', fontWeight:600, color:'var(--ed-text)'}}>{title}</span>
        </div>
        {(extra || EMBED) && (
          <div style={{display:'flex', gap:'8px', alignItems:'center'}}>
            {extra}
            {/* Embedded in Profolio the editor's top bar (with Save) is hidden. */}
            {EMBED && onSave && (
              <button onClick={() => { onSave(); markSaved() }} title="Save (⌘S)" style={{
                border:'none', borderRadius:'9999px', padding:'6px 16px', cursor:'pointer', fontFamily:'inherit',
                fontSize:'12px', lineHeight:1, background: saved ? 'transparent' : 'var(--ed-text)',
                color: saved ? 'var(--ed-text-muted)' : 'var(--ed-bg)',
              }}>{saved ? '✓ Saved' : 'Save'}</button>
            )}
          </div>
        )}
      </div>

      {/* Deploy panel */}
      {showPanel && (
        <div style={{
          padding:'10px 12px', marginTop:'8px',
          background:'var(--ed-block-bg)', borderRadius:'8px',
          display:'flex', flexDirection:'column', gap:'8px',
        }}>
          {/* Progress bar + elapsed time */}
          <div style={{display:'flex', flexDirection:'column', gap:'4px'}}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
              <div style={{display:'flex', gap:'8px', alignItems:'center'}}>
                {STEPS.map((s, i) => {
                  const stepIdx = STEPS.findIndex(x => x.key === currentStep)
                  const isDone = deployState === 'done' || (stepIdx > i)
                  const isActive = s.key === currentStep && deployState === 'loading'
                  return (
                    <span key={s.key} style={{
                      fontSize:'10px',
                      color: isDone ? '#1e8e3e' : isActive ? '#0087ED' : 'var(--ed-text-xmuted)',
                      fontWeight: isActive ? 700 : 400,
                    }}>
                      {isDone ? '✓ ' : isActive ? '· ' : ''}{s.label}
                    </span>
                  )
                })}
              </div>
              <span style={{fontSize:'10px', color:'var(--ed-text-muted)', fontVariantNumeric:'tabular-nums'}}>
                {fmtElapsed(elapsed)}
              </span>
            </div>
            {/* Bar */}
            <div style={{height:'4px', background:'var(--ed-input-border)', borderRadius:'2px', overflow:'hidden'}}>
              <div style={{
                height:'100%', borderRadius:'2px',
                background: barColor,
                width: `${progress}%`,
                transition: 'width 0.4s ease, background 0.3s',
              }} />
            </div>
            <div style={{display:'flex', justifyContent:'space-between'}}>
              <span style={{fontSize:'10px', color: barColor, fontWeight:600}}>
                {deployState === 'done' ? 'Deployed' : deployState === 'error' ? 'Failed' : `${progress}%`}
              </span>
            </div>
          </div>

          {/* Log */}
          {log.length > 0 && (
            <div style={{display:'flex', flexDirection:'column', gap:'2px', borderTop:'1px solid var(--ed-divider)', paddingTop:'6px'}}>
              {log.map((line, i) => (
                <div key={i} style={{fontSize:'11px', fontFamily:'monospace', color: logColor(line)}}>
                  {line}
                </div>
              ))}
            </div>
          )}

          {/* Re-auth section (shown on error) */}
          {deployState === 'error' && reauthState === 'idle' && (
            <div style={{borderTop:'1px solid var(--ed-divider)', paddingTop:'8px'}}>
              <button
                onClick={reauth}
                style={{fontSize:'11px', padding:'5px 12px', border:'1px solid var(--ed-input-border)', borderRadius:'6px', background:'var(--ed-input-bg)', color:'var(--ed-text-sub)', cursor:'pointer', fontFamily:'inherit'}}
              >Re-authenticate Vercel</button>
            </div>
          )}
          {reauthState !== 'idle' && (
            <div style={{borderTop:'1px solid var(--ed-divider)', paddingTop:'8px', display:'flex', flexDirection:'column', gap:'6px'}}>
              <span style={{fontSize:'11px', fontWeight:600, color:'var(--ed-text-muted)'}}>Vercel Login</span>
              {reauthLog.map((line, i) => (
                <div key={i} style={{fontSize:'11px', fontFamily:'monospace', color:'var(--ed-text-sub)'}}>{line}</div>
              ))}
              {reauthUrl && (
                <a href={reauthUrl} target="_blank" rel="noreferrer" style={{fontSize:'11px', color:'#0087ED', wordBreak:'break-all'}}>
                  → Click to authorize in browser
                </a>
              )}
              {reauthState === 'loading' && !reauthUrl && (
                <span style={{fontSize:'11px', color:'var(--ed-text-muted)'}}>Waiting for Vercel CLI...</span>
              )}
              {reauthState === 'done' && (
                <span style={{fontSize:'11px', color:'#1e8e3e', fontWeight:600}}>✓ Authenticated — try deploying again</span>
              )}
              {reauthState === 'error' && (
                <span style={{fontSize:'11px', color:'#e53e3e'}}>Authentication failed</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function FontSizeSelect({ label, value, onChange }) {
  return (
    <div style={{display:'flex', flexDirection:'column', gap:'6px', minWidth:'80px', flex:'1 1 80px'}}>
      <label style={{fontSize:'12px', fontWeight:500, color:'var(--ed-text-muted)'}}>{label} size</label>
      <select value={value || ''} onChange={e => onChange(e.target.value)}
        style={{border:'1px solid var(--ed-input-border)', borderRadius:'8px', padding:'8px 12px', fontSize:'13px', fontFamily:'inherit', color:'var(--ed-text)', background:'var(--ed-input-bg)', outline:'none'}}>
        {FONT_SIZES.map(s => <option key={s} value={s}>{s || 'Default'}</option>)}
      </select>
    </div>
  )
}

const ctrlSel = { border: '1px solid var(--ed-input-border)', borderRadius: '6px', padding: '3px 6px', fontSize: '11px', fontFamily: 'inherit', background: 'var(--ed-input-bg)', color: 'var(--ed-text)', cursor: 'pointer', outline: 'none' }

// Tablet/Mobile size overrides for a text field that already has a desktop
// size set — shown only once that base size exists, since these represent
// intentional deviations from it rather than standalone values.
export function TierSizeRow({ label, size, tabletValue, onTablet, mobileValue, onMobile }) {
  return (
    <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span style={{ fontSize: '11px', color: 'var(--ed-text-xmuted)', flexShrink: 0 }}>{label} — Tablet size</span>
        <select value={tabletValue || ''} onChange={e => onTablet(e.target.value || undefined)} style={{ ...ctrlSel, fontSize: '11px', padding: '3px 6px' }}>
          <option value=''>Same as desktop</option>
          {FONT_SIZES.filter(s => s && s !== size).map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span style={{ fontSize: '11px', color: 'var(--ed-text-xmuted)', flexShrink: 0 }}>{label} — Mobile size</span>
        <select value={mobileValue || ''} onChange={e => onMobile(e.target.value || undefined)} style={{ ...ctrlSel, fontSize: '11px', padding: '3px 6px' }}>
          <option value=''>Same as tablet/desktop</option>
          {FONT_SIZES.filter(s => s && s !== size).map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
    </div>
  )
}

// Inline rich-text box: contentEditable + Bold/Italic toolbar so a *portion* of a
// sentence can be bolded/italicized, on top of the line's whole-field weight/italic/size/color.
// Stores its value as a small HTML string (sanitized on render — see utils/sanitizeInline.js).
function RichTextEditable({ value, onChange, multiline, rows, style }) {
  const ref = useRef(null)
  const lastHtml = useRef(value || '')

  // Set the initial content once on mount via a callback ref, instead of
  // dangerouslySetInnerHTML. Re-applying dangerouslySetInnerHTML on every
  // keystroke would make React rewrite the DOM each time, which wipes the
  // browser's native contentEditable undo (Cmd+Z) history.
  const initRef = useCallback((node) => {
    ref.current = node
    if (node && node.innerHTML !== (value || '')) {
      node.innerHTML = value || ''
      lastHtml.current = value || ''
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- intentionally mount-only

  useEffect(() => {
    if (ref.current && value !== lastHtml.current && document.activeElement !== ref.current) {
      ref.current.innerHTML = value || ''
      lastHtml.current = value || ''
    }
  }, [value])

  // Remember the last *highlighted* range inside this editor so the color
  // controls can re-apply it. Clicking the color swatch / hex input collapses
  // the selection to a caret before onChange fires, so we deliberately ignore
  // collapsed selections here — otherwise that caret would wipe the real one
  // and foreColor would have nothing to color.
  const savedRange = useRef(null)
  const [linkPopoverOpen, setLinkPopoverOpen] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  // Snapshot the current highlight if (and only if) it's a real, non-collapsed
  // range inside this editor. Ignoring collapsed carets keeps a stray click
  // from wiping the selection the color controls need.
  const captureSelection = () => {
    const sel = window.getSelection()
    if (
      sel && sel.rangeCount > 0 && !sel.isCollapsed &&
      ref.current && ref.current.contains(sel.anchorNode) && ref.current.contains(sel.focusNode)
    ) {
      savedRange.current = sel.getRangeAt(0).cloneRange()
    }
  }
  useEffect(() => {
    document.addEventListener('selectionchange', captureSelection)
    return () => document.removeEventListener('selectionchange', captureSelection)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const emit = () => {
    const html = ref.current?.innerHTML || ''
    lastHtml.current = html
    onChange(html)
  }

  const handleBold = (e) => {
    e.preventDefault()
    ref.current?.focus()
    document.execCommand('bold')
    emit()
  }

  const handleItalic = (e) => {
    e.preventDefault()
    ref.current?.focus()
    document.execCommand('italic')
    emit()
  }

  const handleColorChange = (e) => {
    const val = e.target.value
    // Focus BEFORE restoring the range: focusing a currently-unfocused
    // contentEditable resets its selection, which would wipe a range we
    // restored first. (When the color swatch has focus, that's the case here.)
    ref.current?.focus()
    if (savedRange.current) {
      const sel = window.getSelection()
      sel.removeAllRanges()
      sel.addRange(savedRange.current)
    }
    document.execCommand('styleWithCSS', false, true)
    document.execCommand('foreColor', false, val)
    // styleWithCSS is a document-wide (not per-editor) toggle — leaving it on
    // makes every *subsequent* execCommand('bold')/('italic') on ANY box on the
    // page emit <span style="font-weight:bold"> instead of <b>. sanitizeInline
    // only keeps `color` off a span, so that bold silently vanishes on save.
    // Turn it back off immediately so Bold/Italic keep producing <b>/<i>.
    document.execCommand('styleWithCSS', false, false)
    emit()
  }

  const handleOpenLinkPopover = (e) => {
    e.preventDefault()
    captureSelection()
    if (!savedRange.current) return
    // Prefill with the existing href if the caret/selection is already inside a link.
    let node = savedRange.current.startContainer
    if (node.nodeType !== 1) node = node.parentElement
    const existingA = node?.closest?.('a')
    setLinkUrl(existingA?.getAttribute('href') || '')
    setLinkPopoverOpen(true)
  }

  const applyLink = () => {
    const url = linkUrl.trim()
    if (!url || !savedRange.current) { setLinkPopoverOpen(false); return }
    ref.current?.focus()
    const sel = window.getSelection()
    sel.removeAllRanges()
    sel.addRange(savedRange.current)
    document.execCommand('createLink', false, url)
    // execCommand only sets href — target/rel get added on save via
    // sanitizeInline, but setting them now too keeps the live editor preview
    // opening links the same way.
    const anchorNode = sel.anchorNode
    const a = (anchorNode?.nodeType === 1 ? anchorNode : anchorNode?.parentElement)?.closest?.('a')
    if (a) { a.setAttribute('target', '_blank'); a.setAttribute('rel', 'noopener noreferrer') }
    setLinkPopoverOpen(false)
    setLinkUrl('')
    emit()
  }

  const removeLink = (e) => {
    e.preventDefault()
    if (!savedRange.current) return
    ref.current?.focus()
    const sel = window.getSelection()
    sel.removeAllRanges()
    sel.addRange(savedRange.current)
    document.execCommand('unlink')
    setLinkPopoverOpen(false)
    setLinkUrl('')
    emit()
  }

  const onKeyDown = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'b') { e.preventDefault(); ref.current?.focus(); document.execCommand('bold'); emit(); return }
    if ((e.metaKey || e.ctrlKey) && e.key === 'i') { e.preventDefault(); ref.current?.focus(); document.execCommand('italic'); emit(); return }
    if (e.key !== 'Enter') return
    e.preventDefault()
    // execCommand('insertLineBreak') is unreliable across browsers — insert a
    // <br> directly via the Range API instead.
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return
    const range = sel.getRangeAt(0)
    range.deleteContents()
    const br = document.createElement('br')
    range.insertNode(br)
    if (br.nextSibling) {
      range.setStartAfter(br)
      range.setEndAfter(br)
    } else {
      // A trailing <br> with nothing after it doesn't render as a new line in
      // some browsers — anchor the caret with a zero-width space (stripped on render).
      const zwsp = document.createTextNode('​')
      br.after(zwsp)
      range.setStart(zwsp, 1)
      range.setEnd(zwsp, 1)
    }
    range.collapse(true)
    sel.removeAllRanges()
    sel.addRange(range)
    emit()
  }

  // Pasted content otherwise carries the source's own fonts/colors/markup —
  // force plain text so it always matches whatever's typed directly here.
  // Newlines render correctly because the box uses white-space: pre-wrap.
  const onPaste = (e) => {
    e.preventDefault()
    const text = e.clipboardData.getData('text/plain')
    document.execCommand('insertText', false, text)
    emit()
  }

  const toolBtn = { border: 'none', borderRadius: '4px', padding: '2px 9px', fontSize: '12px', cursor: 'pointer', background: 'var(--ed-input-bg)', color: 'var(--ed-text-sub)', fontFamily: 'inherit', lineHeight: 1.6 }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
        <button type="button" title="Bold (selection)" onMouseDown={handleBold} style={{ ...toolBtn, fontWeight: 700 }}>B</button>
        <button type="button" title="Italic (selection)" onMouseDown={handleItalic} style={{ ...toolBtn, fontStyle: 'italic' }}>I</button>
        <label title="Color (selection)" onMouseDown={captureSelection} style={{ ...toolBtn, position: 'relative', width: '27px', height: '23px', flexShrink: 0, boxSizing: 'border-box', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontWeight: 700, color: '#e53e3e', userSelect: 'none', WebkitUserSelect: 'none' }}>A</span>
          {/* The label has an explicit fixed size (not sized by its children) so this
              input's 100%/100% resolves reliably — percentage sizing against an
              auto-sized flex parent is inconsistent across browsers (notably Safari),
              and without it the input can fall back to its native intrinsic size and
              overlap neighboring toolbar controls. */}
          <input
            type="color"
            onMouseDown={captureSelection}
            onChange={handleColorChange}
            style={{ position: 'absolute', opacity: 0, left: 0, top: 0, width: '100%', height: '100%', display: 'block', cursor: 'pointer', padding: 0, margin: 0, border: 'none' }}
          />
        </label>
        <input
          type="text"
          placeholder="#000000"
          onMouseDown={captureSelection}
          onKeyDown={e => e.stopPropagation()}
          onChange={e => {
            // Accept "000000", "#000000", "#000" or "000" — normalize the leading #.
            let v = e.target.value.trim()
            if (/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(v)) v = '#' + v
            if (/^#[0-9a-fA-F]{3}$/.test(v)) {
              // Expand shorthand 3-digit hex ("#abc") to the canonical 6-digit
              // form ("#aabbcc") before applying — keeps every stored color in
              // this codebase in the same 6-digit format, not a mix of both.
              v = '#' + v.slice(1).split('').map(c => c + c).join('')
            }
            if (/^#([0-9a-fA-F]{6})$/.test(v)) handleColorChange({ target: { value: v } })
          }}
          style={{ width: '68px', border: '1px solid var(--ed-input-border)', borderRadius: '4px', padding: '2px 5px', fontSize: '11px', fontFamily: 'monospace', background: 'var(--ed-input-bg)', color: 'var(--ed-text)', outline: 'none' }}
        />
        <button type="button" title="Link (selection)" onMouseDown={handleOpenLinkPopover} style={{ ...toolBtn }}>🔗</button>
        <button type="button" title="Remove link (selection)" onMouseDown={removeLink} style={{ ...toolBtn }}>🔗✕</button>
      </div>
      {linkPopoverOpen && (
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          <input
            type="text"
            autoFocus
            placeholder="https://example.com"
            value={linkUrl}
            onChange={e => setLinkUrl(e.target.value)}
            onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); applyLink() }; if (e.key === 'Escape') { e.preventDefault(); setLinkPopoverOpen(false) } }}
            style={{ flex: 1, border: '1px solid var(--ed-input-border)', borderRadius: '4px', padding: '3px 6px', fontSize: '11px', fontFamily: 'monospace', background: 'var(--ed-input-bg)', color: 'var(--ed-text)', outline: 'none' }}
          />
          <button type="button" onMouseDown={e => { e.preventDefault(); applyLink() }} style={{ ...toolBtn, background: '#0087ED', color: '#fff' }}>Apply</button>
          <button type="button" onMouseDown={e => { e.preventDefault(); setLinkPopoverOpen(false) }} style={toolBtn}>Cancel</button>
        </div>
      )}
      <div
        ref={initRef}
        contentEditable
        suppressContentEditableWarning
        onInput={emit}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        style={{ ...style, whiteSpace: 'pre-wrap', minHeight: multiline ? `${(rows || 3) * 22}px` : '20px', cursor: 'text' }}
      />
    </div>
  )
}

export function TextField({ label, value, onChange, size, onSize, weight, onWeight, color, onColor, font, onFont, italic, onItalic, multiline, rows, rich, sizePlaceholder, weightPlaceholder }) {
  const inp = { border: '1px solid var(--ed-input-border)', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', fontFamily: 'inherit', color: 'var(--ed-text)', background: 'var(--ed-input-bg)', outline: 'none', width: '100%', boxSizing: 'border-box', fontStyle: italic ? 'italic' : 'normal' }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', flex: 1, minWidth: '120px' }}>
      {label && <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ed-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</label>}
      {rich
        ? <RichTextEditable value={value} onChange={onChange} multiline={multiline} rows={rows} style={inp} />
        : multiline
          ? <textarea style={{ ...inp, resize: 'vertical' }} rows={rows || 3} value={value || ''} onChange={e => onChange(e.target.value)} />
          : <input style={inp} value={value || ''} onChange={e => onChange(e.target.value)} />
      }
      {(onSize || onWeight || onColor || onFont || onItalic) && (
        <div style={{ display: 'flex', gap: '5px', alignItems: 'center', flexWrap: 'wrap' }}>
          {onSize && (
            <>
              <input
                list="font-size-presets"
                value={size || ''}
                onChange={e => onSize(e.target.value)}
                placeholder={sizePlaceholder || 'Size'}
                style={{ ...ctrlSel, width: '72px', color: size ? 'var(--ed-text)' : 'var(--ed-text-xmuted)' }}
              />
              <datalist id="font-size-presets">
                {FONT_SIZES.filter(s => s).map(sz => <option key={sz} value={sz} />)}
              </datalist>
            </>
          )}
          {onWeight && (
            <select value={weight || ''} onChange={e => onWeight(e.target.value)} style={{ ...ctrlSel, color: weight ? 'var(--ed-text)' : 'var(--ed-text-xmuted)' }}>
              <option value="">{weightPlaceholder || 'Weight'}</option>
              {FONT_WEIGHTS.filter(w => w.value).map(w => <option key={w.value} value={w.value}>{w.label}</option>)}
            </select>
          )}
          {onColor && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
              <label title="Text color" style={{ position: 'relative', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                <div style={{
                  width: '22px', height: '22px', borderRadius: '4px', flexShrink: 0,
                  background: color || '#111111',
                  border: '1.5px solid var(--ed-input-border)',
                  boxSizing: 'border-box',
                }} />
                <input
                  type="color"
                  value={color || '#111111'}
                  onChange={e => onColor(e.target.value)}
                  style={{ position: 'absolute', opacity: 0, width: '22px', height: '22px', cursor: 'pointer', left: 0, top: 0, padding: 0, border: 'none' }}
                />
              </label>
              <input
                type="text"
                value={color || ''}
                onChange={e => {
                  // Accept hex typed with or without the leading '#' (e.g. "000000").
                  // The field is controlled, so rejecting the keystroke would make
                  // typed characters vanish — normalize by prepending '#' instead.
                  let v = e.target.value.trim()
                  if (v && !v.startsWith('#')) v = '#' + v
                  if (v === '#') v = ''
                  if (v === '' || /^#[0-9a-fA-F]{0,6}$/.test(v)) onColor(v)
                }}
                onBlur={e => { const v = e.target.value; if (v && !/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v)) onColor('') }}
                placeholder="#111111"
                style={{ width: '72px', border: '1px solid var(--ed-input-border)', borderRadius: '4px', padding: '2px 5px', fontSize: '11px', fontFamily: 'monospace', background: 'var(--ed-input-bg)', color: 'var(--ed-text)', outline: 'none' }}
              />
              {color && (
                <button onClick={e => { e.preventDefault(); onColor('') }}
                  style={{ background: 'none', border: 'none', color: 'var(--ed-text-xmuted)', cursor: 'pointer', fontSize: '10px', padding: '0 2px', lineHeight: 1 }}>✕</button>
              )}
            </div>
          )}
          {onFont && (
            <select value={font || 'inherit'} onChange={e => onFont(e.target.value)} style={ctrlSel}>
              {FONT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          )}
          {onItalic && (
            <button
              type="button"
              onClick={() => onItalic(!italic)}
              title="Italic"
              style={{ ...ctrlSel, fontStyle: 'italic', fontWeight: 700, width: '26px', textAlign: 'center', background: italic ? 'var(--ed-text)' : 'var(--ed-input-bg)', color: italic ? 'var(--ed-bg)' : 'var(--ed-text)' }}
            >I</button>
          )}
        </div>
      )}
    </div>
  )
}

export function Field({ label, children }) {
  return (
    <div style={{display:'flex', flexDirection:'column', gap:'6px', flex:1, minWidth:'120px'}}>
      {label && <label style={{fontSize:'12px', fontWeight:500, color:'var(--ed-text-muted)'}}>{label}</label>}
      {children}
    </div>
  )
}

export function Row({ children }) {
  return <div style={{display:'flex', gap:'14px', flexWrap:'wrap'}}>{children}</div>
}

const SECTION_TYPE_COLOR = {
  'images':               '#e53935',
  'image-text':           '#f57c00',
  'image-text-carousel':  '#f9a825',
  'image-grid':           '#43a047',
  'text':                 '#1e88e5',
  'text-columns':         '#3949ab',
  'scroll-animation':     '#8e24aa',
  'model-viewer':         '#d81b60',
  'interactive':          '#0277bd',
  'tab-switcher':         '#00897b',
  'feature-tabs':         '#3949ab',
  'accordion':            '#f9a825',
  'image-tab':            '#00838f',
  'video-background':     '#7b1fa2',
  'annotation':           '#e53935',
  'full-image':           '#e53935',
  'icon-row':             '#43a047',
}

const SECTION_TYPE_LABEL = {
  'images':               'i',
  'image-text':           'it',
  'image-text-carousel':  'itc',
  'image-grid':           'ig',
  'text':                 't',
  'text-columns':         'tc',
  'scroll-animation':     's',
  'model-viewer':         'm',
  'interactive':          'lab',
  'tab-switcher':         'tab',
  'feature-tabs':         'ftab',
  'accordion':            'acc',
  'image-tab':            'itab',
  'video-background':     'vid',
  'annotation':           'ann',
  'full-image':           'fi',
  'icon-row':             'ico',
}

export function SectionDots({ section }) {
  const color = SECTION_TYPE_COLOR[section.type] || '#a1a1aa'
  const label = SECTION_TYPE_LABEL[section.type] || '?'
  return (
    <span style={{
      minWidth: '18px', height: '18px', borderRadius: '99px',
      background: color + '22', border: `1.5px solid ${color}`,
      color, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0, fontSize: '9px', fontWeight: 700, padding: '0 4px',
      letterSpacing: '0.02em', fontFamily: 'monospace',
    }}>{label}</span>
  )
}

export function Block({ label, children, onRemove, onDuplicate, onMoveUp, onMoveDown, hidden, onToggleHidden, collapsible = false, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)
  const btnStyle = { background:'none', border:'1px solid var(--ed-input-border)', color:'var(--ed-text-sub)', cursor:'pointer', padding:'3px 7px', borderRadius:'8px', lineHeight:1, fontSize:'12px' }
  return (
    <div style={{border:`1px solid ${hidden ? 'var(--ed-divider)' : 'var(--ed-block-border)'}`, borderRadius:'14px', padding:'18px', display:'flex', flexDirection:'column', gap:'14px', background:'var(--ed-block-bg)', opacity: hidden ? 0.5 : 1, transition:'opacity 0.15s'}}>
      <div className="ed-block-hd" style={{display:'flex', alignItems:'center', justifyContent:'space-between', gap:'8px'}}>
        <div style={{display:'flex', alignItems:'center', gap:'5px', minWidth:0}}>
          {onMoveUp && <button onClick={onMoveUp} style={btnStyle} title="Move up">↑</button>}
          {onMoveDown && <button onClick={onMoveDown} style={btnStyle} title="Move down">↓</button>}
          {collapsible && (
            <button onClick={() => setOpen(o => !o)} style={{...btnStyle, padding:'3px 6px'}} title={open ? 'Collapse' : 'Expand'}>
              <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" style={{display:'block', transform: open ? 'rotate(0deg)' : 'rotate(-90deg)', transition:'transform 0.15s'}}>
                <polygon points="1,2 9,2 5,8"/>
              </svg>
            </button>
          )}
          {label && <span style={{fontSize:'12px', fontWeight:600, color:'var(--ed-text-sub)', flexShrink:0}}>{label}</span>}
        </div>
        <div style={{display:'flex', alignItems:'center', gap:'5px', flexShrink:0}}>
          {onToggleHidden && (
            <button onClick={onToggleHidden} title={hidden ? 'Show block' : 'Hide block'} style={{...btnStyle, color: hidden ? 'var(--ed-accent)' : 'var(--ed-text-muted)'}}>
              {hidden ? (
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M1 8s3-5 7-5 7 5 7 5-3 5-7 5-7-5-7-5z"/><circle cx="8" cy="8" r="2.5"/><line x1="2" y1="2" x2="14" y2="14"/></svg>
              ) : (
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M1 8s3-5 7-5 7 5 7 5-3 5-7 5-7-5-7-5z"/><circle cx="8" cy="8" r="2.5"/></svg>
              )}
            </button>
          )}
          {onDuplicate && <button onClick={onDuplicate} style={{background:'none', border:'1px solid var(--ed-input-border)', color:'var(--ed-text-sub)', cursor:'pointer', fontSize:'11px', padding:'3px 8px', borderRadius:'8px', fontFamily:'inherit', fontWeight:500}}>Copy</button>}
          {onRemove && <button onClick={onRemove} style={{background:'none', border:'1px solid var(--ed-input-border)', color:'#f87171', cursor:'pointer', fontSize:'11px', padding:'3px 8px', borderRadius:'8px', fontFamily:'inherit', fontWeight:500}}>Remove</button>}
        </div>
      </div>
      {(!collapsible || open) && children}
    </div>
  )
}

export function Card({ id, title, children, collapsible, defaultOpen = true }) {
  const storageKey = collapsible ? `ed-card-open:${title}` : null
  const [open, setOpen] = useState(() => {
    if (!collapsible) return true
    const saved = safeGet(storageKey)
    return saved === null ? defaultOpen : saved === 'true'
  })
  const toggle = () => {
    if (!collapsible) return
    setOpen(o => { safeSet(storageKey, String(!o)); return !o })
  }
  return (
    <div id={id} style={{border:'1px solid var(--ed-card-border)', borderRadius:'18px', background:'var(--ed-card-bg)', flexShrink:0, overflow:'hidden', scrollMarginTop:'76px'}}>
      <div
        onClick={collapsible ? toggle : undefined}
        style={{padding:'14px 24px', borderBottom: open ? '1px solid var(--ed-divider)' : 'none', fontSize:'13px', fontWeight:600, color:'var(--ed-text)', display:'flex', alignItems:'center', justifyContent:'space-between', cursor: collapsible ? 'pointer' : 'default', userSelect:'none'}}
      >
        <span>{title}</span>
        {collapsible && <span style={{fontSize:'11px', color:'var(--ed-text-xmuted)', transition:'transform 0.2s', display:'inline-block', transform: open ? 'rotate(0deg)' : 'rotate(-90deg)'}}>▾</span>}
      </div>
      {open && <div style={{padding:'20px 24px', display:'flex', flexDirection:'column', gap:'18px'}}>{children}</div>}
    </div>
  )
}

// Compact On/Off switch used all over the per-page editors (Show Section,
// Inset Image, Hide on Mobile, ...) — was previously ~8 lines of duplicated
// inline-styled markup per toggle across pages; this is that markup once.
export function Toggle({ label, checked, onChange, onLabel = 'On', offLabel = 'Off', hint }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: hint ? '6px' : 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', background: 'var(--ed-head-bg)', borderRadius: '8px' }}>
        <span style={{ fontSize: '13px', color: 'var(--ed-text-sub)', flex: 1 }}>{label}</span>
        <button
          onClick={() => onChange(!checked)}
          style={{
            border: 'none', borderRadius: '20px', padding: '4px 16px', fontSize: '12px',
            cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600, transition: 'all 0.15s',
            background: checked ? '#111' : 'var(--ed-input-bg)', color: checked ? '#fff' : 'var(--ed-text-muted)',
          }}
        >{checked ? onLabel : offLabel}</button>
      </div>
      {hint && <div style={{ fontSize: '11px', color: 'var(--ed-text-xmuted)', padding: '0 2px' }}>{hint}</div>}
    </div>
  )
}

// Compact standalone visible/hidden pill for one row in a list (e.g. one
// project's "Visible"/"Hidden" state in the All Projects/Originals editor)
// — no wrapping background block, supports `disabled` (e.g. when hidden
// site-wide, so it can't be independently toggled here) and semantic
// green/red instead of Toggle's neutral black/gray.
export function TogglePill({ checked, onChange, onLabel = 'Visible', offLabel = 'Hidden', disabled }) {
  return (
    <button
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      style={{
        padding: '4px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: 600,
        cursor: disabled ? 'default' : 'pointer', fontFamily: 'inherit', border: 'none',
        background: checked ? '#e6f4ea' : '#fff0f0', color: checked ? '#1e8e3e' : '#e53e3e',
      }}
    >{checked ? onLabel : offLabel}</button>
  )
}

// Sticky row of section chips under the topbar — click to jump to that Card,
// active section highlighted as it scrolls into view. Figma/Framer-style
// wayfinding for editor pages with many Card sections (Home, Project, ...).
// `sections` is [{ id, label }]; ids must match the target Card's `id` prop.
export function EditorSectionNav({ sections }) {
  const [active, setActive] = useState(sections[0]?.id)

  useEffect(() => {
    const els = sections.map(s => document.getElementById(s.id)).filter(Boolean)
    if (!els.length) return
    const onScroll = () => {
      const trigger = 120
      let current = els[0].id
      for (const el of els) {
        if (el.getBoundingClientRect().top <= trigger) current = el.id
      }
      setActive(current)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [sections])

  return (
    <div style={{
      display: 'flex', gap: '6px', overflowX: 'auto', padding: '10px 0',
      position: 'sticky', top: 0, zIndex: 20, background: 'var(--ed-bg)',
      borderBottom: '1px solid var(--ed-topbar-border)', marginBottom: '4px',
    }}>
      {sections.map(s => {
        const isActive = active === s.id
        return (
          <a
            key={s.id}
            href={`#${s.id}`}
            style={{
              flexShrink: 0, fontSize: '12px', fontWeight: 600, padding: '6px 14px', borderRadius: '20px',
              textDecoration: 'none', whiteSpace: 'nowrap', transition: 'all 0.15s',
              background: isActive ? 'var(--ed-nav-active-bg)' : 'var(--ed-input-bg)',
              color: isActive ? 'var(--ed-nav-active-text)' : 'var(--ed-text-muted)',
              border: '1px solid ' + (isActive ? 'transparent' : 'var(--ed-input-border)'),
            }}
          >{s.label}</a>
        )
      })}
    </div>
  )
}

// ── Image Picker ──────────────────────────────────────────────
const CROP_RATIO_PRESETS = [
  { label: '2:1', value: '2/1', num: 2 },
  { label: '16:9', value: '16/9', num: 16/9 },
  { label: '3:2', value: '3/2', num: 3/2 },
  { label: '4:3', value: '4/3', num: 4/3 },
  { label: '5:4', value: '5/4', num: 5/4 },
  { label: '1:1', value: '1/1', num: 1 },
  { label: '4:5', value: '4/5', num: 4/5 },
  { label: '3:4', value: '3/4', num: 3/4 },
  { label: '9:16', value: '9/16', num: 9/16 },
]

const parseRatioStr = (s) => {
  if (!s) return null
  s = s.trim()
  if (s.includes(':')) { const [a,b] = s.split(':').map(Number); return (a && b) ? a/b : null }
  if (s.includes('/')) { const [a,b] = s.split('/').map(Number); return (a && b) ? a/b : null }
  const n = parseFloat(s); return isFinite(n) && n > 0 ? n : null
}

const ratioNumToStr = (n) => {
  if (!n) return '16/9'
  const preset = CROP_RATIO_PRESETS.find(p => Math.abs(p.num - n) < 0.005)
  if (preset) return preset.value
  return String(Math.round(n * 1000) / 1000)
}

// Edge handles are listed first so corner handles paint last (on top),
// winning hit-testing at any overlap — corners are the primary drag target.
const HANDLES = [
  { id: 't',  x: 0.5, y: 0,   cursor: 'ns-resize',   corner: false },
  { id: 'r',  x: 1,   y: 0.5, cursor: 'ew-resize',   corner: false },
  { id: 'b',  x: 0.5, y: 1,   cursor: 'ns-resize',   corner: false },
  { id: 'l',  x: 0,   y: 0.5, cursor: 'ew-resize',   corner: false },
  { id: 'tl', x: 0,   y: 0,   cursor: 'nwse-resize', corner: true },
  { id: 'tr', x: 1,   y: 0,   cursor: 'nesw-resize', corner: true },
  { id: 'br', x: 1,   y: 1,   cursor: 'nwse-resize', corner: true },
  { id: 'bl', x: 0,   y: 1,   cursor: 'nesw-resize', corner: true },
]

export function CropEditor({ src, initialRatio, initialCrop, onSave, onClose, mediaType = 'image' }) {
  const outerRef = useRef(null)
  const [naturalSize, setNaturalSize] = useState(null)
  // box: x1,y1,x2,y2 as % of image dimensions (0–100). Default = full image.
  const [box, setBox] = useState(() => {
    if (initialCrop && initialCrop.x1 !== undefined) return initialCrop
    return { x1: 0, y1: 0, x2: 100, y2: 100 }
  })
  const [outerW, setOuterW] = useState(540)
  const ia = useRef({ type: null })
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    const el = outerRef.current; if (!el) return
    const obs = new ResizeObserver(([e]) => setOuterW(e.contentRect.width))
    obs.observe(el); return () => obs.disconnect()
  }, [])

  const imgRatio = naturalSize ? naturalSize.w / naturalSize.h : (parseRatioStr(initialRatio) || 16/9)
  const PREVIEW_H = 280

  let rW, rH
  if (outerW / PREVIEW_H > imgRatio) { rH = PREVIEW_H; rW = rH * imgRatio }
  else { rW = outerW; rH = rW / imgRatio }
  const imgL = (outerW - rW) / 2
  const imgT = (PREVIEW_H - rH) / 2

  // Crop frame in preview pixels
  const frameL = imgL + rW * box.x1 / 100
  const frameT = imgT + rH * box.y1 / 100
  const frameW = rW * (box.x2 - box.x1) / 100
  const frameH = rH * (box.y2 - box.y1) / 100
  const frameR = frameL + frameW
  const frameB = frameT + frameH

  const getPos = (e) => e.touches ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : { x: e.clientX, y: e.clientY }

  const startFrame = (e) => {
    if (e.button != null && e.button !== 0) return
    const pos = getPos(e)
    ia.current = { type: 'frame', sx: pos.x, sy: pos.y, box: { ...box } }
    setDragging(true); e.preventDefault(); e.stopPropagation()
  }

  const startHandle = (handle, e) => {
    if (e.button != null && e.button !== 0) return
    const pos = getPos(e)
    ia.current = { type: 'handle', handle, sx: pos.x, sy: pos.y, box: { ...box } }
    setDragging(true); e.preventDefault(); e.stopPropagation()
  }

  const onMove = useCallback((e) => {
    const state = ia.current; if (!state.type) return
    if (e.cancelable) e.preventDefault()
    const pos = getPos(e)
    const dx = (pos.x - state.sx) / rW * 100
    const dy = (pos.y - state.sy) / rH * 100
    const b = state.box
    const MIN = 1

    if (state.type === 'frame') {
      const w = b.x2 - b.x1, h = b.y2 - b.y1
      const nx1 = Math.max(0, Math.min(100 - w, b.x1 + dx))
      const ny1 = Math.max(0, Math.min(100 - h, b.y1 + dy))
      setBox({ x1: nx1, y1: ny1, x2: nx1 + w, y2: ny1 + h })
    } else {
      const h = state.handle
      let { x1, y1, x2, y2 } = b
      if (h.includes('l')) x1 = Math.max(0, Math.min(x2 - MIN, b.x1 + dx))
      if (h.includes('r')) x2 = Math.min(100, Math.max(x1 + MIN, b.x2 + dx))
      if (h.includes('t')) y1 = Math.max(0, Math.min(y2 - MIN, b.y1 + dy))
      if (h.includes('b')) y2 = Math.min(100, Math.max(y1 + MIN, b.y2 + dy))
      setBox({ x1, y1, x2, y2 })
    }
  }, [rW, rH])

  const onUp = useCallback(() => { ia.current = { type: null }; setDragging(false) }, [])

  useEffect(() => {
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onUp)
    }
  }, [onMove, onUp])

  const isDefault = box.x1 < 0.5 && box.y1 < 0.5 && box.x2 > 99.5 && box.y2 > 99.5

  const calcRatio = () => {
    if (!naturalSize) return null
    return (naturalSize.w * (box.x2 - box.x1) / 100) / (naturalSize.h * (box.y2 - box.y1) / 100)
  }

  const hStyle = (h) => {
    const size = h.corner ? 16 : 10
    return {
      position: 'absolute',
      left: frameL + h.x * frameW, top: frameT + h.y * frameH,
      transform: 'translate(-50%,-50%)',
      width: size, height: size, background: '#fff',
      border: '2px solid rgba(0,0,0,0.4)', borderRadius: h.corner ? 4 : 2,
      cursor: h.cursor, zIndex: h.corner ? 13 : 12,
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: 'var(--ed-card-bg)', borderRadius: '16px', width: '580px', maxWidth: '100%', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.22)', overflow: 'hidden', maxHeight: '92vh' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--ed-divider)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--ed-text-muted)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/></svg>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ed-text)' }}>{mediaType === 'video' ? 'Crop Video' : 'Crop Image'}</span>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--ed-text-xmuted)', fontSize: '18px', lineHeight: 1, padding: '0 2px' }}>✕</button>
        </div>

        {/* Preview */}
        <div ref={outerRef}
          style={{ position: 'relative', width: '100%', height: `${PREVIEW_H}px`, background: '#111', flexShrink: 0, userSelect: 'none', touchAction: 'none', overflow: 'hidden' }}
        >
          {/* Full media dimmed */}
          {mediaType === 'video' ? (
            <video src={src} autoPlay muted loop playsInline
              onLoadedMetadata={e => setNaturalSize({ w: e.target.videoWidth, h: e.target.videoHeight })}
              style={{ position: 'absolute', left: imgL, top: imgT, width: rW, height: rH, display: 'block', pointerEvents: 'none', opacity: 0.35 }}
            />
          ) : (
            <img src={src}
              onLoad={e => setNaturalSize({ w: e.target.naturalWidth, h: e.target.naturalHeight })}
              style={{ position: 'absolute', left: imgL, top: imgT, width: rW, height: rH, display: 'block', pointerEvents: 'none', opacity: 0.35 }}
              alt="" draggable={false}
            />
          )}

          {/* Dark overlays outside crop box */}
          {[
            { left: 0, top: 0, width: frameL, height: PREVIEW_H },
            { left: frameR, top: 0, width: outerW - frameR, height: PREVIEW_H },
            { left: frameL, top: 0, width: frameW, height: frameT },
            { left: frameL, top: frameB, width: frameW, height: PREVIEW_H - frameB },
          ].map((s, i) => (
            <div key={i} style={{ position: 'absolute', background: 'rgba(0,0,0,0.45)', pointerEvents: 'none', ...s }} />
          ))}

          {/* Crop frame — draggable */}
          <div
            onMouseDown={startFrame}
            onTouchStart={startFrame}
            style={{ position: 'absolute', left: frameL, top: frameT, width: frameW, height: frameH, overflow: 'hidden', cursor: dragging ? 'grabbing' : 'grab', boxSizing: 'border-box', border: '2px solid rgba(255,255,255,0.85)', borderRadius: 3 }}
          >
            {mediaType === 'video' ? (
              <video src={src} autoPlay muted loop playsInline style={{ position: 'absolute', left: imgL - frameL, top: imgT - frameT, width: rW, height: rH, display: 'block', pointerEvents: 'none' }} />
            ) : (
              <img src={src} style={{ position: 'absolute', left: imgL - frameL, top: imgT - frameT, width: rW, height: rH, display: 'block', pointerEvents: 'none' }} alt="" draggable={false} />
            )}
            <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} viewBox="0 0 3 3" preserveAspectRatio="none">
              <line x1="1" y1="0" x2="1" y2="3" stroke="rgba(255,255,255,0.2)" strokeWidth="0.025" vectorEffect="non-scaling-stroke"/>
              <line x1="2" y1="0" x2="2" y2="3" stroke="rgba(255,255,255,0.2)" strokeWidth="0.025" vectorEffect="non-scaling-stroke"/>
              <line x1="0" y1="1" x2="3" y2="1" stroke="rgba(255,255,255,0.2)" strokeWidth="0.025" vectorEffect="non-scaling-stroke"/>
              <line x1="0" y1="2" x2="3" y2="2" stroke="rgba(255,255,255,0.2)" strokeWidth="0.025" vectorEffect="non-scaling-stroke"/>
            </svg>
          </div>

          {/* Resize handles */}
          {HANDLES.map(h => (
            <div key={h.id} style={hStyle(h)}
              onMouseDown={e => startHandle(h.id, e)}
              onTouchStart={e => startHandle(h.id, e)}
            />
          ))}
        </div>
        <p style={{ fontSize: '11px', color: 'var(--ed-text-xmuted)', textAlign: 'center', padding: '6px 0 6px', flexShrink: 0 }}>
          Drag inside the frame to move · Drag handles to crop
        </p>

        <div style={{ padding: '0 18px 12px', display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
          <span style={{ fontSize: '11px', color: 'var(--ed-text-muted)', flexShrink: 0 }}>Size</span>
          <input
            type="range" min="1" max="100"
            value={Math.round(Math.max(box.x2 - box.x1, box.y2 - box.y1))}
            onChange={e => {
              const size = Number(e.target.value)
              const cx = (box.x1 + box.x2) / 2, cy = (box.y1 + box.y2) / 2
              const curSize = Math.max(box.x2 - box.x1, box.y2 - box.y1) || 1
              const scale = size / curSize
              const w = Math.min(100, (box.x2 - box.x1) * scale)
              const h = Math.min(100, (box.y2 - box.y1) * scale)
              const nx1 = Math.max(0, Math.min(100 - w, cx - w / 2))
              const ny1 = Math.max(0, Math.min(100 - h, cy - h / 2))
              setBox({ x1: nx1, y1: ny1, x2: nx1 + w, y2: ny1 + h })
            }}
            style={{ flex: 1 }}
          />
          <span style={{ fontSize: '11px', color: 'var(--ed-text-xmuted)', width: '32px', textAlign: 'right', flexShrink: 0 }}>{Math.round(Math.max(box.x2 - box.x1, box.y2 - box.y1))}%</span>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px', borderTop: '1px solid var(--ed-divider)', flexShrink: 0 }}>
          <button
            onClick={() => setBox({ x1: 0, y1: 0, x2: 100, y2: 100 })}
            style={{ fontSize: '12px', border: 'none', background: 'none', color: isDefault ? 'var(--ed-text-xmuted)' : 'var(--ed-text-muted)', cursor: isDefault ? 'default' : 'pointer', fontFamily: 'inherit', padding: '6px 0' }}
          >Reset</button>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={onClose} style={{ fontSize: '12px', border: '1px solid var(--ed-input-border)', background: 'var(--ed-input-bg)', color: 'var(--ed-text-sub)', borderRadius: '8px', padding: '7px 16px', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
            <button
              onClick={() => {
                const imgR = naturalSize ? naturalSize.w / naturalSize.h : null
                const r = imgR ? imgR * (box.x2 - box.x1) / (box.y2 - box.y1) : null
                const crop = isDefault ? null : { ...box, ...(imgR ? { imgRatio: imgR } : {}) }
                onSave(crop, r ? ratioNumToStr(r) : null)
                onClose()
              }}
              style={{ fontSize: '12px', border: 'none', background: 'var(--ed-text)', color: 'var(--ed-bg)', borderRadius: '8px', padding: '7px 20px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}
            >Apply</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// Two modes:
//   display — shows only selected thumbnails + "Edit" button
//   picking — shows full grid to toggle; "Done" collapses back
export function ImagePicker({ value = [], onChange, images, basePath, label, uploadUrl, onRefresh, ratio, cropData = {}, onCropChange, onRatioChange }) {
  const [picking, setPicking] = useState(false)
  const [dims, setDims] = useState({})
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [targetNum, setTargetNum] = useState('')
  const [cropEditorFor, setCropEditorFor] = useState(null)
  const [hoverThumb, setHoverThumb] = useState(null)
  const fileInputRef = useRef(null)

  const getNum  = (fname) => parseInt(fname)
  const getFile = (num)   => images.find(f => f.name.startsWith(String(num).padStart(2, '0')))

  const nextAvailable = () => {
    const nums = images.map(f => parseInt(f.name)).filter(n => !isNaN(n))
    return nums.length > 0 ? Math.max(...nums) + 1 : 1
  }

  const toggle = (num) => {
    if (value.includes(num)) onChange(value.filter(n => n !== num))
    else onChange([...value, num])
  }

  const doUpload = useCallback(async (file) => {
    if (!uploadUrl || !file) return
    setUploading(true)
    const reader = new FileReader()
    reader.onload = async (ev) => {
      const data = ev.target.result.split(',')[1]
      const body = { name: file.name, data }
      const num = targetNum !== '' ? parseInt(targetNum) : undefined
      if (num != null && !isNaN(num)) body.targetNum = num
      try {
        const res = await fetch(uploadUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const d = await res.json()
        if (d.ok) {
          await onRefresh?.()
          if (!value.includes(d.num)) onChange([...value, d.num])
          setTargetNum('')
        }
      } finally {
        setUploading(false)
      }
    }
    reader.readAsDataURL(file)
  }, [uploadUrl, onRefresh, onChange, value, targetNum])

  const onDrop = useCallback((e) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) doUpload(file)
  }, [doUpload])

  const labelEl = label && (
    <label style={{fontSize:'11px', fontWeight:600, color:'var(--ed-text-muted)', textTransform:'uppercase', letterSpacing:'0.06em'}}>
      {label}
    </label>
  )

  const btnStyle = (primary) => ({
    padding:'5px 12px', borderRadius:'6px', cursor:'pointer', fontFamily:'inherit',
    fontSize:'12px', border: primary ? 'none' : '1px solid var(--ed-input-border)',
    background: primary ? '#0087ED' : 'var(--ed-input-bg)',
    color: primary ? '#fff' : 'var(--ed-text-sub)',
  })

  // ── Picking mode: full grid ──
  if (picking) {
    return (
      <div style={{display:'flex', flexDirection:'column', gap:'10px'}}>
        {labelEl}
        <div style={{display:'flex', flexWrap:'wrap', gap:'6px'}}>
          {images.map(f => {
            const num = getNum(f.name)
            const idx = value.indexOf(num)
            const selected = idx !== -1
            return (
              <div
                key={f.name}
                onClick={() => toggle(num)}
                title={`${f.name} · ${f.size}`}
                style={{
                  position:'relative', cursor:'pointer', borderRadius:'8px', overflow:'hidden', flexShrink:0,
                  outline: selected ? '2.5px solid #0087ED' : '2px solid var(--ed-badge-border)',
                  outlineOffset:'1px', transition:'outline 0.1s',
                }}
              >
                <img src={`${basePath}/${f.name}`} style={{width:'80px', height:'60px', objectFit:'cover', display:'block'}} alt={f.name} />
                <div style={{position:'absolute', bottom:0, left:0, right:0, background:'rgba(0,0,0,0.45)', color:'#fff', fontSize:'9px', textAlign:'center', padding:'2px 0', lineHeight:1.4}}>
                  {num}
                </div>
                {selected && (
                  <div style={{position:'absolute', top:'4px', right:'4px', background:'#0087ED', color:'#fff', borderRadius:'50%', width:'18px', height:'18px', fontSize:'10px', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, boxShadow:'0 1px 3px rgba(0,0,0,0.3)'}}>
                    {idx + 1}
                  </div>
                )}
              </div>
            )
          })}

          {/* Use a placeholder instead of a real image — shows on the editor AND the live site */}
          <div
            onClick={() => toggle(PLACEHOLDER_IMG)}
            title="Use a placeholder (no real image yet)"
            style={{
              position:'relative', cursor:'pointer', borderRadius:'8px', overflow:'hidden', flexShrink:0,
              width:'80px', height:'60px', background:'#e8e8e8',
              display:'flex', alignItems:'center', justifyContent:'center',
              outline: value.includes(PLACEHOLDER_IMG) ? '2.5px solid #0087ED' : '2px solid var(--ed-badge-border)',
              outlineOffset:'1px', transition:'outline 0.1s',
            }}
          >
            <span style={{fontSize:'9px', color:'var(--ed-text-xmuted)', textAlign:'center', lineHeight:1.3, padding:'0 4px'}}>Placeholder</span>
            {value.includes(PLACEHOLDER_IMG) && (
              <div style={{position:'absolute', top:'4px', right:'4px', background:'#0087ED', color:'#fff', borderRadius:'50%', width:'18px', height:'18px', fontSize:'10px', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, boxShadow:'0 1px 3px rgba(0,0,0,0.3)'}}>
                {value.indexOf(PLACEHOLDER_IMG) + 1}
              </div>
            )}
          </div>

          {/* Upload drop zone */}
          {uploadUrl && (
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => !uploading && fileInputRef.current?.click()}
              style={{
                width:'80px', height:'60px', borderRadius:'8px', flexShrink:0,
                border: `2px dashed ${dragging ? '#0087ED' : 'var(--ed-input-border)'}`,
                background: dragging ? '#e8f4ff' : 'var(--ed-input-bg)',
                display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
                cursor: uploading ? 'wait' : 'pointer', gap:'2px', transition:'all 0.15s',
              }}
            >
              <span style={{fontSize:'18px', color: dragging ? '#0087ED' : 'var(--ed-text-xmuted)', lineHeight:1}}>
                {uploading ? '...' : '+'}
              </span>
              <span style={{fontSize:'8px', color:'var(--ed-text-xmuted)', textAlign:'center', lineHeight:1.3}}>
                {uploading ? 'Uploading...' : 'Upload'}
              </span>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/gif,image/webp,image/png,image/jpeg,image/svg+xml"
                style={{display:'none'}}
                onChange={e => { const f = e.target.files[0]; if (f) doUpload(f); e.target.value = '' }}
              />
            </div>
          )}
        </div>

        {/* Target number input for hover/mobile folders */}
        {uploadUrl && (
          <div style={{display:'flex', alignItems:'center', gap:'6px'}}>
            <span style={{fontSize:'11px', color:'var(--ed-text-xmuted)'}}>Save #</span>
            <input
              type="number"
              min="1"
              value={targetNum}
              onChange={e => setTargetNum(e.target.value)}
              placeholder={`Auto (${nextAvailable()})`}
              style={{width:'90px', padding:'3px 8px', border:'1px solid var(--ed-input-border)', borderRadius:'6px', fontSize:'12px', fontFamily:'inherit', background:'var(--ed-input-bg)', color:'var(--ed-text)', outline:'none'}}
            />
            <span style={{fontSize:'10px', color:'var(--ed-text-xmuted)'}}>Leave blank for auto</span>
          </div>
        )}

        <div style={{display:'flex', gap:'6px', alignItems:'center'}}>
          <button style={btnStyle(true)} onClick={() => setPicking(false)}>Done</button>
          {value.length > 0 && (
            <span style={{fontSize:'11px', color:'#0087ED'}}>{value.length} selected</span>
          )}
        </div>
      </div>
    )
  }

  // ── Display mode: selected thumbnails only ──
  const cropEditorFile = cropEditorFor != null ? getFile(cropEditorFor) : null
  return (
    <div style={{display:'flex', flexDirection:'column', gap:'8px'}}>
      {cropEditorFor != null && cropEditorFile && (
        <CropEditor
          src={`${basePath}/${cropEditorFile.name}`}
          initialRatio={ratio || '16/9'}
          initialCrop={cropData[cropEditorFor]}
          onSave={(crop, newRatio) => {
            onCropChange?.(cropEditorFor, crop)
            if (newRatio && newRatio !== (ratio || '16/9')) onRatioChange?.(newRatio)
          }}
          onClose={() => setCropEditorFor(null)}
        />
      )}
      {labelEl}
      <div style={{display:'flex', gap:'6px', alignItems:'flex-start', flexWrap:'wrap'}}>
        {value.length > 0 ? (
          <>
            {value.map((num, idx) => {
              if (num === PLACEHOLDER_IMG) return (
                <div key={num} style={{display:'flex', flexDirection:'column', alignItems:'center', gap:'2px', flexShrink:0}}>
                  <div style={{position:'relative'}}>
                    <div style={{width:'96px', height:'72px', borderRadius:'8px', background:'#e8e8e8', display:'flex', alignItems:'center', justifyContent:'center'}}>
                      <span style={{fontSize:'9px', color:'var(--ed-text-xmuted)'}}>Placeholder</span>
                    </div>
                    <button
                      onClick={() => onChange(value.filter(n => n !== num))}
                      style={{position:'absolute', top:'4px', right:'4px', width:'16px', height:'16px', borderRadius:'50%', border:'none', background:'rgba(0,0,0,0.55)', color:'#fff', fontSize:'9px', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', padding:0, lineHeight:1}}
                    >✕</button>
                  </div>
                </div>
              )
              const file = getFile(num)
              if (!file) return (
                <div key={num} style={{display:'flex', flexDirection:'column', alignItems:'center', gap:'2px', flexShrink:0}}>
                  <div style={{position:'relative'}}>
                    <div style={{width:'96px', height:'72px', borderRadius:'8px', border:'1px dashed #e53e3e', background:'rgba(229,62,62,0.08)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', color:'#e53e3e', fontSize:'9px', textAlign:'center', lineHeight:1.3, gap:'2px', padding:'2px', boxSizing:'border-box'}}>
                      <span style={{fontSize:'14px'}}>⚠</span>
                      <span>#{num} missing</span>
                    </div>
                    <button
                      onClick={() => onChange(value.filter(n => n !== num))}
                      title="Remove dead reference"
                      style={{position:'absolute', top:'4px', right:'4px', width:'16px', height:'16px', borderRadius:'50%', border:'none', background:'#e53e3e', color:'#fff', fontSize:'9px', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', padding:0, lineHeight:1}}
                    >✕</button>
                  </div>
                </div>
              )
              const hasCrop = !!cropData[num]
              const isHovered = hoverThumb === num
              return (
                <div key={num}
                  style={{display:'flex', flexDirection:'column', alignItems:'center', gap:'2px', flexShrink:0}}
                  onMouseEnter={() => setHoverThumb(num)}
                  onMouseLeave={() => setHoverThumb(null)}
                >
                  <div style={{position:'relative'}}>
                    <img
                      src={`${basePath}/${file.name}`}
                      style={{width:'96px', height:'72px', objectFit:'cover', borderRadius:'8px', display:'block', border: hasCrop ? '1.5px solid var(--ed-accent)' : '1px solid var(--ed-badge-border)'}}
                      alt={file.name}
                      onLoad={e => setDims(d => ({...d, [num]: {w: e.target.naturalWidth, h: e.target.naturalHeight}}))}
                    />
                    {/* Order badge */}
                    <div style={{position:'absolute', bottom:0, left:0, right:0, background:'rgba(0,0,0,0.42)', color:'#fff', fontSize:'9px', textAlign:'center', padding:'2px 0', lineHeight:1.4, borderRadius:'0 0 7px 7px', pointerEvents:'none'}}>
                      {idx + 1}
                    </div>
                    {/* Remove button */}
                    <button
                      onClick={() => onChange(value.filter(n => n !== num))}
                      style={{position:'absolute', top:'4px', right:'4px', width:'16px', height:'16px', borderRadius:'50%', border:'none', background:'rgba(0,0,0,0.55)', color:'#fff', fontSize:'9px', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', padding:0, lineHeight:1, opacity: isHovered ? 1 : 0.7, transition:'opacity 0.12s'}}
                    >✕</button>
                    {/* Crop button — visible on hover */}
                    {onCropChange && (
                      <button
                        onClick={() => setCropEditorFor(num)}
                        title="Crop"
                        style={{
                          position:'absolute', bottom:'16px', left:'4px', width:'18px', height:'18px',
                          borderRadius:'4px', border:'none',
                          background: hasCrop ? 'var(--ed-accent)' : 'rgba(0,0,0,0.55)',
                          color:'#fff', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', padding:0,
                          opacity: isHovered || hasCrop ? 1 : 0, transition:'opacity 0.12s',
                        }}
                      >
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/>
                        </svg>
                      </button>
                    )}
                  </div>
                  {dims[num] && (
                    <span style={{fontSize:'8px', color:'var(--ed-text-xmuted)', whiteSpace:'nowrap', lineHeight:1}}>
                      {dims[num].w}×{dims[num].h}
                    </span>
                  )}
                </div>
              )
            })}
            <button style={{...btnStyle(false), alignSelf:'center'}} onClick={() => setPicking(true)}>Edit</button>
          </>
        ) : (
          <div
            onClick={() => setPicking(true)}
            title={ratio ? `Placeholder ratio: ${ratio}` : undefined}
            style={{
              width: ratio ? '140px' : '96px',
              aspectRatio: ratio || '4/3',
              borderRadius: '8px',
              border: 'none',
              background: 'var(--ed-badge-border)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', gap: '4px', color: 'var(--ed-text-xmuted)', fontSize: '11px', flexShrink: 0,
            }}
          >
            <span style={{ fontSize: '18px', lineHeight: 1 }}>+</span>
            <span>Add Image{ratio ? ` (${ratio})` : ''}</span>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Mobile Override Picker ──────────────────────────────────────
// Lets you pair a desktop image #N with ANY image already in the mobile
// folder (or upload a fresh one, freely numbered) — no forced number match.
// The pairing is stored explicitly as { desktopNum: mobileNum }, so desktop
// and mobile files can be uploaded/replaced/deleted independently without
// ever drifting apart. Also reads the old "same-number" array format used
// by existing content, so nothing already saved breaks.
function mobileOverrideMap(value) {
  if (!value) return {}
  if (Array.isArray(value)) return Object.fromEntries(value.map(n => [n, n]))
  return value
}

export function MobileOverridePicker({ desktopNums = [], value, onChange, images, basePath, uploadUrl, onRefresh, ratio, cropData = {}, onCropChange, icon = '📱', label = 'Mobile Override (optional) — pick any image from the mobile folder' }) {
  const [pickingFor, setPickingFor] = useState(null)
  const [uploadingFor, setUploadingFor] = useState(null)
  const [cropEditorFor, setCropEditorFor] = useState(null)
  const fileInputRef = useRef(null)

  const map = mobileOverrideMap(value)
  const getFile = (num) => images.find(f => f.name.startsWith(String(num).padStart(2, '0')))

  const pick = (desktopNum, mobileNum) => {
    onChange({ ...map, [desktopNum]: mobileNum })
    setPickingFor(null)
  }
  const remove = (desktopNum) => {
    const next = { ...map }
    delete next[desktopNum]
    onChange(next)
  }

  const doUpload = async (desktopNum, file) => {
    if (!file || !uploadUrl) return
    setUploadingFor(desktopNum)
    const reader = new FileReader()
    reader.onload = async (ev) => {
      const data = ev.target.result.split(',')[1]
      try {
        const res = await fetch(uploadUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: file.name, data }),
        })
        const d = await res.json()
        if (d.ok) {
          await onRefresh?.()
          pick(desktopNum, d.num)
        }
      } finally {
        setUploadingFor(null)
      }
    }
    reader.readAsDataURL(file)
  }

  const smallBtn = { border: 'none', borderRadius: '4px', padding: '3px 8px', fontSize: '10px', cursor: 'pointer', background: 'var(--ed-input-bg)', color: 'var(--ed-text-sub)', fontFamily: 'inherit' }

  if (desktopNums.length === 0) {
    return <div style={{ fontSize: '11px', color: 'var(--ed-text-xmuted)' }}>Pick a desktop image above first.</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ed-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {icon} {label}
      </label>
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
        {desktopNums.map(num => {
          const mobileNum = map[num]
          const has = mobileNum != null
          const file = has ? getFile(mobileNum) : null
          const picking = pickingFor === num
          const uploading = uploadingFor === num
          return (
            <div key={num} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
              <div style={{ fontSize: '10px', color: 'var(--ed-text-xmuted)' }}>Desktop #{num}</div>
              {picking ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '8px', border: '1px solid var(--ed-card-border)', borderRadius: '8px', background: 'var(--ed-card-bg)', maxWidth: '200px' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                    {images.map(f => {
                      const n = parseInt(f.name)
                      return (
                        <img
                          key={f.name}
                          src={`${basePath}/${f.name}`}
                          onClick={() => pick(num, n)}
                          alt=""
                          style={{ width: '40px', height: '32px', objectFit: 'cover', borderRadius: '4px', cursor: 'pointer', outline: mobileNum === n ? '2px solid #0087ED' : '1px solid var(--ed-input-border)', outlineOffset: '1px' }}
                        />
                      )
                    })}
                    {images.length === 0 && <span style={{ fontSize: '10px', color: 'var(--ed-text-xmuted)' }}>No mobile images yet</span>}
                    <div
                      onClick={() => pick(num, PLACEHOLDER_IMG)}
                      title="Use a placeholder (no real mobile image yet)"
                      style={{ width: '40px', height: '32px', borderRadius: '4px', cursor: 'pointer', background: '#e8e8e8', display: 'flex', alignItems: 'center', justifyContent: 'center', outline: mobileNum === PLACEHOLDER_IMG ? '2px solid #0087ED' : '1px solid var(--ed-input-border)', outlineOffset: '1px' }}
                    >
                      <span style={{ fontSize: '14px', color: 'var(--ed-text-xmuted)', lineHeight: 1 }}>▢</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button style={smallBtn} disabled={uploading} onClick={() => fileInputRef.current?.click()}>{uploading ? 'Uploading…' : '+ Upload new'}</button>
                    <button style={smallBtn} onClick={() => setPickingFor(null)}>Done</button>
                  </div>
                </div>
              ) : (
                <div style={{ position: 'relative' }}>
                  <div
                    onClick={() => setPickingFor(num)}
                    title={ratio ? `Placeholder ratio: ${ratio}` : undefined}
                    style={{
                      width: '90px',
                      aspectRatio: ratio || '4/3',
                      borderRadius: '8px', overflow: 'hidden', cursor: 'pointer',
                      border: has ? '2px solid #0087ED' : 'none',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: has ? 'var(--ed-block-bg)' : 'var(--ed-badge-border)', boxSizing: 'border-box',
                    }}
                  >
                    {mobileNum === PLACEHOLDER_IMG ? (
                      <span style={{ fontSize: '9px', color: 'var(--ed-text-xmuted)' }}>Placeholder</span>
                    ) : has && file ? (
                      <img src={`${basePath}/${file.name}?t=${Date.now()}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" />
                    ) : (
                      <span style={{ fontSize: '10px', color: 'var(--ed-text-xmuted)' }}>+ Choose</span>
                    )}
                  </div>
                  {has && mobileNum !== PLACEHOLDER_IMG && (
                    <>
                      <button
                        onClick={() => remove(num)}
                        style={{ position: 'absolute', top: '3px', right: '3px', width: '16px', height: '16px', borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: '9px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, lineHeight: 1 }}
                      >✕</button>
                      {onCropChange && file && (
                        <button
                          onClick={e => { e.stopPropagation(); setCropEditorFor(num) }}
                          title="Crop mobile image"
                          style={{ position: 'absolute', bottom: '3px', right: '3px', width: '18px', height: '18px', borderRadius: '4px', border: 'none', background: cropData[num] ? '#2563eb' : 'rgba(0,0,0,0.55)', color: '#fff', fontSize: '9px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, lineHeight: 1 }}
                        >
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/></svg>
                        </button>
                      )}
                    </>
                  )}
                  {has && mobileNum === PLACEHOLDER_IMG && (
                    <button
                      onClick={() => remove(num)}
                      style={{ position: 'absolute', top: '3px', right: '3px', width: '16px', height: '16px', borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: '9px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, lineHeight: 1 }}
                    >✕</button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/gif,image/webp,image/png,image/jpeg,image/svg+xml"
        style={{ display: 'none' }}
        onChange={e => { const f = e.target.files[0]; if (f && pickingFor != null) doUpload(pickingFor, f); e.target.value = '' }}
      />
      {cropEditorFor != null && (() => {
        const mNum = map[cropEditorFor]
        const f = mNum != null ? getFile(mNum) : null
        if (!f) return null
        return (
          <CropEditor
            src={`${basePath}/${f.name}`}
            initialRatio={ratio || '9/16'}
            initialCrop={cropData[cropEditorFor]}
            onSave={(crop) => onCropChange?.(cropEditorFor, crop)}
            onClose={() => setCropEditorFor(null)}
          />
        )
      })()}
    </div>
  )
}

// ── Position Picker ───────────────────────────────────────────
// Visual button group for left / center / right.
const POSITION_OPTS = [
  { value: 'left',   label: 'Left',   icon: '⬛░░' },
  { value: 'center', label: 'Center', icon: '░⬛░' },
  { value: 'right',  label: 'Right',  icon: '░░⬛' },
]

export function PositionPicker({ value, onChange, label }) {
  return (
    <div style={{display:'flex', flexDirection:'column', gap:'6px'}}>
      {label && <label style={{fontSize:'11px', fontWeight:600, color:'var(--ed-text-muted)', textTransform:'uppercase', letterSpacing:'0.06em'}}>{label}</label>}
      <div style={{display:'flex', gap:'4px'}}>
        {POSITION_OPTS.map(opt => {
          const active = (value || 'left') === opt.value
          return (
            <button
              key={opt.value}
              onClick={() => onChange(opt.value)}
              style={{
                display:'flex', flexDirection:'column', alignItems:'center', gap:'3px',
                padding:'7px 14px', borderRadius:'8px', cursor:'pointer',
                border: active ? '1.5px solid #0087ED' : '1.5px solid var(--ed-badge-border)',
                background: active ? '#e8f4ff' : 'var(--ed-input-bg)',
                color: active ? '#0087ED' : 'var(--ed-text-muted)',
                fontSize:'11px', fontFamily:'inherit', fontWeight: active ? 600 : 400,
                transition:'all 0.12s',
              }}
            >
              <span style={{fontSize:'9px', letterSpacing:'1px', opacity:0.7}}>{opt.icon}</span>
              {opt.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Layout Picker ─────────────────────────────────────────────
// Visual canvas+text layout selector for scroll-animation sections.
// Shows mini diagram of how canvas and text will be arranged.
const LAYOUT_OPTS = [
  {
    canvas: 'left',
    label: 'Canvas Left',
    diagram: (
      <div style={{display:'flex', gap:'3px', height:'28px', width:'64px'}}>
        <div style={{flex:3, background:'currentColor', opacity:0.8, borderRadius:'3px'}} />
        <div style={{flex:1, display:'flex', flexDirection:'column', gap:'2px', justifyContent:'center'}}>
          {[1,2,3].map(i => <div key={i} style={{height:'2px', background:'currentColor', opacity:0.35, borderRadius:'1px'}} />)}
        </div>
      </div>
    ),
  },
  {
    canvas: 'center',
    label: 'Canvas Center',
    diagram: (
      <div style={{display:'flex', flexDirection:'column', gap:'3px', height:'28px', width:'64px', alignItems:'center'}}>
        <div style={{width:'80%', flex:2, background:'currentColor', opacity:0.8, borderRadius:'3px'}} />
        <div style={{width:'80%', height:'2px', background:'currentColor', opacity:0.35, borderRadius:'1px'}} />
        <div style={{width:'60%', height:'2px', background:'currentColor', opacity:0.35, borderRadius:'1px'}} />
      </div>
    ),
  },
  {
    canvas: 'right',
    label: 'Canvas Right',
    diagram: (
      <div style={{display:'flex', gap:'3px', height:'28px', width:'64px'}}>
        <div style={{flex:1, display:'flex', flexDirection:'column', gap:'2px', justifyContent:'center'}}>
          {[1,2,3].map(i => <div key={i} style={{height:'2px', background:'currentColor', opacity:0.35, borderRadius:'1px'}} />)}
        </div>
        <div style={{flex:3, background:'currentColor', opacity:0.8, borderRadius:'3px'}} />
      </div>
    ),
  },
]

// ── Tag Input ─────────────────────────────────────────────────
export function TagInput({ value = [], onChange }) {
  const [text, setText] = useState(() => value.join(', '))

  const commit = (raw) => {
    const arr = raw.split(',').map(t => t.trim()).filter(Boolean)
    onChange(arr)
  }

  return (
    <input
      style={s}
      value={text}
      onChange={e => setText(e.target.value)}
      onBlur={e => commit(e.target.value)}
      placeholder="Enter tags, comma separated"
    />
  )
}

export function LayoutPicker({ canvasValue, onCanvasChange }) {
  return (
    <div style={{display:'flex', flexDirection:'column', gap:'6px'}}>
      <label style={{fontSize:'11px', fontWeight:600, color:'var(--ed-text-muted)', textTransform:'uppercase', letterSpacing:'0.06em'}}>Layout</label>
      <div style={{display:'flex', gap:'6px'}}>
        {LAYOUT_OPTS.map(opt => {
          const active = (canvasValue || 'left') === opt.canvas
          return (
            <button
              key={opt.canvas}
              onClick={() => onCanvasChange(opt.canvas)}
              style={{
                display:'flex', flexDirection:'column', alignItems:'center', gap:'6px',
                padding:'10px 12px', borderRadius:'10px', cursor:'pointer',
                border: active ? '1.5px solid #0087ED' : '1.5px solid var(--ed-badge-border)',
                background: active ? '#e8f4ff' : 'var(--ed-input-bg)',
                color: active ? '#0087ED' : 'var(--ed-text-xmuted)',
                fontSize:'11px', fontFamily:'inherit', fontWeight: active ? 600 : 400,
                transition:'all 0.12s',
              }}
            >
              {opt.diagram}
              <span style={{fontSize:'10px'}}>{opt.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

const s = { border: '1px solid var(--ed-input-border)', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', fontFamily: 'inherit', color: 'var(--ed-text)', background: 'var(--ed-input-bg)', outline: 'none', width: '100%', boxSizing: 'border-box' }

const FONT_OPTIONS = [
  { value: 'inherit', label: 'Default' },
  { value: 'Georgia, serif', label: 'Serif' },
  { value: "'Courier New', monospace", label: 'Mono' },
]

export function TextStyleRow({ value = {}, onChange }) {
  const set = (key, val) => onChange({ ...value, [key]: val })
  const btnStyle = (active) => ({
    padding: '5px 11px', borderRadius: '7px', cursor: 'pointer', fontFamily: 'inherit', fontSize: '13px',
    border: active ? '1.5px solid #0087ED' : '1.5px solid var(--ed-badge-border)',
    background: active ? '#e8f4ff' : 'var(--ed-input-bg)',
    color: active ? '#0087ED' : 'var(--ed-text-muted)',
  })
  return (
    <Field label="Align">
      <div style={{ display: 'flex', gap: '6px' }}>
        {[['left', '←'], ['center', '↔'], ['right', '→']].map(([val, icon]) => (
          <button key={val} onClick={() => set('textAlign', val)} style={btnStyle((value.textAlign || 'left') === val)}>{icon}</button>
        ))}
      </div>
    </Field>
  )
}

export function LinkPicker({ value, onChange, label }) {
  const [open, setOpen] = useState(false)
  const [projects, setProjects] = useState([])
  const [originals, setOriginals] = useState([])
  const [tab, setTab] = useState('projects')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    const [p, o] = await Promise.all([
      fetch(`${API}/projects`).then(r => r.json()).catch(() => []),
      fetch(`${API}/originals`).then(r => r.json()).catch(() => []),
    ])
    setProjects(p); setOriginals(o); setLoading(false)
  }, [])

  const handleOpen = () => { setOpen(true); setSearch(''); refresh() }

  const select = (linkType, category, id) => { onChange(`/${linkType}/${category}/${id}`); setOpen(false) }

  const list = tab === 'projects' ? projects : originals
  const filtered = list.filter(p => `${p.category} ${p.id}`.toLowerCase().includes(search.toLowerCase()))

  const tabBtn = (t, lbl) => ({
    padding: '4px 12px', border: 'none', borderRadius: '6px', cursor: 'pointer',
    fontFamily: 'inherit', fontSize: '12px', fontWeight: 600,
    background: tab === t ? '#111' : 'transparent', color: tab === t ? '#fff' : '#888',
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {label && <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ed-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</label>}
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
        <input
          style={{ ...s, flex: 1 }}
          value={value || ''}
          onChange={e => onChange(e.target.value)}
          placeholder="e.g. /projects/work/desk-lamp"
        />
        <button onClick={handleOpen}
          style={{ border: '1px solid var(--ed-input-border)', background: 'var(--ed-input-bg)', color: 'var(--ed-text-sub)', borderRadius: '8px', padding: '8px 12px', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
          Browse
        </button>
        {value && (
          <button onClick={() => onChange('')}
            style={{ border: 'none', background: 'none', color: 'var(--ed-text-xmuted)', cursor: 'pointer', fontSize: '16px', padding: '0 4px', lineHeight: 1 }}>
            ✕
          </button>
        )}
      </div>

      {open && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setOpen(false)}>
          <div style={{ background: 'var(--ed-card-bg)', borderRadius: '16px', width: '560px', maxHeight: '70vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}
            onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--ed-divider)', display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
              <div style={{ display: 'flex', gap: '3px', background: 'var(--ed-block-bg)', borderRadius: '8px', padding: '3px' }}>
                <button onClick={() => setTab('projects')} style={tabBtn('projects', 'Projects')}>Projects</button>
                <button onClick={() => setTab('originals')} style={tabBtn('originals', 'Originals')}>Originals</button>
              </div>
              <input value={search} onChange={e => setSearch(e.target.value)} autoFocus placeholder="Search..."
                style={{ flex: 1, border: '1px solid var(--ed-input-border)', borderRadius: '8px', padding: '6px 10px', fontSize: '12px', fontFamily: 'inherit', outline: 'none', background: 'var(--ed-input-bg)', color: 'var(--ed-text)' }} />
              <button onClick={() => setOpen(false)} style={{ border: 'none', background: 'none', fontSize: '18px', cursor: 'pointer', color: 'var(--ed-text-xmuted)', lineHeight: 1 }}>✕</button>
            </div>
            {/* List */}
            <div style={{ overflowY: 'auto', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {loading && <div style={{ padding: '20px', textAlign: 'center', color: 'var(--ed-text-muted)', fontSize: '13px' }}>Loading...</div>}
              {!loading && filtered.length === 0 && <div style={{ padding: '20px', textAlign: 'center', color: 'var(--ed-text-muted)', fontSize: '13px' }}>No results</div>}
              {!loading && filtered.map(item => {
                const thumbPath = tab === 'projects'
                  ? `/assets/projects/${item.category}/${item.id}/${item.id}-thumbnail`
                  : `/assets/originals/${item.category}/${item.id}/${item.id}-thumbnail`
                const link = `/${tab}/${item.category}/${item.id}`
                const isSelected = value === link
                return (
                  <button key={link} onClick={() => select(tab, item.category, item.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px',
                      border: isSelected ? '1.5px solid #0087ED' : '1px solid var(--ed-block-border)',
                      borderRadius: '8px', background: isSelected ? '#e8f4ff' : 'var(--ed-block-bg)',
                      cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                    }}>
                    <div style={{ width: '48px', height: '36px', borderRadius: '4px', overflow: 'hidden', background: 'var(--ed-input-bg)', flexShrink: 0 }}>
                      <Thumb path={thumbPath} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '10px', color: '#0087ED', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 700 }}>{item.category}</div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ed-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.id}</div>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--ed-text-muted)', flexShrink: 0 }}>{link}</div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Checkbox toggles between an internal-page LinkPicker (Browse a project/original)
// and a plain URL input for external links. The toggle itself isn't persisted —
// it's just derived from whether the current value looks like an external URL.
export function LinkField({ value, onChange, label }) {
  const [external, setExternal] = useState(() => /^https?:\/\//.test(value || ''))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {label && <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ed-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</label>}
      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12px', color: 'var(--ed-text-sub)' }}>
        <input type="checkbox" checked={external} onChange={e => { setExternal(e.target.checked); onChange('') }} />
        External URL
      </label>
      {external
        ? <input style={s} value={value || ''} onChange={e => onChange(e.target.value)} placeholder="https://…" />
        : <LinkPicker value={value} onChange={onChange} />}
    </div>
  )
}

// Wraps LinkField with an optional visual preview for the link: a plain
// chip, or an OG card whose title/description/image are fetched server-side
// (once, on demand) and cached on the section — the live page never re-fetches.
export function LinkPreviewField({ link, previewStyle, ogTitle, ogDescription, ogImage, ogSiteName,
  ogTitleSize, ogTitleSizeTablet, ogTitleSizeMobile,
  ogDescSize, ogDescSizeTablet, ogDescSizeMobile,
  ogSiteSize, ogSiteSizeTablet, ogSiteSizeMobile,
  onChange }) {
  const [fetching, setFetching] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef(null)

  const fetchPreview = async () => {
    if (!link) return
    setFetching(true); setError('')
    try {
      const res = await fetch(`${API}/link-preview`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: link }) })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Fetch failed')
      onChange('ogTitle', d.title)
      onChange('ogDescription', d.description)
      onChange('ogImage', d.image)
      onChange('ogSiteName', d.siteName)
    } catch (e) {
      setError(e.message)
    }
    setFetching(false)
  }

  const uploadImage = async (file) => {
    if (!file) return
    setUploading(true); setError('')
    try {
      const reader = new FileReader()
      const base64 = await new Promise((resolve, reject) => {
        reader.onload = () => resolve(reader.result.split(',')[1])
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      const res = await fetch(`${API}/about-images/upload`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: file.name, data: base64 }) })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Upload failed')
      onChange('ogImage', `/assets/about/sections/${d.filename}`)
    } catch (e) {
      setError(e.message)
    }
    setUploading(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <LinkField label="Link (optional — makes the section clickable)" value={link} onChange={v => onChange('link', v)} />
      {link && (
        <>
          <Field label="Preview">
            <select style={s} value={previewStyle || 'none'} onChange={e => onChange('previewStyle', e.target.value === 'none' ? undefined : e.target.value)}>
              <option value="none">None — link only, no visible preview</option>
              <option value="simple">Simple link chip</option>
              <option value="og">OG card (title, description, image)</option>
            </select>
          </Field>
          {previewStyle === 'og' && (
            <div style={{ background: 'var(--ed-block-bg)', borderRadius: '10px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button onClick={fetchPreview} disabled={fetching} style={{ alignSelf: 'flex-start', border: '1px solid var(--ed-input-border)', background: 'var(--ed-input-bg)', color: 'var(--ed-text-sub)', borderRadius: '8px', padding: '6px 12px', fontSize: '12px', cursor: fetching ? 'default' : 'pointer', fontFamily: 'inherit' }}>
                {fetching ? 'Fetching…' : 'Fetch Preview'}
              </button>
              {error && <div style={{ color: '#e53e3e', fontSize: '12px' }}>{error}</div>}
              <input style={s} placeholder="Title" value={ogTitle || ''} onChange={e => onChange('ogTitle', e.target.value)} />
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '11px', color: 'var(--ed-text-xmuted)', flexShrink: 0 }}>Title size — desktop</span>
                <input type="number" min="0" placeholder="Default (14)" style={{ ...s, width: '120px' }} value={ogTitleSize ? parseInt(ogTitleSize) : ''} onChange={e => onChange('ogTitleSize', e.target.value ? `${e.target.value}px` : undefined)} />
              </div>
              <TierSizeRow label="Title" size={ogTitleSize}
                tabletValue={ogTitleSizeTablet} onTablet={v => onChange('ogTitleSizeTablet', v)}
                mobileValue={ogTitleSizeMobile} onMobile={v => onChange('ogTitleSizeMobile', v)} />
              <textarea style={{ ...s, resize: 'vertical' }} rows={2} placeholder="Description" value={ogDescription || ''} onChange={e => onChange('ogDescription', e.target.value)} />
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '11px', color: 'var(--ed-text-xmuted)', flexShrink: 0 }}>Description size — desktop</span>
                <input type="number" min="0" placeholder="Default (13)" style={{ ...s, width: '120px' }} value={ogDescSize ? parseInt(ogDescSize) : ''} onChange={e => onChange('ogDescSize', e.target.value ? `${e.target.value}px` : undefined)} />
              </div>
              <TierSizeRow label="Description" size={ogDescSize}
                tabletValue={ogDescSizeTablet} onTablet={v => onChange('ogDescSizeTablet', v)}
                mobileValue={ogDescSizeMobile} onMobile={v => onChange('ogDescSizeMobile', v)} />
              <div style={{ display: 'flex', gap: '6px' }}>
                <input style={{ ...s, flex: 1 }} placeholder="Image URL" value={ogImage || ''} onChange={e => onChange('ogImage', e.target.value)} />
                <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { uploadImage(e.target.files[0]); e.target.value = '' }} />
                <button onClick={() => fileRef.current?.click()} disabled={uploading} style={{ border: '1px solid var(--ed-input-border)', background: 'var(--ed-input-bg)', color: 'var(--ed-text-sub)', borderRadius: '8px', padding: '6px 12px', fontSize: '12px', cursor: uploading ? 'default' : 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
                  {uploading ? 'Uploading…' : 'Upload'}
                </button>
              </div>
              <input style={s} placeholder="Site name (optional)" value={ogSiteName || ''} onChange={e => onChange('ogSiteName', e.target.value)} />
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '11px', color: 'var(--ed-text-xmuted)', flexShrink: 0 }}>Site name size — desktop</span>
                <input type="number" min="0" placeholder="Default (12)" style={{ ...s, width: '120px' }} value={ogSiteSize ? parseInt(ogSiteSize) : ''} onChange={e => onChange('ogSiteSize', e.target.value ? `${e.target.value}px` : undefined)} />
              </div>
              <TierSizeRow label="Site name" size={ogSiteSize}
                tabletValue={ogSiteSizeTablet} onTablet={v => onChange('ogSiteSizeTablet', v)}
                mobileValue={ogSiteSizeMobile} onMobile={v => onChange('ogSiteSizeMobile', v)} />
              {ogImage && <img src={ogImage} alt="" style={{ width: '100%', maxHeight: '140px', objectFit: 'cover', borderRadius: '6px' }} />}
            </div>
          )}
        </>
      )}
    </div>
  )
}

export function BgColorField({ value = '', onChange, label = 'BG Color' }) {
  return (
    <Field label={label}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <input type="color" value={value || '#ffffff'} onChange={e => onChange(e.target.value)}
          style={{ width: '36px', height: '36px', border: '1px solid var(--ed-input-border)', borderRadius: '6px', cursor: 'pointer', padding: '2px', background: 'none' }} />
        <input style={{ ...s, width: '160px' }} value={value} onChange={e => onChange(e.target.value)} placeholder="#ffffff or linear-gradient(...)" />
        {value && <button onClick={() => onChange('')} style={{ background: 'none', border: '1px solid var(--ed-input-border)', borderRadius: '6px', padding: '5px 10px', fontSize: '12px', color: 'var(--ed-text-muted)', cursor: 'pointer', fontFamily: 'inherit' }}>Reset</button>}
      </div>
    </Field>
  )
}

const KIND_META = {
  title:    { label: 'Title',    color: '#1a73e8', bg: '#e8f0fe', defaultSize: '24px', defaultWeight: '700' },
  subtitle: { label: 'Subtitle', color: '#1e8e3e', bg: '#e6f4ea', defaultSize: '21px', defaultWeight: '700', defaultGapAfter: 12 },
  body:     { label: 'Body',     color: '#555',    bg: '#f0f0f0', defaultSize: '17px', defaultWeight: '500' },
  row:      { label: 'Row (3 cols)', color: '#6d4aff', bg: '#efe9ff', defaultSize: '14px', defaultWeight: '500' },
  spacer:   { label: 'Spacer',   color: '#b45309', bg: '#fef3c7', defaultSize: '32px', defaultWeight: '' },
}

const SPACER_SIZES = ['4px','8px','12px','16px','20px','24px','28px','32px','40px','48px','56px','64px','80px','100px','120px','160px','200px']

export function autoConvertToLines(section) {
  const lines = []
  if (section.title)    lines.push({ kind: 'title',    text: section.title,    size: section.titleSize    || '', weight: section.titleWeight    || '', color: section.titleColor    || '', font: section.titleFont    || '' })
  if (section.subtitle) lines.push({ kind: 'subtitle', text: section.subtitle, size: section.subtitleSize || '', weight: section.subtitleWeight || '', color: section.subtitleColor || '', font: section.subtitleFont || '' })
  if (section.content)  lines.push({ kind: 'body',     text: section.content,  size: section.contentSize  || '', weight: section.contentWeight  || '', color: section.contentColor  || '', font: section.contentFont  || '' })
  return lines
}

export function TextLinesEditor({ lines = [], onChange }) {
  const update = (li, key, val) => onChange(lines.map((l, i) => i === li ? { ...l, [key]: val } : l))
  const move   = (li, dir) => {
    const next = [...lines], ti = li + dir
    if (ti < 0 || ti >= next.length) return
    ;[next[li], next[ti]] = [next[ti], next[li]]
    onChange(next)
  }
  const remove = (li) => onChange(lines.filter((_, i) => i !== li))
  const add    = (kind) => {
    const km = KIND_META[kind] || KIND_META.body
    const lineUid = () => Math.random().toString(36).slice(2, 9)
    onChange([...lines, { _id: lineUid(), kind, text: '', size: km.defaultSize, weight: km.defaultWeight, color: '', font: '', ...(km.defaultGapAfter != null ? { gapAfter: km.defaultGapAfter } : {}) }])
  }

  const btnBase = { border: 'none', borderRadius: '4px', padding: '3px 6px', cursor: 'pointer', fontSize: '10px', fontFamily: 'inherit' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {lines.map((line, li) => {
        const km = KIND_META[line.kind] || KIND_META.body
        return (
          <div key={line._id || li} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flexShrink: 0, width: '68px' }}>
              <select
                value={line.kind || 'body'}
                onChange={e => update(li, 'kind', e.target.value)}
                style={{ background: km.bg, color: km.color, border: 'none', borderRadius: '6px', padding: '5px 6px', fontSize: '11px', fontFamily: 'inherit', fontWeight: 600, cursor: 'pointer', outline: 'none', width: '100%' }}
              >
                {Object.entries(KIND_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
              </select>
              <div style={{ display: 'flex', gap: '2px' }}>
                <button onClick={() => move(li, -1)} style={{ ...btnBase, flex: 1, background: 'var(--ed-input-bg)', color: 'var(--ed-text-sub)' }}>↑</button>
                <button onClick={() => move(li, 1)}  style={{ ...btnBase, flex: 1, background: 'var(--ed-input-bg)', color: 'var(--ed-text-sub)' }}>↓</button>
                <button onClick={() => remove(li)}   style={{ ...btnBase, flex: 1, background: 'none', color: 'var(--ed-text-xmuted)' }}>✕</button>
              </div>
            </div>
            {line.kind === 'spacer' ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, padding: '8px 0' }}>
                <span style={{ fontSize: '12px', color: 'var(--ed-text-muted)' }}>Height</span>
                <select
                  value={line.size || '32px'}
                  onChange={e => update(li, 'size', e.target.value)}
                  style={{ ...ctrlSel, fontSize: '13px', padding: '6px 8px' }}
                >
                  {SPACER_SIZES.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            ) : (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {line.kind === 'row' && (
                  <div style={{ fontSize: '11px', color: 'var(--ed-text-xmuted)' }}>Separate up to 3 items with | (e.g. Team A | Team B | Team C)</div>
                )}
                <TextField
                  value={line.text || ''}
                  onChange={v => update(li, 'text', v)}
                  size={line.size}     onSize={v   => update(li, 'size',   v)}
                  weight={line.weight} onWeight={v => update(li, 'weight', v)}
                  color={line.color}   onColor={v  => update(li, 'color',  v)}
                  font={line.font}     onFont={v   => update(li, 'font',   v)}
                  italic={line.italic} onItalic={v => update(li, 'italic', v)}
                  rich={line.kind !== 'row'}
                  multiline={line.kind !== 'row'}
                  rows={line.kind === 'body' ? 4 : 2}
                  sizePlaceholder={`Default (${km.defaultSize})`}
                  weightPlaceholder={km.defaultWeight ? `Default (${km.defaultWeight})` : undefined}
                />
                {(line.size || line.kind === 'body') && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--ed-text-xmuted)', flexShrink: 0 }}>Tablet size</span>
                    <select
                      value={line.tabletSize || ''}
                      onChange={e => update(li, 'tabletSize', e.target.value)}
                      style={{ ...ctrlSel, fontSize: '11px', padding: '3px 6px' }}
                    >
                      {/* Body text defaults to 15px on tablet (not the desktop
                          size) unless a tablet size is set here — see renderLines'
                          tablet handling in ProjectDetail/OriginalDetail/
                          CategorySections. Titles/subtitles still cascade from
                          desktop since those stay author-sized. */}
                      <option value=''>{line.kind === 'body' ? 'Default (15px)' : 'Same as desktop'}</option>
                      {FONT_SIZES.filter(s => s && s !== line.size).map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                )}
                {(line.size || line.kind === 'body') && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--ed-text-xmuted)', flexShrink: 0 }}>Mobile size</span>
                    <select
                      value={line.mobileSize || ''}
                      onChange={e => update(li, 'mobileSize', e.target.value)}
                      style={{ ...ctrlSel, fontSize: '11px', padding: '3px 6px' }}
                    >
                      {/* Body text falls back to a fixed 14px on mobile (not the
                          tablet/desktop size) unless a mobile size is set here —
                          see renderLines' mobile handling in ProjectDetail/
                          OriginalDetail/CategorySections. Titles/subtitles still
                          cascade from tablet/desktop since those stay author-sized. */}
                      <option value=''>{line.kind === 'subtitle' || line.kind === 'title' ? 'Same as tablet/desktop' : 'Default (14px)'}</option>
                      <option value='inherit'>Follow system</option>
                      {FONT_SIZES.filter(s => s && s !== line.size).map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--ed-text-xmuted)', flexShrink: 0 }}>Text align</span>
                  <select
                    value={line.textAlign || ''}
                    onChange={e => update(li, 'textAlign', e.target.value || undefined)}
                    style={{ ...ctrlSel, fontSize: '11px', padding: '3px 6px' }}
                  >
                    <option value=''>Default (column/section)</option>
                    <option value='left'>Left</option>
                    <option value='center'>Center</option>
                    <option value='right'>Right</option>
                  </select>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--ed-text-xmuted)', flexShrink: 0 }}>Max width</span>
                  <MaxWidthInput value={line.maxWidth} onChange={v => update(li, 'maxWidth', v)} placeholder="None" />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--ed-text-xmuted)', flexShrink: 0 }}>Line height</span>
                  <select
                    value={line.lineHeight ?? ''}
                    onChange={e => update(li, 'lineHeight', e.target.value || undefined)}
                    style={{ ...ctrlSel, fontSize: '11px', padding: '3px 6px' }}
                  >
                    <option value=''>Default</option>
                    {['1', '1.1', '1.2', '1.3', '1.4', '1.5', '1.6', '1.7', '1.8', '1.9', '2', '2.2', '2.5'].map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--ed-text-xmuted)', flexShrink: 0 }}>Letter spacing</span>
                  <select
                    value={line.letterSpacing ?? ''}
                    onChange={e => update(li, 'letterSpacing', e.target.value || undefined)}
                    style={{ ...ctrlSel, fontSize: '11px', padding: '3px 6px' }}
                  >
                    <option value=''>Default</option>
                    {['-0.05em', '-0.04em', '-0.03em', '-0.02em', '-0.01em', '0em', '0.01em', '0.02em', '0.03em', '0.05em', '0.08em', '0.1em', '0.15em', '0.2em'].map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--ed-text-xmuted)', flexShrink: 0 }}>Gap after</span>
                  <select
                    value={line.gapAfter ?? ''}
                    onChange={e => update(li, 'gapAfter', e.target.value !== '' ? Number(e.target.value) : undefined)}
                    style={{ ...ctrlSel, fontSize: '11px', padding: '3px 6px' }}
                  >
                    <option value=''>Default (4px)</option>
                    {[0,2,4,6,8,10,12,16,20,24,28,32,40,48,56,64].map(v => <option key={v} value={v}>{v}px</option>)}
                  </select>
                </div>
                <LinkPreviewField
                  link={line.link}
                  previewStyle={line.previewStyle}
                  ogTitle={line.ogTitle}
                  ogDescription={line.ogDescription}
                  ogImage={line.ogImage}
                  ogSiteName={line.ogSiteName}
                  ogTitleSize={line.ogTitleSize} ogTitleSizeTablet={line.ogTitleSizeTablet} ogTitleSizeMobile={line.ogTitleSizeMobile}
                  ogDescSize={line.ogDescSize} ogDescSizeTablet={line.ogDescSizeTablet} ogDescSizeMobile={line.ogDescSizeMobile}
                  ogSiteSize={line.ogSiteSize} ogSiteSizeTablet={line.ogSiteSizeTablet} ogSiteSizeMobile={line.ogSiteSizeMobile}
                  onChange={(key, val) => update(li, key, val)}
                />
              </div>
            )}
          </div>
        )
      })}
      <div style={{ display: 'flex', gap: '6px', paddingTop: '2px' }}>
        {Object.entries(KIND_META).map(([kind, m]) => (
          <button key={kind} onClick={() => add(kind)}
            style={{ background: m.bg, color: m.color, border: 'none', borderRadius: '6px', padding: '5px 12px', fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>
            + {m.label}
          </button>
        ))}
      </div>
    </div>
  )
}

const MAX_WIDTH_UNITS = ['px', '%', 'vw', 'rem', 'ch']
function parseMaxWidth(val) {
  if (!val) return { num: '', unit: 'px' }
  const m = String(val).match(/^(\d*\.?\d+)(px|%|vw|rem|ch)$/)
  if (m) return { num: m[1], unit: m[2] }
  if (/^\d+(\.\d+)?$/.test(String(val))) return { num: String(val), unit: 'px' }
  return { num: val, unit: 'px' }
}
export function MaxWidthInput({ value, onChange, placeholder, label }) {
  const { num, unit } = parseMaxWidth(value)
  const update = (n, u) => onChange(n ? `${n}${u}` : undefined)
  const input = (
    <div style={{display:'flex', gap:'6px', flexWrap:'wrap'}}>
      <input style={{...s, flex:1, minWidth:'64px'}} type="number" min="0" placeholder={placeholder} value={num} onChange={e => update(e.target.value, unit)} />
      <div style={{display:'flex', borderRadius:'8px', overflow:'hidden', border:'1px solid var(--ed-input-border)', flexShrink:0}}>
        {MAX_WIDTH_UNITS.map(u => (
          <button key={u} onClick={() => update(num, u)} style={{
            padding:'0 8px', fontSize:'12px', fontWeight:600, cursor:'pointer', border:'none',
            borderRight: u !== 'rem' ? '1px solid var(--ed-input-border)' : 'none',
            background: unit === u ? 'var(--ed-accent, #0070f3)' : 'var(--ed-input-bg)',
            color: unit === u ? '#fff' : 'var(--ed-text-muted)',
            transition:'background 0.15s',
          }}>{u}</button>
        ))}
      </div>
    </div>
  )
  return label ? <Field label={label}>{input}</Field> : input
}
