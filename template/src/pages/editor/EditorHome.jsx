import { useState, useEffect } from 'react'
import { API, EditorTopbar, EditorSectionNav, TextField, Field, Row, Block, Card, Toggle, Thumb, ImageField, RatioRow, GapRow, RATIOS, HERO_RATIOS, SizeHint, ImageBreakpointOptions, ratioDims } from './EditorComponents'
import SectionsEditor from './EditorSectionsEditor'
import originalsData from '../../data/originals.json'
import { SITE_FONTS, applyFont } from '../../App'

function ItemPicker({ projects, onSelect, onClose }) {
  const [tab, setTab] = useState('projects')
  const [search, setSearch] = useState('')

  const filteredProjects = projects.filter(p =>
    !search || `${p.category} ${p.id}`.toLowerCase().includes(search.toLowerCase())
  )
  const filteredOriginals = originalsData.filter(o =>
    !search || `${o.category} ${o.id} ${o.title}`.toLowerCase().includes(search.toLowerCase())
  )

  const tabBtn = (t, label) => (
    <button onClick={() => setTab(t)} style={{
      padding: '5px 14px', border: 'none', borderRadius: '6px',
      fontFamily: 'inherit', fontSize: '12px', cursor: 'pointer',
      background: tab === t ? 'var(--ed-nav-active-bg)' : 'transparent',
      color: tab === t ? 'var(--ed-nav-active-text)' : 'var(--ed-text-muted)',
    }}>{label}</button>
  )

  const cardStyle = {
    border: '1.5px solid var(--ed-badge-border)', borderRadius: '10px', overflow: 'hidden',
    cursor: 'pointer', background: 'var(--ed-card-bg)', textAlign: 'left', padding: 0,
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}
    >
      <div
        style={{ background: 'var(--ed-card-bg)', borderRadius: '16px', width: '580px', maxHeight: '72vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.18)' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--ed-divider)', display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: '3px', background: 'var(--ed-block-bg)', borderRadius: '8px', padding: '3px' }}>
            {tabBtn('projects', 'Projects')}
            {tabBtn('originals', 'Originals')}
          </div>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search..." autoFocus
            style={{ flex: 1, border: '1px solid var(--ed-input-border)', borderRadius: '8px', padding: '6px 10px', fontSize: '12px', fontFamily: 'inherit', outline: 'none', background: 'var(--ed-input-bg)', color: 'var(--ed-text)' }}
          />
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: '18px', cursor: 'pointer', color: 'var(--ed-text-xmuted)', lineHeight: 1 }}>✕</button>
        </div>

        <div style={{ overflow: 'auto', padding: '14px 18px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
          {tab === 'projects'
            ? filteredProjects.map(p => (
              <button key={`${p.category}/${p.id}`} style={cardStyle}
                onClick={() => onSelect({ category: p.category, id: p.id, linkType: 'projects' })}
                onMouseEnter={e => e.currentTarget.style.borderColor = '#0087ED'}
                onMouseLeave={e => e.currentTarget.style.borderColor = '#e8e8e8'}
              >
                <div style={{ height: '72px', background: 'var(--ed-block-bg)', position: 'relative', overflow: 'hidden' }}>
                  <Thumb path={`/assets/projects/${p.category}/${p.id}/thumbnail`} />
                </div>
                <div style={{ padding: '7px 10px' }}>
                  <div style={{ fontSize: '9px', color: '#0087ED', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{p.category}</div>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ed-text)', marginTop: '1px' }}>{p.id}</div>
                </div>
              </button>
            ))
            : filteredOriginals.map(o => (
              <button key={`${o.category}/${o.id}`} style={cardStyle}
                onClick={() => onSelect({ category: o.category, id: o.id, linkType: 'originals', title: o.title })}
                onMouseEnter={e => e.currentTarget.style.borderColor = '#0087ED'}
                onMouseLeave={e => e.currentTarget.style.borderColor = '#e8e8e8'}
              >
                <div style={{ height: '72px', background: 'var(--ed-block-bg)', position: 'relative', overflow: 'hidden' }}>
                  <Thumb path={o.thumbnail} />
                </div>
                <div style={{ padding: '7px 10px' }}>
                  <div style={{ fontSize: '9px', color: '#0087ED', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{o.category}</div>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ed-text)', marginTop: '1px' }}>{o.title}</div>
                </div>
              </button>
            ))
          }
        </div>
      </div>
    </div>
  )
}

function LinkBadge({ item, onPick }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', background: '#f0f7ff', borderRadius: '8px', border: '1px solid #d0e8ff' }}>
      <div style={{ width: '52px', height: '38px', borderRadius: '5px', overflow: 'hidden', background: '#dde8f0', flexShrink: 0 }}>
        <Thumb path={item.image} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '10px', color: '#0087ED', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{item.linkType || 'projects'}</div>
        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ed-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.category} / {item.id}</div>
      </div>
      <button onClick={onPick} style={{ border: '1px solid #0087ED', background: 'none', color: '#0087ED', borderRadius: '6px', padding: '5px 12px', fontSize: '11px', cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
        Change
      </button>
    </div>
  )
}

export default function EditorHome() {
  const [data, setData] = useState(null)
  const [saved, setSaved] = useState(false)
  const [projects, setProjects] = useState([])
  const [picker, setPicker] = useState(null) // { type: 'featured'|'grid', index: number, sectionIndex?: number }
  const [siteConfig, setSiteConfig] = useState(null)
  const [siteSaved, setSiteSaved] = useState(false)

  useEffect(() => {
    fetch(`${API}/page/home`).then(r => r.json()).then(setData)
    fetch(`${API}/projects`).then(r => r.json()).then(setProjects)
    fetch(`${API}/page/siteConfig`).then(r => r.json()).then(setSiteConfig)
    // preload all font options so preview cards render correctly
    const families = SITE_FONTS.filter(f => f.value).map(f => f.google).join('&family=')
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = `https://fonts.googleapis.com/css2?family=${families}&display=swap`
    document.head.appendChild(link)
  }, [])

  const updateSiteConfig = (key, val) => setSiteConfig(c => ({ ...c, [key]: val }))

  const saveSiteConfig = async () => {
    await fetch(`${API}/page/siteConfig`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(siteConfig) })
    setSiteSaved(true); setTimeout(() => setSiteSaved(false), 2000)
  }

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
    await fetch(`${API}/page/home`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
    setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  const handlePickerSelect = (item) => {
    if (!picker) return
    const { type, index, sectionIndex } = picker
    setData(d => {
      const n = JSON.parse(JSON.stringify(d))
      const slot = type === 'grid' ? n.gridSections[sectionIndex].items[index] : n[type][index]
      slot.category = item.category
      slot.id = item.id
      slot.linkType = item.linkType
      if (item.title) slot.title = item.title
      return n
    })
    setPicker(null)
  }

  const addToGrid = (sectionIndex, item) => {
    setData(d => {
      const n = JSON.parse(JSON.stringify(d))
      n.gridSections[sectionIndex].items.push({
        id: item.id,
        category: item.category,
        linkType: item.linkType,
        title: item.title || item.id,
        image: item.image,
        tagline: '',
        taglineSize: '20px',
        taglineColor: '#ffffff',
      })
      return n
    })
  }

  const removeGridItem = (sectionIndex, index) => {
    setData(d => {
      const n = JSON.parse(JSON.stringify(d))
      n.gridSections[sectionIndex].items.splice(index, 1)
      return n
    })
  }

  const moveGridItem = (sectionIndex, index, dir) => {
    setData(d => {
      const n = JSON.parse(JSON.stringify(d))
      const items = n.gridSections[sectionIndex].items
      const newIdx = index + dir
      if (newIdx < 0 || newIdx >= items.length) return n;
      [items[index], items[newIdx]] = [items[newIdx], items[index]]
      return n
    })
  }

  const addGridSection = () => {
    setData(d => {
      const n = JSON.parse(JSON.stringify(d))
      if (!n.gridSections) n.gridSections = []
      n.gridSections.push({ desktopRatio: '5/4', mobileRatio: '5/4', hidden: false, items: [] })
      return n
    })
  }

  const removeGridSection = (sectionIndex) => {
    setData(d => {
      const n = JSON.parse(JSON.stringify(d))
      n.gridSections.splice(sectionIndex, 1)
      return n
    })
  }

  const moveGridSection = (sectionIndex, dir) => {
    setData(d => {
      const n = JSON.parse(JSON.stringify(d))
      const newIdx = sectionIndex + dir
      if (newIdx < 0 || newIdx >= n.gridSections.length) return n;
      [n.gridSections[sectionIndex], n.gridSections[newIdx]] = [n.gridSections[newIdx], n.gridSections[sectionIndex]]
      return n
    })
  }

  const addFeatured = (item) => {
    setData(d => {
      const n = JSON.parse(JSON.stringify(d))
      n.featured.push({
        id: item.id,
        category: item.category,
        linkType: item.linkType,
        title: item.title || item.id,
        image: item.image,
        tagline: '',
        taglineSize: '20px',
        taglineColor: '#ffffff',
      })
      return n
    })
  }

  const removeFeaturedItem = (index) => {
    setData(d => {
      const n = JSON.parse(JSON.stringify(d))
      n.featured.splice(index, 1)
      return n
    })
  }

  const moveFeaturedItem = (index, dir) => {
    setData(d => {
      const n = JSON.parse(JSON.stringify(d))
      const newIdx = index + dir
      if (newIdx < 0 || newIdx >= n.featured.length) return n;
      [n.featured[index], n.featured[newIdx]] = [n.featured[newIdx], n.featured[index]]
      return n
    })
  }

  const activeOriginals = data?.homeOriginals || originalsData.map(o => ({ id: o.id, category: o.category }))

  const toggleOriginal = (o) => {
    setData(d => {
      const n = JSON.parse(JSON.stringify(d))
      const current = n.homeOriginals || originalsData.map(x => ({ id: x.id, category: x.category }))
      const idx = current.findIndex(x => x.id === o.id)
      n.homeOriginals = idx >= 0 ? current.filter((_, i) => i !== idx) : [...current, { id: o.id, category: o.category }]
      return n
    })
  }

  const toggleOriginalHidden = (idx) => {
    setData(d => {
      const n = JSON.parse(JSON.stringify(d))
      const current = n.homeOriginals || originalsData.map(x => ({ id: x.id, category: x.category }))
      current[idx] = { ...current[idx], hidden: !current[idx].hidden }
      n.homeOriginals = current
      return n
    })
  }

  const moveOriginal = (idx, dir) => {
    setData(d => {
      const n = JSON.parse(JSON.stringify(d))
      const list = [...(n.homeOriginals || originalsData.map(x => ({ id: x.id, category: x.category })))]
      const newIdx = idx + dir
      if (newIdx < 0 || newIdx >= list.length) return n;
      [list[idx], list[newIdx]] = [list[newIdx], list[idx]]
      n.homeOriginals = list
      return n
    })
  }

  if (!data) return <div style={{ padding: '40px', color: 'var(--ed-text-xmuted)' }}>Loading...</div>

  const s = { border: '1px solid var(--ed-input-border)', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', fontFamily: 'inherit', color: 'var(--ed-text)', background: 'var(--ed-input-bg)', outline: 'none', width: '100%', boxSizing: 'border-box' }

  const sectionNavItems = [
    { id: 'ed-hero', label: 'Hero' },
    { id: 'ed-featured', label: 'Featured' },
    { id: 'ed-grid', label: 'Grid' },
    { id: 'ed-originals', label: 'Originals' },
    { id: 'ed-sections', label: 'Sections' },
    ...(siteConfig ? [{ id: 'ed-site-info', label: 'Site Info' }, { id: 'ed-typography', label: 'Typography' }, { id: 'ed-toc', label: 'TOC' }] : []),
  ]

  return (
    <div className="ed-page">
      <EditorTopbar title="Home" onSave={save} saved={saved} />
      <EditorSectionNav sections={sectionNavItems} />

      {picker && (
        <ItemPicker projects={projects} onSelect={handlePickerSelect} onClose={() => setPicker(null)} />
      )}

      {/* ── Hero ── */}
      <Card id="ed-hero" title="Hero" collapsible defaultOpen>
        <Row>
          <Field label="Scroll Hint Delay (sec)">
            <input
              style={s} type="number" min="0" max="30" step="1"
              value={data.hero.scrollHintDelay ?? 5}
              onChange={e => update('hero.scrollHintDelay', Number(e.target.value))}
            />
          </Field>
        </Row>

        <ImageField label="Hero Image" value={data.hero.image || '/assets/home/hero'} onChange={v => update('hero.image', v)}
          desktopRatio={data.hero.desktopRatio || 'full'} tabletRatio={data.hero.tabletRatio || ''} mobileRatio={data.hero.mobileRatio || '5/4'}
          onDesktopRatio={v => update('hero.desktopRatio', v)} onTabletRatio={v => update('hero.tabletRatio', v || undefined)} onMobileRatio={v => update('hero.mobileRatio', v)}
          ratioOptions={HERO_RATIOS} />
        {(() => {
          const dr = data.hero.desktopRatio || 'full'
          const tr = data.hero.tabletRatio || dr
          const mr = data.hero.mobileRatio || '5/4'
          return (
            <>
              <SizeHint>Recommended: Desktop {dr === 'full' ? '3840×2160 (fullscreen — matches the viewport, not a fixed ratio)' : ratioDims(3840, dr)} · Tablet {tr === 'full' ? '2048×1152' : ratioDims(2048, tr)} · Mobile {ratioDims(1200, mr)}</SizeHint>
              <ImageBreakpointOptions
                mobileValue={data.hero.mobileImage} onMobileChange={v => update('hero.mobileImage', v)}
                tabletValue={data.hero.tabletImage} onTabletChange={v => update('hero.tabletImage', v)}
                nativeSize={data.hero.nativeSize} onNativeSize={v => update('hero.nativeSize', v)}
                hideOnMobile={data.hero.hideOnMobile} onHideOnMobile={v => update('hero.hideOnMobile', v)}
                sizeHint="Prepare at ~2x the widest expected hero width (e.g. 3840px wide for a 1920px display) for retina sharpness — required if Apple-style is on below, since then it won't be scaled down to fit."
                containerRatio={dr !== 'full' ? dr : undefined}
              />
            </>
          )
        })()}

        <Toggle
          label="Inset Image (show background at the edges instead of full-bleed)"
          checked={!!data.hero?.inset} onChange={v => update('hero.inset', v)}
        />
        {data.hero?.inset && (
          <>
            <Row>
              <Field label="Inset Amount — desktop (e.g. 12%)">
                <input style={s} placeholder="Default (12%)" value={data.hero?.insetAmount || ''} onChange={e => update('hero.insetAmount', e.target.value || undefined)} />
              </Field>
              <Field label="Inset Amount — mobile">
                <input style={s} placeholder="Same as desktop" value={data.hero?.insetAmountMobile || ''} onChange={e => update('hero.insetAmountMobile', e.target.value || undefined)} />
              </Field>
            </Row>
            <Field label="Background Color">
              <input style={s} type="text" placeholder="#f5f5f7" value={data.hero?.bgColor || ''} onChange={e => update('hero.bgColor', e.target.value || undefined)} />
            </Field>
          </>
        )}
      </Card>

      {/* ── Featured Cards ── */}
      <Card id="ed-featured" title="Featured Cards" collapsible defaultOpen>
        <RatioRow desktopRatio={data.featuredSection?.desktopRatio || '16/9'} tabletRatio={data.featuredSection?.tabletRatio || ''} mobileRatio={data.featuredSection?.mobileRatio || '16/9'} onDesktopRatio={v => update('featuredSection.desktopRatio', v)} onTabletRatio={v => update('featuredSection.tabletRatio', v || undefined)} onMobileRatio={v => update('featuredSection.mobileRatio', v)} />

        <Toggle
          label="Inset Image (show background at the edges instead of full-bleed)"
          checked={!!data.featuredSection?.inset} onChange={v => update('featuredSection.inset', v)}
        />
        {data.featuredSection?.inset && (
          <>
            <Row>
              <Field label="Inset Amount — desktop (e.g. 12%)">
                <input style={s} placeholder="Default (12%)" value={data.featuredSection?.insetAmount || ''} onChange={e => update('featuredSection.insetAmount', e.target.value || undefined)} />
              </Field>
              <Field label="Inset Amount — mobile">
                <input style={s} placeholder="Same as desktop" value={data.featuredSection?.insetAmountMobile || ''} onChange={e => update('featuredSection.insetAmountMobile', e.target.value || undefined)} />
              </Field>
            </Row>
            <Field label="Default Background Color">
              <input style={s} type="text" placeholder="#f5f5f7" value={data.featuredSection?.bgColor || ''} onChange={e => update('featuredSection.bgColor', e.target.value || undefined)} />
            </Field>
            <div style={{ fontSize: '11px', color: 'var(--ed-text-xmuted)' }}>
              Each card below can override this with its own Background Color.
            </div>
          </>
        )}

        {data.featured.map((item, i) => (
          <Block key={i} label={`Featured ${i + 1}`}
            hidden={item.hidden} onToggleHidden={() => update(`featured.${i}.hidden`, !item.hidden)}
            onMoveUp={i > 0 ? () => moveFeaturedItem(i, -1) : undefined}
            onMoveDown={i < data.featured.length - 1 ? () => moveFeaturedItem(i, 1) : undefined}
            onRemove={() => removeFeaturedItem(i)}
          >
            <LinkBadge item={item} onPick={() => setPicker({ type: 'featured', index: i })} />
            <TextField label="Tagline" value={item.tagline} onChange={v => update(`featured.${i}.tagline`, v)}
              size={item.taglineSize} onSize={v => update(`featured.${i}.taglineSize`, v)}
              weight={item.taglineWeight} onWeight={v => update(`featured.${i}.taglineWeight`, v)}
              color={item.taglineColor} onColor={v => update(`featured.${i}.taglineColor`, v)}
              font={item.taglineFont} onFont={v => update(`featured.${i}.taglineFont`, v)}  rich />
            <ImageField label="Card Image" value={item.image} onChange={v => update(`featured.${i}.image`, v)} />
            {(() => {
              const dr = data.featuredSection?.desktopRatio || '16/9'
              const tr = data.featuredSection?.tabletRatio || dr
              const mr = data.featuredSection?.mobileRatio || '16/9'
              return <SizeHint>Recommended (Ratio row above sets this — currently {dr}): Desktop {ratioDims(3840, dr)} · Tablet {ratioDims(2048, tr)} · Mobile {ratioDims(1200, mr)}</SizeHint>
            })()}
            <ImageBreakpointOptions
              mobileValue={item.mobileImage} onMobileChange={v => update(`featured.${i}.mobileImage`, v)}
              tabletValue={item.tabletImage} onTabletChange={v => update(`featured.${i}.tabletImage`, v)}
              nativeSize={item.nativeSize} onNativeSize={v => update(`featured.${i}.nativeSize`, v)}
              hideOnMobile={item.hideOnMobile} onHideOnMobile={v => update(`featured.${i}.hideOnMobile`, v)}
              containerRatio={data.featuredSection?.desktopRatio || '16/9'}
              sizeHint="Prepare at ~2x the widest expected card width for retina sharpness — required if Apple-style is on below, since then it won't be scaled down to fit."
            />
            {data.featuredSection?.inset && (
              <Field label="Background Color (overrides default above)">
                <input style={s} type="text" placeholder="Default" value={item.bgColor || ''} onChange={e => update(`featured.${i}.bgColor`, e.target.value || undefined)} />
              </Field>
            )}
            <Field label="Logo Path"><input style={s} value={item.logo || ''} onChange={e => update(`featured.${i}.logo`, e.target.value)} /></Field>
            <Row>
              <Field label="Logo Height — desktop (px)">
                <input style={s} type="number" min="0" placeholder="Default (60)" value={item.logoHeight ? parseInt(item.logoHeight) : ''} onChange={e => update(`featured.${i}.logoHeight`, e.target.value ? `${e.target.value}px` : undefined)} />
              </Field>
              <Field label="Logo Height — mobile (px)">
                <input style={s} type="number" min="0" placeholder="Same as desktop" value={item.logoHeightMobile ? parseInt(item.logoHeightMobile) : ''} onChange={e => update(`featured.${i}.logoHeightMobile`, e.target.value ? `${e.target.value}px` : undefined)} />
              </Field>
              <Field label="Logo–Tagline Gap (px)">
                <input style={s} type="number" min="0" placeholder="Default (12)" value={item.logoGap ? parseInt(item.logoGap) : ''} onChange={e => update(`featured.${i}.logoGap`, e.target.value ? `${e.target.value}px` : undefined)} />
              </Field>
            </Row>
            <Row>
              <Field label="Tagline Top Offset — desktop (e.g. 40px, 30%, empty = default bottom)">
                <input style={s} placeholder="Default (bottom, with logo)" value={item.taglineTop || ''} onChange={e => update(`featured.${i}.taglineTop`, e.target.value || undefined)} />
              </Field>
              <Field label="Tagline Top Offset — mobile">
                <input style={s} placeholder="Same as desktop" value={item.taglineTopMobile || ''} onChange={e => update(`featured.${i}.taglineTopMobile`, e.target.value || undefined)} />
              </Field>
            </Row>
          </Block>
        ))}

        {(() => {
          const featuredSet = new Set(data.featured.map(f => `${f.linkType || 'projects'}:${f.category}:${f.id}`))
          const exProjects = projects.filter(p => !featuredSet.has(`projects:${p.category}:${p.id}`))
          const exOriginals = originalsData.filter(o => !featuredSet.has(`originals:${o.category}:${o.id}`))
          if (exProjects.length === 0 && exOriginals.length === 0) return null
          return (
            <>
              <div style={{ fontSize: '12px', color: 'var(--ed-text-muted)', marginBottom: '6px', marginTop: '4px' }}>
                Click any of these to add them as a new Featured card.
              </div>
              {exProjects.length > 0 && (
                <>
                  <div style={{ fontSize: '10px', color: 'var(--ed-text-xmuted)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Projects</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
                    {exProjects.map(p => (
                      <button key={`${p.category}/${p.id}`}
                        onClick={() => addFeatured({ id: p.id, category: p.category, linkType: 'projects', title: p.title, image: `/assets/home/projects/${p.id}` })}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', border: '1px dashed var(--ed-input-border)', background: 'none', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer', fontSize: '12px', color: 'var(--ed-text-sub)', fontFamily: 'inherit' }}>
                        <div style={{ width: '32px', height: '24px', borderRadius: '3px', overflow: 'hidden', background: 'var(--ed-block-bg)', flexShrink: 0 }}>
                          <Thumb path={`/assets/projects/${p.category}/${p.id}/thumbnail`} />
                        </div>
                        + {p.title || p.id}
                      </button>
                    ))}
                  </div>
                </>
              )}
              {exOriginals.length > 0 && (
                <>
                  <div style={{ fontSize: '10px', color: 'var(--ed-text-xmuted)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Originals</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {exOriginals.map(o => (
                      <button key={`${o.category}/${o.id}`}
                        onClick={() => addFeatured({ id: o.id, category: o.category, linkType: 'originals', title: o.title, image: o.homeThumbnail })}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', border: '1px dashed var(--ed-input-border)', background: 'none', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer', fontSize: '12px', color: 'var(--ed-text-sub)', fontFamily: 'inherit' }}>
                        <div style={{ width: '32px', height: '24px', borderRadius: '3px', overflow: 'hidden', background: 'var(--ed-block-bg)', flexShrink: 0 }}>
                          <Thumb path={o.homeThumbnail} />
                        </div>
                        + {o.title}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </>
          )
        })()}
      </Card>

      {/* ── Grid Cards ── */}
      <Card id="ed-grid" title="Grid Cards" collapsible defaultOpen>
        <div style={{ fontSize: '11px', color: 'var(--ed-text-xmuted)' }}>
          Each section below renders as its own row: below 1920px screens show its first 2 cards,
          1920px+ screens show its first 3 — split cards into separate sections instead of stacking
          them all in one if you want independent rows/ratios.
        </div>

        {(data.gridSections || []).map((section, si) => {
          const usedSet = new Set((data.gridSections || []).flatMap(sec => sec.items.map(g => `${g.linkType || 'projects'}:${g.category}:${g.id}`)))
          const exProjects = projects.filter(p => !usedSet.has(`projects:${p.category}:${p.id}`))
          const exOriginals = originalsData.filter(o => !usedSet.has(`originals:${o.category}:${o.id}`))
          return (
            <Block key={si} label={`Grid Section ${si + 1}`} hidden={section.hidden}
              onToggleHidden={() => update(`gridSections.${si}.hidden`, !section.hidden)}
              onMoveUp={si > 0 ? () => moveGridSection(si, -1) : undefined}
              onMoveDown={si < data.gridSections.length - 1 ? () => moveGridSection(si, 1) : undefined}
              onRemove={data.gridSections.length > 1 ? () => removeGridSection(si) : undefined}
            >
              <RatioRow desktopRatio={section.desktopRatio || '5/4'} tabletRatio={section.tabletRatio || ''} mobileRatio={section.mobileRatio || '5/4'} onDesktopRatio={v => update(`gridSections.${si}.desktopRatio`, v)} onTabletRatio={v => update(`gridSections.${si}.tabletRatio`, v || undefined)} onMobileRatio={v => update(`gridSections.${si}.mobileRatio`, v)} />
              <GapRow desktopGap={section.desktopGap || ''} mobileGap={section.mobileGap || ''} onDesktopGap={v => update(`gridSections.${si}.desktopGap`, v)} onMobileGap={v => update(`gridSections.${si}.mobileGap`, v)} />

              <Toggle
                label="Inset Image (show background at the edges instead of full-bleed)"
                checked={!!section.inset} onChange={v => update(`gridSections.${si}.inset`, v)}
              />
              {section.inset && (
                <>
                  <Row>
                    <Field label="Inset Amount — desktop (e.g. 8%)">
                      <input style={s} placeholder="Default (8%)" value={section.insetAmount || ''} onChange={e => update(`gridSections.${si}.insetAmount`, e.target.value || undefined)} />
                    </Field>
                    <Field label="Inset Amount — mobile">
                      <input style={s} placeholder="Same as desktop" value={section.insetAmountMobile || ''} onChange={e => update(`gridSections.${si}.insetAmountMobile`, e.target.value || undefined)} />
                    </Field>
                  </Row>
                  <Field label="Default Background Color">
                    <input style={s} type="text" placeholder="#f5f5f7" value={section.bgColor || ''} onChange={e => update(`gridSections.${si}.bgColor`, e.target.value || undefined)} />
                  </Field>
                  <div style={{ fontSize: '11px', color: 'var(--ed-text-xmuted)' }}>
                    Each card below can override this with its own Background Color.
                  </div>
                </>
              )}

              {section.items.map((item, i) => (
                <Block key={i} label={`Grid ${i + 1}`} hidden={item.hidden} onToggleHidden={() => update(`gridSections.${si}.items.${i}.hidden`, !item.hidden)}>
                  <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
                    <button onClick={() => moveGridItem(si, i, -1)} disabled={i === 0}
                      style={{ border: '1px solid var(--ed-input-border)', background: 'var(--ed-input-bg)', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontSize: '11px', color: i === 0 ? 'var(--ed-text-xmuted)' : 'var(--ed-text-sub)', fontFamily: 'inherit' }}>↑</button>
                    <button onClick={() => moveGridItem(si, i, 1)} disabled={i === section.items.length - 1}
                      style={{ border: '1px solid var(--ed-input-border)', background: 'var(--ed-input-bg)', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontSize: '11px', color: i === section.items.length - 1 ? 'var(--ed-text-xmuted)' : 'var(--ed-text-sub)', fontFamily: 'inherit' }}>↓</button>
                    <button onClick={() => removeGridItem(si, i)}
                      style={{ border: '1px solid #ffccc7', background: '#fff5f5', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', fontSize: '11px', color: '#e53e3e', fontFamily: 'inherit', marginLeft: 'auto' }}>Remove</button>
                  </div>
                  <LinkBadge item={item} onPick={() => setPicker({ type: 'grid', sectionIndex: si, index: i })} />
                  <Row>
                    <Field label="Title"><input style={s} value={item.title || ''} onChange={e => update(`gridSections.${si}.items.${i}.title`, e.target.value)} /></Field>
                    <Field label="Tagline"><input style={s} value={item.tagline || ''} onChange={e => update(`gridSections.${si}.items.${i}.tagline`, e.target.value)} /></Field>
                  </Row>
                  <ImageField label="Card Image" value={item.image} onChange={v => update(`gridSections.${si}.items.${i}.image`, v)} />
                  {(() => {
                    const dr = section.desktopRatio || '5/4'
                    const tr = section.tabletRatio || dr
                    const mr = section.mobileRatio || '5/4'
                    return <SizeHint>Recommended (Ratio row above sets this — currently {dr}, half-width): Desktop {ratioDims(1920, dr)} · Tablet {ratioDims(1024, tr)} · Mobile {ratioDims(1200, mr)}</SizeHint>
                  })()}
                  <ImageBreakpointOptions
                    mobileValue={item.mobileImage} onMobileChange={v => update(`gridSections.${si}.items.${i}.mobileImage`, v)}
                    tabletValue={item.tabletImage} onTabletChange={v => update(`gridSections.${si}.items.${i}.tabletImage`, v)}
                    nativeSize={item.nativeSize} onNativeSize={v => update(`gridSections.${si}.items.${i}.nativeSize`, v)}
                    hideOnMobile={item.hideOnMobile} onHideOnMobile={v => update(`gridSections.${si}.items.${i}.hideOnMobile`, v)}
                    containerRatio={section.desktopRatio || '5/4'}
                    sizeHint="Prepare at ~2x the widest expected card width for retina sharpness — required if Apple-style is on below, since then it won't be scaled down to fit."
                  />
                  {section.inset && (
                    <Field label="Background Color (overrides default above)">
                      <input style={s} type="text" placeholder="Default" value={item.bgColor || ''} onChange={e => update(`gridSections.${si}.items.${i}.bgColor`, e.target.value || undefined)} />
                    </Field>
                  )}
                </Block>
              ))}
              {(exProjects.length > 0 || exOriginals.length > 0) && (
                <>
                  <div style={{ fontSize: '11px', color: 'var(--ed-text-xmuted)', marginBottom: '6px', borderTop: '1px solid var(--ed-divider)', paddingTop: '10px' }}>Add to this section</div>
                  {exProjects.length > 0 && (
                    <>
                      <div style={{ fontSize: '10px', color: 'var(--ed-text-xmuted)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Projects</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
                        {exProjects.map(p => (
                          <button key={`${p.category}/${p.id}`}
                            onClick={() => addToGrid(si, { id: p.id, category: p.category, linkType: 'projects', title: p.title, image: `/assets/home/projects/${p.id}` })}
                            style={{ display: 'flex', alignItems: 'center', gap: '6px', border: '1px dashed var(--ed-input-border)', background: 'none', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer', fontSize: '12px', color: 'var(--ed-text-sub)', fontFamily: 'inherit' }}>
                            <div style={{ width: '32px', height: '24px', borderRadius: '3px', overflow: 'hidden', background: 'var(--ed-block-bg)', flexShrink: 0 }}>
                              <Thumb path={`/assets/projects/${p.category}/${p.id}/thumbnail`} />
                            </div>
                            + {p.title || p.id}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                  {exOriginals.length > 0 && (
                    <>
                      <div style={{ fontSize: '10px', color: 'var(--ed-text-xmuted)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Originals</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {exOriginals.map(o => (
                          <button key={`${o.category}/${o.id}`}
                            onClick={() => addToGrid(si, { id: o.id, category: o.category, linkType: 'originals', title: o.title, image: o.homeThumbnail })}
                            style={{ display: 'flex', alignItems: 'center', gap: '6px', border: '1px dashed var(--ed-input-border)', background: 'none', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer', fontSize: '12px', color: 'var(--ed-text-sub)', fontFamily: 'inherit' }}>
                            <div style={{ width: '32px', height: '24px', borderRadius: '3px', overflow: 'hidden', background: 'var(--ed-block-bg)', flexShrink: 0 }}>
                              <Thumb path={o.homeThumbnail} />
                            </div>
                            + {o.title}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}
            </Block>
          )
        })}

        <button onClick={addGridSection}
          style={{ border: '1px dashed var(--ed-input-border)', background: 'none', borderRadius: '10px', padding: '10px', cursor: 'pointer', fontSize: '12px', color: 'var(--ed-text-sub)', fontFamily: 'inherit' }}>
          + Add Grid Section
        </button>
      </Card>

      {/* ── Originals ── */}
      <Card id="ed-originals" title="Originals" collapsible defaultOpen>
        <Row>
          <Field label="Gap Above — desktop (px)">
            <input style={s} type="number" min="0" placeholder="Default (60)" value={data.originalsSection?.gapBefore ? parseInt(data.originalsSection.gapBefore) : ''} onChange={e => update('originalsSection.gapBefore', e.target.value ? `${e.target.value}px` : undefined)} />
          </Field>
          <Field label="Gap Above — mobile (px)">
            <input style={s} type="number" min="0" placeholder="Same as desktop" value={data.originalsSection?.gapBeforeMobile ? parseInt(data.originalsSection.gapBeforeMobile) : ''} onChange={e => update('originalsSection.gapBeforeMobile', e.target.value ? `${e.target.value}px` : undefined)} />
          </Field>
        </Row>
        <Row>
          <Field label="Gap Below — desktop (px)">
            <input style={s} type="number" min="0" placeholder="Default (0)" value={data.originalsSection?.gapAfter ? parseInt(data.originalsSection.gapAfter) : ''} onChange={e => update('originalsSection.gapAfter', e.target.value ? `${e.target.value}px` : undefined)} />
          </Field>
          <Field label="Gap Below — mobile (px)">
            <input style={s} type="number" min="0" placeholder="Same as desktop" value={data.originalsSection?.gapAfterMobile ? parseInt(data.originalsSection.gapAfterMobile) : ''} onChange={e => update('originalsSection.gapAfterMobile', e.target.value ? `${e.target.value}px` : undefined)} />
          </Field>
        </Row>
        <Field label="Auto-rotate Interval (seconds)">
          <input style={s} type="number" min="1" step="0.5" placeholder="Default (4)" value={data.originalsSection?.rotationInterval ?? ''} onChange={e => update('originalsSection.rotationInterval', e.target.value !== '' ? Number(e.target.value) : undefined)} />
        </Field>

        <Toggle
          label="Inset (show background at the edges instead of full-width)"
          checked={!!data.originalsSection?.inset} onChange={v => update('originalsSection.inset', v)}
        />
        {data.originalsSection?.inset && (
          <>
            <Row>
              <Field label="Inset Amount — desktop (e.g. 8%)">
                <input style={s} placeholder="Default (8%)" value={data.originalsSection?.insetAmount || ''} onChange={e => update('originalsSection.insetAmount', e.target.value || undefined)} />
              </Field>
              <Field label="Inset Amount — mobile">
                <input style={s} placeholder="Same as desktop" value={data.originalsSection?.insetAmountMobile || ''} onChange={e => update('originalsSection.insetAmountMobile', e.target.value || undefined)} />
              </Field>
            </Row>
            <Field label="Background Color">
              <input style={s} type="text" placeholder="#f5f5f7" value={data.originalsSection?.bgColor || ''} onChange={e => update('originalsSection.bgColor', e.target.value || undefined)} />
            </Field>
          </>
        )}

        <Toggle
          label="Show Dots" onLabel="Visible" offLabel="Hidden"
          checked={data.originalsSection?.showDots === true} onChange={v => update('originalsSection.showDots', v)}
        />
        <Toggle
          label="Show Title" onLabel="Visible" offLabel="Hidden"
          checked={data.originalsSection?.showTitle !== false} onChange={v => update('originalsSection.showTitle', v)}
        />
        {data.originalsSection?.showTitle !== false && (
          <TextField label="Title Text"
            value={data.originalsSection?.titleText || 'Originals'} onChange={v => update('originalsSection.titleText', v)}
            size={data.originalsSection?.titleSize || '20px'} onSize={v => update('originalsSection.titleSize', v)}
            weight={data.originalsSection?.titleWeight} onWeight={v => update('originalsSection.titleWeight', v)}
            color={data.originalsSection?.titleColor} onColor={v => update('originalsSection.titleColor', v)}
            font={data.originalsSection?.titleFont} onFont={v => update('originalsSection.titleFont', v)} />
        )}

        <Toggle
          label="Show Description" onLabel="Visible" offLabel="Hidden"
          checked={!!data.originalsSection?.showDesc} onChange={v => update('originalsSection.showDesc', v)}
        />
        {data.originalsSection?.showDesc && (
          <TextField label="Description" value={data.originalsSection?.description || ''} onChange={v => update('originalsSection.description', v)}
            size={data.originalsSection?.descSize || '13px'} onSize={v => update('originalsSection.descSize', v)}
            weight={data.originalsSection?.descWeight} onWeight={v => update('originalsSection.descWeight', v)}
            color={data.originalsSection?.descColor} onColor={v => update('originalsSection.descColor', v)}
            font={data.originalsSection?.descFont} onFont={v => update('originalsSection.descFont', v)}
            multiline rows={3}  rich />
        )}

        <RatioRow desktopRatio={data.originalsSection?.desktopRatio || '16/9'} mobileRatio={data.originalsSection?.mobileRatio || '5/4'} onDesktopRatio={v => update('originalsSection.desktopRatio', v)} onMobileRatio={v => update('originalsSection.mobileRatio', v)} />
        {(() => {
          const dr = data.originalsSection?.desktopRatio || '16/9'
          const mr = data.originalsSection?.mobileRatio || '5/4'
          return <SizeHint>Uses each Original's own thumbnail (set on its own editor page). Recommended (Ratio row above sets this — currently {dr}): Desktop {ratioDims(3456, dr)} · Tablet {ratioDims(1660, dr)} · Mobile {ratioDims(1080, mr)}</SizeHint>
        })()}
        <div style={{ fontSize: '12px', color: 'var(--ed-text-muted)', marginBottom: '4px', marginTop: '4px' }}>
          Select and reorder Originals to display.
        </div>

        {/* Active list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
          {activeOriginals.map((ref, idx) => {
            const orig = originalsData.find(o => o.id === ref.id)
            if (!orig) return null
            return (
              <div key={ref.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', background: 'var(--ed-block-bg)', borderRadius: '8px', border: '1px solid var(--ed-card-border)', opacity: ref.hidden ? 0.5 : 1 }}>
                <div style={{ width: '56px', height: '40px', borderRadius: '5px', overflow: 'hidden', background: 'var(--ed-input-bg)', flexShrink: 0 }}>
                  <Thumb path={orig.homeThumbnail} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ed-text)' }}>{orig.title}</div>
                  <div style={{ fontSize: '10px', color: 'var(--ed-text-muted)' }}>{orig.category}</div>
                </div>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button onClick={() => moveOriginal(idx, -1)} disabled={idx === 0}
                    style={{ border: '1px solid var(--ed-input-border)', background: 'var(--ed-input-bg)', borderRadius: '4px', padding: '3px 8px', cursor: 'pointer', fontSize: '11px', color: idx === 0 ? 'var(--ed-text-xmuted)' : 'var(--ed-text-sub)' }}>↑</button>
                  <button onClick={() => moveOriginal(idx, 1)} disabled={idx === activeOriginals.length - 1}
                    style={{ border: '1px solid var(--ed-input-border)', background: 'var(--ed-input-bg)', borderRadius: '4px', padding: '3px 8px', cursor: 'pointer', fontSize: '11px', color: idx === activeOriginals.length - 1 ? 'var(--ed-text-xmuted)' : 'var(--ed-text-sub)' }}>↓</button>
                  <button onClick={() => toggleOriginalHidden(idx)} title={ref.hidden ? 'Show on the home page' : 'Hide from the home page (keeps its place in this list)'}
                    style={{ border: '1px solid var(--ed-input-border)', background: 'var(--ed-input-bg)', borderRadius: '4px', padding: '3px 8px', cursor: 'pointer', fontSize: '11px', color: ref.hidden ? 'var(--ed-accent)' : 'var(--ed-text-sub)' }}>{ref.hidden ? 'Hidden' : 'Hide'}</button>
                  <button onClick={() => toggleOriginal(ref)} title="Remove from this list entirely"
                    style={{ border: '1px solid #ffccc7', background: '#fff5f5', borderRadius: '4px', padding: '3px 8px', cursor: 'pointer', fontSize: '11px', color: '#e53e3e' }}>✕</button>
                </div>
              </div>
            )
          })}
        </div>

        {/* Excluded originals */}
        {originalsData.filter(o => !activeOriginals.some(a => a.id === o.id)).length > 0 && (
          <>
            <div style={{ fontSize: '11px', color: 'var(--ed-text-xmuted)', marginBottom: '6px', borderTop: '1px solid var(--ed-divider)', paddingTop: '10px' }}>Excluded</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {originalsData.filter(o => !activeOriginals.some(a => a.id === o.id)).map(o => (
                <button key={o.id} onClick={() => toggleOriginal(o)} style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  border: '1px dashed var(--ed-input-border)', background: 'none', borderRadius: '8px',
                  padding: '6px 10px', cursor: 'pointer', fontSize: '12px', color: 'var(--ed-text-sub)', fontFamily: 'inherit',
                }}>
                  <div style={{ width: '32px', height: '24px', borderRadius: '3px', overflow: 'hidden', background: 'var(--ed-block-bg)', flexShrink: 0 }}>
                    <Thumb path={o.homeThumbnail} />
                  </div>
                  + {o.title}
                </button>
              ))}
            </div>
          </>
        )}
      </Card>

      {/* ── Additional Sections (same block types available on About / Projects / Category pages) ── */}
      <Card id="ed-sections" title="Additional Sections" collapsible defaultOpen={false}>
        <div style={{ fontSize: '12px', color: 'var(--ed-text-muted)', marginBottom: '4px' }}>
          Appended below the Originals carousel. Use the same section types (images, image+text, carousels, tabs, video, stats, 3D model, etc.) as the About / Project / Category editors.
        </div>
        <SectionsEditor
          sections={data.sections || []}
          onChange={v => update('sections', v)}
          basePath="/assets/home/sections"
          uploadUrl={`${API}/home-images/upload`}
          mobileBasePath="/assets/home/sections/mobile"
          mobileUploadUrl={`${API}/home-images/mobile/upload`}
          tabletBasePath="/assets/home/sections/tablet"
          tabletUploadUrl={`${API}/home-images/tablet/upload`}
        />
      </Card>

      {siteConfig && (
        <Card id="ed-site-info" title="Site Info" collapsible defaultOpen={false}>
          <Field label="Name"><input style={s} value={siteConfig.name || ''} onChange={e => updateSiteConfig('name', e.target.value)} /></Field>
          <Field label="Tagline"><input style={s} value={siteConfig.tagline || ''} onChange={e => updateSiteConfig('tagline', e.target.value)} /></Field>
          <Field label="CV File Path"><input style={s} value={siteConfig.cvFile || ''} onChange={e => updateSiteConfig('cvFile', e.target.value)} /></Field>
          <TextField label="CV Button Text"
            value={siteConfig.cvButtonText || 'Download CV'} onChange={v => updateSiteConfig('cvButtonText', v)}
            size={siteConfig.cvButtonSize} onSize={v => updateSiteConfig('cvButtonSize', v)}
            weight={siteConfig.cvButtonWeight} onWeight={v => updateSiteConfig('cvButtonWeight', v)}
            color={siteConfig.cvButtonColor} onColor={v => updateSiteConfig('cvButtonColor', v)} />
          <button
            onClick={saveSiteConfig}
            style={{ alignSelf: 'flex-start', background: siteSaved ? '#e6f4ea' : 'var(--ed-accent)', color: siteSaved ? '#1e8e3e' : '#fff', border: 'none', borderRadius: '7px', padding: '7px 16px', fontSize: '12px', fontFamily: 'inherit', cursor: 'pointer', fontWeight: 600 }}
          >
            {siteSaved ? 'Saved!' : 'Save Site Info'}
          </button>
        </Card>
      )}

      {siteConfig && (
        <Card id="ed-typography" title="Typography" collapsible defaultOpen={false}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Apple */}
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ed-text-xmuted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Apple</div>
            {(() => {
              const font = SITE_FONTS.find(f => f.value === 'system-ui')
              const isActive = siteConfig.fontFamily === 'system-ui'
              return (
                <button
                  onClick={() => { updateSiteConfig('fontFamily', 'system-ui'); applyFont('system-ui', siteConfig.fontFallback) }}
                  style={{
                    border: isActive ? '2px solid var(--ed-accent)' : '1.5px solid var(--ed-card-border)',
                    borderRadius: '10px', padding: '14px 16px',
                    background: isActive ? 'color-mix(in srgb, var(--ed-accent) 8%, var(--ed-card-bg))' : 'var(--ed-card-bg)',
                    cursor: 'pointer', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '6px', transition: 'border-color 0.15s', width: '100%',
                  }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.borderColor = 'var(--ed-accent)' }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.borderColor = 'var(--ed-card-border)' }}
                >
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px' }}>
                    <span style={{ fontFamily: `-apple-system, BlinkMacSystemFont, sans-serif`, fontSize: '22px', fontWeight: 500, color: 'var(--ed-text)', lineHeight: 1.2 }}>Ag</span>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: isActive ? 'var(--ed-accent)' : 'var(--ed-text-sub)' }}>System UI</span>
                    <span style={{ fontSize: '10px', color: 'var(--ed-text-muted)' }}>SF Pro on Apple · Segoe UI on Windows</span>
                  </div>
                </button>
              )
            })()}

            {siteConfig.fontFamily === 'system-ui' && (
              <div style={{ background: 'var(--ed-block-bg)', borderRadius: '10px', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ed-text-sub)' }}>Windows / Android fallback</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '8px' }}>
                  {SITE_FONTS.filter(f => f.value && f.value !== 'system-ui').map(font => {
                    const isFallbackActive = (siteConfig.fontFallback || 'Inter') === font.value
                    return (
                      <button
                        key={font.value}
                        onClick={() => { updateSiteConfig('fontFallback', font.value); applyFont('system-ui', font.value, siteConfig.fontFallbackEverywhere) }}
                        style={{
                          border: isFallbackActive ? '2px solid var(--ed-accent)' : '1.5px solid var(--ed-card-border)',
                          borderRadius: '8px', padding: '10px 12px',
                          background: isFallbackActive ? 'color-mix(in srgb, var(--ed-accent) 8%, var(--ed-card-bg))' : 'var(--ed-card-bg)',
                          cursor: 'pointer', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '4px', transition: 'border-color 0.15s',
                        }}
                        onMouseEnter={e => { if (!isFallbackActive) e.currentTarget.style.borderColor = 'var(--ed-accent)' }}
                        onMouseLeave={e => { if (!isFallbackActive) e.currentTarget.style.borderColor = 'var(--ed-card-border)' }}
                      >
                        <span style={{ fontFamily: `'${font.value}', sans-serif`, fontSize: '18px', fontWeight: 500, color: 'var(--ed-text)', lineHeight: 1.2 }}>Ag</span>
                        <span style={{ fontSize: '10px', fontWeight: 600, color: isFallbackActive ? 'var(--ed-accent)' : 'var(--ed-text-sub)' }}>{font.label}</span>
                      </button>
                    )
                  })}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
                  <label style={{ fontSize: '10px', fontWeight: 600, color: 'var(--ed-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Or type any Google Font name</label>
                  <input
                    style={s}
                    placeholder="e.g. Sora, Work Sans, IBM Plex Sans..."
                    defaultValue={SITE_FONTS.some(f => f.value === siteConfig.fontFallback) ? '' : (siteConfig.fontFallback || '')}
                    onBlur={e => { const v = e.target.value.trim(); if (v) { updateSiteConfig('fontFallback', v); applyFont('system-ui', v, siteConfig.fontFallbackEverywhere) } }}
                    onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
                  />
                </div>
                <div style={{ marginTop: '4px' }}>
                  <Toggle
                    label="Use this fallback font on Apple devices too (instead of SF Pro)"
                    checked={!!siteConfig.fontFallbackEverywhere}
                    onChange={v => { updateSiteConfig('fontFallbackEverywhere', v); applyFont('system-ui', siteConfig.fontFallback, v) }}
                  />
                </div>
              </div>
            )}

            {/* Other */}
            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--ed-text-xmuted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginTop: '4px' }}>Other</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '10px' }}>
              {SITE_FONTS.filter(f => f.value !== 'system-ui').map(font => {
                const isActive = (siteConfig.fontFamily || '') === font.value
                const previewFamily = font.value ? `'${font.value}', sans-serif` : "'Red Hat Display', sans-serif"
                return (
                  <button
                    key={font.value}
                    onClick={() => { updateSiteConfig('fontFamily', font.value || undefined); applyFont(font.value, siteConfig.fontFallback) }}
                    style={{
                      border: isActive ? '2px solid var(--ed-accent)' : '1.5px solid var(--ed-card-border)',
                      borderRadius: '10px', padding: '14px 16px',
                      background: isActive ? 'color-mix(in srgb, var(--ed-accent) 8%, var(--ed-card-bg))' : 'var(--ed-card-bg)',
                      cursor: 'pointer', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '6px', transition: 'border-color 0.15s',
                    }}
                    onMouseEnter={e => { if (!isActive) e.currentTarget.style.borderColor = 'var(--ed-accent)' }}
                    onMouseLeave={e => { if (!isActive) e.currentTarget.style.borderColor = 'var(--ed-card-border)' }}
                  >
                    <span style={{ fontFamily: previewFamily, fontSize: '22px', fontWeight: 500, color: 'var(--ed-text)', lineHeight: 1.2 }}>Ag</span>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: isActive ? 'var(--ed-accent)' : 'var(--ed-text-sub)' }}>{font.label}</span>
                    <span style={{ fontFamily: previewFamily, fontSize: '10px', color: 'var(--ed-text-muted)', lineHeight: 1.4 }}>The quick brown fox</span>
                  </button>
                )
              })}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ fontSize: '10px', fontWeight: 600, color: 'var(--ed-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Or type any Google Font name</label>
              <input
                style={s}
                placeholder="e.g. Sora, Work Sans, IBM Plex Sans..."
                defaultValue={SITE_FONTS.some(f => f.value === siteConfig.fontFamily) ? '' : (siteConfig.fontFamily || '')}
                onBlur={e => { const v = e.target.value.trim(); if (v) { updateSiteConfig('fontFamily', v); applyFont(v, siteConfig.fontFallback) } }}
                onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
              />
            </div>
            <button
              onClick={saveSiteConfig}
              style={{ alignSelf: 'flex-start', background: siteSaved ? '#e6f4ea' : 'var(--ed-accent)', color: siteSaved ? '#1e8e3e' : '#fff', border: 'none', borderRadius: '7px', padding: '7px 16px', fontSize: '12px', fontFamily: 'inherit', cursor: 'pointer', fontWeight: 600 }}
            >
              {siteSaved ? 'Saved!' : 'Save'}
            </button>
          </div>
        </Card>
      )}

      {siteConfig && (
        <Card id="ed-toc" title="TOC Settings" collapsible defaultOpen={false}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <Toggle
              label="Section TOC on project & original pages"
              checked={!!siteConfig.tocEnabled}
              onChange={v => updateSiteConfig('tocEnabled', v || undefined)}
              onLabel="Shown on every page (a page can still turn it off in its own editor)"
              offLabel="Hidden by default (a page can still turn it on in its own editor)"
            />
            <Field label="Label Font Size (px)">
              <input
                type="number" min="8" max="24" placeholder="12"
                value={siteConfig.tocLabelSize ?? ''}
                onChange={e => updateSiteConfig('tocLabelSize', e.target.value !== '' ? Number(e.target.value) : undefined)}
                style={{ border: '1px solid var(--ed-input-border)', borderRadius: '6px', padding: '5px 8px', fontSize: '12px', fontFamily: 'inherit', background: 'var(--ed-input-bg)', color: 'var(--ed-text)', width: '80px' }}
              />
            </Field>

            <Toggle
              label="Always show text labels (instead of dots that only expand on hover)"
              checked={!!siteConfig.tocAlwaysShowLabels}
              onChange={v => updateSiteConfig('tocAlwaysShowLabels', v)}
            />

            <Field label="Background">
              <select
                value={siteConfig.tocBackgroundStyle || 'pill'}
                onChange={e => updateSiteConfig('tocBackgroundStyle', e.target.value)}
                style={{ border: '1px solid var(--ed-input-border)', borderRadius: '6px', padding: '5px 8px', fontSize: '12px', fontFamily: 'inherit', background: 'var(--ed-input-bg)', color: 'var(--ed-text)' }}
              >
                <option value="pill">Pill (default — solid blurred background)</option>
                <option value="none">None (transparent, no background)</option>
                <option value="gradient">Gradient (fades out hero image behind it, keeps text readable)</option>
              </select>
            </Field>

            <Row>
              <Field label="Text Color (inactive item)">
                <input style={s} type="text" placeholder="Default" value={siteConfig.tocColor || ''} onChange={e => updateSiteConfig('tocColor', e.target.value || undefined)} />
              </Field>
              <Field label="Text Color (active item)">
                <input style={s} type="text" placeholder="Default" value={siteConfig.tocActiveColor || ''} onChange={e => updateSiteConfig('tocActiveColor', e.target.value || undefined)} />
              </Field>
            </Row>

            <button
              onClick={saveSiteConfig}
              style={{ alignSelf: 'flex-start', background: siteSaved ? '#e6f4ea' : 'var(--ed-accent)', color: siteSaved ? '#1e8e3e' : '#fff', border: 'none', borderRadius: '7px', padding: '7px 16px', fontSize: '12px', fontFamily: 'inherit', cursor: 'pointer', fontWeight: 600 }}
            >
              {siteSaved ? 'Saved!' : 'Save TOC Settings'}
            </button>
          </div>
        </Card>
      )}
    </div>
  )
}
